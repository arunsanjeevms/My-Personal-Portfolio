'use strict';

/**
 * MySQL / MariaDB access layer.
 *
 * Everything in the app goes through these helpers. They use prepared
 * statements exclusively - no SQL string is ever built by concatenating
 * user input.
 *
 * Compatible with both MariaDB 10.4 (XAMPP) and MySQL 8.
 */

const mysql = require('mysql2/promise');
const { config } = require('./env');
const logger = require('../utils/logger');

let pool = null;
/** Set when the DB is unreachable, so the public site can degrade gracefully. */
let lastError = null;

function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    // Keep DATE / DATETIME as JS Date objects, but return DECIMAL as a
    // string so money-like values never lose precision.
    decimalNumbers: false,
    dateStrings: ['DATE'],
    timezone: 'local',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // Prepared statements are cached per connection.
    maxPreparedStatements: 200,
    // Guards against a hung query holding a request open forever.
    connectTimeout: 10000,
  });

  pool.on('connection', () => logger.debug('db: connection opened'));

  return pool;
}

/**
 * Runs a parameterised query.
 *
 * @param {string} sql   SQL with ? placeholders. Never interpolate input.
 * @param {Array}  params
 * @returns {Promise<Array>} rows
 */
async function query(sql, params = []) {
  const startedAt = process.hrtime.bigint();
  try {
    // execute() = prepared statement. Use it everywhere by default.
    const [rows] = await getPool().execute(sql, params);
    lastError = null;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs > 300) {
      logger.warn('db: slow query', { durationMs: Math.round(durationMs), sql: sql.slice(0, 200) });
    }

    return rows;
  } catch (err) {
    lastError = err;
    logger.error('db: query failed', { code: err.code, message: err.message, sql: sql.slice(0, 200) });
    throw err;
  }
}

/**
 * For statements mysql2 cannot prepare (notably `LIMIT ?` on older
 * MariaDB, and `IN (?)` list expansion). Placeholders are still escaped
 * by the driver - this is not string interpolation.
 */
async function queryUnprepared(sql, params = []) {
  try {
    const [rows] = await getPool().query(sql, params);
    lastError = null;
    return rows;
  } catch (err) {
    lastError = err;
    logger.error('db: query failed', { code: err.code, message: err.message, sql: sql.slice(0, 200) });
    throw err;
  }
}

/** First row or null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Single scalar value from the first row, or null. */
async function queryValue(sql, params = []) {
  const row = await queryOne(sql, params);
  if (!row) return null;
  const values = Object.values(row);
  return values.length ? values[0] : null;
}

/**
 * Runs `callback` inside a transaction on a dedicated connection.
 * Commits on success, rolls back on any throw, and always releases.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} callback
 */
async function transaction(callback) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      logger.error('db: rollback failed', { message: rollbackErr.message });
    }
    throw err;
  } finally {
    connection.release();
  }
}

/** Verifies connectivity and reports round-trip latency for /admin/system. */
async function healthCheck() {
  const startedAt = process.hrtime.bigint();
  try {
    await query('SELECT 1 AS ok');
    return {
      connected: true,
      latencyMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      error: null,
    };
  } catch (err) {
    return { connected: false, latencyMs: null, error: err.code || err.message };
  }
}

function getLastError() {
  return lastError;
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
  logger.info('db: pool closed');
}

module.exports = {
  getPool,
  query,
  queryUnprepared,
  queryOne,
  queryValue,
  transaction,
  healthCheck,
  getLastError,
  closePool,
};
