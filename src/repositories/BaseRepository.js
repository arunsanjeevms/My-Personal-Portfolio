'use strict';

/**
 * Shared CRUD behaviour for table-backed repositories.
 *
 * SQL-injection policy
 * --------------------
 * Values are ALWAYS bound as ? placeholders - never interpolated.
 *
 * Identifiers (table, column, direction) cannot be placeholders in SQL,
 * so every identifier used here must appear in the subclass's declared
 * `columns` allowlist. Anything not on that list is rejected before a
 * query is built, which means request input can never reach the SQL text.
 */

const db = require('../config/database');
const { ValidationError } = require('../utils/errors');

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

class BaseRepository {
  /**
   * @param {object} options
   * @param {string} options.table
   * @param {string[]} options.columns    every column that may be read, filtered or sorted
   * @param {string[]} [options.fillable] columns writable through create/update
   * @param {boolean} [options.softDelete]
   * @param {string} [options.defaultOrder] e.g. "sort_order ASC, id ASC"
   */
  constructor({ table, columns, fillable, softDelete = false, defaultOrder = 'id ASC' }) {
    if (!IDENTIFIER_PATTERN.test(table)) throw new Error(`Unsafe table name: ${table}`);

    this.table = table;
    this.columns = new Set(columns);
    this.fillable = new Set(fillable || columns);
    this.softDelete = softDelete;
    this.defaultOrder = defaultOrder;
    this.primaryKey = 'id';
  }

  /** Throws unless `column` is a declared column of this table. */
  assertColumn(column) {
    if (!this.columns.has(column)) {
      throw new ValidationError(`Unknown field "${column}" for ${this.table}.`);
    }
    return column;
  }

