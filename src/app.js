'use strict';

/**
 * Express application assembly.
 *
 * Only wiring lives here - no business logic, no route handlers. The
 * order below is deliberate and security-relevant; see the comments at
 * each stage.
 */

const path = require('node:path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { config } = require('./config/env');
const logger = require('./utils/logger');

const { createSecurityMiddleware, additionalHeaders } = require('./middleware/security');
const { createSessionMiddleware, enforceSessionLifetime } = require('./middleware/session');
const { attachCsrfToken, verifyCsrf } = require('./middleware/csrf');
const { flashMessages, viewLocals } = require('./middleware/locals');
const { globalLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { applyRedirects, enforceSiteStatus } = require('./middleware/redirects');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();

  // ---- 1. proxy awareness -------------------------------------------
  // Must come first: rate limiting, secure cookies and IP hashing all
  // depend on knowing the real client address.
  app.set('trust proxy', config.trustProxy ? 1 : false);

  // ---- 2. view engine -----------------------------------------------
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.rootDir, 'views'));
  // Trims template whitespace in production without touching output
  // semantics; keeps generated HTML close to the hand-written original.
  app.set('view options', { rmWhitespace: config.isProduction });
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  // ---- 3. security headers ------------------------------------------
  app.use(createSecurityMiddleware());
  app.use(additionalHeaders);

  // ---- 4. compression -----------------------------------------------
  app.use(compression({ threshold: 1024 }));

  // ---- 5. body parsing ----------------------------------------------
  // Small limits: nothing here legitimately posts more than a form.
  // File uploads are handled separately by multer, which has its own cap.
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser(config.session.secret));

  // ---- 6. static assets ---------------------------------------------
  // Mounted before sessions so serving a CSS file never touches the
  // database or allocates a session.
  const staticOptions = {
    maxAge: config.isProduction ? '30d' : 0,
    etag: true,
    lastModified: true,
    // No directory listings, and never serve a dotfile.
    dotfiles: 'ignore',
    index: false,
  };

  // The existing portfolio's assets, untouched.
  app.use('/assets', express.static(path.join(config.rootDir, 'assets'), staticOptions));
  // Admin panel CSS/JS.
  app.use('/static', express.static(path.join(config.rootDir, 'public'), staticOptions));
  // User uploads. Served from storage/, which sits outside the web root,
  // through this controlled mount so nothing there can ever be executed.
  app.use('/uploads', express.static(config.storage.uploadDir, {
    ...staticOptions,
    maxAge: '365d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    },
  }));

  // ---- 7. rate limiting ---------------------------------------------
  app.use(globalLimiter);

  // ---- 8. sessions ---------------------------------------------------
  app.use(createSessionMiddleware());
  app.use(enforceSessionLifetime);

  // ---- 9. CSRF -------------------------------------------------------
  // attachCsrfToken mints the token for every render; verifyCsrf rejects
  // unsafe methods without it. Both run after the body parser so the
  // _csrf field is available.
  app.use(attachCsrfToken);
  app.use(verifyCsrf);

  // ---- 10. view context ----------------------------------------------
  app.use(flashMessages);
  app.use(viewLocals);

  // ---- 11. request logging -------------------------------------------
  if (config.isDevelopment) {
    app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        // Static assets are noise; skip them.
        if (req.path.startsWith('/assets') || req.path.startsWith('/static')) return;
        logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
          ms: Date.now() - startedAt,
        });
      });
      next();
    });
  }

  // ---- 12. redirects and site status ---------------------------------
  // Before the routes so a configured redirect beats a 404, and
  // maintenance mode covers every public page at once.
  app.use(applyRedirects);
  app.use(enforceSiteStatus);

  // ---- 13. routes ----------------------------------------------------
  app.use(config.security.adminPath, adminRoutes);
  app.use('/', publicRoutes);

  // ---- 14. errors ----------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
