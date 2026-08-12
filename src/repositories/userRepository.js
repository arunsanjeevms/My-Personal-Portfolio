'use strict';

const BaseRepository = require('./BaseRepository');
const db = require('../config/database');

const COLUMNS = [
  'id', 'uuid', 'role_id', 'name', 'email', 'username', 'password_hash',
  'avatar_media_id', 'status', 'must_change_password', 'last_login_at',
  'last_login_ip_hash', 'failed_login_count', 'locked_until',
  'password_changed_at', 'reset_token_hash', 'reset_token_expires_at',
  'created_at', 'updated_at', 'deleted_at',
];

// password_hash and the reset-token fields are deliberately writable only
// through the dedicated methods below, never through a generic update().
const FILLABLE = [
  'uuid', 'role_id', 'name', 'email', 'username', 'avatar_media_id',
  'status', 'must_change_password',
];

/** Columns safe to select when the row will be rendered or serialised. */
const PUBLIC_FIELDS = `u.id, u.uuid, u.role_id, u.name, u.email, u.username,
  u.avatar_media_id, u.status, u.must_change_password, u.last_login_at,
  u.created_at, u.updated_at`;

class UserRepository extends BaseRepository {
  constructor() {
    super({
      table: 'users',
      columns: COLUMNS,
      fillable: FILLABLE,
      softDelete: true,
      defaultOrder: 'name ASC',
    });
  }

  /**
   * Looks a user up for authentication. Accepts either an email address
   * or a username in the same field, and includes password_hash - so the
   * result must never be sent to a view or an API response.
   */
  async findForAuth(identifier) {
    return db.queryOne(
      `SELECT u.*, r.slug AS role_slug, r.name AS role_name, r.level AS role_level
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE (u.email = ? OR u.username = ?)
          AND u.deleted_at IS NULL
        LIMIT 1`,
      [identifier, identifier],
    );
  }

  /** Full profile for the signed-in session, without secret columns. */
  async findWithRole(id) {
    return db.queryOne(
      `SELECT ${PUBLIC_FIELDS}, r.slug AS role_slug, r.name AS role_name, r.level AS role_level
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.id = ? AND u.deleted_at IS NULL
        LIMIT 1`,
      [id],
    );
  }

  /** Permission slugs granted to a user through their role. */
  async getPermissions(userId) {
    const rows = await db.query(
      `SELECT p.slug
         FROM users u
         JOIN role_permissions rp ON rp.role_id = u.role_id
         JOIN permissions p       ON p.id = rp.permission_id
        WHERE u.id = ?`,
      [userId],
    );
    return rows.map((row) => row.slug);
  }

  async findByEmail(email) {
    return db.queryOne(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email],
    );
  }

  /** Used by validators to enforce the unique constraint before insert. */
  async emailTaken(email, exceptId = null) {
    const value = await db.queryValue(
      'SELECT COUNT(*) AS total FROM users WHERE email = ? AND (? IS NULL OR id <> ?)',
      [email, exceptId, exceptId],
    );
    return Number(value) > 0;
  }

  async usernameTaken(username, exceptId = null) {
    if (!username) return false;
    const value = await db.queryValue(
      'SELECT COUNT(*) AS total FROM users WHERE username = ? AND (? IS NULL OR id <> ?)',
      [username, exceptId, exceptId],
    );
    return Number(value) > 0;
  }

  async listWithRoles({ includeDeleted = false } = {}) {
    return db.query(
      `SELECT ${PUBLIC_FIELDS}, r.slug AS role_slug, r.name AS role_name, r.level AS role_level
         FROM users u
         JOIN roles r ON r.id = u.role_id
        ${includeDeleted ? '' : 'WHERE u.deleted_at IS NULL'}
        ORDER BY r.level DESC, u.name ASC`,
    );
  }

  async setPassword(userId, passwordHash, { mustChange = false } = {}) {
    const [result] = await db.getPool().execute(
      `UPDATE users
          SET password_hash = ?, password_changed_at = NOW(), must_change_password = ?,
              reset_token_hash = NULL, reset_token_expires_at = NULL,
              failed_login_count = 0, locked_until = NULL
        WHERE id = ?`,
      [passwordHash, mustChange ? 1 : 0, userId],
    );
    return result.affectedRows;
  }

  async recordSuccessfulLogin(userId, ipHash) {
    await db.getPool().execute(
      `UPDATE users
          SET last_login_at = NOW(), last_login_ip_hash = ?,
              failed_login_count = 0, locked_until = NULL
        WHERE id = ?`,
      [ipHash, userId],
    );
  }

  /**
   * Increments the failure counter and locks the account once the
   * threshold is reached.
   * @returns {{failed: number, lockedUntil: Date|null}}
   */
  async recordFailedLogin(userId, { maxAttempts, lockoutMinutes }) {
    await db.getPool().execute(
      'UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?',
      [userId],
    );

    const row = await db.queryOne(
      'SELECT failed_login_count, locked_until FROM users WHERE id = ?',
      [userId],
    );
    const failed = Number(row?.failed_login_count) || 0;

    if (failed >= maxAttempts) {
      await db.getPool().execute(
        'UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [lockoutMinutes, userId],
      );
      const locked = await db.queryOne('SELECT locked_until FROM users WHERE id = ?', [userId]);
      return { failed, lockedUntil: locked?.locked_until || null };
    }

    return { failed, lockedUntil: row?.locked_until || null };
  }

  async clearLock(userId) {
    await db.getPool().execute(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?',
      [userId],
    );
  }

  async setResetToken(userId, tokenHash, expiresInMinutes) {
    await db.getPool().execute(
      `UPDATE users
          SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id = ?`,
      [tokenHash, expiresInMinutes, userId],
    );
  }

  async findByValidResetToken(tokenHash) {
    return db.queryOne(
      `SELECT * FROM users
        WHERE reset_token_hash = ?
          AND reset_token_expires_at > NOW()
          AND deleted_at IS NULL
        LIMIT 1`,
      [tokenHash],
    );
  }

  /** True when this is the last active account holding a given role. */
  async isLastOfRole(userId, roleSlug) {
    const value = await db.queryValue(
      `SELECT COUNT(*) AS total
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.slug = ? AND u.deleted_at IS NULL AND u.status = 'active' AND u.id <> ?`,
      [roleSlug, userId],
    );
    return Number(value) === 0;
  }

  async countActive() {
    const value = await db.queryValue(
      "SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL AND status = 'active'",
    );
    return Number(value) || 0;
  }
}

module.exports = new UserRepository();
module.exports.PUBLIC_FIELDS = PUBLIC_FIELDS;
