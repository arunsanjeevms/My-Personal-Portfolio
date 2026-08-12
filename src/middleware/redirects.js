'use strict';

/**
 * Database-driven redirects and site-status gating.
 *
 * Runs before the public routes so a redirect wins over a 404, and
 * maintenance mode wins over everything except the admin area.
 */

const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const settingsService = require('../services/settingsService');
const { config } = require('../config/env');

const CACHE_KEY = 'redirects:map';
const CACHE_TTL = 300;

/** Path -> redirect, loaded once and cached. */
async function getRedirectMap() {
  return cache.remember(CACHE_KEY, CACHE_TTL, async () => {
    const rows = await db.query(
      'SELECT id, source_path, destination, status_code FROM redirects WHERE is_active = 1',
    );
    const map = new Map();
    for (const row of rows) map.set(row.source_path.toLowerCase(), row);
    return map;
  }).catch(() => new Map());
}

/**
 * Applies a configured redirect if one matches this path.
 * Only GET and HEAD are redirected; redirecting a POST would silently
 * drop the body.
 */
async function applyRedirects(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith(config.security.adminPath)) return next();

  try {
    const map = await getRedirectMap();
    if (!map.size) return next();

    // Match with and without a trailing slash.
    const path = req.path.toLowerCase();
    const match = map.get(path) || map.get(path.replace(/\/$/, '')) || map.get(`${path}/`);
    if (!match) return next();

    // Counting a hit must not delay the redirect.
    db.query(
      'UPDATE redirects SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = ?',
      [match.id],
    ).catch(() => {});

    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(match.status_code, match.destination + query);
  } catch (err) {
    logger.error('redirects: lookup failed', { message: err.message });
    return next();
  }
}

/**
 * Enforces the site status.
 *
 *   published    - normal
 *   private      - only signed-in admins can see the site
 *   maintenance  - everyone gets the maintenance page, admins optionally
 *                  pass through
 */
async function enforceSiteStatus(req, res, next) {
  // The admin area and the health probe stay reachable so the owner can
  // always get back in and monitoring keeps working.
  if (req.path.startsWith(config.security.adminPath)) return next();
  if (req.path === '/healthz') return next();
  if (req.path.startsWith('/assets') || req.path.startsWith('/static') || req.path.startsWith('/uploads')) return next();

  try {
    const settings = await settingsService.getAll();
    const status = settings.site_status || 'published';

    if (status === 'published') return next();

    const isAdmin = Boolean(req.session?.user);
    const adminMayPass = settings.maintenance_allow_admin !== false;

    if (isAdmin && adminMayPass) {
      res.locals.siteStatusBanner = status;
      return next();
    }

    if (status === 'private') {
      return res.status(403).render('errors/403', {
        title: 'Not available',
        status: 403,
        message: 'This site is currently private.',
        stack: null,
        isAdminArea: false,
        layout: false,
      });
    }

    // maintenance
    return res.status(503).render('public/maintenance', {
      layout: false,
      title: settings.maintenance_title || 'Be Right Back',
      message: settings.maintenance_message || 'The site is being updated. Please check back shortly.',
      siteName: settings.site_name || 'Portfolio',
      themeColor: settings.theme_color || '#111318',
    });
  } catch (err) {
    // If settings cannot be read, keep the site up rather than locking
    // everyone out on a transient database error.
    logger.error('site status check failed, allowing through', { message: err.message });
    return next();
  }
}

function invalidate() {
  cache.del(CACHE_KEY);
}

module.exports = { applyRedirects, enforceSiteStatus, invalidate };
