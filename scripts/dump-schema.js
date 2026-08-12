#!/usr/bin/env node
'use strict';

/**
 * Regenerates database/schema.sql from the live database.
 *
 *   npm run schema:dump
 *
 * The migrations in database/migrations are the source of truth; this
 * file is a generated, human-readable snapshot for documentation and for
 * standing up a fresh database in one step. Structure only - no data.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { config } = require('../src/config/env');
const db = require('../src/config/database');

const OUTPUT_PATH = path.join(__dirname, '..', 'database', 'schema.sql');

async function main() {
  const health = await db.healthCheck();
  if (!health.connected) {
    process.stdout.write(`Cannot reach the database (${health.error}).\n`);
    process.exitCode = 1;
    return;
  }

  const tables = await db.query(
    `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME ASC`,
    [config.db.database],
  );

  const header = [
    '-- =====================================================================',
    '-- Portfolio CMS - full schema snapshot',
    '--',
    '-- GENERATED FILE. Do not edit by hand.',
    '--   regenerate with:  npm run schema:dump',
    '--   source of truth:  database/migrations/*.sql',
    '--',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Server:    ${(await db.queryValue('SELECT VERSION()')) || 'unknown'}`,
    `-- Tables:    ${tables.length}`,
    '-- =====================================================================',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  const parts = [];

  for (const table of tables) {
    // Identifier comes from information_schema for our own database, not
    // from user input, and is validated before interpolation.
    if (!/^[A-Za-z0-9_]+$/.test(table.name)) continue;

    const row = await db.queryOne(`SHOW CREATE TABLE \`${table.name}\``);
    const createStatement = row['Create Table'] || row['Create View'];

    parts.push(
      `-- ---------------------------------------------------------------------`,
      `-- ${table.name}`,
      `-- ---------------------------------------------------------------------`,
      `DROP TABLE IF EXISTS \`${table.name}\`;`,
      // Make the dump re-runnable and strip the volatile AUTO_INCREMENT
      // counter so the file does not churn on every regeneration.
      `${createStatement.replace(/ AUTO_INCREMENT=\d+/, '')};`,
      '',
    );
  }

  const footer = ['SET FOREIGN_KEY_CHECKS = 1;', ''];

  await fs.writeFile(OUTPUT_PATH, [...header, ...parts, ...footer].join('\n'), 'utf8');

  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
  process.stdout.write(`${tables.length} tables.\n`);
}

main()
  .catch((err) => {
    process.stdout.write(`Failed: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.closePool().catch(() => {}));
