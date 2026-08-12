#!/usr/bin/env node
'use strict';

/**
 * Migrates the portfolio content out of index.html and into the database.
 *
 *   npm run seed              insert anything missing
 *   npm run seed -- --force   also overwrite rows that already exist
 *
 * Idempotent by design: rows are matched on their natural key (slug, or
 * name + company) so running it twice does not create duplicates.
 *
 * Images referenced by the original markup are imported into the media
 * library through the normal upload pipeline, so they are validated,
 * re-encoded and given variants exactly like a hand-uploaded file.
 */

const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../src/config/env');
const db = require('../src/config/database');
const mediaService = require('../src/services/mediaService');
const data = require('../database/seed-data');

const c = {
  reset: '\x1b[0m', dim: '\x1b[90m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

const force = process.argv.includes('--force');
const log = (message = '') => process.stdout.write(`${message}\n`);

const stats = { created: 0, skipped: 0, updated: 0, media: 0, mediaFailed: 0 };

/**
 * Imports a file referenced by the original markup into the media library.
 * Returns the media id, or null when the file is missing on disk.
 *
 * Results are memoised so the same asset shared by several rows is only
 * imported once.
 */
const mediaCache = new Map();

async function importAsset(relativePath, { alt = null, folder = 'imported' } = {}) {
  if (!relativePath) return null;
  if (mediaCache.has(relativePath)) return mediaCache.get(relativePath);

  const cleaned = relativePath.replace(/^\.\//, '');
  const absolute = path.join(config.rootDir, cleaned);

  if (!fs.existsSync(absolute)) {
    log(`    ${c.yellow}missing asset:${c.reset} ${cleaned}`);
    stats.mediaFailed += 1;
    mediaCache.set(relativePath, null);
    return null;
  }

  // Reuse an earlier import of the same original filename.
  const existing = await db.queryOne(
    'SELECT id FROM media WHERE original_name = ? AND folder = ? AND deleted_at IS NULL LIMIT 1',
    [path.basename(cleaned), folder],
  );
  if (existing) {
    mediaCache.set(relativePath, existing.id);
    return existing.id;
  }

  try {
    const buffer = fs.readFileSync(absolute);
    const media = await mediaService.store(
      { buffer, originalname: path.basename(cleaned), size: buffer.length, mimetype: 'application/octet-stream' },
      { folder, alt },
    );
    stats.media += 1;
    mediaCache.set(relativePath, media.id);
    return media.id;
  } catch (err) {
    log(`    ${c.yellow}could not import ${cleaned}:${c.reset} ${err.message}`);
    stats.mediaFailed += 1;
    mediaCache.set(relativePath, null);
    return null;
  }
}

/**
 * Inserts a row unless one matching `match` already exists.
 * @returns {Promise<number>} the row id
 */
async function upsert(table, match, values) {
  const whereSql = Object.keys(match).map((key) => `\`${key}\` = ?`).join(' AND ');
  const existing = await db.queryOne(
    `SELECT id FROM \`${table}\` WHERE ${whereSql} LIMIT 1`,
    Object.values(match),
  );

  if (existing) {
    if (!force) {
      stats.skipped += 1;
      return existing.id;
    }
    const columns = Object.keys(values);
    await db.query(
      `UPDATE \`${table}\` SET ${columns.map((col) => `\`${col}\` = ?`).join(', ')} WHERE id = ?`,
      [...Object.values(values), existing.id],
    );
    stats.updated += 1;
    return existing.id;
  }

  const columns = Object.keys(values);
  const [result] = await db.getPool().execute(
    `INSERT INTO \`${table}\` (${columns.map((col) => `\`${col}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    Object.values(values),
  );
  stats.created += 1;
  return result.insertId;
}

async function seedProfile() {
  log(`\n${c.cyan}profile${c.reset}`);

  const photoId = await importAsset('./assets/images/Profile/photo.png', {
    alt: 'M S Arun Sanjeev', folder: 'profile',
  });
  const resumeId = await importAsset('./assets/resume.pdf', { folder: 'resume' });

  const values = { ...data.profile };
  if (photoId) { values.photo_media_id = photoId; values.photo_alt = 'M S Arun Sanjeev'; }
  if (resumeId) values.resume_media_id = resumeId;

  const columns = Object.keys(values);
  await db.query(
    `UPDATE profile SET ${columns.map((col) => `\`${col}\` = ?`).join(', ')} WHERE id = 1`,
    Object.values(values),
  );

  log(`  ${c.green}profile updated${c.reset}${photoId ? ' with photo' : ''}${resumeId ? ' and resume' : ''}`);
}

async function seedSimpleList(label, table, rows, matchKey, transform) {
  log(`\n${c.cyan}${label}${c.reset}`);
  let order = 10;

  for (const row of rows) {
    const values = await transform(row, order);
    await upsert(table, { [matchKey]: values[matchKey] }, values);
    order += 10;
  }

  log(`  ${rows.length} ${label} processed`);
}

async function seedExperience() {
  log(`\n${c.cyan}experience${c.reset}`);
  let order = 10;

  for (const row of data.experience) {
    await upsert('experience',
      { company: row.company, position: row.position },
      {
        company: row.company,
        position: row.position,
        employment_type: row.employment_type || 'other',
        date_label: row.date_label || null,
        is_current: row.is_current || 0,
        description: row.description || null,
        is_active: 1,
        sort_order: order,
      });
    order += 10;
  }

  log(`  ${data.experience.length} experience entries processed`);
}

async function seedProjects() {
  log(`\n${c.cyan}projects${c.reset}`);

  const categories = await db.query('SELECT id, slug FROM project_categories');
  const bySlug = new Map(categories.map((row) => [row.slug, row.id]));

  let order = 10;
  for (const project of data.projects) {
    const mediaId = await importAsset(project.legacy_image, {
      alt: project.image_alt, folder: 'projects',
    });

    await upsert('projects', { slug: project.slug }, {
      title: project.title,
      slug: project.slug,
      category_id: bySlug.get(project.category) || null,
      category_label: project.category_label || null,
      featured_media_id: mediaId,
      image_alt: project.image_alt || null,
      primary_url: project.primary_url || null,
      github_url: project.github_url || null,
      live_url: project.live_url || null,
      is_featured: project.is_featured || 0,
      open_in_new_tab: 1,
      status: 'published',
      sort_order: order,
    });
    order += 10;
  }

  log(`  ${data.projects.length} projects processed`);
}

async function seedSkills() {
  log(`\n${c.cyan}skills${c.reset}`);

  const categoryId = await upsert('skill_categories',
    { slug: data.skillCategory.slug },
    { name: data.skillCategory.name, slug: data.skillCategory.slug, is_active: 1, sort_order: 10 });

  let order = 10;
  for (const skill of data.skills) {
    await upsert('skills', { slug: skill.slug }, {
      name: skill.name,
      slug: skill.slug,
      category_id: categoryId,
      level: skill.level,
      aria_label: skill.aria_label,
      is_active: 1,
      sort_order: order,
    });
    order += 10;
  }

  log(`  ${data.skills.length} skills processed`);
}

async function seedServices() {
  log(`\n${c.cyan}services${c.reset}`);

  let order = 10;
  for (const service of data.services) {
    const iconId = service.legacy_icon
      ? await importAsset(service.legacy_icon, { alt: service.icon_alt, folder: 'icons' })
      : null;

    await upsert('services', { title: service.title }, {
      title: service.title,
      description: service.description,
      icon_type: service.icon_type,
      icon_name: service.icon_name || null,
      icon_media_id: iconId,
      icon_alt: service.icon_alt || null,
      is_active: 1,
      sort_order: order,
    });
    order += 10;
  }

  log(`  ${data.services.length} services processed`);
}

async function main() {
  log(`\n${c.bold}Portfolio CMS - content migration${c.reset}`);
  log(`${c.dim}Reading content extracted from index.html${c.reset}`);
  if (force) log(`${c.yellow}--force: existing rows will be overwritten${c.reset}`);

  const health = await db.healthCheck();
  if (!health.connected) {
    log(`\n${c.red}Cannot reach the database (${health.error}).${c.reset}`);
    log(`${c.dim}Start MySQL in XAMPP, then run: npm run migrate${c.reset}\n`);
    process.exitCode = 1;
    return;
  }

  await seedProfile();

  await seedSimpleList('social links', 'social_links', data.socialLinks, 'platform',
    async (row, order) => ({
      platform: row.platform,
      url: row.url,
      icon_name: row.icon_name,
      username: row.username || null,
      include_in_jsonld: row.include_in_jsonld ?? 1,
      show_in_sidebar: 1,
      open_in_new_tab: 1,
      is_active: 1,
      sort_order: order,
    }));

  await seedSimpleList('navigation items', 'navigation', data.navigation, 'label',
    async (row, order) => ({
      label: row.label,
      target_page: row.target_page,
      link_type: row.link_type,
      is_active: 1,
      sort_order: order,
    }));

  await seedServices();

  await seedSimpleList('education entries', 'education', data.education, 'institution',
    async (row, order) => ({
      institution: row.institution,
      degree: row.degree || null,
      field: row.field || null,
      grade: row.grade || null,
      date_label: row.date_label || null,
      start_year: row.start_year || null,
      end_year: row.end_year || null,
      is_current: row.is_current || 0,
      description: row.description || null,
      is_active: 1,
      sort_order: order,
    }));

  await seedExperience();

  await seedSimpleList('achievements', 'achievements', data.achievements, 'title',
    async (row, order) => ({
      title: row.title,
      description: row.description || null,
      organization: row.organization || null,
      achieved_on: row.achieved_on || null,
      date_label: row.date_label || null,
      category: row.category || null,
      is_featured: row.is_featured || 0,
      is_active: 1,
      sort_order: order,
    }));

  await seedSimpleList('certifications', 'certifications', data.certifications, 'name',
    async (row, order) => ({
      name: row.name,
      issuer: row.issuer || null,
      date_label: row.date_label || null,
      description: row.description || null,
      is_featured: row.is_featured || 0,
      is_active: 1,
      sort_order: order,
    }));

  await seedSkills();

  await seedSimpleList('project categories', 'project_categories', data.projectCategories, 'slug',
    async (row, order) => ({
      name: row.name,
      slug: row.slug,
      is_active: 1,
      sort_order: order,
    }));

  await seedProjects();

  log(`\n${c.green}${c.bold}Migration complete.${c.reset}`);
  log(`${c.dim}  created ${stats.created} · skipped ${stats.skipped} (already present) · updated ${stats.updated}${c.reset}`);
  log(`${c.dim}  media imported ${stats.media}${stats.mediaFailed ? ` · ${stats.mediaFailed} could not be imported` : ''}${c.reset}`);

  if (stats.skipped && !force) {
    log(`\n${c.dim}Rows that already existed were left alone. Use --force to overwrite them.${c.reset}`);
  }
  log('');
}

main()
  .catch((err) => {
    log(`\n${c.red}Seeding failed: ${err.message}${c.reset}`);
    if (config.isDevelopment) log(`${c.dim}${err.stack}${c.reset}`);
    process.exitCode = 1;
  })
  .finally(() => db.closePool().catch(() => {}));
