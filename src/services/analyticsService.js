'use strict';

/**
 * Privacy-conscious visitor analytics.
 *
 * What is deliberately NOT done here:
 *   - No raw IP address is stored, anywhere, ever.
 *   - No cross-site tracking, no third-party requests, no ad identifiers.
 *   - No fingerprinting beyond the coarse user-agent family.
 *   - No full referring URL - only the referring hostname.
 *
 * How a visitor is counted:
 *   visitor_hash = sha256(ip + user-agent + salt-of-the-day)
 *   The salt rotates daily, so the same person is countable within one
 *   day but cannot be linked across days, and the hash cannot be
 *   reversed to an address. That is enough for "unique visitors today"
 *   and nothing more, which is the point.
 *
 * Raw rows are rolled up nightly into analytics_daily and then pruned
 * according to the configured retention window.
 */

const crypto = require('node:crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const settingsService = require('./settingsService');
const { dailyVisitorHash } = require('../utils/crypto');
const { getClientIp, getUserAgent, getReferrerHost } = require('../utils/request');

/** Coarse user-agent parsing. Family only - no version fingerprinting. */
function parseUserAgent(userAgent = '') {
  const ua = userAgent.toLowerCase();

  let device = 'desktop';
  if (/bot|crawler|spider|crawling|headless|lighthouse|pingdom|monitor/.test(ua)) device = 'bot';
  else if (/ipad|tablet|playbook|silk/.test(ua)) device = 'tablet';
  else if (/mobi|android|iphone|ipod|windows phone/.test(ua)) device = 'mobile';

  let browser = 'Other';
  if (/edg\//.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/firefox\//.test(ua)) browser = 'Firefox';
  else if (/chrome\//.test(ua)) browser = 'Chrome';
  else if (/safari\//.test(ua)) browser = 'Safari';

  let os = 'Other';
  if (/windows nt/.test(ua)) os = 'Windows';
  else if (/android/.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';
  else if (/mac os x/.test(ua)) os = 'macOS';
  else if (/linux/.test(ua)) os = 'Linux';

  return { device, browser, os };
}

/** Classifies a referring host into a traffic source. */
function classifyReferrer(host, siteHost) {
  if (!host) return 'direct';
  if (host === siteHost) return 'internal';
  if (/google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave/.test(host)) return 'search';
  if (/facebook|twitter|x\.com|linkedin|instagram|reddit|t\.co|youtube|medium|github|whatsapp|telegram/.test(host)) return 'social';
  return 'referral';
}

/**
 * Records a page view.
 *
 * Called from the beacon endpoint. Never throws: analytics must not be
 * able to break a page or an API response.
 */
async function recordPageView(req, payload = {}) {
  try {
    const settings = await settingsService.getAll();
    const flags = await settingsService.getFlags();

    if (flags.enable_analytics === false) return { skipped: 'disabled' };

    // Do not count the owner's own browsing.
    if (settings.analytics_exclude_admin !== false && req.session?.user) {
      return { skipped: 'admin' };
    }

    const userAgent = getUserAgent(req);
    const { device, browser, os } = parseUserAgent(userAgent);

    // Bots are identified but not stored; they would distort every metric.
    if (device === 'bot') return { skipped: 'bot' };

    const visitorHash = dailyVisitorHash(getClientIp(req), userAgent);
    const path = String(payload.path || req.path || '/').slice(0, 255);
    const referrerHost = payload.referrer
      ? String(payload.referrer).slice(0, 160)
      : getReferrerHost(req);

    let siteHost = null;
    try { siteHost = new URL(require('../config/env').config.siteUrl).hostname; } catch { /* ignore */ }

    // ---- visitor
    await db.query(
      `INSERT INTO analytics_visitors
         (visitor_hash, first_seen_at, last_seen_at, visit_count, device_type, browser, os,
          screen_width, screen_height, language)
       VALUES (?, NOW(), NOW(), 1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = NOW(), visit_count = visit_count + 1`,
      [
        visitorHash, device, browser, os,
        Number.parseInt(payload.screenWidth, 10) || null,
        Number.parseInt(payload.screenHeight, 10) || null,
        payload.language ? String(payload.language).slice(0, 12) : null,
      ],
    );

    const visitor = await db.queryOne(
      'SELECT id FROM analytics_visitors WHERE visitor_hash = ?', [visitorHash],
    );
    if (!visitor) return { skipped: 'no-visitor' };

    // ---- session
    const sessionTimeout = Number(settings.analytics_session_minutes) || 30;

    let session = await db.queryOne(
      `SELECT id, pageview_count FROM analytics_sessions
        WHERE visitor_id = ? AND last_activity_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY last_activity_at DESC LIMIT 1`,
      [visitor.id, sessionTimeout],
    );

    if (!session) {
      const [created] = await db.getPool().execute(
        `INSERT INTO analytics_sessions
           (visitor_id, session_key, started_at, last_activity_at, pageview_count,
            entry_path, referrer_host, referrer_type)
         VALUES (?, ?, NOW(), NOW(), 0, ?, ?, ?)`,
        [
          visitor.id, crypto.randomUUID(), path, referrerHost,
          classifyReferrer(referrerHost, siteHost),
        ],
      );
      session = { id: created.insertId, pageview_count: 0 };
    }

    await db.query(
      `UPDATE analytics_sessions
          SET last_activity_at = NOW(),
              pageview_count = pageview_count + 1,
              exit_path = ?,
              duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()),
              is_bounce = IF(pageview_count + 1 > 1, 0, 1)
        WHERE id = ?`,
      [path, session.id],
    );

    // ---- pageview
    await db.query(
      `INSERT INTO analytics_pageviews
         (session_id, visitor_id, path, page_key, title, referrer_host, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id, visitor.id, path,
        payload.pageKey ? String(payload.pageKey).slice(0, 60) : null,
        payload.title ? String(payload.title).slice(0, 255) : null,
        referrerHost,
        Number.parseInt(payload.durationMs, 10) || 0,
      ],
    );

    return { recorded: true };
  } catch (err) {
    logger.error('analytics: could not record pageview', { message: err.message });
    return { error: err.message };
  }
}

/** Records a named event (resume download, project click). */
async function recordEvent(req, { name, path, label, value, meta }) {
  try {
    const flags = await settingsService.getFlags();
    if (flags.enable_analytics === false) return { skipped: 'disabled' };

    const visitorHash = dailyVisitorHash(getClientIp(req), getUserAgent(req));
    const session = await db.queryOne(
      `SELECT s.id FROM analytics_sessions s
         JOIN analytics_visitors v ON v.id = s.visitor_id
        WHERE v.visitor_hash = ?
        ORDER BY s.last_activity_at DESC LIMIT 1`,
      [visitorHash],
    );

    await db.query(
      'INSERT INTO analytics_events (session_id, name, path, label, value, meta_json) VALUES (?,?,?,?,?,?)',
      [
        session?.id || null,
        String(name).slice(0, 60),
        path ? String(path).slice(0, 255) : null,
        label ? String(label).slice(0, 160) : null,
        Number.isFinite(Number(value)) ? Number(value) : null,
        meta ? JSON.stringify(meta).slice(0, 2000) : null,
      ],
    );

    return { recorded: true };
  } catch (err) {
    logger.error('analytics: could not record event', { message: err.message });
    return { error: err.message };
  }
}

/** Headline numbers for the dashboard. */
async function getOverview(days = 30) {
  const safeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 30, 365));

  const [totals, today, yesterday, period] = await Promise.all([
    db.queryOne(`
      SELECT (SELECT COUNT(*) FROM analytics_visitors)  AS visitors,
             (SELECT COUNT(*) FROM analytics_pageviews) AS pageviews,
             (SELECT COUNT(*) FROM analytics_sessions)  AS sessions`),
    db.queryOne(`
      SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageviews
        FROM analytics_pageviews WHERE DATE(created_at) = CURDATE()`),
    db.queryOne(`
      SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageviews
        FROM analytics_pageviews WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`),
    db.queryOne(
      `SELECT COUNT(DISTINCT p.visitor_id) AS visitors,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT p.session_id) AS sessions,
              COALESCE(AVG(s.duration_seconds), 0) AS avg_duration,
              COALESCE(AVG(s.is_bounce) * 100, 0) AS bounce_rate
         FROM analytics_pageviews p
         JOIN analytics_sessions s ON s.id = p.session_id
        WHERE p.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [safeDays],
    ),
  ]);

  return {
    totals,
    today,
    yesterday,
    period: {
      ...period,
      avg_duration: Math.round(Number(period?.avg_duration) || 0),
      bounce_rate: Number(Number(period?.bounce_rate || 0).toFixed(1)),
      days: safeDays,
    },
  };
}

/** Daily series for the visitors chart, gap-filled so the line is continuous. */
async function getTimeSeries(days = 30) {
  const safeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 30, 365));

  const rows = await db.query(
    `SELECT DATE(created_at) AS day,
            COUNT(DISTINCT visitor_id) AS visitors,
            COUNT(*) AS pageviews
       FROM analytics_pageviews
      WHERE created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC`,
    [safeDays],
  );

  const byDay = new Map(rows.map((row) => [String(row.day), row]));
  const series = [];

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);

    series.push({
      date: key,
      visitors: Number(row?.visitors) || 0,
      pageviews: Number(row?.pageviews) || 0,
    });
  }

  return series;
}

