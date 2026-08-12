'use strict';

/**
 * Media library: validation, safe storage, variant generation.
 *
 * Upload threat model and the defences applied here:
 *
 *  1. A file claiming to be an image but containing something else.
 *     -> The declared MIME type and the extension are both ignored for
 *        the security decision. The real type is read from the file's
 *        magic bytes (sniffType) and must match an allowlist.
 *
 *  2. A real image with a payload appended (polyglot / EXIF injection).
 *     -> Every raster image is re-encoded through sharp. The output is
 *        pixel data written afresh, so anything appended or hidden in
 *        metadata does not survive. EXIF is dropped, which also removes
 *        GPS coordinates from phone photos.
 *
 *  3. SVG with embedded script.
 *     -> SVG cannot be re-encoded, so it is sanitised as text: script,
 *        foreignObject, event handlers and javascript: URLs are stripped.
 *
 *  4. A file written outside the upload directory (path traversal).
 *     -> The uploaded filename is never used as a path. Storage names are
 *        generated from random bytes and a slugified stem.
 *
 *  5. Executing an uploaded file.
 *     -> Files live in storage/ (outside the web root) and are served by
 *        a controlled route with nosniff and a sandboxing CSP.
 *
 *  6. Decompression bombs.
 *     -> sharp is given explicit pixel limits and refuses oversized input.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const db = require('../config/database');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { ValidationError } = require('../utils/errors');
const { slugify } = require('../utils/viewHelpers');

/** Real types we accept, keyed by the signature we detect. */
const ALLOWED_TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', kind: 'image', raster: true },
  png: { mime: 'image/png', ext: 'png', kind: 'image', raster: true },
  gif: { mime: 'image/gif', ext: 'gif', kind: 'image', raster: true },
  webp: { mime: 'image/webp', ext: 'webp', kind: 'image', raster: true },
  svg: { mime: 'image/svg+xml', ext: 'svg', kind: 'image', raster: false },
  ico: { mime: 'image/x-icon', ext: 'ico', kind: 'image', raster: false },
  pdf: { mime: 'application/pdf', ext: 'pdf', kind: 'document', raster: false },
};

const VARIANTS = [
  { name: 'thumbnail', width: 320, height: 240, fit: 'cover' },
  { name: 'medium', width: 800, fit: 'inside' },
  { name: 'large', width: 1600, fit: 'inside' },
];

/**
 * Guards against decompression bombs.
 *
 * For an animated GIF sharp counts every frame, so a modest 800x600
 * clip with 300 frames is already 144M "pixels". Animated formats get a
 * larger budget; the real ceiling for them is still MAX_UPLOAD_MB, and
 * MAX_DIMENSION below caps how big any single frame can be.
 */
const MAX_PIXELS = 50_000_000;
const MAX_PIXELS_ANIMATED = 400_000_000;
const MAX_DIMENSION = 10000;

/**
 * Identifies a buffer by its magic bytes.
 * @returns {string|null} key into ALLOWED_TYPES, or null if unrecognised
 */
function sniffType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';

  // GIF: "GIF87a" / "GIF89a"
  if (buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) return 'gif';

  // WEBP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';

  // PDF: "%PDF"
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'pdf';

  // ICO: 00 00 01 00
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'ico';

  // SVG is text; check the first chunk for an <svg root element.
  const head = buffer.subarray(0, 1024).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg')) {
    if (head.includes('<svg')) return 'svg';
  }

  return null;
}

/**
 * Strips executable content from SVG markup.
 * SVG is XML that a browser will happily run script from, so it gets the
 * same treatment as untrusted HTML.
 */
