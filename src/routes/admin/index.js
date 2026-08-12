'use strict';

/**
 * Admin routes.
 *
 * Route order matters:
 *   1. guest-only auth routes (login) - no session required
 *   2. requireAuth for everything below
 *   3. requirePasswordChange - blocks the rest until a forced change
 *   4. feature routes, each with its own requirePermission()
 */

const express = require('express');

const authController = require('../../controllers/authController');
const dashboardController = require('../../controllers/dashboardController');
const profileController = require('../../controllers/profileController');
const mediaController = require('../../controllers/mediaController');
const settingsController = require('../../controllers/settingsController');
const messagesController = require('../../controllers/messagesController');
const analyticsController = require('../../controllers/analyticsController');
const opsController = require('../../controllers/opsController');
const usersController = require('../../controllers/usersController');
const securityController = require('../../controllers/securityController');
const resourceRoutes = require('./resources');
const upload = require('../../middleware/upload');
const {
  requireAuth, requireGuest, requirePermission, requireRole, requirePasswordChange,
} = require('../../middleware/auth');
const { loginLimiter, adminWriteLimiter, uploadLimiter } = require('../../middleware/rateLimit');
const {
  loginRules, changePasswordRules, handleValidation,
} = require('../../validators/authValidator');

const router = express.Router();

// ------------------------------------------------------------ auth
router.get('/login', requireGuest, authController.showLogin);
router.post(
  '/login',
  requireGuest,
  loginLimiter,
  loginRules,
  handleValidation,
  authController.login,
);
// Returns validation failures to the login form instead of an error page.
router.use('/login', authController.loginValidationHandler);

// Second factor. Guest-only: the session is not established until the
// code is verified, so these must be reachable while signed out.
router.get('/login/2fa', requireGuest, authController.showTwoFactor);
router.post('/login/2fa', requireGuest, loginLimiter, authController.verifyTwoFactor);

// POST rather than GET so a stray link or prefetch cannot sign you out.
router.post('/logout', requireAuth, authController.logout);

// ------------------------------------------- everything below is private
router.use(requireAuth);
router.use(requirePasswordChange);

router.get('/password/change', authController.showChangePassword);
router.post(
  '/password/change',
  changePasswordRules,
  handleValidation,
  authController.changePassword,
);
router.use('/password/change', authController.changePasswordValidationHandler);

// ------------------------------------------------------- dashboard
router.get('/', (req, res) => res.redirect(`${res.locals.adminPath}/dashboard`));
router.get('/dashboard', dashboardController.index);
router.get('/system', requirePermission('manage_settings'), dashboardController.system);

// --------------------------------------------------------- profile
router.get('/profile', requirePermission('manage_profile'), profileController.edit);
router.post('/profile', requirePermission('manage_profile'), adminWriteLimiter, profileController.update);

// ----------------------------------------------------------- media
router.get('/media', requirePermission('manage_media'), mediaController.index);
router.get('/media/browse', requirePermission('manage_media'), mediaController.browse);
router.get('/media/:id(\\d+)/thumb', mediaController.thumb);
router.get('/media/:id(\\d+)/usage', requirePermission('manage_media'), mediaController.usage);
router.post(
  '/media/upload',
  requirePermission('manage_media'),
  uploadLimiter,
  upload.array('files', 10),
  upload.handleUploadErrors,
  mediaController.upload,
);
router.post('/media/:id(\\d+)', requirePermission('manage_media'), adminWriteLimiter, mediaController.update);
router.post('/media/:id(\\d+)/delete', requirePermission('manage_media'), adminWriteLimiter, mediaController.destroy);

// -------------------------------------------------------- settings
router.get('/settings', requirePermission('manage_settings'), settingsController.index);
router.post('/settings', requirePermission('manage_settings'), adminWriteLimiter, settingsController.update);
router.post('/settings/test-email', requirePermission('manage_settings'), adminWriteLimiter, settingsController.testEmail);

router.get('/theme', requirePermission('manage_theme'), settingsController.theme);
router.post('/theme', requirePermission('manage_theme'), adminWriteLimiter, settingsController.updateTheme);
router.post('/theme/reset', requirePermission('manage_theme'), adminWriteLimiter, settingsController.resetTheme);

router.get('/seo', requirePermission('manage_seo'), settingsController.seo);
router.post('/seo/:id(\\d+)', requirePermission('manage_seo'), adminWriteLimiter, settingsController.updateSeo);

router.get('/sections', requirePermission('manage_sections'), settingsController.sections);
router.post('/sections', requirePermission('manage_sections'), adminWriteLimiter, settingsController.updateSections);
router.post('/sections/flags', requirePermission('manage_features'), adminWriteLimiter, settingsController.updateFlags);

router.get('/redirects', requirePermission('manage_redirects'), settingsController.redirects);
router.post('/redirects', requirePermission('manage_redirects'), adminWriteLimiter, settingsController.createRedirect);
router.post('/redirects/:id(\\d+)/delete', requirePermission('manage_redirects'), adminWriteLimiter, settingsController.deleteRedirect);

