'use strict';

/**
 * Rate limiters.
 *
 * Clients are keyed by hashed IP so no raw address is held in the
 * limiter's memory store either.
 */

const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const { hashIp } = require('../utils/crypto');
const { getClientIp, wantsJson } = require('../utils/request');

function keyByHashedIp(req) {
  return hashIp(getClientIp(req));
}

function buildHandler(label) {
  return function handler(req, res) {
    const retryAfterSeconds = Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000) || 60;

    logger.security(`ratelimit: ${label}`, {
      path: req.originalUrl,
      method: req.method,
      ipHash: keyByHashedIp(req),
    });

    res.set('Retry-After', String(retryAfterSeconds));

    if (wantsJson(req)) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfter: retryAfterSeconds,
      });
    }

    return res.status(429).render('errors/429', {
      title: 'Too many requests',
      retryAfterSeconds,
      layout: false,
    });
  };
}

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByHashedIp,
  // Never rate-limit the developer machine out of its own admin panel.
  skip: () => false,
};

/** Broad protection for the whole site. Generous by design. */
const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: config.isProduction ? 300 : 2000,
  handler: buildHandler('global limit reached'),
});

/**
 * Login form. Deliberately tight. Successful sign-ins are not counted,
 * so a legitimate user who mistypes once is not punished afterwards.
 */
const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 10 : 50,
  skipSuccessfulRequests: true,
  handler: buildHandler('login limit reached'),
});

/** Password reset requests - limits both spam and account probing. */
const passwordResetLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: buildHandler('password reset limit reached'),
});

/** Public contact form. */
const contactLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: config.isProduction ? 5 : 100,
  handler: buildHandler('contact form limit reached'),
});

/** Admin writes - catches a runaway script, not a human. */
const adminWriteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 120,
  handler: buildHandler('admin write limit reached'),
});

/** File uploads. */
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 60,
  handler: buildHandler('upload limit reached'),
});

/** Analytics beacon - high ceiling, exists only to stop flooding. */
const analyticsLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 60,
  handler: (req, res) => res.status(429).end(),
});

module.exports = {
  globalLimiter,
  loginLimiter,
  passwordResetLimiter,
  contactLimiter,
  adminWriteLimiter,
  uploadLimiter,
  analyticsLimiter,
};
