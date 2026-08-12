'use strict';

/**
 * Typed application errors.
 *
 * `expose: true` means the message is safe to show a user. Anything else
 * is replaced with a generic message by the error handler so internal
 * details never leak to the browser.
 */

class AppError extends Error {
  constructor(message, status = 500, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.expose = options.expose ?? status < 500;
    this.code = options.code || null;
    this.details = options.details || null;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 - malformed request or failed validation. */
class ValidationError extends AppError {
  constructor(message = 'Some fields need your attention.', details = null) {
    super(message, 400, { expose: true, code: 'VALIDATION', details });
  }
}

/** 401 - not signed in, or the session expired. */
class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super(message, 401, { expose: true, code: 'UNAUTHORIZED' });
  }
}

/** 403 - signed in, but not allowed to do this. */
class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do that.') {
    super(message, 403, { expose: true, code: 'FORBIDDEN' });
  }
}

/** 404 - no such record or route. */
class NotFoundError extends AppError {
  constructor(message = 'That page could not be found.') {
    super(message, 404, { expose: true, code: 'NOT_FOUND' });
  }
}

/** 409 - unique constraint, or an edit that conflicts with current state. */
class ConflictError extends AppError {
  constructor(message = 'That conflicts with something that already exists.') {
    super(message, 409, { expose: true, code: 'CONFLICT' });
  }
}

/** 429 - rate limited. */
class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please slow down and try again shortly.', retryAfterSeconds = null) {
    super(message, 429, { expose: true, code: 'RATE_LIMITED' });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 403 - CSRF token missing, stale or mismatched. */
class CsrfError extends AppError {
  constructor(message = 'Your session expired. Please reload the page and try again.') {
    super(message, 403, { expose: true, code: 'CSRF' });
  }
}

/** 503 - a dependency (usually the database) is unavailable. */
class ServiceUnavailableError extends AppError {
  constructor(message = 'The service is temporarily unavailable.') {
    super(message, 503, { expose: true, code: 'UNAVAILABLE' });
  }
}

/**
 * Wraps an async route handler so a rejected promise reaches Express's
 * error middleware instead of hanging the request.
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** True for database errors that mean "the DB is not reachable". */
function isConnectionError(err) {
  return [
    'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND',
    'ER_CON_COUNT_ERROR', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'ECONNRESET',
  ].includes(err?.code);
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  CsrfError,
  ServiceUnavailableError,
  asyncHandler,
  isConnectionError,
};
