-- =====================================================================
-- 001_identity.sql
-- Users, roles, permissions, 2FA, sessions, audit trail.
--
-- Target: MariaDB 10.4+ (XAMPP) and MySQL 8+. Deliberately avoids
-- MySQL-8-only syntax (utf8mb4_0900 collations, functional indexes,
-- CHECK ... JSON_VALID) so one schema runs on both.
-- =====================================================================

-- ---------------------------------------------------------------- roles
CREATE TABLE IF NOT EXISTS roles (
  id            TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(50)      NOT NULL,
  name          VARCHAR(80)      NOT NULL,
  description   VARCHAR(255)         NULL,
  -- Higher level = more authority. Used to stop a lower role from
  -- editing or deleting an account that outranks it.
  level         TINYINT UNSIGNED NOT NULL DEFAULT 10,
  is_system     TINYINT(1)       NOT NULL DEFAULT 0,
  created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------- permissions
CREATE TABLE IF NOT EXISTS permissions (
  id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(60)       NOT NULL,
  name          VARCHAR(120)      NOT NULL,
  group_name    VARCHAR(50)       NOT NULL DEFAULT 'general',
  description   VARCHAR(255)          NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_slug (slug),
  KEY idx_permissions_group (group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       TINYINT UNSIGNED  NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_rp_permission (permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- users
-- Note: avatar_media_id has no foreign key yet - the media table is
-- created in 002. The constraint is added there.
CREATE TABLE IF NOT EXISTS users (
  id                     INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  uuid                   CHAR(36)         NOT NULL,
  role_id                TINYINT UNSIGNED NOT NULL,
  name                   VARCHAR(120)     NOT NULL,
  email                  VARCHAR(190)     NOT NULL,
  username               VARCHAR(60)          NULL,
  password_hash          VARCHAR(255)     NOT NULL,
  avatar_media_id        INT UNSIGNED         NULL,
  status                 ENUM('active','suspended') NOT NULL DEFAULT 'active',
  must_change_password   TINYINT(1)       NOT NULL DEFAULT 0,
  last_login_at          DATETIME             NULL,
  last_login_ip_hash     CHAR(64)             NULL,
  failed_login_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until           DATETIME             NULL,
  password_changed_at    DATETIME             NULL,
  reset_token_hash       CHAR(64)             NULL,
  reset_token_expires_at DATETIME             NULL,
  created_at             TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at             DATETIME             NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uuid     (uuid),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role    (role_id),
  KEY idx_users_status  (status, deleted_at),
  KEY idx_users_reset   (reset_token_hash),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ 2FA
-- secret_encrypted holds an AES-256-GCM payload (iv:tag:ciphertext),
-- never the raw TOTP secret.
CREATE TABLE IF NOT EXISTS user_2fa (
  user_id          INT UNSIGNED NOT NULL,
  secret_encrypted VARCHAR(512) NOT NULL,
  is_enabled       TINYINT(1)   NOT NULL DEFAULT 0,
  confirmed_at     DATETIME         NULL,
  last_used_at     DATETIME         NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_2fa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id   INT UNSIGNED NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used_at   DATETIME         NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backup_user (user_id, used_at),
  CONSTRAINT fk_backup_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- sessions
-- Schema required by express-mysql-session. Do not add NOT NULL columns
-- here; the library only ever writes these three.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128)     NOT NULL,
  expires    INT(11) UNSIGNED NOT NULL,
  data       MEDIUMTEXT           NULL,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- login_attempts
-- ip_hash is sha256(ip + secret) - the raw IP is never stored.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(190)        NULL,
  user_id    INT UNSIGNED        NULL,
  ip_hash    CHAR(64)        NOT NULL,
  user_agent VARCHAR(255)        NULL,
  success    TINYINT(1)      NOT NULL DEFAULT 0,
  reason     VARCHAR(50)         NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_email (email, created_at),
  KEY idx_attempts_ip    (ip_hash, created_at),
  KEY idx_attempts_time  (created_at),
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------- activity_logs
-- user_name is denormalised on purpose: the audit trail must stay
-- readable after the account that produced it is deleted.
CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED        NULL,
  user_name   VARCHAR(120)        NULL,
  action      VARCHAR(60)     NOT NULL,
  entity      VARCHAR(60)         NULL,
  entity_id   INT UNSIGNED        NULL,
  description VARCHAR(255)        NULL,
  before_json LONGTEXT            NULL,
  after_json  LONGTEXT            NULL,
  ip_hash     CHAR(64)            NULL,
  user_agent  VARCHAR(255)        NULL,
  severity    ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_user     (user_id, created_at),
  KEY idx_logs_entity   (entity, entity_id),
  KEY idx_logs_action   (action, created_at),
  KEY idx_logs_time     (created_at),
  KEY idx_logs_severity (severity, created_at),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
