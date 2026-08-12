'use strict';

/**
 * Database backups.
 *
 * Uses mysqldump / mysql rather than reimplementing a dump in JS, which
 * would inevitably get character sets, triggers or foreign-key ordering
 * subtly wrong.
 *
 * Credential handling: the password is passed through the child
 * process's environment (MYSQL_PWD), never on the command line, so it
 * cannot be read from the process list. It is never written to the
 * backup metadata, the activity log or any response.
 *
 * Restore is genuinely destructive, so it takes an automatic safety
 * backup first and requires typed confirmation in the UI.
 */

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const db = require('../config/database');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * Runs a binary, streaming stdout to a file when `outputPath` is given.
 * @returns {Promise<{code: number, stderr: string}>}
 */
function run(command, args, { outputPath = null, inputPath = null, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        // Keeps the password out of the process list.
        MYSQL_PWD: config.db.password || '',
      },
      windowsHide: true,
    });

    let stderr = '';
    let output = null;

    if (outputPath) {
      output = fsSync.createWriteStream(outputPath);
      child.stdout.pipe(output);
    }

    if (inputPath) {
      fsSync.createReadStream(inputPath).pipe(child.stdin);
    }

    child.stderr.on('data', (chunk) => {
      // Cap what is retained; a failing dump can be very noisy.
      if (stderr.length < 8000) stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The backup process timed out.'));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        err.code === 'ENOENT'
          ? `Could not find ${command}. Set MYSQLDUMP_PATH and MYSQL_CLIENT_PATH in .env.`
          : err.message,
      ));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (output) output.end();
      resolve({ code, stderr });
    });
  });
}

async function ensureBackupDir() {
  await fs.mkdir(config.storage.backupDir, { recursive: true });
}

/**
 * Creates a SQL dump of the application database.
 *
 * @param {object} options
 * @param {number} [options.userId]
 * @param {'manual'|'scheduled'|'pre-restore'} [options.type]
 * @returns {Promise<object>} the backup row
 */
