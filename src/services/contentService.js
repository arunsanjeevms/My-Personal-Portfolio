'use strict';

/**
 * Read model for the public site.
 *
 * Every getter is cached and every admin write clears the "public:"
 * prefix, so a page render usually costs zero queries. On a cache miss
 * the whole page is a handful of batched queries - no N+1.
 *
 * If the database is unreachable, each getter returns an empty result
 * rather than throwing, so the site degrades to a page with missing
 * sections instead of a 500.
 */

const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { sanitizeHtml } = require('./resourceService');

const TTL = 300;

/** Wraps a query so a database failure yields `fallback` instead of throwing. */
async function safely(key, fallback, producer) {
  try {
    return await cache.remember(`public:${key}`, TTL, producer);
  } catch (err) {
    logger.error(`content: ${key} failed, serving fallback`, { message: err.message });
    return fallback;
  }
}

/** Resolves a media id to a public URL, with variants. */
async function mediaMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};

  const rows = await db.queryUnprepared(
    `SELECT id, url_path, alt, title, width, height, mime
       FROM media WHERE id IN (?) AND deleted_at IS NULL`,
    [unique],
  );

  const map = {};
  for (const row of rows) map[row.id] = row;
  return map;
}

async function getProfile() {
  return safely('profile', null, async () => {
    const row = await db.queryOne('SELECT * FROM profile WHERE id = 1');
    if (!row) return null;

    const media = await mediaMap([row.photo_media_id, row.resume_media_id]);
    return {
      ...row,
      // Sanitised again on the way out, so content stored under an older
      // rule set is still cleaned before it reaches a browser.
      about_html: sanitizeHtml(row.about_html),
      photo: media[row.photo_media_id] || null,
      resume: media[row.resume_media_id] || null,
    };
  });
}

