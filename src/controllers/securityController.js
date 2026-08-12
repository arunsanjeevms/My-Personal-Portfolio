'use strict';

/**
 * Security screen: active sessions, sign-in history, 2FA, and the
 * custom-code injection area.
 */

const db = require('../config/database');
const twoFactorService = require('../services/twoFactorService');
const loginAttemptRepository = require('../repositories/loginAttemptRepository');
const activityService = require('../services/activityService');
const settingsService = require('../services/settingsService');
const contentService = require('../services/contentService');
const authService = require('../services/authService');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { config } = require('../config/env');
const { asyncHandler, ValidationError, ForbiddenError } = require('../utils/errors');

/**
 * Active sessions, read out of the session store.
 *
 * express-session serialises the session as JSON in `data`, so the user
 * it belongs to is recovered by parsing that rather than by keeping a
 * duplicate index that could drift.
 */
async function getActiveSessions(currentSessionId) {
  const rows = await db.query(
    'SELECT session_id, expires, data FROM sessions ORDER BY expires DESC LIMIT 100',
  );

  const sessions = [];
  for (const row of rows) {
    let parsed = null;
    try {
      parsed = JSON.parse(row.data || '{}');
    } catch {
      continue;
    }
    if (!parsed?.user?.id) continue;   // anonymous session, not worth listing

    sessions.push({
      id: row.session_id,
      isCurrent: row.session_id === currentSessionId,
      userId: parsed.user.id,
      userName: parsed.user.name,
      userEmail: parsed.user.email,
      role: parsed.user.roleName,
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : null,
      expiresAt: new Date(row.expires * 1000),
    });
  }

  return sessions;
}

/** GET /admin/security */
const index = asyncHandler(async (req, res) => {
  const [twoFactor, sessions, attempts, summary, settings] = await Promise.all([
    twoFactorService.getStatus(req.session.user.id),
    getActiveSessions(req.sessionID),
    loginAttemptRepository.recent(25),
    loginAttemptRepository.summary(24),
    settingsService.getAll(),
  ]);

  res.render('admin/security', {
    title: 'Security',
    activeNav: 'security',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Security' },
    ],
    twoFactor,
    sessions,
    attempts,
    summary,
    settings,
    // Only present immediately after enrolment or regeneration.
    enrolment: req.session.pendingEnrolment || null,
    backupCodes: req.session.freshBackupCodes || null,
  });

  // Shown once, then discarded.
  delete req.session.freshBackupCodes;
});

/** POST /admin/security/2fa/begin */
const beginTwoFactor = asyncHandler(async (req, res) => {
  const status = await twoFactorService.getStatus(req.session.user.id);
  if (status.enabled) throw new ValidationError('Two-factor authentication is already switched on.');

  const settings = await settingsService.getAll();
  const { secret, uri, qr } = await twoFactorService.beginEnrolment(
    req.session.user,
    settings.site_name || 'Portfolio CMS',
  );

  // Held in the session only until the setup is confirmed.
  req.session.pendingEnrolment = { secret, uri, qr };

  res.redirect(`${res.locals.adminPath}/security#two-factor`);
});

/** POST /admin/security/2fa/confirm */
const confirmTwoFactor = asyncHandler(async (req, res) => {
  const codes = await twoFactorService.confirmEnrolment(req.session.user.id, req.body.token);

  delete req.session.pendingEnrolment;
  req.session.freshBackupCodes = codes;

  await activityService.record({
    req,
    action: 'security.2fa_enabled',
    entity: 'user',
    entityId: req.session.user.id,
    description: 'Enabled two-factor authentication',
    severity: 'critical',
  });

  req.flash('success', 'Two-factor authentication is on. Save your backup codes now.');
  res.redirect(`${res.locals.adminPath}/security#two-factor`);
});

/** POST /admin/security/2fa/disable */
const disableTwoFactor = asyncHandler(async (req, res) => {
  // Turning off a second factor requires proving the first one again.
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
  const matches = await authService.verifyPassword(req.body.password, user.password_hash);

  if (!matches) {
    logger.security('2fa: disable rejected, wrong password', { userId: req.session.user.id });
    throw new ValidationError('That password is not correct.');
  }

  const settings = await settingsService.getAll();
  if (settings.require_2fa_super_admin && req.session.user.role === 'super_admin') {
    throw new ForbiddenError('Two-factor authentication is required for Super Admins by policy.');
  }

  await twoFactorService.disable(req.session.user.id);

  await activityService.record({
    req,
    action: 'security.2fa_disabled',
    entity: 'user',
    entityId: req.session.user.id,
    description: 'Disabled two-factor authentication',
    severity: 'critical',
  });

  req.flash('success', 'Two-factor authentication has been turned off.');
  res.redirect(`${res.locals.adminPath}/security#two-factor`);
});

