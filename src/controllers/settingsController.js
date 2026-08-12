'use strict';

/**
 * Site settings, SEO, theme, page sections and redirects.
 */

const db = require('../config/database');
const settingsService = require('../services/settingsService');
const contentService = require('../services/contentService');
const seoService = require('../services/seoService');
const mailService = require('../services/mailService');
const activityService = require('../services/activityService');
const cache = require('../utils/cache');
const { asyncHandler, NotFoundError, ValidationError } = require('../utils/errors');

/** Friendly names for the settings tabs, in display order. */
const GROUP_LABELS = {
  branding: 'Branding',
  titles: 'Page titles',
  meta: 'Meta defaults',
  contact: 'Contact details',
  footer: 'Footer',
  status: 'Site status',
  analytics: 'Analytics',
  privacy: 'Privacy',
  mail: 'Email (SMTP)',
  blog: 'Blog',
  integrations: 'Integrations',
  security: 'Security policy',
};

/** GET /admin/settings */
const index = asyncHandler(async (req, res) => {
  const grouped = await settingsService.getGrouped();
  const activeGroup = req.query.group && GROUP_LABELS[req.query.group] ? req.query.group : 'branding';

  // Media-typed settings need their current thumbnails resolving.
  const mediaIds = [];
  for (const rows of grouped.values()) {
    for (const row of rows) {
      if (row.value_type === 'media' && row.setting_value) mediaIds.push(Number(row.setting_value));
    }
  }
  const media = await contentService.mediaMap(mediaIds);

  res.render('admin/settings', {
    title: 'Settings',
    activeNav: 'settings',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Settings' },
    ],
    grouped,
    groupLabels: GROUP_LABELS,
    activeGroup,
    media,
    searchTerm: req.query.q || '',
    mailConfigured: mailService.isConfigured(await mailService.getMailConfig()),
  });
});

/** POST /admin/settings */
const update = asyncHandler(async (req, res) => {
  const group = req.body._group;

  // Only the keys belonging to the submitted tab are considered, so a
  // crafted post cannot reach settings outside the visible form.
  const rows = await db.query(
    'SELECT setting_key, value_type FROM site_settings WHERE setting_group = ?',
    [group],
  );

  const updates = {};
  for (const row of rows) {
    if (row.value_type === 'boolean') {
      updates[row.setting_key] = Boolean(req.body[row.setting_key]);
    } else if (row.setting_key in req.body) {
      updates[row.setting_key] = req.body[row.setting_key];
    }
  }

  const { changed, before, after } = await settingsService.setMany(updates);

  if (changed.length) {
    // Rebuilding the mail transport picks up new SMTP credentials.
    if (group === 'mail') mailService.reset();
    seoService.invalidate();
    contentService.invalidate();

    await activityService.record({
      req,
      action: 'settings.update',
      entity: 'settings',
      description: `Updated ${changed.length} setting(s) in ${GROUP_LABELS[group] || group}`,
      // Only the changed keys, and secrets are excluded by the diff.
      before: Object.fromEntries(changed.map((key) => [key, before[key]])),
      after: Object.fromEntries(changed.map((key) => [key, after[key]])),
      severity: 'warning',
    });

    req.flash('success', `${changed.length} setting${changed.length === 1 ? '' : 's'} saved.`);
  } else {
    req.flash('info', 'No changes to save.');
  }

  res.redirect(`${res.locals.adminPath}/settings?group=${encodeURIComponent(group)}`);
});

/** POST /admin/settings/test-email */
const testEmail = asyncHandler(async (req, res) => {
  const recipient = String(req.body.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)) {
    throw new ValidationError('Enter a valid email address to send the test to.');
  }

  const result = await mailService.sendTest(recipient);

  await activityService.record({
    req,
    action: 'settings.test_email',
    entity: 'settings',
    description: `Sent a test email to ${recipient} (${result.sent ? 'delivered' : 'failed'})`,
  });

  req.flash(result.sent ? 'success' : 'error',
    result.sent ? `Test email sent to ${recipient}.` : `Could not send: ${result.reason}`);

  res.redirect(`${res.locals.adminPath}/settings?group=mail`);
});

/* ------------------------------------------------------------- theme */

/** GET /admin/theme */
const theme = asyncHandler(async (req, res) => {
  const variables = await settingsService.getThemeVariables();

  const groups = new Map();
  for (const variable of variables) {
    if (!groups.has(variable.group_name)) groups.set(variable.group_name, []);
    groups.get(variable.group_name).push(variable);
  }

  res.render('admin/theme', {
    title: 'Theme',
    activeNav: 'theme',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Theme' },
    ],
    groups,
    changedCount: variables.filter((v) => v.var_value !== v.default_value).length,
  });
});

