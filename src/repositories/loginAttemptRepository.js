'use strict';

const BaseRepository = require('./BaseRepository');
const db = require('../config/database');

class LoginAttemptRepository extends BaseRepository {
  constructor() {
    super({
      table: 'login_attempts',
      columns: ['id', 'email', 'user_id', 'ip_hash', 'user_agent', 'success', 'reason', 'created_at'],
      fillable: ['email', 'user_id', 'ip_hash', 'user_agent', 'success', 'reason'],
      defaultOrder: 'created_at DESC',
    });
  }

  /**
   * Failed attempts from one IP inside a rolling window. Backs the
   * per-IP throttle, which is what stops credential stuffing across
   * many different accounts.
   */
  async countRecentFailuresByIp(ipHash, windowMinutes) {
    const value = await db.queryValue(
      `SELECT COUNT(*) AS total FROM login_attempts
        WHERE ip_hash = ? AND success = 0
          AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [ipHash, windowMinutes],
    );
    return Number(value) || 0;
  }

  async countRecentFailuresByEmail(email, windowMinutes) {
    const value = await db.queryValue(
      `SELECT COUNT(*) AS total FROM login_attempts
        WHERE email = ? AND success = 0
          AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [email, windowMinutes],
    );
    return Number(value) || 0;
  }

  async recent(limit = 25) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 25, 200));
    return db.query(
      `SELECT id, email, ip_hash, user_agent, success, reason, created_at
         FROM login_attempts
        ORDER BY created_at DESC, id DESC
        LIMIT ${safeLimit}`,
    );
  }

  /** Feeds the "failed logins (24h)" tile on the security page. */
  async summary(hours = 24) {
    return db.queryOne(
      `SELECT
         COUNT(*)                                         AS total,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)     AS successes,
         SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)     AS failures,
         COUNT(DISTINCT ip_hash)                          AS distinct_sources
       FROM login_attempts
       WHERE created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [hours],
    );
  }

  async pruneOlderThan(days) {
    const [result] = await db.getPool().execute(
      'DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days],
    );
    return result.affectedRows;
  }
}

module.exports = new LoginAttemptRepository();