async function create({ userId = null, type = 'manual' } = {}) {
  await ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${config.db.database}-${type}-${timestamp}.sql`;
  const diskPath = path.join(config.storage.backupDir, filename);

  const [pending] = await db.getPool().execute(
    `INSERT INTO backups (filename, disk_path, backup_type, status, created_by)
     VALUES (?, ?, ?, 'running', ?)`,
    [filename, diskPath, type, userId],
  );
  const backupId = pending.insertId;

  const startedAt = Date.now();

  try {
    const args = [
      `--host=${config.db.host}`,
      `--port=${config.db.port}`,
      `--user=${config.db.user}`,
      '--single-transaction',      // consistent snapshot without locking
      '--quick',
      '--default-character-set=utf8mb4',
      '--add-drop-table',
      '--routines',
      '--events',
      // The session table is runtime state; restoring it would resurrect
      // dead sessions.
      `--ignore-table=${config.db.database}.sessions`,
      config.db.database,
    ];

    const { code, stderr } = await run(config.binaries.mysqldump, args, { outputPath: diskPath });

    // mysqldump warns about password usage on stderr even on success;
    // only a non-zero exit is a real failure.
    if (code !== 0) throw new Error(stderr.trim() || `mysqldump exited with code ${code}`);

    const stats = await fs.stat(diskPath);
    if (stats.size < 1024) throw new Error('The dump file is suspiciously small; treating it as failed.');

    const checksum = crypto.createHash('sha256')
      .update(await fs.readFile(diskPath))
      .digest('hex');

    const tableCount = await db.queryValue(
      'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [config.db.database],
    );

    await db.query(
      `UPDATE backups
          SET status = 'completed', size_bytes = ?, checksum = ?, tables_count = ?, duration_ms = ?
        WHERE id = ?`,
      [stats.size, checksum, Number(tableCount) || 0, Date.now() - startedAt, backupId],
    );

    logger.admin('backup created', { backupId, filename, bytes: stats.size, type });
    return db.queryOne('SELECT * FROM backups WHERE id = ?', [backupId]);
  } catch (err) {
    await db.query(
      "UPDATE backups SET status = 'failed', error_message = ?, duration_ms = ? WHERE id = ?",
      [String(err.message).slice(0, 500), Date.now() - startedAt, backupId],
    );

    // Remove the partial file so it cannot be mistaken for a good backup.
    await fs.unlink(diskPath).catch(() => {});

    logger.error('backup failed', { backupId, message: err.message });
    throw err;
  }
}

async function list() {
  return db.query(
    `SELECT b.*, u.name AS created_by_name
       FROM backups b LEFT JOIN users u ON u.id = b.created_by
      ORDER BY b.created_at DESC`,
  );
}

async function findById(id) {
  return db.queryOne('SELECT * FROM backups WHERE id = ?', [id]);
}

/**
 * Verifies a backup file is present and unmodified.
 * A path outside the backup directory is refused outright.
 */
async function verify(backupId) {
  const backup = await findById(backupId);
  if (!backup) throw new NotFoundError('That backup no longer exists.');

  const resolved = path.resolve(backup.disk_path);
  const root = path.resolve(config.storage.backupDir);
  if (!resolved.startsWith(root + path.sep)) {
    throw new ValidationError('That backup path is outside the backup directory.');
  }

  if (!fsSync.existsSync(resolved)) return { ok: false, reason: 'The file is missing from disk.' };

  const checksum = crypto.createHash('sha256').update(await fs.readFile(resolved)).digest('hex');
  if (backup.checksum && checksum !== backup.checksum) {
    return { ok: false, reason: 'The checksum does not match; the file has been modified.' };
  }

  return { ok: true, path: resolved, size: (await fs.stat(resolved)).size };
}

/**
 * Restores a backup. Destructive.
 *
 * A safety backup of the current state is taken first, so a restore can
 * itself be undone.
 */
async function restore(backupId, { userId = null } = {}) {
  const backup = await findById(backupId);
  if (!backup) throw new NotFoundError('That backup no longer exists.');
  if (backup.status !== 'completed') throw new ValidationError('That backup did not complete, so it cannot be restored.');

  const check = await verify(backupId);
  if (!check.ok) throw new ValidationError(`This backup cannot be restored: ${check.reason}`);

  logger.security('backup: restore starting', { backupId, filename: backup.filename, userId });

  // Safety net before overwriting anything.
  const safety = await create({ userId, type: 'pre-restore' });

  const args = [
    `--host=${config.db.host}`,
    `--port=${config.db.port}`,
    `--user=${config.db.user}`,
    '--default-character-set=utf8mb4',
    config.db.database,
  ];

  const { code, stderr } = await run(config.binaries.mysql, args, { inputPath: check.path });
  if (code !== 0) throw new Error(stderr.trim() || `Restore failed with exit code ${code}`);

  // Every cached value now describes the pre-restore database.
  cache.clear();

  logger.security('backup: restore completed', { backupId, safetyBackupId: safety.id, userId });

  return { restored: backup.filename, safetyBackup: safety.filename };
}

async function remove(backupId) {
  const backup = await findById(backupId);
  if (!backup) throw new NotFoundError('That backup no longer exists.');

  const resolved = path.resolve(backup.disk_path);
  const root = path.resolve(config.storage.backupDir);
  if (resolved.startsWith(root + path.sep)) {
    await fs.unlink(resolved).catch((err) => {
      if (err.code !== 'ENOENT') logger.warn('backup: could not delete file', { message: err.message });
    });
  }

  await db.query('DELETE FROM backups WHERE id = ?', [backupId]);
  return backup;
}

/** Keeps the newest `keep` scheduled backups and deletes the rest. */
async function pruneOld(keep = 7) {
  const rows = await db.query(
    "SELECT id FROM backups WHERE backup_type = 'scheduled' AND status = 'completed' ORDER BY created_at DESC",
  );

  let removed = 0;
  for (const row of rows.slice(keep)) {
    await remove(row.id).catch(() => {});
    removed += 1;
  }
  return removed;
}

module.exports = { create, list, findById, verify, restore, remove, pruneOld };
