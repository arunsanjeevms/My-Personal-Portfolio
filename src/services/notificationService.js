'use strict';

/**
 * Admin notification centre.
 *
 * `dedupe_key` carries a unique constraint, which is how recurring alerts
 * (a domain expiring, an SSL certificate nearing renewal) fire once per
 * threshold instead of every time the nightly job runs.
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * @param {object} options
 * @param {string} options.type       e.g. 'contact_message', 'domain_expiry'
 * @param {string} options.title
 * @param {string} [options.dedupeKey] suppresses duplicates when set
 */
async function create({
  type, severity = 'info', title, body = null, link = null,
  entity = null, entityId = null, userId = null, dedupeKey = null,
}) {
  try {
    const [result] = await db.getPool().execute(
      `INSERT INTO admin_notifications
         (type, severity, title, body, link, entity, entity_id, user_id, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [type, severity, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null,
        link, entity, entityId, userId, dedupeKey],
    );

    // affectedRows === 0 means the dedupe key already existed.
    return result.insertId || null;
  } catch (err) {
    logger.error('notifications: could not create', { type, message: err.message });
    return null;
  }
}

async function unreadCount(userId = null) {
  const value = await db.queryValue(
    'SELECT COUNT(*) AS total FROM admin_notifications WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
    [userId],
  );
  return Number(value) || 0;
}

async function list({ page = 1, perPage = 30, unreadOnly = false, userId = null } = {}) {
  const clauses = ['(user_id IS NULL OR user_id = ?)'];
  const params = [userId];

  if (unreadOnly) clauses.push('read_at IS NULL');

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePerPage = Math.max(1, Math.min(Number.parseInt(perPage, 10) || 30, 100));
  const offset = (safePage - 1) * safePerPage;

  const [rows, total] = await Promise.all([
    db.query(
      `SELECT * FROM admin_notifications ${whereSql}
        ORDER BY read_at IS NULL DESC, created_at DESC
        LIMIT ${safePerPage} OFFSET ${offset}`,
      params,
    ),
    db.queryValue(`SELECT COUNT(*) AS total FROM admin_notifications ${whereSql}`, params),
  ]);

  return {
    rows,
    total: Number(total) || 0,
    page: safePage,
    perPage: safePerPage,
    pages: Math.max(1, Math.ceil((Number(total) || 0) / safePerPage)),
  };
}

async function recent(limit = 8, userId = null) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 8, 30));
  return db.query(
    `SELECT id, type, severity, title, body, link, read_at, created_at
       FROM admin_notifications
      WHERE (user_id IS NULL OR user_id = ?)
      ORDER BY read_at IS NULL DESC, created_at DESC
      LIMIT ${safeLimit}`,
    [userId],
  );
}

async function markRead(id, userId = null) {
  const [result] = await db.getPool().execute(
    'UPDATE admin_notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
    [id, userId],
  );
  return result.affectedRows;
}

async function markAllRead(userId = null) {
  const [result] = await db.getPool().execute(
    'UPDATE admin_notifications SET read_at = NOW() WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)',
    [userId],
  );
  return result.affectedRows;
}

async function remove(id) {
  const [result] = await db.getPool().execute('DELETE FROM admin_notifications WHERE id = ?', [id]);
  return result.affectedRows;
}

/** Housekeeping: drop read notifications older than `days`. */
async function prune(days = 90) {
  const [result] = await db.getPool().execute(
    'DELETE FROM admin_notifications WHERE read_at IS NOT NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [days],
  );
  return result.affectedRows;
}

module.exports = {
  create, unreadCount, list, recent, markRead, markAllRead, remove, prune,
};