/** POST /admin/theme */
const updateTheme = asyncHandler(async (req, res) => {
  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (key.startsWith('--')) updates[key] = value;
  }

  const changed = await settingsService.setThemeVariables(updates);
  contentService.invalidate();

  await activityService.record({
    req,
    action: 'theme.update',
    entity: 'theme',
    description: `Updated ${changed.length} theme variable(s)`,
  });

  req.flash('success', changed.length
    ? `${changed.length} colour${changed.length === 1 ? '' : 's'} updated.`
    : 'No changes to save.');

  res.redirect(`${res.locals.adminPath}/theme`);
});

/** POST /admin/theme/reset */
const resetTheme = asyncHandler(async (req, res) => {
  await settingsService.resetTheme();
  contentService.invalidate();

  await activityService.record({
    req,
    action: 'theme.reset',
    entity: 'theme',
    description: 'Reset all theme variables to their stylesheet defaults',
    severity: 'warning',
  });

  req.flash('success', 'Theme reset to the original design.');
  res.redirect(`${res.locals.adminPath}/theme`);
});

/* ---------------------------------------------------------------- SEO */

/** GET /admin/seo */
const seo = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM seo_settings ORDER BY id ASC');
  const media = await contentService.mediaMap(
    rows.flatMap((row) => [row.og_media_id, row.twitter_media_id]),
  );

  res.render('admin/seo', {
    title: 'SEO',
    activeNav: 'seo',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'SEO' },
    ],
    rows,
    media,
    settings: await settingsService.getAll(),
  });
});

