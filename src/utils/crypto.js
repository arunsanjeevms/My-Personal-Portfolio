'use strict';

/**
 * Cryptographic helpers.
 *
 * Central rule enforced here: raw IP addresses never reach the database.
 * Anything that needs to identify a client stores a salted hash instead.
 */

const crypto = require('node:crypto');
const { config } = require('../config/env');

const AES_ALGORITHM = 'aes-256-gcm';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Stable hash of a client IP, used for rate limiting and audit records.
 * Salted with ANALYTICS_SALT so the digest cannot be brute-forced back
 * to an address from a database dump alone.
 */
function hashIp(ip) {
  if (!ip) return sha256(`unknown:${config.security.analyticsSalt}`);
  return sha256(`${ip}:${config.security.analyticsSalt}`);
}

/**
 * Visitor identity for analytics. The salt-of-the-day means the same
 * person is countable within a single day but cannot be linked across
 * days - deliberately weaker than hashIp so analytics stays anonymous.
 *
 * @param {string} ip
 * @param {string} userAgent
 * @param {Date}   [date] defaults to today
 */
function dailyVisitorHash(ip, userAgent, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return sha256(`${ip || 'unknown'}|${userAgent || 'unknown'}|${day}|${config.security.analyticsSalt}`);
}

/** URL-safe random token. Use for reset links, session keys, filenames. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomUuid() {
  return crypto.randomUUID();
}

/** Numeric backup codes, formatted in two groups for readability. */
function randomBackupCode() {
  const digits = crypto.randomInt(0, 100000000).toString().padStart(8, '0');
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function getEncryptionKey() {
  const key = config.security.encryptionKey;
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypts a short string (TOTP secrets) with AES-256-GCM.
 * @returns {string} "iv:authTag:ciphertext", all base64
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Reverses encrypt(). Throws if the payload was tampered with. */
function decrypt(payload) {
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload.');

  const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Constant-time string comparison. Always compares fixed-length digests
 * so the length of the inputs does not leak through timing.
 */
function safeCompare(a, b) {
  const bufferA = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const bufferB = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = {
  sha256,
  hashIp,
  dailyVisitorHash,
  randomToken,
  randomUuid,
  randomBackupCode,
  encrypt,
  decrypt,
  safeCompare,
};
