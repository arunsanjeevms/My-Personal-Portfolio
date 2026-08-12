'use strict';

/**
 * Structured application logger.
 *
 * Writes one JSON object per line to logs/<channel>.log and a readable
 * line to the console in development. Channels are separated so a
 * security review never has to grep through request noise.
 *
 * Never log passwords, session secrets, API keys or raw IP addresses -
 * redact() strips the common offenders as a backstop, but the caller is
 * still responsible for not passing them in.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CHANNELS = ['app', 'security', 'admin', 'error'];

const REDACT_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'confirm_password', 'current_password',
  'new_password', 'secret', 'session_secret', 'sessionsecret', 'token', 'access_key',
  'apikey', 'api_key', 'authorization', 'cookie', 'smtp_password', 'encryption_key',
  'secret_encrypted', 'reset_token_hash', 'code_hash', 'totp', 'otp', 'ip', 'ip_address',
  'remoteaddress', 'creditcard', 'card_number',
]);

const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';

let streams = null;
let warnedAboutDisk = false;

function ensureStreams() {
  if (streams) return streams;

  streams = {};
  try {
    fs.mkdirSync(config.logging.dir, { recursive: true });
    for (const channel of CHANNELS) {
      streams[channel] = fs.createWriteStream(
        path.join(config.logging.dir, `${channel}.log`),
        { flags: 'a' },
      );
      // A broken log file must never take the site down.
      streams[channel].on('error', () => {});
    }
  } catch (err) {
    if (!warnedAboutDisk) {
      warnedAboutDisk = true;
      // eslint-disable-next-line no-console
      console.error(`[logger] file logging disabled: ${err.message}`);
    }
    streams = {};
  }

  return streams;
}

/** Recursively masks sensitive keys. Depth-capped to avoid huge payloads. */
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack, code: value.code };
  }

  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(item, depth + 1);
    }
    return output;
  }

  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...[truncated]`;

  return value;
}

function write(level, channel, message, meta) {
  if (LEVELS[level] > (LEVELS[config.logging.level] ?? LEVELS.info)) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    channel,
    message,
    ...(meta && Object.keys(meta).length ? { meta: redact(meta) } : {}),
  };

  const target = ensureStreams()[channel] || ensureStreams().app;
  if (target) target.write(`${JSON.stringify(entry)}\n`);
  // Errors are duplicated into error.log so they are all in one place.
  if (level === 'error' && channel !== 'error' && ensureStreams().error) {
    ensureStreams().error.write(`${JSON.stringify(entry)}\n`);
  }

  if (config.isDevelopment) {
    const colour = COLORS[level] || '';
    const suffix = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    // eslint-disable-next-line no-console
    console.log(`${colour}[${level}]${RESET} ${channel === 'app' ? '' : `(${channel}) `}${message}${suffix}`);
  }
}

const logger = {
  error: (message, meta) => write('error', 'error', message, meta),
  warn: (message, meta) => write('warn', 'app', message, meta),
  info: (message, meta) => write('info', 'app', message, meta),
  debug: (message, meta) => write('debug', 'app', message, meta),

  /** Auth events, permission denials, rate limiting, upload rejections. */
  security: (message, meta) => write('warn', 'security', message, meta),
  /** Content changes made through the admin panel. */
  admin: (message, meta) => write('info', 'admin', message, meta),

  redact,
};

module.exports = logger;