// -------------------------------------------------------- messages
router.get('/messages', requirePermission('view_messages'), messagesController.index);
router.get('/messages/export', requirePermission('manage_messages'), messagesController.exportCsv);
router.get('/messages/:id(\\d+)', requirePermission('view_messages'), messagesController.show);
router.post('/messages/:id(\\d+)/status', requirePermission('manage_messages'), adminWriteLimiter, messagesController.updateStatus);
router.post('/messages/:id(\\d+)/star', requirePermission('manage_messages'), adminWriteLimiter, messagesController.toggleStar);
router.post('/messages/:id(\\d+)/notes', requirePermission('manage_messages'), adminWriteLimiter, messagesController.saveNotes);
router.post('/messages/:id(\\d+)/delete', requirePermission('manage_messages'), adminWriteLimiter, messagesController.destroy);

// --------------------------------------------------- notifications
router.get('/notifications', messagesController.notifications);
router.post('/notifications/read-all', adminWriteLimiter, messagesController.markAllRead);
router.post('/notifications/:id(\\d+)/read', adminWriteLimiter, messagesController.markRead);

// ------------------------------------------------------- analytics
router.get('/analytics', requirePermission('manage_analytics'), analyticsController.index);
router.get('/analytics/live', requirePermission('manage_analytics'), analyticsController.livePoll);
router.get('/analytics/export', requirePermission('manage_analytics'), analyticsController.exportCsv);
router.get('/activity-logs', requirePermission('view_activity_logs'), analyticsController.activityLogs);

// ------------------------------------------------------------- ops
router.get('/domain', requirePermission('manage_domains'), opsController.domains);
router.post('/domain', requirePermission('manage_domains'), adminWriteLimiter, opsController.createDomain);
router.post('/domain/:id(\\d+)', requirePermission('manage_domains'), adminWriteLimiter, opsController.updateDomain);
router.post('/domain/:id(\\d+)/check', requirePermission('manage_domains'), adminWriteLimiter, opsController.checkDomain);
router.post('/domain/:id(\\d+)/delete', requirePermission('manage_domains'), adminWriteLimiter, opsController.deleteDomain);

router.get('/backups', requirePermission('manage_backups'), opsController.backups);
router.post('/backups', requirePermission('manage_backups'), adminWriteLimiter, opsController.createBackup);
router.get('/backups/:id(\\d+)/download', requirePermission('manage_backups'), opsController.downloadBackup);
router.post('/backups/:id(\\d+)/restore', requirePermission('manage_backups'), adminWriteLimiter, opsController.restoreBackup);
router.post('/backups/:id(\\d+)/delete', requirePermission('manage_backups'), adminWriteLimiter, opsController.deleteBackup);

router.post('/jobs/:name/run', requirePermission('manage_backups'), adminWriteLimiter, opsController.runJobNow);

// -------------------------------------------------------- security
router.get('/security', requirePermission('manage_security'), securityController.index);
router.post('/security/2fa/begin', requirePermission('manage_security'), adminWriteLimiter, securityController.beginTwoFactor);
router.post('/security/2fa/confirm', requirePermission('manage_security'), adminWriteLimiter, securityController.confirmTwoFactor);
router.post('/security/2fa/disable', requirePermission('manage_security'), adminWriteLimiter, securityController.disableTwoFactor);
router.post('/security/2fa/backup-codes', requirePermission('manage_security'), adminWriteLimiter, securityController.regenerateBackupCodes);
router.post('/security/sessions/revoke-others', requirePermission('manage_security'), adminWriteLimiter, securityController.revokeOtherSessions);
router.post('/security/sessions/:id/revoke', requirePermission('manage_security'), adminWriteLimiter, securityController.revokeSession);

// ---------------------------------------------------- users & roles
router.get('/users', requirePermission('manage_users'), usersController.index);
router.post('/users', requirePermission('manage_users'), adminWriteLimiter, usersController.store);
router.post('/users/:id(\\d+)/role', requirePermission('manage_users'), adminWriteLimiter, usersController.updateRole);
router.post('/users/:id(\\d+)/status', requirePermission('manage_users'), adminWriteLimiter, usersController.toggleStatus);
router.post('/users/:id(\\d+)/reset-password', requirePermission('manage_users'), adminWriteLimiter, usersController.resetPassword);
router.post('/users/:id(\\d+)/delete', requirePermission('manage_users'), adminWriteLimiter, usersController.destroy);

// ----------------------------------------------------- custom code
// Super Admin only - this injects raw markup into every public page.
router.get('/custom-code', requireRole('super_admin'), requirePermission('manage_custom_code'), securityController.customCode);
router.post('/custom-code', requireRole('super_admin'), requirePermission('manage_custom_code'), adminWriteLimiter, securityController.updateCustomCode);

// ----------------------------------- declared content resources (CRUD)
router.use(resourceRoutes);

module.exports = router;
