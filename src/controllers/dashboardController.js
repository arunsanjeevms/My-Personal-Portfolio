'use strict';

/**
 * Admin dashboard.
 *
 * Phase 2 wires the shell and the counts that already have tables
 * behind them. Analytics, domain and SSL tiles render as "not
 * configured yet" until Phases 5 and 6 fill them - deliberately, rather
 * than showing invented numbers.
 */

const db = require('../config/database');
const healthService = require('../services/healthService');
const activityLogRepository = require('../repositories/activityLogRepository');
const loginAttemptRepository = require('../repositories/loginAttemptRepository');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Content counts in a single round trip. Scalar subqueries keep this to
 * one query rather than a dozen, which matters because the dashboard is
 * the most-visited admin page.
 */
async function getContentCounts() {
  try {
    return await db.queryOne(`
      SELECT
        (SELECT COUNT(*) FROM projects        WHERE deleted_at IS NULL)                       AS projects,
        (SELECT COUNT(*) FROM projects        WHERE deleted_at IS NULL AND status='published') AS projects_published,
        (SELECT COUNT(*) FROM experience      WHERE deleted_at IS NULL)                       AS experience,
        (SELECT COUNT(*) FROM education       WHERE deleted_at IS NULL)                       AS education,
        (SELECT COUNT(*) FROM certifications  WHERE deleted_at IS NULL)                       AS certifications,
        (SELECT COUNT(*) FROM achievements    WHERE deleted_at IS NULL)                       AS achievements,
        (SELECT COUNT(*) FROM skills)                                                          AS skills,
        (SELECT COUNT(*) FROM services)                                                        AS services,
        (SELECT COUNT(*) FROM social_links    WHERE is_active = 1)                             AS social_links,
        (SELECT COUNT(*) FROM blog_posts      WHERE deleted_at IS NULL)                        AS blog_posts,
        (SELECT COUNT(*) FROM media           WHERE deleted_at IS NULL)                        AS media,
        (SELECT COUNT(*) FROM contact_messages WHERE deleted_at IS NULL)                       AS messages,
        (SELECT COUNT(*) FROM contact_messages WHERE deleted_at IS NULL AND status='unread')   AS messages_unread,
        (SELECT COUNT(*) FROM domains         WHERE is_active = 1)                             AS domains,
        (SELECT COUNT(*) FROM users           WHERE deleted_at IS NULL)                        AS users,
        (SELECT COUNT(*) FROM admin_notifications WHERE read_at IS NULL)                       AS notifications_unread
    `);
  } catch (err) {
    logger.error('dashboard: count query failed', { message: err.message });
    return {};
  }
}

/**
 * Visitor tiles. Returns configured:false until the analytics collector
 * lands in Phase 5, so the UI can say "not collecting yet" instead of
 * displaying zeros that look like a broken site.
 */
async function getVisitorSummary() {
  try {
    const row = await db.queryOne(`
      SELECT
        (SELECT COUNT(*) FROM analytics_pageviews WHERE DATE(created_at) = CURDATE())          AS views_today,
        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_pageviews
          WHERE DATE(created_at) = CURDATE())                                                  AS visitors_today,
        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_pageviews
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))                             AS visitors_week,
        (SELECT COUNT(*) FROM analytics_visitors)                                              AS visitors_total
    `);

    return { configured: Number(row?.visitors_total) > 0, ...row };
  } catch (err) {
    logger.error('dashboard: visitor summary failed', { message: err.message });
    return { configured: false };
  }
}

/** Domain and SSL expiry warnings, ordered by urgency. */
async function getDomainSummary() {
  try {
    const rows = await db.query(`
      SELECT id, domain, expires_at, ssl_expires_at, ssl_status, auto_renew, is_primary,
             DATEDIFF(expires_at, CURDATE())     AS days_to_expiry,
             DATEDIFF(ssl_expires_at, CURDATE()) AS days_to_ssl_expiry
        FROM domains
       WHERE is_active = 1
       ORDER BY is_primary DESC, expires_at ASC
       LIMIT 5
    `);
    return { configured: rows.length > 0, domains: rows };
  } catch (err) {
    logger.error('dashboard: domain summary failed', { message: err.message });
    return { configured: false, domains: [] };
  }
}

/** GET /admin/dashboard */
const index = asyncHandler(async (req, res) => {
  const [counts, visitors, domains, health, recentActivity, loginSummary] = await Promise.all([
    getContentCounts(),
    getVisitorSummary(),
    getDomainSummary(),
    healthService.getReport(),
    activityLogRepository.recent(8).catch(() => []),
    loginAttemptRepository.summary(24).catch(() => null),
  ]);

  res.render('admin/dashboard', {
    title: 'Dashboard',
    activeNav: 'dashboard',
    breadcrumbs: [{ label: 'Dashboard' }],
    counts,
    visitors,
    domains,
    health,
    recentActivity,
    loginSummary,
  });
});

/** GET /admin/system */
const system = asyncHandler(async (req, res) => {
  const health = await healthService.getReport();

  res.render('admin/system', {
    title: 'System health',
    activeNav: 'system',
    breadcrumbs: [{ label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` }, { label: 'System health' }],
    health,
  });
});

module.exports = { index, system };
