'use strict';

const path = require('node:path');
const fs = require('node:fs');

const mediaService = require('../services/mediaService');
const activityService = require('../services/activityService');
const { asyncHandler, NotFoundError, ValidationError } = require('../utils/errors');
const { config } = require('../config/env');

/** GET /admin/media */
const index = asyncHandler(async (req, res) => {
  const [result, folders] = await Promise.all([
    mediaService.list({
      page: req.query.page,
      q: req.query.q || '',
      kind: req.query.kind || '',
      folder: req.query.folder || '',
    }),
    mediaService.folders(),
  ]);

  res.render('admin/media', {
    title: 'Media library',
    activeNav: 'media',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Media library' },
    ],
    result,
    folders,
    searchTerm: req.query.q || '',
    activeKind: req.query.kind || '',
    activeFolder: req.query.folder || '',
    maxUploadMb: Math.round(config.storage.maxUploadBytes / 1024 / 1024),
  });
});

/**
 * POST /admin/media/upload
 * Accepts multiple files; each is validated independently so one bad
 * file does not discard a good batch.
 */
const upload = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files.length) throw new ValidationError('Choose at least one file to upload.');

  const created = [];
  const failed = [];

  for (const file of files) {
    try {
      const media = await mediaService.store(file, {
        userId: req.session.user.id,
        folder: req.body.folder || 'general',
      });
      created.push(media);

      await activityService.record({
        req,
        action: 'media.upload',
        entity: 'media',
        entityId: media.id,
        description: `Uploaded ${media.original_name}`,
      });
    } catch (err) {
      failed.push({ name: file.originalname, reason: err.expose ? err.message : 'Upload failed.' });
    }
  }

  if (req.get('x-requested-with') === 'XMLHttpRequest') {
    return res.json({ ok: failed.length === 0, created, failed });
  }

  if (created.length) req.flash('success', `${created.length} file${created.length === 1 ? '' : 's'} uploaded.`);
  for (const failure of failed) req.flash('error', `${failure.name}: ${failure.reason}`);

  return res.redirect(`${res.locals.adminPath}/media`);
});

/**
 * GET /admin/media/:id/thumb
 * Streams a thumbnail for the admin UI. Reads the path from the database
 * rather than the URL, and refuses anything resolving outside the upload
 * directory as a defence against a tampered stored path.
 */
const thumb = asyncHandler(async (req, res) => {
  const media = await mediaService.findById(req.params.id);
  if (!media) throw new NotFoundError('That file no longer exists.');

  const thumbRow = await require('../config/database').queryOne(
    "SELECT disk_path FROM media_variants WHERE media_id = ? AND variant = 'thumbnail'",
    [media.id],
  );

  const filePath = path.resolve(thumbRow?.disk_path || media.disk_path);
  const uploadRoot = path.resolve(config.storage.uploadDir);

  if (!filePath.startsWith(uploadRoot + path.sep) && filePath !== uploadRoot) {
    throw new NotFoundError('That file could not be served.');
  }
  if (!fs.existsSync(filePath)) throw new NotFoundError('That file is missing from disk.');

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  // Documents are never rendered inline in the browser.
  if (media.kind !== 'image') res.setHeader('Content-Disposition', 'attachment');

  res.sendFile(filePath);
});

/** GET /admin/media/browse - JSON feed for the picker modal. */
const browse = asyncHandler(async (req, res) => {
  const result = await mediaService.list({
    page: req.query.page,
    perPage: 24,
    q: req.query.q || '',
    kind: req.query.kind || '',
  });

  res.json({
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      kind: row.kind,
      url: row.url_path,
      thumb: `${config.security.adminPath}/media/${row.id}/thumb`,
      alt: row.alt,
      size: row.size_bytes,
      width: row.width,
      height: row.height,
    })),
    page: result.page,
    pages: result.pages,
    total: result.total,
  });
});

/** POST /admin/media/:id */
const update = asyncHandler(async (req, res) => {
  const before = await mediaService.findById(req.params.id);
  if (!before) throw new NotFoundError('That file no longer exists.');

  const after = await mediaService.updateMeta(before.id, {
    alt: req.body.alt,
    title: req.body.title,
    caption: req.body.caption,
    folder: req.body.folder,
  });

  await activityService.record({
    req,
    action: 'media.update',
    entity: 'media',
    entityId: before.id,
    description: `Updated details for ${before.original_name}`,
    before,
    after,
  });

  req.flash('success', 'File details saved.');
  res.redirect(`${res.locals.adminPath}/media`);
});

/** GET /admin/media/:id/usage - where a file is referenced. */
const usage = asyncHandler(async (req, res) => {
  const media = await mediaService.findById(req.params.id);
  if (!media) throw new NotFoundError('That file no longer exists.');

  res.json({ usage: await mediaService.findUsage(media.id) });
});

/** POST /admin/media/:id/delete */
const destroy = asyncHandler(async (req, res) => {
  const media = await mediaService.findById(req.params.id);
  if (!media) throw new NotFoundError('That file no longer exists.');

  const references = await mediaService.findUsage(media.id);
  await mediaService.remove(media.id);

  await activityService.record({
    req,
    action: 'media.delete',
    entity: 'media',
    entityId: media.id,
    description: `Deleted ${media.original_name}${references.length ? ` (was used in ${references.length} place(s))` : ''}`,
    before: media,
    severity: 'warning',
  });

  req.flash('success', references.length
    ? `${media.original_name} deleted. ${references.length} reference(s) were cleared.`
    : `${media.original_name} deleted.`);

  res.redirect(`${res.locals.adminPath}/media`);
});

module.exports = { index, upload, thumb, browse, update, usage, destroy };
