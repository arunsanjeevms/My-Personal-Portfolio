'use strict';

/**
 * Security headers.
 *
 * The Content-Security-Policy allows exactly the third-party origins the
 * existing portfolio already uses - ionicons from unpkg, Poppins from
 * Google Fonts, and the Google Maps embed - and nothing else.
 *
 * 'unsafe-inline' is present for styles and scripts because the current
 * site and the theme-variable override block rely on inline style, and
 * the admin uses small inline handlers. Nonces would be stricter; that
 * is a Phase 7 hardening item, tracked rather than silently skipped.
 */

const helmet = require('helmet');
const { config } = require('../config/env');

const UNPKG = 'https://unpkg.com';
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';
const GOOGLE_MAPS = 'https://maps.google.com';
const GOOGLE_MAPS_ALT = 'https://www.google.com';

function createSecurityMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],

        scriptSrc: ["'self'", "'unsafe-inline'", UNPKG],
        // ionicons is loaded as an ES module from unpkg.
        scriptSrcElem: ["'self'", "'unsafe-inline'", UNPKG],

        styleSrc: ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
        styleSrcElem: ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],

        fontSrc: ["'self'", GOOGLE_FONTS_FILES, 'data:'],

        // data: for inline SVG icons, https: so cached Medium thumbnails
        // and externally hosted certificate images still render.
        imgSrc: ["'self'", 'data:', 'https:'],

        // The contact map embed.
        frameSrc: [GOOGLE_MAPS, GOOGLE_MAPS_ALT],

        // unpkg is required here, not just in script-src: ionicons loads
        // its loader script and then fetches every individual icon SVG
        // over XHR at runtime. Without this the script loads happily and
        // every icon silently fails to render.
        connectSrc: ["'self'", UNPKG],

        // Blocks any plugin/worker vector outright.
        workerSrc: ["'self'", 'blob:'],

        ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },

    // The Maps iframe needs a cross-origin embed to work.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    hsts: config.isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,

    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'deny' },
    noSniff: true,
    // Hides the fact this is Express.
    hidePoweredBy: true,
  });
}

/** Extra headers helmet does not set by default. */
function additionalHeaders(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()',
  );

  // The admin panel must never be cached by a shared proxy or left in
  // the back-forward cache after sign-out.
  if (req.path.startsWith(config.security.adminPath)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return next();
}

module.exports = { createSecurityMiddleware, additionalHeaders };
