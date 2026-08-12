-- =====================================================================
-- 004_settings.sql
-- Site settings, per-page SEO, theme variables, feature flags,
-- custom code injection, redirects.
-- =====================================================================

-- --------------------------------------------------------- site_settings
-- Key/value store. setting_group drives the tab layout and the settings
-- search box; is_secret masks the value in the admin UI and excludes it
-- from exports and activity-log diffs.
CREATE TABLE IF NOT EXISTS site_settings (
  id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key   VARCHAR(100) NOT NULL,
  setting_value LONGTEXT         NULL,
  value_type    ENUM('string','text','html','number','boolean','json','media','color','select') NOT NULL DEFAULT 'string',
  setting_group VARCHAR(50)  NOT NULL DEFAULT 'general',
  label         VARCHAR(160)     NULL,
  description   VARCHAR(255)     NULL,
  options_json  TEXT             NULL,
  is_secret     TINYINT(1)   NOT NULL DEFAULT 0,
  is_public     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_setting_key (setting_key),
  KEY idx_setting_group (setting_group, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------- seo_settings
-- One row per public page key: home, resume, projects, blog, contact,
-- 404, maintenance. Project and post rows carry their own SEO columns.
CREATE TABLE IF NOT EXISTS seo_settings (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  page_key            VARCHAR(60)  NOT NULL,
  page_label          VARCHAR(100)     NULL,
  page_title          VARCHAR(200)     NULL,
  meta_title          VARCHAR(200)     NULL,
  meta_description    VARCHAR(320)     NULL,
  meta_keywords       VARCHAR(320)     NULL,
  canonical_url       VARCHAR(500)     NULL,
  robots              VARCHAR(120) NOT NULL DEFAULT 'index, follow',
  og_title            VARCHAR(200)     NULL,
  og_description      VARCHAR(320)     NULL,
  og_media_id         INT UNSIGNED     NULL,
  twitter_card        ENUM('summary','summary_large_image') NOT NULL DEFAULT 'summary_large_image',
  twitter_title       VARCHAR(200)     NULL,
  twitter_description VARCHAR(320)     NULL,
  twitter_media_id    INT UNSIGNED     NULL,
  jsonld              LONGTEXT         NULL,
  in_sitemap          TINYINT(1)   NOT NULL DEFAULT 1,
  sitemap_priority    DECIMAL(2,1) NOT NULL DEFAULT 0.8,
  sitemap_changefreq  ENUM('always','hourly','daily','weekly','monthly','yearly','never') NOT NULL DEFAULT 'weekly',
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seo_page (page_key),
  CONSTRAINT fk_seo_og      FOREIGN KEY (og_media_id)      REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT fk_seo_twitter FOREIGN KEY (twitter_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------- theme_settings
-- Each row maps 1:1 to a CSS custom property already declared in
-- assets/css/style.css :root. Only safe, visual variables are exposed -
-- gradients and layout values stay in the stylesheet.
CREATE TABLE IF NOT EXISTS theme_settings (
  id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  var_name      VARCHAR(60)  NOT NULL,
  var_value     VARCHAR(160) NOT NULL,
  default_value VARCHAR(160) NOT NULL,
  label         VARCHAR(120) NOT NULL,
  description   VARCHAR(255)     NULL,
  group_name    VARCHAR(50)  NOT NULL DEFAULT 'colors',
  input_type    ENUM('color','text','number','select','font') NOT NULL DEFAULT 'color',
  options_json  TEXT             NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_theme_var (var_name),
  KEY idx_theme_group (group_name, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------- feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  flag_key    VARCHAR(60)  NOT NULL,
  label       VARCHAR(120) NOT NULL,
  description VARCHAR(255)     NULL,
  is_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_flag_key (flag_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- custom_code
-- Raw markup injected into the public pages. Super Admin only, every
-- change is written to activity_logs with a full before/after diff.
CREATE TABLE IF NOT EXISTS custom_code (
  id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  location   ENUM('head','body_start','body_end') NOT NULL,
  code       LONGTEXT         NULL,
  is_enabled TINYINT(1)   NOT NULL DEFAULT 0,
  notes      VARCHAR(255)     NULL,
  updated_by INT UNSIGNED     NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code_location (location),
  CONSTRAINT fk_code_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- redirects
CREATE TABLE IF NOT EXISTS redirects (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_path  VARCHAR(255) NOT NULL,
  destination  VARCHAR(500) NOT NULL,
  status_code  SMALLINT UNSIGNED NOT NULL DEFAULT 301,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  hit_count    INT UNSIGNED NOT NULL DEFAULT 0,
  last_hit_at  DATETIME         NULL,
  notes        VARCHAR(255)     NULL,
  created_by   INT UNSIGNED     NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redirect_source (source_path),
  KEY idx_redirect_active (is_active),
  CONSTRAINT fk_redirect_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
