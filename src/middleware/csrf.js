'use strict';

/**
 * CSRF protection - synchroniser token pattern.
 *
 * A random token is minted per session and must accompany every
 * state-changing request, either as the _csrf form field or as an
 * X-CSRF-Token header. Because the token lives in the session (server
 * side) and must be echoed back by the page, a cross-site form post
 * cannot supply it.
 *
 * Implemented here rather than pulled in as a dependency: it is ~40
 * lines of well-understood logic, and this app already has server-side
 * sessions, which is the only thing the pattern needs.
 */

const { randomToken, safeCompare } = require('../utils/crypto');
const { CsrfError } = require('../utils/errors');
const logger = require('../utils/logger');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_NAMES = ['x-csrf-token', 'x-xsrf-token', 'csrf-token'];

/**
 * Paths exempt from CSRF verification.
 *
 * The exemption list lives here rather than as route-level middleware
 * because verifyCsrf is mounted globally, before the routers - a
 * per-route opt-out would never get the chance to run.
 *
 * Only the analytics beacons are listed. They are sent with
 * navigator.sendBeacon, which cannot attach a custom header, and they
 * are safe to exempt because they are unauthenticated, write nothing but
 * anonymous counters, are rate-limited, and change no user-visible
 * state. Nothing about them is worth forging.
 *
 * Do not add an authenticated or state-changing route to this list.
 */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/analytics/collect',
  '/api/analytics/event',
]);

/**
 * Exposes the token to views as `csrfToken()` and `csrfField()`.
 *
 * Both are functions, not values, so the token is minted only when a
 * template actually calls one. This matters because writing to
 * req.session forces a row into the sessions table - minting eagerly
 * would create a database row for every anonymous visitor and every
 * crawler hit on the public site.
 *
 * A property getter does not work here: res.render copies res.locals
 * into the render scope, which evaluates getters whether the template
 * uses them or not. A plain function is copied by reference.
 */
function attachCsrfToken(req, res, next) {
  if (!req.session) return next();

  const mint = () => {
    if (!req.session.csrfToken) req.session.csrfToken = randomToken(32);
    return req.session.csrfToken;
  };

  // <meta name="csrf-token" content="<%= csrfToken() %>">
  res.locals.csrfToken = mint;
  // <%- csrfField() %>
  res.locals.csrfField = () => `<input type="hidden" name="_csrf" value="${mint()}">`;

  return next();
}

function extractToken(req) {
  if (req.body && typeof req.body._csrf === 'string') return req.body._csrf;
  if (req.query && typeof req.query._csrf === 'string') return req.query._csrf;
  for (const header of HEADER_NAMES) {
    const value = req.get(header);
    if (value) return value;
  }
  return null;
}

/**
 * Rejects unsafe requests without a valid token.
 * Mount after the body parser and after attachCsrfToken.
 */
function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  const expected = req.session?.csrfToken;
  const provided = extractToken(req);

  if (!expected || !provided || !safeCompare(expected, provided)) {
    logger.security('csrf: rejected request', {
      method: req.method,
      path: req.originalUrl,
      hasSession: Boolean(req.session),
      hasToken: Boolean(provided),
      userId: req.session?.user?.id || null,
    });
    return next(new CsrfError());
  }

  return next();
}

/**
 * Marker for routes listed in CSRF_EXEMPT_PATHS, kept so the exemption is
 * visible at the route definition as well as in the list above. It does
 * not itself grant the exemption - verifyCsrf has already run by then.
 */
function skipCsrf(req, res, next) {
  req.csrfSkipped = true;
  return next();
}

module.exports = { attachCsrfToken, verifyCsrf, skipCsrf, CSRF_EXEMPT_PATHS };
