'use strict';

const BaseRepository = require('./BaseRepository');
const db = require('../config/database');

class ActivityLogRepository extends BaseRepository {
  constructor() {
    super({
      table: 'activity_logs',
      columns: [
        'id', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'description',
        'before_json', 'after_json', 'ip_hash', 'user_agent', 'severity', 'created_at',
      ],
      fillable: [
        'user_id', 'user_name', 'action', 'entity', 'entity_id', 'description',
        'before_json', 'after_json', 'ip_hash', 'user_agent', 'severity',
      ],
      defaultOrder: 'created_at DESC',
    });
  }

  /**
   * Filtered, paginated audit trail for /admin/activity-logs.
   *
   * Every filter value is bound; only fixed SQL fragments are appended.
   */
  async search({ page = 1, perPage = 30, userId, action, entity, severity, search, from, to } = {}) {
    const clauses = [];
    const params = [];

    if (userId) { clauses.push('l.user_id = ?'); params.push(userId); }
    if (action) { clauses.push('l.action = ?'); params.push(action); }
    if (entity) { clauses.push('l.entity = ?'); params.push(entity); }
    if (severity) { clauses.push('l.severity = ?'); params.push(severity); }
    if (from) { clauses.push('l.created_at >= ?'); params.push(from); }
    if (to) { clauses.push('l.created_at <= ?'); params.push(to); }
    if (search) {
      clauses.push('(l.description LIKE ? OR l.user_name LIKE ? OR l.action LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safePerPage = Math.max(1, Math.min(Number.parseInt(perPage, 10) || 30, 100));
    const offset = (safePage - 1) * safePerPage;

    const [rows, total] = await Promise.all([
      db.query(
        `SELECT l.*, u.email AS user_email
           FROM activity_logs l
           LEFT JOIN users u ON u.id = l.user_id
          ${whereSql}
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT ${safePerPage} OFFSET ${offset}`,
        params,
      ),
      db.queryValue(`SELECT COUNT(*) AS total FROM activity_logs l ${whereSql}`, params),
    ]);

    return {
      rows,
      total: Number(total) || 0,
      page: safePage,
      perPage: safePerPage,
      pages: Math.max(1, Math.ceil((Number(total) || 0) / safePerPage)),
    };
  }

  async recent(limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 10, 50));
    return db.query(
      `SELECT l.id, l.user_name, l.action, l.entity, l.entity_id, l.description,
              l.severity, l.created_at
         FROM activity_logs l
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${safeLimit}`,
    );
  }

  /** Distinct values to populate the filter dropdowns. */
  async filterOptions() {
    const [actions, entities] = await Promise.all([
      db.query('SELECT DISTINCT action FROM activity_logs ORDER BY action ASC'),
      db.query('SELECT DISTINCT entity FROM activity_logs WHERE entity IS NOT NULL ORDER BY entity ASC'),
    ]);
    return {
      actions: actions.map((row) => row.action),
      entities: entities.map((row) => row.entity),
    };
  }

  async pruneOlderThan(days) {
    const [result] = await db.getPool().execute(
      'DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days],
    );
    return result.affectedRows;
  }
}

module.exports = new ActivityLogRepository();
