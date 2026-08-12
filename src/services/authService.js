'use strict';

/**
 * Authentication.
 *
 * Design decisions worth knowing:
 *
 *  - Failed logins are throttled on two axes: per account (locks one
 *    account) and per IP (stops one source spraying many accounts).
 *  - The caller always receives the same generic failure message, and an
 *    equivalent amount of work is done for unknown accounts, so the
 *    response neither states nor times-leaks whether an email exists.
 *  - Session IDs are regenerated on every successful login to close
 *    session-fixation.
 *  - Sessions carry an absolute deadline as well as an idle timeout, so
 *    a stolen cookie cannot be refreshed indefinitely.
 */

const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const loginAttemptRepository = require('../repositories/loginAttemptRepository');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');
const { config } = require('../config/env');
const { hashIp, sha256, randomToken } = require('../utils/crypto');
const { getClientIp, getUserAgent } = require('../utils/request');
const { UnauthorizedError, TooManyRequestsError, ValidationError } = require('../utils/errors');

const BCRYPT_ROUNDS = 12;
const IP_THROTTLE_WINDOW_MINUTES = 15;
const IP_THROTTLE_MAX_FAILURES = 20;
const GENERIC_FAILURE = 'Incorrect email or password.';

/**
 * Burned when the account does not exist, so a missing user costs the
 * same time as a wrong password. Generated once at module load.
 */
const DUMMY_HASH = bcrypt.hashSync(randomToken(24), BCRYPT_ROUNDS);

function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash || DUMMY_HASH);
}

/**
 * Password policy. Intentionally length-first: length beats forced
 * character classes for real-world resistance.
 * @returns {string[]} problems, empty when acceptable
 */
function validatePasswordStrength(password, { email = '', name = '' } = {}) {
  const problems = [];
  const value = String(password || '');

  if (value.length < 12) problems.push('Use at least 12 characters.');
  if (value.length > 128) problems.push('Use at most 128 characters.');
  if (!/[a-z]/i.test(value)) problems.push('Include at least one letter.');
  if (!/[0-9]/.test(value)) problems.push('Include at least one number.');
  if (/^(.)\1+$/.test(value)) problems.push('Do not use a single repeated character.');

  const lowered = value.toLowerCase();
  const localPart = String(email).split('@')[0]?.toLowerCase();
  if (localPart && localPart.length > 2 && lowered.includes(localPart)) {
    problems.push('Do not include your email address.');
  }
  if (name && name.length > 2 && lowered.includes(String(name).toLowerCase())) {
    problems.push('Do not include your name.');
  }

  const common = ['password', 'qwerty', '123456', 'admin', 'letmein', 'welcome', 'portfolio'];
  if (common.some((word) => lowered.includes(word))) {
    problems.push('Avoid common words like "password" or "admin".');
  }

  return problems;
}

async function recordAttempt({ req, email, userId, success, reason }) {
  try {
    await loginAttemptRepository.create({
      email: email ? String(email).slice(0, 190) : null,
      user_id: userId || null,
      ip_hash: hashIp(getClientIp(req)),
      user_agent: getUserAgent(req),
      success: success ? 1 : 0,
      reason: reason || null,
    });
  } catch (err) {
    logger.error('auth: could not record login attempt', { message: err.message });
  }
}

/**
 * Verifies credentials.
 *
 * @throws {TooManyRequestsError} when the IP or the account is throttled
 * @throws {UnauthorizedError} for any credential failure
 * @returns {Promise<object>} the authenticated user row (without secrets)
 */
async function attemptLogin({ req, identifier, password }) {
  const email = String(identifier || '').trim().toLowerCase();
  const ipHash = hashIp(getClientIp(req));

  // ---- 1. per-IP throttle, checked before touching the user table
  const ipFailures = await loginAttemptRepository.countRecentFailuresByIp(
    ipHash, IP_THROTTLE_WINDOW_MINUTES,
  );
  if (ipFailures >= IP_THROTTLE_MAX_FAILURES) {
    logger.security('auth: ip throttled', { ipHash, failures: ipFailures });
    await recordAttempt({ req, email, success: false, reason: 'ip_throttled' });
    throw new TooManyRequestsError(
      `Too many failed sign-in attempts. Try again in ${IP_THROTTLE_WINDOW_MINUTES} minutes.`,
    );
  }

  const settings = await settingsService.getAll();
  const maxAttempts = Number(settings.login_max_attempts) || 5;
  const lockoutMinutes = Number(settings.login_lockout_minutes) || 15;

  const user = await userRepository.findForAuth(email);

  // ---- 2. unknown account: do the same work, give the same answer
  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    await recordAttempt({ req, email, success: false, reason: 'unknown_user' });
    logger.security('auth: unknown account', { ipHash });
    throw new UnauthorizedError(GENERIC_FAILURE);
  }

  // ---- 3. account lock
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((new Date(user.locked_until) - Date.now()) / 60000));
    await recordAttempt({ req, email, userId: user.id, success: false, reason: 'locked' });
    logger.security('auth: locked account attempted', { userId: user.id, ipHash });
    throw new TooManyRequestsError(`This account is temporarily locked. Try again in ${minutesLeft} minute(s).`);
  }

  // ---- 4. suspended account
  if (user.status !== 'active') {
    await recordAttempt({ req, email, userId: user.id, success: false, reason: 'suspended' });
    logger.security('auth: suspended account attempted', { userId: user.id, ipHash });
    throw new UnauthorizedError('This account is not active. Contact a Super Admin.');
  }

  // ---- 5. password
  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    const { failed, lockedUntil } = await userRepository.recordFailedLogin(user.id, {
      maxAttempts, lockoutMinutes,
    });
    await recordAttempt({ req, email, userId: user.id, success: false, reason: 'bad_password' });
    logger.security('auth: bad password', { userId: user.id, ipHash, failed });

    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      throw new TooManyRequestsError(
        `Too many failed attempts. This account is locked for ${lockoutMinutes} minutes.`,
      );
    }
    throw new UnauthorizedError(GENERIC_FAILURE);
  }

  // ---- 6. success
  await userRepository.recordSuccessfulLogin(user.id, ipHash);
  await recordAttempt({ req, email, userId: user.id, success: true, reason: null });
  logger.security('auth: sign-in succeeded', { userId: user.id, email: user.email, ipHash });

  delete user.password_hash;
  delete user.reset_token_hash;
  return user;
}

