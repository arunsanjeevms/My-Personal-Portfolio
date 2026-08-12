'use strict';

/**
 * Process entry point: validate configuration, verify the database,
 * start listening, and shut down cleanly.
 */

const fs = require('node:fs');

const { config, validate } = require('./config/env');
const logger = require('./utils/logger');
const db = require('./config/database');
const cache = require('./utils/cache');
const { createApp } = require('./app');
const jobs = require('./jobs');
const { closeSessionStore } = require('./middleware/session');

const c = { reset: '\x1b[0m', dim: '\x1b[90m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m' };

let server = null;
let shuttingDown = false;
let cachePruneTimer = null;

function ensureDirectories() {
  for (const directory of [config.storage.uploadDir, config.storage.backupDir, config.logging.dir]) {
    try {
      fs.mkdirSync(directory, { recursive: true });
    } catch (err) {
      logger.warn(`could not create directory ${directory}`, { message: err.message });
    }
  }
}

/**
 * Confirms the database is reachable and migrated before accepting
 * traffic - a clearer failure than 500s on the first request.
 */
async function verifyDatabase() {
  const health = await db.healthCheck();

  if (!health.connected) {
    process.stdout.write(`\n${c.red}Cannot connect to the database.${c.reset}\n`);
    process.stdout.write(`${c.dim}${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}${c.reset}\n`);
    process.stdout.write(`${c.dim}${health.error || ''}${c.reset}\n\n`);
    process.stdout.write('If you use XAMPP, start MySQL from the XAMPP Control Panel.\n');
    throw new Error('Database unavailable');
  }

  const migrated = await db.queryValue(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [config.db.database, 'users'],
  );

  if (!Number(migrated)) {
    process.stdout.write(`\n${c.yellow}The database has no schema yet.${c.reset}\n`);
    process.stdout.write(`${c.dim}Run: npm run migrate${c.reset}\n\n`);
    throw new Error('Database not migrated');
  }

  return health;
}

async function start() {
  try {
    const warnings = validate();
    for (const warning of warnings) logger.warn(`config: ${warning}`);

    ensureDirectories();

    const health = await verifyDatabase();

    const app = createApp();

    server = app.listen(config.port, () => {
      process.stdout.write(`\n${c.bold}Portfolio CMS${c.reset} ${c.dim}v${require('../package.json').version}${c.reset}\n`);
      process.stdout.write(`${c.green}running${c.reset}   ${config.siteUrl}\n`);
      process.stdout.write(`${c.dim}admin     ${config.siteUrl}${config.security.adminPath}${c.reset}\n`);
      process.stdout.write(`${c.dim}env       ${config.env}${c.reset}\n`);
      process.stdout.write(`${c.dim}database  ${config.db.database} (${health.latencyMs}ms)${c.reset}\n`);

      if (warnings.length) {
        process.stdout.write(`\n${c.yellow}${warnings.length} configuration warning(s):${c.reset}\n`);
        for (const warning of warnings) process.stdout.write(`${c.dim}  - ${warning}${c.reset}\n`);
      }
      process.stdout.write('\n');

      logger.info('server started', { port: config.port, env: config.env });
    });

    // Slightly above a typical 60s proxy timeout, so Node is never the
    // side that drops a keep-alive connection mid-response.
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        process.stdout.write(`\n${c.red}Port ${config.port} is already in use.${c.reset}\n`);
        process.stdout.write(`${c.dim}Change PORT in .env or stop the other process.${c.reset}\n\n`);
      } else {
        logger.error('server error', { message: err.message, code: err.code });
      }
      process.exit(1);
    });

    // Keeps the in-process cache from growing without bound.
    cachePruneTimer = setInterval(() => cache.prune(), 5 * 60 * 1000);
    cachePruneTimer.unref();

    // Scheduled maintenance: analytics rollups, Medium sync, SSL checks,
    // backups, housekeeping. Guarded so a scheduler failure cannot stop
    // the site from serving.
    try {
      const count = jobs.start();
      process.stdout.write(`${c.dim}jobs      ${count} scheduled${c.reset}\n\n`);
    } catch (err) {
      logger.error('jobs: scheduler failed to start', { message: err.message });
    }
  } catch (err) {
    logger.error('startup failed', { message: err.message });
    if (config.isDevelopment && !['Database unavailable', 'Database not migrated'].includes(err.message)) {
      process.stdout.write(`${c.dim}${err.stack}${c.reset}\n`);
    } else if (err.message.startsWith('Invalid environment')) {
      process.stdout.write(`\n${c.red}${err.message}${c.reset}\n\n`);
    }
    process.exit(1);
  }
}

/** Drains connections, closes the pool, then exits. */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`shutting down (${signal})`);
  if (cachePruneTimer) clearInterval(cachePruneTimer);
  try { jobs.stop(); } catch { /* nothing scheduled */ }
  try { closeSessionStore(); } catch { /* not started */ }

  const forceExit = setTimeout(() => {
    logger.warn('shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.closePool();
    clearTimeout(forceExit);
    logger.info('shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('error during shutdown', { message: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', {
    message: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', { message: err.message, stack: err.stack });
  // The process state is unknown after this point; exit rather than
  // continue serving from a possibly-corrupt state.
  shutdown('uncaughtException');
});

start();
