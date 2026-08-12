'use strict';

/**
 * Scheduled jobs.
 *
 * node-cron rather than an external queue: these are a handful of
 * periodic maintenance tasks in a single-process app, and a job runner
 * service would be more to operate than the work justifies.
 *
 * Every run is recorded in jobs_log, and every job is wrapped so a
 * failure is logged and contained rather than crashing the process.
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../utils/logger');
const settingsService = require('../services/settingsService');
const analyticsService = require('../services/analyticsService');
const blogService = require('../services/blogService');
const domainService = require('../services/domainService');
const backupService = require('../services/backupService');
const notificationService = require('../services/notificationService');
const activityLogRepository = require('../repositories/activityLogRepository');
const loginAttemptRepository = require('../repositories/loginAttemptRepository');

const tasks = [];

/**
 * Wraps a job with logging and error containment.
 * @param {string} name
 * @param {() => Promise<*>} work
 */
async function runJob(name, work) {
  const startedAt = new Date();

  const [entry] = await db.getPool().execute(
    "INSERT INTO jobs_log (job_name, status, started_at) VALUES (?, 'running', ?)",
    [name, startedAt],
  ).catch(() => [{ insertId: null }]);

  const jobId = entry?.insertId;

  try {
    const result = await work();
    const durationMs = Date.now() - startedAt.getTime();

    if (jobId) {
      await db.query(
        "UPDATE jobs_log SET status = 'success', finished_at = NOW(), duration_ms = ?, message = ? WHERE id = ?",
        [durationMs, JSON.stringify(result || {}).slice(0, 500), jobId],
      ).catch(() => {});
    }

    logger.info(`job: ${name} finished`, { durationMs, result });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();

    if (jobId) {
      await db.query(
        "UPDATE jobs_log SET status = 'failed', finished_at = NOW(), duration_ms = ?, message = ? WHERE id = ?",
        [durationMs, String(err.message).slice(0, 500), jobId],
      ).catch(() => {});
    }

    logger.error(`job: ${name} failed`, { message: err.message });
    return { error: err.message };
  }
}

/** Publishes posts whose scheduled time has arrived. */
async function publishScheduledPosts() {
  const [result] = await db.getPool().execute(
    `UPDATE blog_posts SET status = 'published'
      WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= NOW()`,
  );
  return { published: result.affectedRows };
}

/** Warns when a burst of failed sign-ins looks like an attack. */
async function checkFailedLogins() {
  const summary = await loginAttemptRepository.summary(1);
  const failures = Number(summary?.failures) || 0;

  if (failures >= 20) {
    await notificationService.create({
      type: 'failed_logins',
      severity: 'warning',
      title: `${failures} failed sign-in attempts in the last hour`,
      body: `From ${summary.distinct_sources} distinct source(s).`,
      link: '/activity-logs',
      // One alert per hour, not one per check.
      dedupeKey: `failed_logins:${new Date().toISOString().slice(0, 13)}`,
    });
  }

  return { failures, sources: Number(summary?.distinct_sources) || 0 };
}

/** Removes expired session rows the store missed. */
async function cleanSessions() {
  const [result] = await db.getPool().execute(
    'DELETE FROM sessions WHERE expires < UNIX_TIMESTAMP()',
  );
  return { removed: result.affectedRows };
}

const SCHEDULE = [
  {
    name: 'analytics-rollup',
    // 00:15 daily - after midnight so "yesterday" is complete.
    cron: '15 0 * * *',
    run: () => analyticsService.rollupDay(),
  },
  {
    name: 'analytics-prune',
    cron: '30 3 * * 0',   // Sunday 03:30
    run: () => analyticsService.pruneOldData(),
  },
  {
    name: 'medium-sync',
    cron: '0 */6 * * *',  // every 6 hours
    run: () => blogService.syncMediumFeed(),
  },
  {
    name: 'publish-scheduled-posts',
    cron: '*/15 * * * *',
    run: publishScheduledPosts,
  },
  {
    name: 'domain-ssl-check',
    cron: '0 6 * * *',    // 06:00 daily
    run: () => domainService.runExpiryChecks(),
  },
  {
    name: 'database-backup',
    cron: '0 2 * * *',    // 02:00 daily
    run: async () => {
      const enabled = await settingsService.isEnabled('enable_backups', false);
      if (!enabled) return { skipped: 'Scheduled backups are switched off.' };

      const backup = await backupService.create({ type: 'scheduled' });
      const pruned = await backupService.pruneOld(7);
      return { filename: backup.filename, pruned };
    },
  },
  {
    name: 'failed-login-watch',
    cron: '0 * * * *',    // hourly
    run: checkFailedLogins,
  },
  {
    name: 'housekeeping',
    cron: '0 4 * * *',    // 04:00 daily
    run: async () => ({
      sessions: (await cleanSessions()).removed,
      notifications: await notificationService.prune(90),
      loginAttempts: await loginAttemptRepository.pruneOlderThan(90),
      activityLogs: await activityLogRepository.pruneOlderThan(365),
    }),
  },
];

/** Starts every scheduled job. Called once from server.js. */
function start() {
  for (const job of SCHEDULE) {
    if (!cron.validate(job.cron)) {
      logger.error(`job: invalid cron expression for ${job.name}`, { cron: job.cron });
      continue;
    }

    const task = cron.schedule(job.cron, () => runJob(job.name, job.run), {
      scheduled: true,
      timezone: process.env.TZ || undefined,
    });

    tasks.push({ name: job.name, cron: job.cron, task });
  }

  logger.info('jobs: scheduler started', { jobs: tasks.length });
  return tasks.length;
}

function stop() {
  for (const entry of tasks) {
    try { entry.task.stop(); } catch { /* already stopped */ }
  }
  tasks.length = 0;
}

/** Runs one job immediately, for the "Run now" buttons in the admin. */
async function runNow(name) {
  const job = SCHEDULE.find((entry) => entry.name === name);
  if (!job) throw new Error(`Unknown job: ${name}`);
  return runJob(job.name, job.run);
}

/** Recent history for the admin, newest run per job. */
async function history(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 100));
  return db.query(
    `SELECT * FROM jobs_log ORDER BY started_at DESC LIMIT ${safeLimit}`,
  );
}

function listJobs() {
  return SCHEDULE.map((job) => ({ name: job.name, cron: job.cron }));
}

module.exports = { start, stop, runNow, history, listJobs, SCHEDULE };