/** POST /admin/security/2fa/backup-codes */
const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const codes = await twoFactorService.regenerateBackupCodes(req.session.user.id);
  req.session.freshBackupCodes = codes;

  await activityService.record({
    req,
    action: 'security.2fa_backup_codes',
    entity: 'user',
    entityId: req.session.user.id,
    description: 'Regenerated two-factor backup codes',
    severity: 'warning',
  });

  req.flash('success', 'New backup codes issued. The previous set no longer works.');
  res.redirect(`${res.locals.adminPath}/security#two-factor`);
});

/** POST /admin/security/sessions/:id/revoke */
const revokeSession = asyncHandler(async (req, res) => {
  const sessionId = String(req.params.id);

  if (sessionId === req.sessionID) {
    throw new ValidationError('That is your current session. Use Sign out instead.');
  }

  await db.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);

  await activityService.record({
    req,
    action: 'security.session_revoked',
    entity: 'session',
    description: 'Revoked another active session',
    severity: 'warning',
  });

  req.flash('success', 'That session has been signed out.');
  res.redirect(`${res.locals.adminPath}/security`);
});

/** POST /admin/security/sessions/revoke-others */
const revokeOtherSessions = asyncHandler(async (req, res) => {
  const [result] = await db.getPool().execute(
    'DELETE FROM sessions WHERE session_id <> ?', [req.sessionID],
  );

  await activityService.record({
    req,
    action: 'security.sessions_revoked',
    entity: 'session',
    description: `Signed out ${result.affectedRows} other session(s)`,
    severity: 'warning',
  });

  req.flash('success', `${result.affectedRows} other session(s) signed out.`);
  res.redirect(`${res.locals.adminPath}/security`);
});

/* ------------------------------------------------------ custom code */

/** GET /admin/custom-code */
const customCode = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM custom_code ORDER BY FIELD(location, "head", "body_start", "body_end")');

  res.render('admin/custom-code', {
    title: 'Custom code',
    activeNav: 'custom-code',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Custom code' },
    ],
    blocks: rows,
  });
});

/**
 * POST /admin/custom-code
 *
 * This writes raw markup into every public page. It is deliberately
 * restricted to Super Admin, requires the password again, and records
 * the full before/after in the audit log.
 */
const updateCustomCode = asyncHandler(async (req, res) => {
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
  const matches = await authService.verifyPassword(req.body.password, user.password_hash);

  if (!matches) {
    logger.security('custom-code: save rejected, wrong password', { userId: req.session.user.id });
    throw new ValidationError('Enter your password to confirm this change.');
  }

  const locations = ['head', 'body_start', 'body_end'];
  const changed = [];

  for (const location of locations) {
    const before = await db.queryOne('SELECT * FROM custom_code WHERE location = ?', [location]);
    const code = String(req.body[`code_${location}`] || '').trim() || null;
    const enabled = req.body[`enabled_${location}`] ? 1 : 0;

    if ((before?.code || null) === code && Boolean(before?.is_enabled) === Boolean(enabled)) continue;

    await db.query(
      'UPDATE custom_code SET code = ?, is_enabled = ?, updated_by = ? WHERE location = ?',
      [code, enabled, req.session.user.id, location],
    );

    changed.push(location);

    await activityService.record({
      req,
      action: 'custom_code.update',
      entity: 'custom_code',
      entityId: before?.id,
      description: `Changed the ${location.replace('_', ' ')} code block (${enabled ? 'enabled' : 'disabled'})`,
      // The full markup is retained so a bad change can be traced.
      before: { code: before?.code, enabled: before?.is_enabled },
      after: { code, enabled },
      severity: 'critical',
    });
  }

  cache.del('public:custom-code');
  contentService.invalidate();

  req.flash(changed.length ? 'success' : 'info', changed.length
    ? `Updated ${changed.length} code block(s). Check your site renders correctly.`
    : 'No changes to save.');

  res.redirect(`${res.locals.adminPath}/custom-code`);
});

module.exports = {
  index,
  beginTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  revokeSession,
  revokeOtherSessions,
  customCode,
  updateCustomCode,
  getActiveSessions,
};
