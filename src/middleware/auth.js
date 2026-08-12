'use strict';

/**
 * Authentication and authorisation guards.
 *
 * Authorisation is always enforced here, server side. Hiding a link in
 * the sidebar is presentation, not protection - every admin route
 * carries its own requirePermission().
 */

const { config } = require('../config/env');
const logger = require('../utils/logger');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { wantsJson, safeRedirectPath } = require('../utils/request');

const ADMIN = config.security.adminPath;

/** True when the session holds an authenticated user. */
function isAuthenticated(req) {
  return Boolean(req.session?.user?.id);
}

function hasPermission(req, permission) {
  if (!isAuthenticated(req)) return false;
  // Super Admin is unconditionally allowed - the role exists so the
  // owner can never lock themselves out of their own site.
  if (req.session.user.role === 'super_admin') return true;
  return Array.isArray(req.session.permissions) && req.session.permissions.includes(permission);
}

function hasAnyPermission(req, permissions) {
  return permissions.some((permission) => hasPermission(req, permission));
}

/** Blocks unauthenticated access. Redirects browsers, 401s API clients. */
function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();

  if (wantsJson(req)) return next(new UnauthorizedError());

  const nextPath = safeRedirectPath(req.originalUrl, `${ADMIN}/dashboard`);
  return res.redirect(`${ADMIN}/login?next=${encodeURIComponent(nextPath)}`);
}

/** Sends an already-authenticated visitor away from the login page. */
function requireGuest(req, res, next) {
  if (!isAuthenticated(req)) return next();
  return res.redirect(`${ADMIN}/dashboard`);
}

/**
 * Requires a specific permission.
 * @param {string} permission slug from the permissions table
 */
function requirePermission(permission) {
  return function guard(req, res, next) {
    if (!isAuthenticated(req)) return requireAuth(req, res, next);

    if (!hasPermission(req, permission)) {
      logger.security('authz: permission denied', {
        userId: req.session.user.id,
        role: req.session.user.role,
        permission,
        path: req.originalUrl,
      });
      return next(new ForbiddenError('You do not have permission to access that section.'));
    }

    return next();
  };
}

/** Requires at least one of several permissions. */
function requireAnyPermission(...permissions) {
  return function guard(req, res, next) {
    if (!isAuthenticated(req)) return requireAuth(req, res, next);

    if (!hasAnyPermission(req, permissions)) {
      logger.security('authz: permission denied', {
        userId: req.session.user.id,
        permissions,
        path: req.originalUrl,
      });
      return next(new ForbiddenError('You do not have permission to access that section.'));
    }

    return next();
  };
}

/** Restricts a route to one or more role slugs. */
function requireRole(...roles) {
  return function guard(req, res, next) {
    if (!isAuthenticated(req)) return requireAuth(req, res, next);

    if (!roles.includes(req.session.user.role)) {
      logger.security('authz: role denied', {
        userId: req.session.user.id,
        role: req.session.user.role,
        required: roles,
        path: req.originalUrl,
      });
      return next(new ForbiddenError('That area is restricted.'));
    }

    return next();
  };
}

/**
 * Forces a password change before anything else can be used. Applied to
 * the whole admin area so an account created with a temporary password
 * cannot browse around with it.
 */
function requirePasswordChange(req, res, next) {
  if (!isAuthenticated(req)) return next();
  if (!req.session.user.mustChangePassword) return next();

  const allowed = [`${ADMIN}/password/change`, `${ADMIN}/logout`];
  if (allowed.includes(req.path) || allowed.includes(req.originalUrl.split('?')[0])) return next();

  if (wantsJson(req)) {
    return next(new ForbiddenError('You must change your password before continuing.'));
  }
  return res.redirect(`${ADMIN}/password/change?reason=required`);
}

module.exports = {
  isAuthenticated,
  hasPermission,
  hasAnyPermission,
  requireAuth,
  requireGuest,
  requirePermission,
  requireAnyPermission,
  requireRole,
  requirePasswordChange,
};