async function getSocialLinks() {
  return safely('social', [], () => db.query(
    `SELECT id, platform, label, url, icon_name, username, open_in_new_tab,
            show_in_sidebar, show_in_footer, include_in_jsonld
       FROM social_links
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getNavigation() {
  return safely('navigation', [], () => db.query(
    `SELECT id, parent_id, label, url, target_page, link_type, icon_name, open_in_new_tab
       FROM navigation
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getServices() {
  return safely('services', [], async () => {
    const rows = await db.query(
      `SELECT id, title, description, icon_type, icon_name, icon_media_id, icon_alt,
              features, starting_price, cta_label, cta_url
         FROM services
        WHERE is_active = 1
        ORDER BY sort_order ASC, id ASC`,
    );

    const media = await mediaMap(rows.map((row) => row.icon_media_id));
    return rows.map((row) => ({
      ...row,
      icon: media[row.icon_media_id] || null,
      featureList: row.features ? row.features.split('\n').filter(Boolean) : [],
    }));
  });
}

async function getEducation() {
  return safely('education', [], () => db.query(
    `SELECT id, institution, degree, field, grade, date_label, start_year, end_year,
            is_current, description, location, website
       FROM education
      WHERE is_active = 1 AND deleted_at IS NULL
      ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getExperience() {
  return safely('experience', [], async () => {
    const rows = await db.query(
      `SELECT id, company, position, employment_type, location, date_label,
              start_date, end_date, is_current, description, company_url
         FROM experience
        WHERE is_active = 1 AND deleted_at IS NULL
        ORDER BY sort_order ASC, id ASC`,
    );

    if (!rows.length) return rows;

    // One batched query for all bullets rather than one per entry.
    const bullets = await db.queryUnprepared(
      `SELECT experience_id, bullet_type, content
         FROM experience_bullets
        WHERE experience_id IN (?)
        ORDER BY sort_order ASC, id ASC`,
      [rows.map((row) => row.id)],
    );

    const byExperience = new Map();
    for (const bullet of bullets) {
      if (!byExperience.has(bullet.experience_id)) byExperience.set(bullet.experience_id, []);
      byExperience.get(bullet.experience_id).push(bullet);
    }

    return rows.map((row) => ({ ...row, bullets: byExperience.get(row.id) || [] }));
  });
}

async function getAchievements() {
  return safely('achievements', [], () => db.query(
    `SELECT id, title, description, organization, date_label, achieved_on,
            external_url, category, is_featured
       FROM achievements
      WHERE is_active = 1 AND deleted_at IS NULL
      ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getCertifications() {
  return safely('certifications', [], () => db.query(
    `SELECT id, name, issuer, date_label, issue_date, expiry_date,
            credential_id, credential_url, description, is_featured
       FROM certifications
      WHERE is_active = 1 AND deleted_at IS NULL
      ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getSkills() {
  return safely('skills', [], () => db.query(
    `SELECT s.id, s.name, s.level, s.aria_label, s.icon_name, s.years_experience,
            s.is_featured, c.name AS category_name, c.slug AS category_slug
       FROM skills s
       LEFT JOIN skill_categories c ON c.id = s.category_id
      WHERE s.is_active = 1
      ORDER BY s.sort_order ASC, s.id ASC`,
  ));
}

async function getProjectCategories() {
  return safely('project-categories', [], () => db.query(
    `SELECT id, name, slug FROM project_categories
      WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`,
  ));
}

async function getProjects() {
  return safely('projects', [], async () => {
    const rows = await db.query(
      `SELECT p.id, p.title, p.slug, p.category_label, p.short_description,
              p.featured_media_id, p.image_alt, p.primary_url, p.github_url,
              p.live_url, p.open_in_new_tab, p.is_featured,
              c.slug AS category_slug, c.name AS category_name
         FROM projects p
         LEFT JOIN project_categories c ON c.id = p.category_id
        WHERE p.status = 'published' AND p.deleted_at IS NULL
        ORDER BY p.sort_order ASC, p.id ASC`,
    );

    const media = await mediaMap(rows.map((row) => row.featured_media_id));
    return rows.map((row) => ({ ...row, image: media[row.featured_media_id] || null }));
  });
}

/** Full project record for /projects/:slug. Not cached by slug to keep the cache small. */
async function getProjectBySlug(slug) {
  try {
    const project = await db.queryOne(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM projects p
         LEFT JOIN project_categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.status = 'published' AND p.deleted_at IS NULL
        LIMIT 1`,
      [slug],
    );
    if (!project) return null;

    const [gallery, technologies] = await Promise.all([
      db.query(
        `SELECT m.id, m.url_path, m.width, m.height, pi.alt, pi.caption
           FROM project_images pi
           JOIN media m ON m.id = pi.media_id
          WHERE pi.project_id = ? AND m.deleted_at IS NULL
          ORDER BY pi.sort_order ASC`,
        [project.id],
      ),
      db.query(
        `SELECT t.name, t.slug, t.icon_name
           FROM project_technologies pt
           JOIN technologies t ON t.id = pt.technology_id
          WHERE pt.project_id = ?
          ORDER BY pt.sort_order ASC`,
        [project.id],
      ),
    ]);

    const media = await mediaMap([project.featured_media_id, project.og_media_id]);

    return {
      ...project,
      full_description: sanitizeHtml(project.full_description),
      image: media[project.featured_media_id] || null,
      ogImage: media[project.og_media_id] || null,
      gallery,
      technologies,
    };
  } catch (err) {
    logger.error('content: project lookup failed', { slug, message: err.message });
    return null;
  }
}

/** Enabled page sections, keyed by section_key for O(1) template lookups. */
async function getSections() {
  return safely('sections', {}, async () => {
    const rows = await db.query(
      `SELECT section_key, label, page_key, title, subtitle, icon_name, is_enabled, sort_order
         FROM homepage_sections ORDER BY sort_order ASC`,
    );

    const map = {};
    for (const row of rows) map[row.section_key] = row;
    return map;
  });
}

/** Everything the shared layout needs, in one call. */
async function getLayoutData() {
  const [profile, social, navigation, sections] = await Promise.all([
    getProfile(), getSocialLinks(), getNavigation(), getSections(),
  ]);
  return { profile, social, navigation, sections };
}

function invalidate() {
  cache.invalidatePrefix('public:');
}

module.exports = {
  getProfile,
  getSocialLinks,
  getNavigation,
  getServices,
  getEducation,
  getExperience,
  getAchievements,
  getCertifications,
  getSkills,
  getProjects,
  getProjectCategories,
  getProjectBySlug,
  getSections,
  getLayoutData,
  invalidate,
  mediaMap,
};