  /** Restricts a payload to writable columns, dropping anything unexpected. */
  pickFillable(data) {
    const output = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (this.fillable.has(key)) output[key] = value === '' ? null : value;
    }
    return output;
  }

  /**
   * Builds a WHERE clause from a plain object.
   *
   * Supported shapes:
   *   { status: 'published' }                 status = ?
   *   { id: [1, 2, 3] }                       id IN (?, ?, ?)
   *   { deleted_at: null }                    deleted_at IS NULL
   *   { title: { like: 'abc' } }              title LIKE ?
   *   { level: { gte: 3 } }                   level >= ?
   */
  buildWhere(filters = {}, { includeDeleted = false } = {}) {
    const clauses = [];
    const params = [];

    for (const [column, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      this.assertColumn(column);

      if (value === null) {
        clauses.push(`\`${column}\` IS NULL`);
      } else if (Array.isArray(value)) {
        if (!value.length) {
          clauses.push('1 = 0');
          continue;
        }
        clauses.push(`\`${column}\` IN (${value.map(() => '?').join(', ')})`);
        params.push(...value);
      } else if (typeof value === 'object') {
        const [operator, operand] = Object.entries(value)[0] || [];
        const sqlOperator = {
          like: 'LIKE', gt: '>', gte: '>=', lt: '<', lte: '<=', ne: '<>', not: '<>',
        }[operator];
        if (!sqlOperator) throw new ValidationError(`Unsupported filter on "${column}".`);
        clauses.push(`\`${column}\` ${sqlOperator} ?`);
        params.push(sqlOperator === 'LIKE' ? `%${operand}%` : operand);
      } else {
        clauses.push(`\`${column}\` = ?`);
        params.push(value);
      }
    }

    if (this.softDelete && !includeDeleted && !('deleted_at' in filters)) {
      clauses.push('`deleted_at` IS NULL');
    }

    return {
      sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Validates an ORDER BY string of the form "col ASC, col2 DESC".
   * Every column is checked against the allowlist.
   */
  buildOrderBy(orderBy) {
    const source = orderBy || this.defaultOrder;
    const parts = String(source).split(',').map((part) => part.trim()).filter(Boolean);
    const safeParts = [];

    for (const part of parts) {
      const [column, direction = 'ASC'] = part.split(/\s+/);
      this.assertColumn(column);
      const safeDirection = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      safeParts.push(`\`${column}\` ${safeDirection}`);
    }

    return safeParts.length ? `ORDER BY ${safeParts.join(', ')}` : '';
  }

  async findById(id, { includeDeleted = false } = {}) {
    const deletedClause = this.softDelete && !includeDeleted ? ' AND `deleted_at` IS NULL' : '';
    return db.queryOne(
      `SELECT * FROM \`${this.table}\` WHERE \`${this.primaryKey}\` = ?${deletedClause} LIMIT 1`,
      [id],
    );
  }

  async findOneBy(filters, options = {}) {
    const rows = await this.findAll({ ...options, where: filters, limit: 1 });
    return rows.length ? rows[0] : null;
  }

  /**
   * @param {object} [options]
   * @param {object} [options.where]
   * @param {string} [options.orderBy]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @param {string[]} [options.select]
   */
  async findAll({ where = {}, orderBy, limit, offset, select, includeDeleted = false } = {}) {
    const columns = select?.length
      ? select.map((column) => `\`${this.assertColumn(column)}\``).join(', ')
      : '*';

    const { sql: whereSql, params } = this.buildWhere(where, { includeDeleted });
    const orderSql = this.buildOrderBy(orderBy);

    // LIMIT/OFFSET are coerced to integers rather than bound, because
    // MariaDB 10.4 cannot prepare them as placeholders in all contexts.
    let limitSql = '';
    if (limit !== undefined) {
      const safeLimit = Math.max(0, Math.min(Number.parseInt(limit, 10) || 0, 1000));
      const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
      limitSql = ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    }

    return db.query(
      `SELECT ${columns} FROM \`${this.table}\` ${whereSql} ${orderSql}${limitSql}`.replace(/\s+/g, ' ').trim(),
      params,
    );
  }

  async count(where = {}, { includeDeleted = false } = {}) {
    const { sql: whereSql, params } = this.buildWhere(where, { includeDeleted });
    const value = await db.queryValue(
      `SELECT COUNT(*) AS total FROM \`${this.table}\` ${whereSql}`,
      params,
    );
    return Number(value) || 0;
  }

  async exists(where) {
    return (await this.count(where)) > 0;
  }

  /**
   * Paginated list plus its total, in two queries.
   * @returns {{rows: Array, total: number, page: number, perPage: number, pages: number}}
   */
  async paginate({ page = 1, perPage = 20, where = {}, orderBy, select, includeDeleted = false } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safePerPage = Math.max(1, Math.min(Number.parseInt(perPage, 10) || 20, 100));

    const [rows, total] = await Promise.all([
      this.findAll({
        where, orderBy, select, includeDeleted,
        limit: safePerPage,
        offset: (safePage - 1) * safePerPage,
      }),
      this.count(where, { includeDeleted }),
    ]);

    return {
      rows,
      total,
      page: safePage,
      perPage: safePerPage,
      pages: Math.max(1, Math.ceil(total / safePerPage)),
    };
  }

  /**
   * @param {object} data
   * @param {import('mysql2/promise').PoolConnection} [connection] to join a transaction
   * @returns {Promise<number>} inserted id
   */
  async create(data, connection = null) {
    const payload = this.pickFillable(data);
    const columns = Object.keys(payload);

    if (!columns.length) throw new ValidationError('Nothing to save.');

    const sql = `INSERT INTO \`${this.table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) `
      + `VALUES (${columns.map(() => '?').join(', ')})`;
    const params = Object.values(payload);

    if (connection) {
      const [result] = await connection.execute(sql, params);
      return result.insertId;
    }

    const [result] = await db.getPool().execute(sql, params);
    return result.insertId;
  }

  /**
   * @returns {Promise<number>} affected row count
   */
  async update(id, data, connection = null) {
    const payload = this.pickFillable(data);
    const columns = Object.keys(payload);

    if (!columns.length) return 0;

    const sql = `UPDATE \`${this.table}\` SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} `
      + `WHERE \`${this.primaryKey}\` = ?`;
    const params = [...Object.values(payload), id];

    if (connection) {
      const [result] = await connection.execute(sql, params);
      return result.affectedRows;
    }

    const [result] = await db.getPool().execute(sql, params);
    return result.affectedRows;
  }

  /** Soft-deletes when the table supports it, otherwise deletes the row. */
  async remove(id, connection = null) {
    const sql = this.softDelete
      ? `UPDATE \`${this.table}\` SET \`deleted_at\` = NOW() WHERE \`${this.primaryKey}\` = ?`
      : `DELETE FROM \`${this.table}\` WHERE \`${this.primaryKey}\` = ?`;

    if (connection) {
      const [result] = await connection.execute(sql, [id]);
      return result.affectedRows;
    }

    const [result] = await db.getPool().execute(sql, [id]);
    return result.affectedRows;
  }

  /** Permanently deletes a soft-deleted row. */
  async forceRemove(id) {
    const [result] = await db.getPool().execute(
      `DELETE FROM \`${this.table}\` WHERE \`${this.primaryKey}\` = ?`, [id],
    );
    return result.affectedRows;
  }

  async restore(id) {
    if (!this.softDelete) return 0;
    const [result] = await db.getPool().execute(
      `UPDATE \`${this.table}\` SET \`deleted_at\` = NULL WHERE \`${this.primaryKey}\` = ?`, [id],
    );
    return result.affectedRows;
  }

  /**
   * Applies a new display order in one transaction.
   * @param {number[]} orderedIds ids in their new visual order
   */
  async reorder(orderedIds) {
    this.assertColumn('sort_order');
    return db.transaction(async (connection) => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await connection.execute(
          `UPDATE \`${this.table}\` SET \`sort_order\` = ? WHERE \`${this.primaryKey}\` = ?`,
          [index * 10, orderedIds[index]],
        );
      }
      return orderedIds.length;
    });
  }

  /** Next sort_order value, leaving gaps so single moves rarely renumber. */
  async nextSortOrder(where = {}) {
    this.assertColumn('sort_order');
    const { sql: whereSql, params } = this.buildWhere(where);
    const value = await db.queryValue(
      `SELECT COALESCE(MAX(\`sort_order\`), 0) + 10 AS next FROM \`${this.table}\` ${whereSql}`,
      params,
    );
    return Number(value) || 10;
  }
}

module.exports = BaseRepository;
