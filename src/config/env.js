'use strict';

/**
 * Environment configuration.
 *
 * Loads .env once, coerces types, applies safe defaults and refuses to
 * boot in production when a security-critical value is missing or is
 * still the development placeholder.
 */

const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', '.env'),
  quiet: true,
});

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function str(key, fallback = '') {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : String(value).trim();
}

function int(key, fallback) {
  const parsed = Number.parseInt(process.env[key], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key, fallback = false) {
  const value = str(key, '').toLowerCase();
  if (value === '') return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/** Resolves a possibly-relative path from .env against the project root. */
function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(ROOT_DIR, value);
}

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

/**
 * Dev-only fallback secret. Deterministic per machine+project so restarts
 * do not invalidate sessions while developing, but it is rejected
 * outright in production by validate().
 */
function developmentSecret(label) {
  return crypto.createHash('sha256').update(`pcms-dev-${label}-${ROOT_DIR}`).digest('hex');
}

const config = {
  rootDir: ROOT_DIR,
  env: nodeEnv,
  isProduction,
  isDevelopment: !isProduction,

  port: int('PORT', 3000),
  siteUrl: str('SITE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  trustProxy: bool('TRUST_PROXY', false),

  db: {
    host: str('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    database: str('DB_NAME', 'portfolio_cms'),
    user: str('DB_USER', 'root'),
    password: str('DB_PASSWORD', ''),
    connectionLimit: int('DB_CONNECTION_LIMIT', 10),
  },

  session: {
    secret: str('SESSION_SECRET', developmentSecret('session')),
    name: str('SESSION_NAME', 'pcms.sid'),
    idleMinutes: int('SESSION_IDLE_MINUTES', 480),
    absoluteHours: int('SESSION_ABSOLUTE_HOURS', 168),
  },

  security: {
    // Encrypts TOTP secrets at rest (AES-256-GCM).
    encryptionKey: str('ENCRYPTION_KEY', developmentSecret('encryption').slice(0, 64)),
    // Mixed into IP hashes so a hash cannot be brute-forced back to an IP.
    analyticsSalt: str('ANALYTICS_SALT', developmentSecret('analytics')),
    adminPath: str('ADMIN_PATH', '/admin').replace(/\/+$/, '') || '/admin',
  },

  storage: {
    uploadDir: resolveFromRoot(str('UPLOAD_DIR', 'storage/uploads')),
    backupDir: resolveFromRoot(str('BACKUP_DIR', 'storage/backups')),
    maxUploadBytes: int('MAX_UPLOAD_MB', 10) * 1024 * 1024,
  },

  mail: {
    host: str('SMTP_HOST'),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: str('SMTP_USER'),
    password: str('SMTP_PASSWORD'),
    fromName: str('MAIL_FROM_NAME', 'Portfolio'),
    fromEmail: str('MAIL_FROM_EMAIL'),
    replyTo: str('MAIL_REPLY_TO'),
  },

  logging: {
    level: str('LOG_LEVEL', isProduction ? 'info' : 'debug'),
    dir: resolveFromRoot(str('LOG_DIR', 'logs')),
  },

  binaries: {
    mysqldump: str('MYSQLDUMP_PATH', 'mysqldump'),
    mysql: str('MYSQL_CLIENT_PATH', 'mysql'),
  },
};

/**
 * Fails fast on misconfiguration. Called from server.js before listen()
 * so a bad production deploy never starts half-secured.
 *
 * @returns {string[]} non-fatal warnings
 */
function validate() {
  const errors = [];
  const warnings = [];

  if (!config.db.database) errors.push('DB_NAME is required.');
  if (!config.db.user) errors.push('DB_USER is required.');

  if (config.isProduction) {
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET must be set in production.');
    } else if (config.session.secret.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters.');
    }

    if (!process.env.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY must be set in production.');
    } else if (!/^[0-9a-f]{64}$/i.test(config.security.encryptionKey)) {
      errors.push('ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
    }

    if (!process.env.ANALYTICS_SALT) {
      errors.push('ANALYTICS_SALT must be set in production.');
    }

    if (!config.db.password) {
      errors.push('DB_PASSWORD must not be empty in production.');
    }

    if (config.siteUrl.startsWith('http://')) {
      warnings.push('SITE_URL uses http:// - secure cookies require https in production.');
    }

    if (!config.trustProxy) {
      warnings.push('TRUST_PROXY is off. Behind Nginx this makes every client look like 127.0.0.1.');
    }
  } else {
    if (!process.env.SESSION_SECRET) {
      warnings.push('SESSION_SECRET not set - using a derived development secret.');
    }
    if (!process.env.ENCRYPTION_KEY) {
      warnings.push('ENCRYPTION_KEY not set - using a derived development key.');
    }
  }

  if (errors.length) {
    const message = ['Invalid environment configuration:', ...errors.map((e) => `  - ${e}`)].join('\n');
    throw new Error(message);
  }

  return warnings;
}

module.exports = { config, validate, resolveFromRoot, ROOT_DIR };
