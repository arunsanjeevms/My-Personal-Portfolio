'use strict';

const authService = require('../services/authService');
const activityService = require('../services/activityService');
const settingsService = require('../services/settingsService');
const { config } = require('../config/env');
const twoFactorService = require('../services/twoFactorService');
const userRepository = require('../repositories/userRepository');
const { asyncHandler, UnauthorizedError } = require('../utils/errors');
const { safeRedirectPath, getClientIp } = require('../utils/request');
const { hashIp } = require('../utils/crypto');

const ADMIN = config.security.adminPath;

const LOGIN_NOTICES = {
  expired: { type: 'warning', message: 'Your session expired. Please sign in again.' },
  loggedout: { type: 'success', message: 'You have been signed out.' },
  reset: { type: 'success', message: 'Password updated. Sign in with your new password.' },
};

/** GET /admin/login */
const showLogin = asyncHandler(async (req, res) => {
  const settings = await settingsService.getAll().catch(() => ({}));
  const notice = LOGIN_NOTICES[req.query.reason] || null;

  res.render('auth/login', {
    layout: false,
    title: 'Sign in',
    siteName: settings.site_name || 'Portfolio CMS',
    nextPath: safeRedirectPath(req.query.next, `${ADMIN}/dashboard`),
    notice,
    formErrors: {},
    formValues: {},
  });
});

/**
 * POST /admin/login
 *
 * Credential failures re-render the form with the message rather than
 * bouncing to a 401 error page. The message itself is always the generic
 * one produced by authService - this handler never reveals which part
 * of the credentials was wrong.
 */
const login = asyncHandler(async (req, res, next) => {
  const { identifier, password } = req.body;
  const nextPath = safeRedirectPath(req.body.next, `${ADMIN}/dashboard`);

  let user;
  try {
    user = await authService.attemptLogin({ req, identifier, password });
  } catch (err) {
    // Anything unexpected still goes to the error handler.
    if (!err.expose || err.status >= 500) return next(err);

    const settings = await settingsService.getAll().catch(() => ({}));
    return res.status(err.status).render('auth/login', {
      layout: false,
      title: 'Sign in',
      siteName: settings.site_name || 'Portfolio CMS',
      nextPath,
      notice: { type: 'danger', message: err.message },
      formErrors: err.details || {},
      formValues: { identifier },
    });
  }

  // A correct password is only the first factor. When 2FA is on, the
  // session is NOT established yet - only a short-lived pending marker
  // is stored, so a half-completed sign-in grants no access at all.
  if (await twoFactorService.isEnabled(user.id)) {
    req.session.pendingTwoFactor = {
      userId: user.id,
      startedAt: Date.now(),
      nextPath,
    };

    return res.redirect(`${ADMIN}/login/2fa`);
  }

  await authService.establishSession(req, user);

  await activityService.record({
    req,
    action: 'auth.login',
    entity: 'user',
    entityId: user.id,
    description: `${user.email} signed in`,
  });

  if (req.session.user.mustChangePassword) {
    return res.redirect(`${ADMIN}/password/change?reason=required`);
  }

  return res.redirect(nextPath);
});

/** How long the second-factor step stays valid. */
const TWO_FACTOR_WINDOW_MS = 5 * 60 * 1000;

/** Reads and validates the pending 2FA marker. */
function readPending(req) {
  const pending = req.session?.pendingTwoFactor;
  if (!pending) return null;
  if (Date.now() - pending.startedAt > TWO_FACTOR_WINDOW_MS) {
    delete req.session.pendingTwoFactor;
    return null;
  }
  return pending;
}

/** GET /admin/login/2fa */
const showTwoFactor = asyncHandler(async (req, res) => {
  if (!readPending(req)) return res.redirect(`${ADMIN}/login?reason=expired`);

  const settings = await settingsService.getAll().catch(() => ({}));

  return res.render('auth/two-factor', {
    layout: false,
    title: 'Two-factor authentication',
    siteName: settings.site_name || 'Portfolio CMS',
    notice: null,
    formErrors: {},
  });
});

