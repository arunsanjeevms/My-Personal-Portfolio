-- =====================================================================
-- 005_analytics_ops.sql
-- Privacy-conscious analytics + operational tables (domains, SSL,
-- backups, scheduled job history).
--
-- PRIVACY CONTRACT for everything below:
--   * No raw IP address is ever stored, in any column, ever.
--   * visitor_hash = sha256(ip + user-agent + salt-of-the-day). The salt
--     rotates daily, so the same person is countable within a day but
--     cannot be linked across days and cannot be reversed to an IP.
--   * Country is coarse (2-letter code). No city, no coordinates.
--   * Retention is configurable; the cleanup job drops raw rows once
--     they have been rolled up into analytics_daily.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_visitors (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_hash   CHAR(64)     NOT NULL,
  first_seen_at  DATETIME     NOT NULL,
  last_seen_at   DATETIME     NOT NULL,
  visit_count    INT UNSIGNED NOT NULL DEFAULT 1,
  device_type    ENUM('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  browser        VARCHAR(40)      NULL,
  browser_version VARCHAR(20)     NULL,
  os             VARCHAR(40)      NULL,
  country_code   CHAR(2)          NULL,
  region         VARCHAR(80)      NULL,
  screen_width   SMALLINT UNSIGNED NULL,
  screen_height  SMALLINT UNSIGNED NULL,
  language       VARCHAR(12)      NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visitor_hash (visitor_hash),
  KEY idx_visitor_last  (last_seen_at),
  KEY idx_visitor_first (first_seen_at),
  KEY idx_visitor_device (device_type),
  KEY idx_visitor_country (country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_id       INT UNSIGNED NOT NULL,
  session_key      CHAR(36)     NOT NULL,
  started_at       DATETIME     NOT NULL,
  last_activity_at DATETIME     NOT NULL,
  ended_at         DATETIME         NULL,
  pageview_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  entry_path       VARCHAR(255)     NULL,
  exit_path        VARCHAR(255)     NULL,
  referrer_host    VARCHAR(160)     NULL,
  referrer_type    ENUM('direct','search','social','referral','internal','campaign') NOT NULL DEFAULT 'direct',
  utm_source       VARCHAR(80)      NULL,
  utm_medium       VARCHAR(80)      NULL,
  utm_campaign     VARCHAR(120)     NULL,
  is_bounce        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_key (session_key),
  KEY idx_session_visitor (visitor_id, started_at),
  KEY idx_session_started (started_at),
  KEY idx_session_active  (last_activity_at),
  KEY idx_session_referrer (referrer_type, started_at),
  CONSTRAINT fk_session_visitor FOREIGN KEY (visitor_id) REFERENCES analytics_visitors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id    BIGINT UNSIGNED NOT NULL,
  visitor_id    INT UNSIGNED    NOT NULL,
  path          VARCHAR(255)    NOT NULL,
  page_key      VARCHAR(60)         NULL,
  title         VARCHAR(255)        NULL,
  referrer_host VARCHAR(160)        NULL,
  duration_ms   INT UNSIGNED    NOT NULL DEFAULT 0,
  entity_type   VARCHAR(40)         NULL,
  entity_id     INT UNSIGNED        NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pv_session (session_id),
  KEY idx_pv_visitor (visitor_id),
  KEY idx_pv_path    (path, created_at),
  KEY idx_pv_created (created_at),
  KEY idx_pv_entity  (entity_type, entity_id),
  CONSTRAINT fk_pv_session FOREIGN KEY (session_id) REFERENCES analytics_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_pv_visitor FOREIGN KEY (visitor_id) REFERENCES analytics_visitors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_events (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED     NULL,
  name       VARCHAR(60)     NOT NULL,
  path       VARCHAR(255)        NULL,
  label      VARCHAR(160)        NULL,
  value      INT                 NULL,
  meta_json  TEXT                NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_name (name, created_at),
  KEY idx_event_time (created_at),
  CONSTRAINT fk_event_session FOREIGN KEY (session_id) REFERENCES analytics_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nightly rollup. The dashboard reads this table, never the raw
-- pageview table, so charts stay fast as history grows.
CREATE TABLE IF NOT EXISTS analytics_daily (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  stat_date            DATE         NOT NULL,
  visitors             INT UNSIGNED NOT NULL DEFAULT 0,
  unique_visitors      INT UNSIGNED NOT NULL DEFAULT 0,
  new_visitors         INT UNSIGNED NOT NULL DEFAULT 0,
  pageviews            INT UNSIGNED NOT NULL DEFAULT 0,
  sessions             INT UNSIGNED NOT NULL DEFAULT 0,
  avg_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  bounce_rate          DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  top_path             VARCHAR(255)     NULL,
  top_referrer         VARCHAR(160)     NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================= operations =================================

-- A tracking dashboard. Express cannot control a registrar without an
-- explicit API integration - registrar_api_provider is the hook for
-- adding Cloudflare / registrar APIs later without a schema change.
CREATE TABLE IF NOT EXISTS domains (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  domain                VARCHAR(190) NOT NULL,
  registrar             VARCHAR(120)     NULL,
  registrar_url         VARCHAR(500)     NULL,
  registrar_api_provider VARCHAR(60)     NULL,
  purchased_at          DATE             NULL,
  registered_at         DATE             NULL,
  expires_at            DATE             NULL,
  auto_renew            TINYINT(1)   NOT NULL DEFAULT 0,
  nameservers           TEXT             NULL,
  dns_provider          VARCHAR(120)     NULL,
  ssl_enabled           TINYINT(1)   NOT NULL DEFAULT 1,
  ssl_issuer            VARCHAR(160)     NULL,
  ssl_expires_at        DATE             NULL,
  ssl_last_checked_at   DATETIME         NULL,
  ssl_status            ENUM('unknown','valid','expiring','expired','error') NOT NULL DEFAULT 'unknown',
  hosting_provider      VARCHAR(120)     NULL,
  server_ip             VARCHAR(45)      NULL,
  environment           ENUM('production','staging','development') NOT NULL DEFAULT 'production',
  is_primary            TINYINT(1)   NOT NULL DEFAULT 0,
  is_active             TINYINT(1)   NOT NULL DEFAULT 1,
  notes                 TEXT             NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_domain (domain),
  KEY idx_domain_expiry (expires_at),
  KEY idx_domain_ssl    (ssl_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  domain_id   INT UNSIGNED NOT NULL,
  event_type  ENUM('registered','renewed','expiring','expired','dns_changed','ssl_issued','ssl_renewed','ssl_expiring','ssl_expired','check','note') NOT NULL DEFAULT 'note',
  message     VARCHAR(500)     NULL,
  occurred_at DATETIME     NOT NULL,
  created_by  INT UNSIGNED     NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_devent_domain (domain_id, occurred_at),
  CONSTRAINT fk_devent_domain FOREIGN KEY (domain_id)  REFERENCES domains (id) ON DELETE CASCADE,
  CONSTRAINT fk_devent_user   FOREIGN KEY (created_by) REFERENCES users (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backups (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename      VARCHAR(255) NOT NULL,
  disk_path     VARCHAR(500) NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  checksum      CHAR(64)         NULL,
  backup_type   ENUM('manual','scheduled','pre-restore') NOT NULL DEFAULT 'manual',
  status        ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  tables_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duration_ms   INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(500)     NULL,
  created_by    INT UNSIGNED     NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_backup_filename (filename),
  KEY idx_backup_created (created_at),
  KEY idx_backup_status  (status),
  CONSTRAINT fk_backups_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs_log (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_name    VARCHAR(60)  NOT NULL,
  status      ENUM('running','success','failed','skipped') NOT NULL DEFAULT 'running',
  started_at  DATETIME     NOT NULL,
  finished_at DATETIME         NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  message     VARCHAR(500)     NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_job_name (job_name, started_at),
  KEY idx_job_status (status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
