-- =====================================================================
-- 003_blog_interaction.sql
-- Blog (native posts + cached Medium feed), contact inbox, subscribers,
-- admin notification centre.
-- =====================================================================

CREATE TABLE IF NOT EXISTS blog_categories (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL,
  description VARCHAR(255)     NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blog_cat_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_tags (
  id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blog_tag_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- source='medium' rows are cached copies of the RSS feed so the public
-- page never depends on a third-party API at request time.
-- external_guid is the feed item guid and keeps the sync idempotent.
CREATE TABLE IF NOT EXISTS blog_posts (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id       SMALLINT UNSIGNED NULL,
  author_id         INT UNSIGNED     NULL,
  title             VARCHAR(240) NOT NULL,
  slug              VARCHAR(260) NOT NULL,
  excerpt           VARCHAR(500)     NULL,
  content_html      LONGTEXT         NULL,
  featured_media_id INT UNSIGNED     NULL,
  featured_image_url VARCHAR(500)    NULL,
  source            ENUM('native','medium') NOT NULL DEFAULT 'native',
  external_url      VARCHAR(500)     NULL,
  external_guid     VARCHAR(255)     NULL,
  reading_minutes   SMALLINT UNSIGNED NULL,
  status            ENUM('draft','published','scheduled','archived') NOT NULL DEFAULT 'draft',
  published_at      DATETIME         NULL,
  is_featured       TINYINT(1)   NOT NULL DEFAULT 0,
  seo_title         VARCHAR(200)     NULL,
  seo_description   VARCHAR(320)     NULL,
  seo_keywords      VARCHAR(320)     NULL,
  og_media_id       INT UNSIGNED     NULL,
  view_count        INT UNSIGNED NOT NULL DEFAULT 0,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_slug  (slug),
  UNIQUE KEY uq_posts_guid  (external_guid),
  KEY idx_posts_status  (status, published_at),
  KEY idx_posts_source  (source, published_at),
  KEY idx_posts_deleted (deleted_at),
  CONSTRAINT fk_posts_category FOREIGN KEY (category_id)       REFERENCES blog_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_posts_author   FOREIGN KEY (author_id)         REFERENCES users (id)           ON DELETE SET NULL,
  CONSTRAINT fk_posts_featured FOREIGN KEY (featured_media_id) REFERENCES media (id)           ON DELETE SET NULL,
  CONSTRAINT fk_posts_og       FOREIGN KEY (og_media_id)       REFERENCES media (id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id INT UNSIGNED      NOT NULL,
  tag_id  SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY idx_bpt_tag (tag_id),
  CONSTRAINT fk_bpt_post FOREIGN KEY (post_id) REFERENCES blog_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_bpt_tag  FOREIGN KEY (tag_id)  REFERENCES blog_tags (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------ contact_messages
-- ip_hash only. The raw IP address is never written to disk.
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  subject    VARCHAR(255)     NULL,
  message    TEXT         NOT NULL,
  ip_hash    CHAR(64)         NULL,
  user_agent VARCHAR(255)     NULL,
  referrer   VARCHAR(255)     NULL,
  status     ENUM('unread','read','replied','archived','spam') NOT NULL DEFAULT 'unread',
  is_starred TINYINT(1)   NOT NULL DEFAULT 0,
  spam_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  admin_notes TEXT            NULL,
  replied_at DATETIME         NULL,
  replied_by INT UNSIGNED     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME         NULL,
  PRIMARY KEY (id),
  KEY idx_msg_status  (status, deleted_at, created_at),
  KEY idx_msg_created (created_at),
  KEY idx_msg_email   (email),
  KEY idx_msg_ip      (ip_hash, created_at),
  CONSTRAINT fk_msg_replied_by FOREIGN KEY (replied_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email             VARCHAR(190) NOT NULL,
  name              VARCHAR(120)     NULL,
  source            VARCHAR(60)      NULL,
  confirm_token_hash CHAR(64)        NULL,
  confirmed_at      DATETIME         NULL,
  unsubscribed_at   DATETIME         NULL,
  ip_hash           CHAR(64)         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscriber_email (email),
  KEY idx_sub_confirmed (confirmed_at, unsubscribed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------- admin_notifications
CREATE TABLE IF NOT EXISTS admin_notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type       VARCHAR(50)  NOT NULL,
  severity   ENUM('info','success','warning','critical') NOT NULL DEFAULT 'info',
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500)     NULL,
  link       VARCHAR(500)     NULL,
  entity     VARCHAR(60)      NULL,
  entity_id  INT UNSIGNED     NULL,
  -- NULL = broadcast to every admin.
  user_id    INT UNSIGNED     NULL,
  -- Prevents duplicate "domain expiring" alerts firing every night.
  dedupe_key VARCHAR(190)     NULL,
  read_at    DATETIME         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notif_dedupe (dedupe_key),
  KEY idx_notif_read (read_at, created_at),
  KEY idx_notif_user (user_id, read_at),
  KEY idx_notif_type (type, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