/** POST /admin/login/2fa */
const verifyTwoFactor = asyncHandler(async (req, res, next) => {
  const pending = readPending(req);
  if (!pending) return res.redirect(`${ADMIN}/login?reason=expired`);

  const result = await twoFactorService.verify(pending.userId, req.body.token);
  const settings = await settingsService.getAll().catch(() => ({}));

  if (!result.ok) {
    // Record the failure so the throttles see it too.
    await activityService.record({
      req,
      action: 'auth.2fa_failed',
      entity: 'user',
      entityId: pending.userId,
      description: 'Incorrect two-factor code',
      severity: 'warning',
    });

    return res.status(401).render('auth/two-factor', {
      layout: false,
      title: 'Two-factor authentication',
      siteName: settings.site_name || 'Portfolio CMS',
      notice: { type: 'danger', message: 'That code was not correct. Try again.' },
      formErrors: {},
    });
  }

  // findWithRole looks up by id and returns exactly the role fields
  // establishSession needs, without the password hash.
  const fullUser = await userRepository.findWithRole(pending.userId);

  if (!fullUser || fullUser.status !== 'active') {
    delete req.session.pendingTwoFactor;
    return next(new UnauthorizedError('That account is no longer available.'));
  }

  const nextPath = pending.nextPath;
  delete req.session.pendingTwoFactor;

  await authService.establishSession(req, fullUser);
  await userRepository.recordSuccessfulLogin(fullUser.id, hashIp(getClientIp(req)));

  await activityService.record({
    req,
    action: 'auth.login',
    entity: 'user',
    entityId: fullUser.id,
    description: `${fullUser.email} signed in with two-factor${result.usedBackupCode ? ' (backup code)' : ''}`,
  });

  if (result.usedBackupCode) {
    req.flash('warning', 'You signed in with a backup code. That code has now been used.');
  }

  if (req.session.user.mustChangePassword) {
    return res.redirect(`${ADMIN}/password/change?reason=required`);
  }

  return res.redirect(nextPath);
});

/** POST /admin/logout */
const logout = asyncHandler(async (req, res) => {
  const user = req.session?.user;

  if (user) {
    await activityService.record({
      req,
      action: 'auth.logout',
      entity: 'user',
      entityId: user.id,
      description: `${user.email} signed out`,
    });
  }

  await authService.destroySession(req, res);
  res.redirect(`${ADMIN}/login?reason=loggedout`);
});

/**
 * Validation failures on the auth forms should return the user to the
 * form with inline field errors, not to a generic error page.
 * Mounted in place of the shared handleValidation on these two routes.
 */
function renderValidationErrors(view, extraLocals = () => ({})) {
  // Must keep four parameters: Express identifies error middleware by arity.
  return function validationErrorRenderer(err, req, res, next) {
    if (!err || err.code !== 'VALIDATION') return next(err);

    return settingsService.getAll()
      .catch(() => ({}))
      .then((settings) => {
        res.status(400).render(view, {
          layout: false,
          title: view.includes('login') ? 'Sign in' : 'Change password',
          siteName: settings.site_name || 'Portfolio CMS',
          notice: { type: 'danger', message: err.message },
          formErrors: err.details || {},
          // Never echo a submitted password back into the form.
          formValues: { ...(req.body || {}), password: '', current_password: '', new_password: '', confirm_password: '' },
          ...extraLocals(req, res),
        });
      })
      .catch(next);
  };
}

const loginValidationHandler = renderValidationErrors('auth/login', (req) => ({
  nextPath: safeRedirectPath(req.body.next, `${ADMIN}/dashboard`),
}));

const changePasswordValidationHandler = renderValidationErrors('auth/change-password', (req) => ({
  required: Boolean(req.session?.user?.mustChangePassword),
}));

/** GET /admin/password/change */
const showChangePassword = asyncHandler(async (req, res) => {
  res.render('auth/change-password', {
    layout: false,
    title: 'Change password',
    required: req.query.reason === 'required' || req.session.user.mustChangePassword,
    formErrors: {},
    formValues: {},
  });
});

/** POST /admin/password/change */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword({
    req,
    userId: req.session.user.id,
    currentPassword: req.body.current_password,
    newPassword: req.body.new_password,
  });

  await activityService.record({
    req,
    action: 'auth.password_change',
    entity: 'user',
    entityId: req.session.user.id,
    description: 'Changed own password',
    severity: 'warning',
  });

  req.flash('success', 'Your password has been updated.');
  res.redirect(`${ADMIN}/dashboard`);
});

module.exports = {
  showLogin,
  showTwoFactor,
  verifyTwoFactor,
  login,
  logout,
  showChangePassword,
  changePassword,
  loginValidationHandler,
  changePasswordValidationHandler,
};
