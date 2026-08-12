'use strict';

/**
 * Per-request view context: flash messages, the signed-in user, a
 * permission checker for conditionally rendering UI, and the shared
 * formatting helpers.
 */

const { config } = require('../config/env');
const helpers = require('../utils/viewHelpers');
const { hasPermission } = require('./auth');
const { visibleNav } = require('../config/adminNav');

/**
 * Minimal session-backed flash messages.
 *
 * req.flash('success', 'Saved.')  queues a message for the next render
 * res.locals.flash                 messages consumed by this render
 */
function flashMessages(req, res, next) {
  if (!req.session) return next();

  req.flash = (type, message) => {
    if (!req.session.flash) req.session.flash = [];
    req.session.flash.push({ type, message });
  };

  // Read and clear in one step so a message is never shown twice.
  res.locals.flash = req.session.flash || [];
  if (req.session.flash) delete req.session.flash;

  return next();
}

/** Everything templates can rely on being present. */
function viewLocals(req, res, next) {
  res.locals.adminPath = config.security.adminPath;
  res.locals.siteUrl = config.siteUrl;
  res.locals.env = config.env;
  res.locals.isProduction = config.isProduction;
  res.locals.appVersion = require('../../package.json').version;

  res.locals.currentUser = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.query = req.query || {};

  // Lets a template hide UI the user cannot use. This is presentation
  // only - the route itself is still protected by requirePermission().
  const can = (permission) => hasPermission(req, permission);
  res.locals.can = can;

  // Sidebar, built once per request from the shared definition so the
  // menu and the routes can never drift apart.
  res.locals.adminNav = req.session?.user ? visibleNav(can) : [];

  res.locals.h = helpers;

  // Populated by individual admin controllers.
  res.locals.pageTitle = '';
  res.locals.breadcrumbs = [];
  res.locals.activeNav = '';
  res.locals.formErrors = {};
  res.locals.formValues = {};

  return next();
}

module.exports = { flashMessages, viewLocals };