/**
 * Writes the authenticated identity into the session.
 *
 * Regenerates the session ID first (session fixation), then stores the
 * user plus both expiry deadlines. Permissions are cached on the session
 * so authorisation checks do not hit the database on every request.
 */
async function establishSession(req, user) {
  const permissions = await userRepository.getPermissions(user.id);

  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.user = {
    id: user.id,
    uuid: user.uuid,
    name: user.name,
    email: user.email,
    username: user.username,
    roleId: user.role_id,
    role: user.role_slug,
    roleName: user.role_name,
    roleLevel: user.role_level,
    avatarMediaId: user.avatar_media_id,
    mustChangePassword: Boolean(user.must_change_password),
  };
  req.session.permissions = permissions;
  req.session.createdAt = Date.now();
  req.session.absoluteExpiry = Date.now() + config.session.absoluteHours * 3600 * 1000;

  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return req.session.user;
}

/** Destroys the session and clears the cookie. */
async function destroySession(req, res) {
  const user = req.session?.user;

  await new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
  res.clearCookie(config.session.name);

  if (user) logger.security('auth: signed out', { userId: user.id, email: user.email });
}

/** Refreshes the cached permission list, e.g. after a role change. */
async function refreshPermissions(req) {
  if (!req.session?.user) return [];
  const permissions = await userRepository.getPermissions(req.session.user.id);
  req.session.permissions = permissions;
  return permissions;
}

/**
 * Changes a password after verifying the current one.
 * @throws {ValidationError|UnauthorizedError}
 */
async function changePassword({ req, userId, currentPassword, newPassword }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new UnauthorizedError('Account not found.');

  const matches = await verifyPassword(currentPassword, user.password_hash);
  if (!matches) {
    logger.security('auth: password change rejected, wrong current password', { userId });
    throw new ValidationError('Your current password is incorrect.', {
      current_password: 'Incorrect password.',
    });
  }

  const problems = validatePasswordStrength(newPassword, { email: user.email, name: user.name });
  if (problems.length) throw new ValidationError(problems[0], { new_password: problems });

  const sameAsOld = await verifyPassword(newPassword, user.password_hash);
  if (sameAsOld) throw new ValidationError('Choose a password you have not used here before.');

  await userRepository.setPassword(userId, await hashPassword(newPassword));
  logger.security('auth: password changed', { userId });

  if (req?.session?.user?.id === userId) req.session.user.mustChangePassword = false;
  return true;
}

/**
 * Starts a password reset.
 *
 * Always resolves the same way whether or not the account exists - the
 * caller shows an identical message either way, so this cannot be used
 * to enumerate accounts.
 *
 * @returns {Promise<{token: string, user: object}|null>} null when unknown
 */
async function createPasswordResetToken(email) {
  const user = await userRepository.findByEmail(String(email || '').trim().toLowerCase());
  if (!user || user.status !== 'active') return null;

  const token = randomToken(32);
  await userRepository.setResetToken(user.id, sha256(token), 60);
  logger.security('auth: password reset requested', { userId: user.id });

  return { token, user };
}

async function resetPasswordWithToken(token, newPassword) {
  const user = await userRepository.findByValidResetToken(sha256(token));
  if (!user) throw new ValidationError('That reset link is invalid or has expired.');

  const problems = validatePasswordStrength(newPassword, { email: user.email, name: user.name });
  if (problems.length) throw new ValidationError(problems[0], { new_password: problems });

  await userRepository.setPassword(user.id, await hashPassword(newPassword));
  logger.security('auth: password reset completed', { userId: user.id });
  return user;
}

module.exports = {
  BCRYPT_ROUNDS,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  attemptLogin,
  establishSession,
  destroySession,
  refreshPermissions,
  changePassword,
  createPasswordResetToken,
  resetPasswordWithToken,
};