function sanitizeSvg(source) {
  let svg = source.toString('utf8');

  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/<!ENTITY[\s\S]*?>/gi, '');   // XXE
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  svg = svg.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');  // event handlers
  svg = svg.replace(/(href|xlink:href)\s*=\s*("|')?\s*javascript:[^"'>\s]*/gi, '');
  svg = svg.replace(/<use\b[^>]*xlink:href\s*=\s*["']?\s*(?!#)[^"'>]*/gi, '<use ');

  if (!/<svg[\s>]/i.test(svg)) throw new ValidationError('That SVG file could not be read.');

  return Buffer.from(svg, 'utf8');
}

/** Random, collision-free storage name. The original name is never a path. */
function buildFilename(originalName, extension) {
  const stem = slugify(path.parse(originalName).name).slice(0, 60) || 'file';
  const random = crypto.randomBytes(8).toString('hex');
  return `${stem}-${random}.${extension}`;
}

/** storage/uploads/YYYY/MM - keeps directories from growing unbounded. */
function buildRelativeDir(date = new Date()) {
  return path.join(String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'));
}

async function ensureDir(directory) {
  await fs.mkdir(directory, { recursive: true });
}

/**
 * Validates, processes and stores an uploaded file.
 *
 * @param {{buffer: Buffer, originalname: string, size: number}} file  from multer memory storage
 * @param {object} options
 * @returns {Promise<object>} the created media row
 */
async function store(file, { userId = null, folder = 'general', alt = null, title = null } = {}) {
  if (!file?.buffer?.length) throw new ValidationError('No file was received.');

  if (file.size > config.storage.maxUploadBytes) {
    throw new ValidationError(
      `That file is too large. The limit is ${Math.round(config.storage.maxUploadBytes / 1024 / 1024)} MB.`,
    );
  }

  // The security decision is made here, from content - not from
  // file.mimetype (client-supplied) or the extension (trivially faked).
  const detected = sniffType(file.buffer);
  if (!detected) {
    logger.security('media: rejected unrecognised file type', {
      originalName: file.originalname,
      declaredMime: file.mimetype,
      size: file.size,
      userId,
    });
    throw new ValidationError('That file type is not supported. Upload a JPG, PNG, GIF, WebP, SVG, ICO or PDF.');
  }

  const type = ALLOWED_TYPES[detected];
  const relativeDir = buildRelativeDir();
  const absoluteDir = path.join(config.storage.uploadDir, relativeDir);
  await ensureDir(absoluteDir);

  let outputBuffer = file.buffer;
  let width = null;
  let height = null;

  if (type.raster) {
    const isAnimated = detected === 'gif' || detected === 'webp';
    const pixelLimit = isAnimated ? MAX_PIXELS_ANIMATED : MAX_PIXELS;

    let metadata;
    try {
      metadata = await sharp(file.buffer, { limitInputPixels: pixelLimit }).metadata();
    } catch (err) {
      logger.security('media: unreadable image rejected', { originalName: file.originalname, message: err.message });
      throw new ValidationError('That image could not be read. It may be corrupt or too large to process.');
    }

    if (!metadata.width || !metadata.height) throw new ValidationError('That image has no readable dimensions.');
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      throw new ValidationError(`Images must be at most ${MAX_DIMENSION}px on each side.`);
    }

    // Re-encode. This is the step that neutralises appended payloads and
    // strips EXIF (including GPS location from phone photos).
    const pipeline = sharp(file.buffer, {
      limitInputPixels: pixelLimit,
      animated: metadata.pages > 1,
    }).rotate();   // apply EXIF orientation before the metadata is dropped

    if (detected === 'jpeg') pipeline.jpeg({ quality: 86, mozjpeg: true });
    else if (detected === 'png') pipeline.png({ compressionLevel: 9 });
    else if (detected === 'webp') pipeline.webp({ quality: 86 });
    else if (detected === 'gif') pipeline.gif();

    outputBuffer = await pipeline.toBuffer();

    const finalMeta = await sharp(outputBuffer, { limitInputPixels: pixelLimit }).metadata();
    width = finalMeta.width;
    // For an animated image sharp reports the height of the whole strip;
    // divide by the frame count to get the real display height.
    height = finalMeta.pages > 1 ? Math.round(finalMeta.height / finalMeta.pages) : finalMeta.height;
  } else if (detected === 'svg') {
    outputBuffer = sanitizeSvg(file.buffer);
  }
  // ICO and PDF are stored as received; both are magic-byte verified and
  // are served with nosniff + Content-Disposition: attachment.

  const filename = buildFilename(file.originalname, type.ext);
  const diskPath = path.join(absoluteDir, filename);
  const urlPath = `/uploads/${relativeDir.split(path.sep).join('/')}/${filename}`;

  await fs.writeFile(diskPath, outputBuffer);

  const checksum = crypto.createHash('sha256').update(outputBuffer).digest('hex');

  const [result] = await db.getPool().execute(
    `INSERT INTO media
       (uuid, filename, original_name, disk_path, url_path, mime, extension, kind,
        size_bytes, width, height, alt, title, folder, checksum, uploaded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      filename,
      String(file.originalname).slice(0, 255),
      diskPath,
      urlPath,
      type.mime,
      type.ext,
      type.kind,
      outputBuffer.length,
      width,
      height,
      alt,
      title,
      folder,
      checksum,
      userId,
    ],
  );

  const mediaId = result.insertId;

  // Variants are skipped for GIF: resizing an animated image to a static
  // WebP would silently drop the animation.
  if (type.raster && detected !== 'gif') {
    // Variants are a nice-to-have; a failure must not fail the upload.
    generateVariants(mediaId, outputBuffer, absoluteDir, filename, relativeDir)
      .catch((err) => logger.error('media: variant generation failed', { mediaId, message: err.message }));
  }

  cache.invalidatePrefix('public:');
  logger.admin('media uploaded', { mediaId, kind: type.kind, bytes: outputBuffer.length, userId });

  return db.queryOne('SELECT * FROM media WHERE id = ?', [mediaId]);
}

/** Builds resized copies plus a WebP version. Best-effort. */
async function generateVariants(mediaId, buffer, absoluteDir, filename, relativeDir) {
  const stem = path.parse(filename).name;
  const urlDir = relativeDir.split(path.sep).join('/');

  for (const variant of VARIANTS) {
    try {
      const output = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
        .resize({
          width: variant.width,
          height: variant.height,
          fit: variant.fit,
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();

      const variantName = `${stem}-${variant.name}.webp`;
      await fs.writeFile(path.join(absoluteDir, variantName), output);

      const meta = await sharp(output).metadata();

      await db.getPool().execute(
        `INSERT INTO media_variants (media_id, variant, disk_path, url_path, width, height, size_bytes)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE disk_path=VALUES(disk_path), url_path=VALUES(url_path),
                                 width=VALUES(width), height=VALUES(height), size_bytes=VALUES(size_bytes)`,
        [
          mediaId,
          variant.name,
          path.join(absoluteDir, variantName),
          `/uploads/${urlDir}/${variantName}`,
          meta.width,
          meta.height,
          output.length,
        ],
      );
    } catch (err) {
      logger.warn('media: variant skipped', { mediaId, variant: variant.name, message: err.message });
    }
  }
}

async function findById(id) {
  return db.queryOne('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [id]);
}

/** Best available variant URL, falling back to the original. */
async function urlFor(mediaId, variant = 'thumbnail') {
  const row = await db.queryOne(
    `SELECT COALESCE(v.url_path, m.url_path) AS url
       FROM media m
       LEFT JOIN media_variants v ON v.media_id = m.id AND v.variant = ?
      WHERE m.id = ? AND m.deleted_at IS NULL`,
    [variant, mediaId],
  );
  return row?.url || null;
}

/** Paginated library listing with search and type filter. */
async function list({ page = 1, perPage = 24, q = '', kind = '', folder = '' } = {}) {
  const clauses = ['m.deleted_at IS NULL'];
  const params = [];

  if (q) {
    clauses.push('(m.original_name LIKE ? OR m.alt LIKE ? OR m.title LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  if (kind) { clauses.push('m.kind = ?'); params.push(kind); }
  if (folder) { clauses.push('m.folder = ?'); params.push(folder); }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePerPage = Math.max(1, Math.min(Number.parseInt(perPage, 10) || 24, 96));
  const offset = (safePage - 1) * safePerPage;

  const [rows, total] = await Promise.all([
    db.query(
      `SELECT m.*, v.url_path AS thumb_url
         FROM media m
         LEFT JOIN media_variants v ON v.media_id = m.id AND v.variant = 'thumbnail'
        ${whereSql}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${safePerPage} OFFSET ${offset}`,
      params,
    ),
    db.queryValue(`SELECT COUNT(*) AS total FROM media m ${whereSql}`, params),
  ]);

  return {
    rows,
    total: Number(total) || 0,
    page: safePage,
    perPage: safePerPage,
    pages: Math.max(1, Math.ceil((Number(total) || 0) / safePerPage)),
  };
}

/**
 * Where a media item is referenced, so the UI can warn before deleting.
 * Checked against known FK columns rather than scanning every table.
 */
async function findUsage(mediaId) {
  const checks = [
    ['profile', 'photo_media_id', 'Profile photo'],
    ['profile', 'resume_media_id', 'Resume'],
    ['projects', 'featured_media_id', 'Project featured image'],
    ['projects', 'og_media_id', 'Project social image'],
    ['project_images', 'media_id', 'Project gallery'],
    ['experience', 'company_logo_media_id', 'Experience logo'],
    ['education', 'logo_media_id', 'Education logo'],
    ['certifications', 'certificate_media_id', 'Certificate file'],
    ['certifications', 'logo_media_id', 'Certification logo'],
    ['achievements', 'image_media_id', 'Achievement image'],
    ['achievements', 'certificate_media_id', 'Achievement certificate'],
    ['services', 'icon_media_id', 'Service icon'],
    ['skills', 'logo_media_id', 'Skill logo'],
    ['blog_posts', 'featured_media_id', 'Blog featured image'],
    ['seo_settings', 'og_media_id', 'SEO social image'],
    ['users', 'avatar_media_id', 'User avatar'],
  ];

  const usage = [];
  for (const [table, column, label] of checks) {
    // Identifiers are literals in this file, never request input.
    const count = await db.queryValue(
      `SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${column}\` = ?`,
      [mediaId],
    );
    if (Number(count) > 0) usage.push({ label, count: Number(count) });
  }

  // Settings store media ids as string values.
  const settingRows = await db.query(
    'SELECT setting_key FROM site_settings WHERE value_type = ? AND setting_value = ?',
    ['media', String(mediaId)],
  );
  for (const row of settingRows) usage.push({ label: `Setting: ${row.setting_key}`, count: 1 });

  return usage;
}

/**
 * Soft-deletes the record and removes the files from disk.
 * Foreign keys are ON DELETE SET NULL, so references become empty rather
 * than breaking a page.
 */
async function remove(mediaId) {
  const media = await findById(mediaId);
  if (!media) return false;

  const variants = await db.query('SELECT disk_path FROM media_variants WHERE media_id = ?', [mediaId]);

  await db.query('UPDATE media SET deleted_at = NOW() WHERE id = ?', [mediaId]);

  for (const filePath of [media.disk_path, ...variants.map((v) => v.disk_path)]) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn('media: could not delete file', { filePath, message: err.message });
    }
  }

  cache.invalidatePrefix('public:');
  return true;
}

async function updateMeta(mediaId, { alt, title, caption, folder }) {
  await db.query(
    'UPDATE media SET alt = ?, title = ?, caption = ?, folder = ? WHERE id = ?',
    [alt || null, title || null, caption || null, folder || 'general', mediaId],
  );
  cache.invalidatePrefix('public:');
  return findById(mediaId);
}

async function folders() {
  const rows = await db.query(
    'SELECT folder, COUNT(*) AS total FROM media WHERE deleted_at IS NULL GROUP BY folder ORDER BY folder ASC',
  );
  return rows;
}

module.exports = {
  store,
  findById,
  urlFor,
  list,
  remove,
  updateMeta,
  findUsage,
  folders,
  sniffType,
  sanitizeSvg,
  ALLOWED_TYPES,
  VARIANTS,
};