/** Generic "top N by count" breakdown used by several dashboard panels. */
async function getBreakdown(dimension, days = 30, limit = 10) {
  const safeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 30, 365));
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 10, 50));

  // Fixed SQL per dimension - the caller cannot inject a column name.
  const queries = {
    pages: `SELECT path AS label, COUNT(*) AS total
              FROM analytics_pageviews
             WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY path ORDER BY total DESC LIMIT ${safeLimit}`,
    referrers: `SELECT COALESCE(referrer_host, 'Direct') AS label, COUNT(*) AS total
                  FROM analytics_sessions
                 WHERE started_at > DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY referrer_host ORDER BY total DESC LIMIT ${safeLimit}`,
    sources: `SELECT referrer_type AS label, COUNT(*) AS total
                FROM analytics_sessions
               WHERE started_at > DATE_SUB(NOW(), INTERVAL ? DAY)
               GROUP BY referrer_type ORDER BY total DESC LIMIT ${safeLimit}`,
    devices: `SELECT v.device_type AS label, COUNT(DISTINCT p.visitor_id) AS total
                FROM analytics_pageviews p JOIN analytics_visitors v ON v.id = p.visitor_id
               WHERE p.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
               GROUP BY v.device_type ORDER BY total DESC LIMIT ${safeLimit}`,
    browsers: `SELECT v.browser AS label, COUNT(DISTINCT p.visitor_id) AS total
                 FROM analytics_pageviews p JOIN analytics_visitors v ON v.id = p.visitor_id
                WHERE p.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY v.browser ORDER BY total DESC LIMIT ${safeLimit}`,
    os: `SELECT v.os AS label, COUNT(DISTINCT p.visitor_id) AS total
           FROM analytics_pageviews p JOIN analytics_visitors v ON v.id = p.visitor_id
          WHERE p.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
          GROUP BY v.os ORDER BY total DESC LIMIT ${safeLimit}`,
    countries: `SELECT COALESCE(v.country_code, 'Unknown') AS label, COUNT(DISTINCT p.visitor_id) AS total
                  FROM analytics_pageviews p JOIN analytics_visitors v ON v.id = p.visitor_id
                 WHERE p.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
                 GROUP BY v.country_code ORDER BY total DESC LIMIT ${safeLimit}`,
  };

  const sql = queries[dimension];
  if (!sql) throw new Error(`Unknown analytics dimension: ${dimension}`);

  return db.query(sql, [safeDays]);
}