/** POST /admin/seo/:id */
const updateSeo = asyncHandler(async (req, res) => {
  const before = await db.queryOne('SELECT * FROM seo_settings WHERE id = ?', [req.params.id]);
  if (!before) throw new NotFoundError('That SEO record no longer exists.');

  const text = (value, max) => (value ? String(value).trim().slice(0, max) : null);
  const mediaId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const values = {
    meta_title: text(req.body.meta_title, 200),
    meta_description: text(req.body.meta_description, 320),
    meta_keywords: text(req.body.meta_keywords, 320),
    canonical_url: text(req.body.canonical_url, 500),
    robots: text(req.body.robots, 120) || 'index, follow',
    og_title: text(req.body.og_title, 200),
    og_description: text(req.body.og_description, 320),
    og_media_id: mediaId(req.body.og_media_id),
    twitter_card: req.body.twitter_card === 'summary' ? 'summary' : 'summary_large_image',
    twitter_title: text(req.body.twitter_title, 200),
    twitter_description: text(req.body.twitter_description, 320),
    twitter_media_id: mediaId(req.body.twitter_media_id),
    in_sitemap: req.body.in_sitemap ? 1 : 0,
    sitemap_priority: Math.min(1, Math.max(0, Number(req.body.sitemap_priority) || 0.5)),
    sitemap_changefreq: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']
      .includes(req.body.sitemap_changefreq) ? req.body.sitemap_changefreq : 'weekly',
  };

  const columns = Object.keys(values);
  await db.query(
    `UPDATE seo_settings SET ${columns.map((col) => `\`${col}\` = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(values), before.id],
  );

  const after = await db.queryOne('SELECT * FROM seo_settings WHERE id = ?', [before.id]);

  seoService.invalidate();
  contentService.invalidate();

  await activityService.record({
    req,
    action: 'seo.update',
    entity: 'seo',
    entityId: before.id,
    description: `Updated SEO for the ${before.page_label || before.page_key} page`,
    before,
    after,
  });

  req.flash('success', `SEO saved for ${before.page_label || before.page_key}.`);
  res.redirect(`${res.locals.adminPath}/seo`);
});

/* ----------------------------------------------------- page sections */

/** GET /admin/sections */
const sections = asyncHandler(async (req, res) => {
  const rows = await db.query(
    'SELECT * FROM homepage_sections ORDER BY page_key ASC, sort_order ASC',
  );

  const byPage = new Map();
  for (const row of rows) {
    if (!byPage.has(row.page_key)) byPage.set(row.page_key, []);
    byPage.get(row.page_key).push(row);
  }

  res.render('admin/sections', {
    title: 'Page sections',
    activeNav: 'sections',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Page sections' },
    ],
    byPage,
    flags: await settingsService.listFlags(),
  });
});

/** POST /admin/sections */
const updateSections = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT id, section_key, is_locked FROM homepage_sections');
  let changed = 0;

  await db.transaction(async (connection) => {
    for (const row of rows) {
      const enabled = row.is_locked ? 1 : (req.body[`enabled_${row.id}`] ? 1 : 0);
      const title = req.body[`title_${row.id}`] ? String(req.body[`title_${row.id}`]).trim().slice(0, 160) : null;
      const subtitle = req.body[`subtitle_${row.id}`] ? String(req.body[`subtitle_${row.id}`]).trim().slice(0, 255) : null;
      const order = Number.parseInt(req.body[`order_${row.id}`], 10);

      const [result] = await connection.execute(
        'UPDATE homepage_sections SET is_enabled = ?, title = ?, subtitle = ?, sort_order = ? WHERE id = ?',
        [enabled, title, subtitle, Number.isFinite(order) ? order : 0, row.id],
      );
      if (result.changedRows) changed += 1;
    }
  });

  contentService.invalidate();

  await activityService.record({
    req,
    action: 'sections.update',
    entity: 'sections',
    description: `Updated ${changed} page section(s)`,
  });

  req.flash('success', changed ? `${changed} section(s) updated.` : 'No changes to save.');
  res.redirect(`${res.locals.adminPath}/sections`);
});

/** POST /admin/sections/flags */
const updateFlags = asyncHandler(async (req, res) => {
  const all = await settingsService.listFlags();
  const updates = {};
  for (const flag of all) updates[flag.flag_key] = Boolean(req.body[flag.flag_key]);

  const changed = await settingsService.setFlags(updates);
  contentService.invalidate();

  await activityService.record({
    req,
    action: 'features.update',
    entity: 'settings',
    description: `Toggled ${changed.length} feature flag(s)`,
    severity: 'warning',
  });

  req.flash('success', changed.length ? 'Feature flags updated.' : 'No changes to save.');
  res.redirect(`${res.locals.adminPath}/sections`);
});

/* ---------------------------------------------------------- redirects */

/** GET /admin/redirects */
const redirects = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM redirects ORDER BY created_at DESC');

  res.render('admin/redirects', {
    title: 'Redirects',
    activeNav: 'redirects',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Redirects' },
    ],
    rows,
    formErrors: {},
  });
});

/** POST /admin/redirects */
const createRedirect = asyncHandler(async (req, res) => {
  let source = String(req.body.source_path || '').trim();
  const destination = String(req.body.destination || '').trim();
  const statusCode = req.body.status_code === '302' ? 302 : 301;

  if (!source.startsWith('/')) source = `/${source}`;

  const errors = {};
  if (source.length < 2) errors.source_path = 'Enter a source path, e.g. /old-page';
  if (!destination) errors.destination = 'Enter where it should go.';
  if (source === destination) errors.destination = 'The source and destination are the same.';
  if (source.startsWith(res.locals.adminPath)) errors.source_path = 'Admin paths cannot be redirected.';

  if (!Object.keys(errors).length) {
    const clash = await db.queryOne('SELECT id FROM redirects WHERE source_path = ?', [source]);
    if (clash) errors.source_path = 'A redirect for that path already exists.';
  }

  if (Object.keys(errors).length) {
    const rows = await db.query('SELECT * FROM redirects ORDER BY created_at DESC');
    return res.status(400).render('admin/redirects', {
      title: 'Redirects',
      activeNav: 'redirects',
      breadcrumbs: [{ label: 'Redirects' }],
      rows,
      formErrors: errors,
    });
  }

  await db.query(
    'INSERT INTO redirects (source_path, destination, status_code, is_active, created_by) VALUES (?,?,?,1,?)',
    [source, destination, statusCode, req.session.user.id],
  );

  cache.invalidatePrefix('redirects');

  await activityService.record({
    req,
    action: 'redirect.create',
    entity: 'redirect',
    description: `Created ${statusCode} redirect ${source} → ${destination}`,
  });

  req.flash('success', 'Redirect created.');
  return res.redirect(`${res.locals.adminPath}/redirects`);
});

/** POST /admin/redirects/:id/delete */
const deleteRedirect = asyncHandler(async (req, res) => {
  const row = await db.queryOne('SELECT * FROM redirects WHERE id = ?', [req.params.id]);
  if (!row) throw new NotFoundError('That redirect no longer exists.');

  await db.query('DELETE FROM redirects WHERE id = ?', [row.id]);
  cache.invalidatePrefix('redirects');

  await activityService.record({
    req,
    action: 'redirect.delete',
    entity: 'redirect',
    entityId: row.id,
    description: `Deleted redirect ${row.source_path}`,
    severity: 'warning',
  });

  req.flash('success', 'Redirect deleted.');
  res.redirect(`${res.locals.adminPath}/redirects`);
});

module.exports = {
  index, update, testEmail,
  theme, updateTheme, resetTheme,
  seo, updateSeo,
  sections, updateSections, updateFlags,
  redirects, createRedirect, deleteRedirect,
  GROUP_LABELS,
};
