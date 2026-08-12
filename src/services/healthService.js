'use strict';

/**
 * System health for the dashboard and /healthz.
 *
 * Nothing here exposes a credential: no connection string, no password,
 * no environment variable values - only derived status.
 */

const os = require('node:os');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { config } = require('../config/env');

const execFileAsync = promisify(execFile);

const STATUS = { HEALTHY: 'healthy', WARNING: 'warning', CRITICAL: 'critical' };

/** CPU load as a percentage, sampled over 100ms. */
function cpuUsagePercent() {
  return new Promise((resolve) => {
    const start = process.cpuUsage();
    const startTime = process.hrtime.bigint();

    setTimeout(() => {
      const delta = process.cpuUsage(start);
      const elapsedMicros = Number(process.hrtime.bigint() - startTime) / 1000;
      const percent = ((delta.user + delta.system) / elapsedMicros) * 100;
      resolve(Number(Math.min(100, Math.max(0, percent)).toFixed(1)));
    }, 100);
  });
}

function memoryStats() {
  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  const systemTotal = os.totalmem();
  const systemFree = os.freemem();

  return {
    processRssBytes: rss,
    heapUsedBytes: heapUsed,
    heapTotalBytes: heapTotal,
    heapPercent: Number(((heapUsed / heapTotal) * 100).toFixed(1)),
    systemTotalBytes: systemTotal,
    systemUsedBytes: systemTotal - systemFree,
    systemPercent: Number((((systemTotal - systemFree) / systemTotal) * 100).toFixed(1)),
  };
}

/** Recursive size of a directory. Returns 0 if it does not exist yet. */
async function directorySize(directory) {
  let total = 0;
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        total += await directorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath).catch(() => null);
        if (stats) total += stats.size;
      }
    }
  } catch {
    return 0;
  }
  return total;
}

async function storageStats() {
  const [uploads, backups] = await Promise.all([
    directorySize(config.storage.uploadDir),
    directorySize(config.storage.backupDir),
  ]);
  return { uploadBytes: uploads, backupBytes: backups, totalBytes: uploads + backups };
}

/** Total size of the application's own schema. */
async function databaseSize() {
  try {
    const row = await db.queryOne(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes,
              COUNT(*) AS tables
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?`,
      [config.db.database],
    );
    return { bytes: Number(row?.bytes) || 0, tables: Number(row?.tables) || 0 };
  } catch {
    return { bytes: 0, tables: 0 };
  }
}

/** Current commit, when the app is running from a git checkout. */
async function gitCommit() {
  return cache.remember('health:git', 3600, async () => {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: config.rootDir,
        timeout: 3000,
        windowsHide: true,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  });
}

/**
 * Full health report.
 * @returns {Promise<object>} status is the worst of the individual checks
 */
async function getReport() {
  const [database, cpu, storage, dbSize, commit] = await Promise.all([
    db.healthCheck(),
    cpuUsagePercent(),
    storageStats(),
    databaseSize(),
    gitCommit(),
  ]);

  const memory = memoryStats();

  const checks = {
    database: {
      status: database.connected
        ? (database.latencyMs > 250 ? STATUS.WARNING : STATUS.HEALTHY)
        : STATUS.CRITICAL,
      label: database.connected ? `Connected (${database.latencyMs}ms)` : 'Unreachable',
      detail: database.error,
    },
    memory: {
      status: memory.systemPercent > 92 ? STATUS.CRITICAL
        : memory.systemPercent > 80 ? STATUS.WARNING : STATUS.HEALTHY,
      label: `${memory.systemPercent}% system memory in use`,
    },
    cpu: {
      status: cpu > 90 ? STATUS.CRITICAL : cpu > 70 ? STATUS.WARNING : STATUS.HEALTHY,
      label: `${cpu}% process CPU`,
    },
  };

  const statuses = Object.values(checks).map((check) => check.status);
  const overall = statuses.includes(STATUS.CRITICAL) ? STATUS.CRITICAL
    : statuses.includes(STATUS.WARNING) ? STATUS.WARNING : STATUS.HEALTHY;

  return {
    status: overall,
    checks,
    application: {
      version: require('../../package.json').version,
      environment: config.env,
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      uptimeSeconds: Math.floor(process.uptime()),
      systemUptimeSeconds: Math.floor(os.uptime()),
      pid: process.pid,
      gitCommit: commit,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
    database: { ...database, ...dbSize },
    memory,
    cpu: { processPercent: cpu, cores: os.cpus().length, loadAverage: os.loadavg() },
    storage,
    cache: cache.stats(),
  };
}

/** Small payload for the public /healthz endpoint. */
async function getLiveness() {
  const database = await db.healthCheck();
  return {
    status: database.connected ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    database: database.connected,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getReport, getLiveness, STATUS };
