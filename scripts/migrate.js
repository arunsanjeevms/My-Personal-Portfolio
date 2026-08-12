#!/usr/bin/env node
'use strict';

/**
 * Migration runner.
 *
 *   npm run migrate           apply every pending migration
 *   npm run migrate:status    show what is applied and what is pending
 *
 * Applied migrations are recorded in schema_migrations along with a
 * checksum, so an already-applied file that has been edited is reported
 * loudly instead of silently drifting.
 *
 * Note: this script (and only this script) opens a connection with
 * multipleStatements enabled. It runs local, developer-authored .sql
 * files - never user input. The application pool never enables it.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { config } = require('../src/config/env');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

const c = {
  reset: '\x1b[0m', dim: '\x1b[90m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

function log(msg = '') { process.stdout.write(`${msg}\n`); }

async function connectWithoutDatabase() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
}

async function ensureDatabase(connection) {
  const [rows] = await connection.query(
    'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [config.db.database],
  );

  if (rows.length) return false;

  // Identifier cannot be a placeholder; the value comes from .env, not
  // from a request, and is validated before use.
  if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
    throw new Error(`Unsafe DB_NAME: ${config.db.database}`);
  }
  await connection.query(
    `CREATE DATABASE \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  return true;
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename    VARCHAR(190) NOT NULL,
      checksum    CHAR(64)     NOT NULL,
      statements  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
      applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migration_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function readMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();

  return Promise.all(files.map(async (filename) => {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    return {
      filename,
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      // Rough count for reporting only.
      statements: (sql.match(/;\s*(?:\n|$)/g) || []).length,
    };
  }));
}

async function main() {
  const statusOnly = process.argv.includes('--status');

  log(`${c.bold}Portfolio CMS - database migrations${c.reset}`);
  log(`${c.dim}${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}${c.reset}\n`);

  let connection;
  try {
    connection = await connectWithoutDatabase();
  } catch (err) {
    log(`${c.red}Cannot reach the database server.${c.reset}`);
    log(`${c.dim}${err.code || ''} ${err.message}${c.reset}`);
    log('\nIf you are using XAMPP, start MySQL from the XAMPP Control Panel and try again.');
    process.exitCode = 1;
    return;
  }

  try {
    const [[versionRow]] = await connection.query('SELECT VERSION() AS version');
    log(`${c.dim}server: ${versionRow.version}${c.reset}`);

    const created = await ensureDatabase(connection);
    if (created) log(`${c.green}created database ${config.db.database}${c.reset}`);

    await connection.changeUser({ database: config.db.database });
    await ensureMigrationsTable(connection);

    const [appliedRows] = await connection.query(
      'SELECT filename, checksum, applied_at FROM schema_migrations',
    );
    const applied = new Map(appliedRows.map((row) => [row.filename, row]));
    const files = await readMigrationFiles();

    if (!files.length) {
      log(`${c.yellow}No migration files found in database/migrations.${c.reset}`);
      return;
    }

    // Warn about edited files that were already applied.
    for (const file of files) {
      const record = applied.get(file.filename);
      if (record && record.checksum !== file.checksum) {
        log(`${c.yellow}! ${file.filename} changed after it was applied.${c.reset}`);
        log(`${c.dim}  Migrations are immutable - add a new file instead of editing this one.${c.reset}`);
      }
    }

    const pending = files.filter((file) => !applied.has(file.filename));

    if (statusOnly) {
      log(`\n${c.bold}Status${c.reset}`);
      for (const file of files) {
        const record = applied.get(file.filename);
        log(record
          ? `  ${c.green}applied${c.reset}  ${file.filename} ${c.dim}${new Date(record.applied_at).toISOString()}${c.reset}`
          : `  ${c.yellow}pending${c.reset}  ${file.filename}`);
      }
      log(`\n${applied.size} applied, ${pending.length} pending.`);
      return;
    }

    if (!pending.length) {
      log(`\n${c.green}Database is up to date${c.reset} ${c.dim}(${applied.size} migrations applied)${c.reset}`);
      return;
    }

    log(`\nApplying ${pending.length} migration(s):\n`);

    for (const file of pending) {
      const startedAt = Date.now();
      process.stdout.write(`  ${c.cyan}${file.filename}${c.reset} ... `);

      try {
        // Each migration file is one atomic unit. Note that MySQL/MariaDB
        // implicitly commit on DDL, so a mid-file failure can leave
        // earlier tables in place - re-running is safe because every
        // statement uses IF NOT EXISTS / INSERT IGNORE / ON DUPLICATE KEY.
        await connection.query(file.sql);

        const durationMs = Date.now() - startedAt;
        await connection.query(
          'INSERT INTO schema_migrations (filename, checksum, statements, duration_ms) VALUES (?, ?, ?, ?)',
          [file.filename, file.checksum, file.statements, durationMs],
        );
        log(`${c.green}ok${c.reset} ${c.dim}${durationMs}ms${c.reset}`);
      } catch (err) {
        log(`${c.red}failed${c.reset}`);
        log(`\n${c.red}${err.code || 'ERROR'}: ${err.message}${c.reset}`);
        if (err.sql) log(`${c.dim}${String(err.sql).slice(0, 400)}${c.reset}`);
        log(`\n${c.yellow}Migration stopped. Fix the file and run npm run migrate again.${c.reset}`);
        process.exitCode = 1;
        return;
      }
    }

    const [[tableCount]] = await connection.query(
      'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [config.db.database],
    );

    log(`\n${c.green}${c.bold}Migrations complete.${c.reset} ${c.dim}${tableCount.total} tables in ${config.db.database}.${c.reset}`);
    log(`${c.dim}Next: npm run create-admin${c.reset}`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  log(`\n${c.red}Unexpected error: ${err.message}${c.reset}`);
  if (config.isDevelopment) log(`${c.dim}${err.stack}${c.reset}`);
  process.exitCode = 1;
});
