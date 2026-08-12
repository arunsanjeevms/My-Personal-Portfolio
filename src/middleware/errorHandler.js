'use strict';

/**
 * Central error handling.
 *
 * Rules:
 *  - A stack trace never reaches the browser in production.
 *  - Only errors marked `expose` show their own message; everything else
 *    becomes a generic sentence.
 *  - Every 5xx is logged with full detail server side.
 *  - Admin requests get the admin-styled error page; public requests get
 *    the portfolio-styled one.
 */

const { config } = require('../config/env');
const logger = require('../utils/logger');
const { NotFoundError, isConnectionError, ServiceUnavailableError } = require('../utils/errors');
const { wantsJson } = require('../utils/request');

const GENERIC_MESSAGE = 'Something went wrong on our side. The issue has been logged.';

const TITLES = {
  400: 'Bad request',
  401: 'Sign in required',
  403: 'Not allowed',
  404: 'Page not found',
  409: 'Conflict',
  429: 'Too many requests',
  500: 'Server error',
  503: 'Service unavailable',
};

/** Terminal 404 handler - mounted after every route. */
function notFoundHandler(req, res, next) {
  next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // A database outage is a 503, not a 500 - it is transient and the
  // public site is expected to degrade rather than break.
  const error = isConnectionError(err) ? new ServiceUnavailableError() : err;

  const status = Number(error.status || error.statusCode) || 500;
  const isServerError = status >= 500;
  const safeMessage = error.expose && error.message ? error.message : (
    status === 404 ? 'That page could not be found.' : GENERIC_MESSAGE
  );

  const context = {
    status,
    method: req.method,
    path: req.originalUrl,
    userId: req.session?.user?.id || null,
    code: error.code || null,
  };

  if (isServerError) {
    logger.error(error.message || 'Unhandled error', { ...context, stack: error.stack });
  } else if (status !== 404) {
    logger.warn(error.message || 'Request error', context);
  } else {
    logger.debug('404', context);
  }

  if (res.headersSent) return next(error);

  res.status(status);

  if (wantsJson(req)) {
    return res.json({
      error: safeMessage,
      code: error.code || undefined,
      details: error.expose ? error.details || undefined : undefined,
      ...(config.isDevelopment && isServerError ? { stack: error.stack } : {}),
    });
  }

  const isAdminArea = req.originalUrl.startsWith(config.security.adminPath);

  const viewData = {
    title: TITLES[status] || 'Error',
    status,
    message: safeMessage,
    // Only ever populated outside production.
    stack: config.isDevelopment && isServerError ? error.stack : null,
    adminPath: config.security.adminPath,
    isAdminArea,
    layout: false,
  };

  // The error page itself must not be able to throw - if rendering
  // fails, fall back to plain text.
  return res.render(`errors/${status}`, viewData, (renderError, html) => {
    if (!renderError) return res.send(html);

    return res.render('errors/generic', viewData, (fallbackError, fallbackHtml) => {
      if (!fallbackError) return res.send(fallbackHtml);
      logger.error('errorHandler: could not render error page', { message: fallbackError.message });
      return res.type('text/plain').send(`${status} - ${safeMessage}`);
    });
  });
}

module.exports = { notFoundHandler, errorHandler };
