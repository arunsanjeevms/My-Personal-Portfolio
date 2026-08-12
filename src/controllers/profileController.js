'use strict';

/**
 * Profile - a singleton row (profile.id = 1), so it gets its own
 * controller rather than going through the generic resource framework.
 */

const db = require('../config/database');
const activityService = require('../services/activityService');
const contentService = require('../services/contentService');
const { sanitizeHtml } = require('../services/resourceService');
const { asyncHandler } = require('../utils/errors');

/** Columns writable from the profile form. Anything else is ignored. */
const TEXT_FIELDS = [
  'full_name', 'display_name', 'professional_title', 'secondary_title', 'tagline',
  'short_bio', 'email', 'email_subject', 'phone', 'whatsapp_url', 'location_html',
  'city', 'state', 'country', 'availability', 'current_status',
  'resume_label', 'resume_version',
];
const BOOLEAN_FIELDS = ['show_email', 'show_phone', 'show_birthday', 'show_location'];
const DATE_FIELDS = ['birthday', 'resume_updated_at'];
const MEDIA_FIELDS = ['photo_media_id', 'resume_media_id'];
const HTML_FIELDS = ['about_html', 'long_bio'];

/** GET /admin/profile */
const edit = asyncHandler(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profile WHERE id = 1');

  res.render('admin/profile', {
    title: 'Profile',
    activeNav: 'profile',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Profile' },
    ],
    profile: profile || {},
    formErrors: {},
  });
});

/** POST /admin/profile */
const update = asyncHandler(async (req, res) => {
  const before = await db.queryOne('SELECT * FROM profile WHERE id = 1');
  const values = {};
  const errors = {};

  for (const field of TEXT_FIELDS) {
    const raw = req.body[field];
    values[field] = raw === undefined || String(raw).trim() === '' ? null : String(raw).trim();
  }
  for (const field of BOOLEAN_FIELDS) {
    values[field] = req.body[field] ? 1 : 0;
  }
  for (const field of DATE_FIELDS) {
    values[field] = req.body[field] ? String(req.body[field]).slice(0, 10) : null;
  }
  for (const field of MEDIA_FIELDS) {
    const parsed = Number.parseInt(req.body[field], 10);
    values[field] = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  for (const field of HTML_FIELDS) {
    values[field] = sanitizeHtml(req.body[field]);
  }

  const years = Number.parseFloat(req.body.years_experience);
  values.years_experience = Number.isFinite(years) ? years : null;

  // The email body is stored raw but is only ever used to build a
  // mailto: link, which the view URL-encodes.
  values.email_body = req.body.email_body ? String(req.body.email_body).trim() : null;

  if (!values.full_name) errors.full_name = 'Your full name is required.';
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (values.whatsapp_url && !/^https?:\/\//i.test(values.whatsapp_url)) {
    errors.whatsapp_url = 'Enter a full URL starting with https://';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('admin/profile', {
      title: 'Profile',
      activeNav: 'profile',
      breadcrumbs: [{ label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` }, { label: 'Profile' }],
      profile: { ...before, ...req.body },
      formErrors: errors,
    });
  }

  const columns = Object.keys(values);
  await db.query(
    `UPDATE profile SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = 1`,
    Object.values(values),
  );

  const after = await db.queryOne('SELECT * FROM profile WHERE id = 1');

  await activityService.record({
    req,
    action: 'profile.update',
    entity: 'profile',
    entityId: 1,
    description: 'Updated profile details',
    before,
    after,
  });

  contentService.invalidate();
  req.flash('success', 'Profile saved.');
  return res.redirect(`${res.locals.adminPath}/profile`);
});

module.exports = { edit, update };
