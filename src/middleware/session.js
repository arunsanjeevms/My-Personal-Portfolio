'use strict';

/**
 * Session middleware backed by the MySQL `sessions` table.
 *
 * Cookie hardening:
 *   httpOnly  - JavaScript cannot read the session cookie (XSS mitigation)
 *   sameSite  - 'lax' blocks cross-site POSTs while keeping normal links working
 *   secure    - HTTPS-only in production
 *   signed via SESSION_SECRET
 *
 * Two expiries are enforced: a rolling idle timeout (below) and an
 * absolute deadline stored on the session itself and checked in
 * enforceSessionLifetime(), so a cookie cannot be refreshed forever.
 */

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { config } = require('../config/env');
const db = require('../config/database');
const logger = require('../utils/logger');
const { getClientIp } = require('../utils/request');
const { hashIp } = require('../utils/crypto');

/**
 * The active store, kept so it can be closed on shutdown. Its expiry
 * sweep runs on an interval that would otherwise hold the event loop
 * open (which makes test processes hang).
 */
let activeStore = null;

function createSessionMiddleware() {
  // Reuses the application pool rather than opening a second one.
  const store = new MySQLStore(
    {
      // The table is created by migration 001; the library must not
      // try to create or alter it.
      createDatabaseTable: false,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: config.session.idleMinutes * 60 * 1000,
      schema: {
        tableName: 'sessions',
        columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' },
      },
    },
    db.getPool(),
  );

  store.on('error', (err) => logger.error('session store error', { message: err.message }));
  activeStore = store;

  return session({
    name: config.session.name,
    secret: config.session.secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh the idle window on activity
    proxy: config.trustProxy,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: config.session.idleMinutes * 60 * 1000,
      path: '/',
    },
  });
}

/**
 * Enforces the absolute session lifetime and detects a session whose
 * client IP changed drastically. Runs after the session middleware.
 */
function enforceSessionLifetime(req, res, next) {
  if (!req.session?.user) return next();

  if (req.session.absoluteExpiry && Date.now() > req.session.absoluteExpiry) {
    const { id, email } = req.session.user;
    logger.security('auth: session hit absolute expiry', { userId: id, email });
    return req.session.destroy(() => {
      res.clearCookie(config.session.name);
      if (req.method === 'GET' && req.accepts('html')) {
        return res.redirect(`${config.security.adminPath}/login?reason=expired`);
      }
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    });
  }

  // Informational only. Rebinding a session to an IP breaks mobile
  // users who change networks, so this warns rather than logs out.
  const currentIpHash = hashIp(getClientIp(req));
  if (!req.session.ipHash) {
    req.session.ipHash = currentIpHash;
  } else if (req.session.ipHash !== currentIpHash) {
    logger.security('auth: session ip changed', {
      userId: req.session.user.id,
      path: req.originalUrl,
    });
    req.session.ipHash = currentIpHash;
  }

  return next();
}

/**
 * Stops the store's expiry sweep. Called during shutdown and by the test
 * harness so the process can exit.
 */
function closeSessionStore() {
  if (!activeStore) return;
  try {
    // close() stops the interval; it does not end the shared pool.
    activeStore.close();
  } catch (err) {
    logger.warn('session store close failed', { message: err.message });
  }
  activeStore = null;
}

module.exports = { createSessionMiddleware, enforceSessionLifetime, closeSessionStore };