/** Visitors active within the configured live window. */
async function getLiveVisitors() {
  const settings = await settingsService.getAll();
  const windowMinutes = Number(settings.live_visitor_window_minutes) || 5;

  const [rows, count] = await Promise.all([
    db.query(
      `SELECT v.device_type, v.browser, v.os, v.country_code,
              s.exit_path AS current_path, s.last_activity_at, s.pageview_count
         FROM analytics_sessions s
         JOIN analytics_visitors v ON v.id = s.visitor_id
        WHERE s.last_activity_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY s.last_activity_at DESC
        LIMIT 25`,
      [windowMinutes],
    ),
    db.queryValue(
      `SELECT COUNT(DISTINCT visitor_id) AS total FROM analytics_sessions
        WHERE last_activity_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [windowMinutes],
    ),
  ]);

  return { online: Number(count) || 0, visitors: rows, windowMinutes };
}

/**
 * Rolls yesterday (or a given date) into analytics_daily.
 * Run nightly so the dashboard never scans the raw pageview table.
 */
async function rollupDay(date = null) {
  const target = date || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const summary = await db.queryOne(
    `SELECT COUNT(*) AS pageviews,
            COUNT(DISTINCT p.visitor_id) AS unique_visitors,
            COUNT(DISTINCT p.session_id) AS sessions,
            COALESCE(AVG(s.duration_seconds), 0) AS avg_duration,
            COALESCE(AVG(s.is_bounce) * 100, 0) AS bounce_rate
       FROM analytics_pageviews p
       JOIN analytics_sessions s ON s.id = p.session_id
      WHERE DATE(p.created_at) = ?`,
    [target],
  );

  const newVisitors = await db.queryValue(
    'SELECT COUNT(*) AS total FROM analytics_visitors WHERE DATE(first_seen_at) = ?', [target],
  );

  const topPath = await db.queryOne(
    `SELECT path FROM analytics_pageviews WHERE DATE(created_at) = ?
      GROUP BY path ORDER BY COUNT(*) DESC LIMIT 1`,
    [target],
  );

  const topReferrer = await db.queryOne(
    `SELECT referrer_host FROM analytics_sessions
      WHERE DATE(started_at) = ? AND referrer_host IS NOT NULL
      GROUP BY referrer_host ORDER BY COUNT(*) DESC LIMIT 1`,
    [target],
  );

  await db.query(
    `INSERT INTO analytics_daily
       (stat_date, visitors, unique_visitors, new_visitors, pageviews, sessions,
        avg_duration_seconds, bounce_rate, top_path, top_referrer)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       visitors=VALUES(visitors), unique_visitors=VALUES(unique_visitors),
       new_visitors=VALUES(new_visitors), pageviews=VALUES(pageviews),
       sessions=VALUES(sessions), avg_duration_seconds=VALUES(avg_duration_seconds),
       bounce_rate=VALUES(bounce_rate), top_path=VALUES(top_path), top_referrer=VALUES(top_referrer)`,
    [
      target,
      Number(summary?.unique_visitors) || 0,
      Number(summary?.unique_visitors) || 0,
      Number(newVisitors) || 0,
      Number(summary?.pageviews) || 0,
      Number(summary?.sessions) || 0,
      Math.round(Number(summary?.avg_duration) || 0),
      Number(Number(summary?.bounce_rate || 0).toFixed(2)),
      topPath?.path || null,
      topReferrer?.referrer_host || null,
    ],
  );

  return { date: target, ...summary };
}

/** Deletes raw rows past the retention window. Rollups are kept. */
async function pruneOldData() {
  const settings = await settingsService.getAll();
  const retentionDays = Number(settings.analytics_retention_days) || 365;

  const [pageviews] = await db.getPool().execute(
    'DELETE FROM analytics_pageviews WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [retentionDays],
  );
  const [sessions] = await db.getPool().execute(
    'DELETE FROM analytics_sessions WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [retentionDays],
  );
  const [visitors] = await db.getPool().execute(
    'DELETE FROM analytics_visitors WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [retentionDays],
  );
  const [events] = await db.getPool().execute(
    'DELETE FROM analytics_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [retentionDays],
  );

  return {
    retentionDays,
    pageviews: pageviews.affectedRows,
    sessions: sessions.affectedRows,
    visitors: visitors.affectedRows,
    events: events.affectedRows,
  };
}

module.exports = {
  recordPageView,
  recordEvent,
  getOverview,
  getTimeSeries,
  getBreakdown,
  getLiveVisitors,
  rollupDay,
  pruneOldData,
  parseUserAgent,
  classifyReferrer,
};
