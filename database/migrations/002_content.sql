-- =====================================================================
-- 002_content.sql
-- Media library + every portfolio content type currently hardcoded in
-- index.html: profile, services, education, experience, achievements,
-- certifications, skills, projects, social links, navigation, sections.
-- =====================================================================

-- ---------------------------------------------------------------- media
CREATE TABLE IF NOT EXISTS media (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid          CHAR(36)      NOT NULL,
  -- Generated, sanitised name actually written to disk. The uploaded
  -- filename is kept only for display and is never used as a path.
  filename      VARCHAR(255)  NOT NULL,
  original_name VARCHAR(255)  NOT NULL,
  disk_path     VARCHAR(500)  NOT NULL,
  url_path      VARCHAR(500)  NOT NULL,
  mime          VARCHAR(100)  NOT NULL,
  extension     VARCHAR(12)   NOT NULL,
  kind          ENUM('image','document','other') NOT NULL DEFAULT 'image',
  size_bytes    INT UNSIGNED  NOT NULL DEFAULT 0,
  width         SMALLINT UNSIGNED NULL,
  height        SMALLINT UNSIGNED NULL,
  alt           VARCHAR(255)      NULL,
  title         VARCHAR(255)      NULL,
  caption       VARCHAR(500)      NULL,
  folder        VARCHAR(100)  NOT NULL DEFAULT 'general',
  checksum      CHAR(64)          NULL,
  uploaded_by   INT UNSIGNED      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_uuid     (uuid),
  UNIQUE KEY uq_media_filename (filename),
  KEY idx_media_kind     (kind, deleted_at),
  KEY idx_media_folder   (folder),
  KEY idx_media_created  (created_at),
  KEY idx_media_checksum (checksum),
  CONSTRAINT fk_media_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_variants (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  media_id   INT UNSIGNED NOT NULL,
  variant    ENUM('thumbnail','medium','large','webp','avif') NOT NULL,
  disk_path  VARCHAR(500) NOT NULL,
  url_path   VARCHAR(500) NOT NULL,
  width      SMALLINT UNSIGNED NULL,
  height     SMALLINT UNSIGNED NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variant (media_id, variant),
  CONSTRAINT fk_variant_media FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deferred from 001 (media did not exist yet).
ALTER TABLE users
  ADD CONSTRAINT fk_users_avatar FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL;

-- -------------------------------------------------------------- profile
-- Single row, always id = 1.
CREATE TABLE IF NOT EXISTS profile (
  id                 TINYINT UNSIGNED NOT NULL DEFAULT 1,
  full_name          VARCHAR(120)  NOT NULL DEFAULT '',
  display_name       VARCHAR(120)  NOT NULL DEFAULT '',
  professional_title VARCHAR(160)  NOT NULL DEFAULT '',
  -- The site shows a second highlighted line under the title.
  secondary_title    VARCHAR(160)      NULL,
  tagline            VARCHAR(255)      NULL,
  short_bio          VARCHAR(500)      NULL,
  about_html         LONGTEXT          NULL,
  long_bio           LONGTEXT          NULL,
  photo_media_id     INT UNSIGNED      NULL,
  photo_alt          VARCHAR(255)      NULL,
  email              VARCHAR(190)      NULL,
  email_subject      VARCHAR(255)      NULL,
  email_body         TEXT              NULL,
  phone              VARCHAR(40)       NULL,
  whatsapp_url       VARCHAR(255)      NULL,
  birthday           DATE              NULL,
  location_html      VARCHAR(255)      NULL,
  city               VARCHAR(80)       NULL,
  state              VARCHAR(80)       NULL,
  country            VARCHAR(80)       NULL,
  show_email         TINYINT(1)    NOT NULL DEFAULT 1,
  show_phone         TINYINT(1)    NOT NULL DEFAULT 1,
  show_birthday      TINYINT(1)    NOT NULL DEFAULT 1,
  show_location      TINYINT(1)    NOT NULL DEFAULT 1,
  availability       VARCHAR(120)      NULL,
  current_status     VARCHAR(120)      NULL,
  years_experience   DECIMAL(3,1)      NULL,
  resume_media_id    INT UNSIGNED      NULL,
  resume_label       VARCHAR(80)   NOT NULL DEFAULT 'Download Resume',
  resume_version     VARCHAR(30)       NULL,
  resume_updated_at  DATE              NULL,
  resume_downloads   INT UNSIGNED  NOT NULL DEFAULT 0,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_profile_photo  FOREIGN KEY (photo_media_id)  REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT fk_profile_resume FOREIGN KEY (resume_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------- skills
CREATE TABLE IF NOT EXISTS skill_categories (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)  NOT NULL,
  slug       VARCHAR(80)  NOT NULL,
  icon_name  VARCHAR(60)      NULL,
  description VARCHAR(255)    NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_skill_cat_slug (slug),
  KEY idx_skill_cat_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- level 1-5 maps directly to the existing .level-1 .. .level-5 CSS
-- classes. No percentage bars - the current site does not use them.
CREATE TABLE IF NOT EXISTS skills (
  id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id      SMALLINT UNSIGNED     NULL,
  name             VARCHAR(120)      NOT NULL,
  slug             VARCHAR(120)      NOT NULL,
  level            TINYINT UNSIGNED  NOT NULL DEFAULT 3,
  aria_label       VARCHAR(160)          NULL,
  icon_name        VARCHAR(60)           NULL,
  logo_media_id    INT UNSIGNED          NULL,
  years_experience DECIMAL(3,1)          NULL,
  is_featured      TINYINT(1)        NOT NULL DEFAULT 0,
  is_active        TINYINT(1)        NOT NULL DEFAULT 1,
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_skills_slug (slug),
  KEY idx_skills_category (category_id, sort_order),
  KEY idx_skills_active   (is_active, sort_order),
  CONSTRAINT fk_skills_category FOREIGN KEY (category_id) REFERENCES skill_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_skills_logo     FOREIGN KEY (logo_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- projects
CREATE TABLE IF NOT EXISTS project_categories (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)  NOT NULL,
  -- Must match the lowercase value used by data-category / the filter
  -- buttons, e.g. "web development", "cyber security".
  slug        VARCHAR(80)  NOT NULL,
  description VARCHAR(255)     NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proj_cat_slug (slug),
  KEY idx_proj_cat_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS technologies (
  id        SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(60) NOT NULL,
  slug      VARCHAR(60) NOT NULL,
  icon_name VARCHAR(60)     NULL,
  color     VARCHAR(20)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tech_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  category_id       SMALLINT UNSIGNED     NULL,
  title             VARCHAR(160)      NOT NULL,
  slug              VARCHAR(180)      NOT NULL,
  -- The literal card subtitle, e.g. "Applications - Full Stack (Live)".
  -- Kept verbatim so cards render exactly as they do today.
  category_label    VARCHAR(180)          NULL,
  short_description VARCHAR(300)          NULL,
  full_description  LONGTEXT              NULL,
  featured_media_id INT UNSIGNED          NULL,
  image_alt         VARCHAR(255)          NULL,
  -- Where the card links today (GitHub, live demo, store listing...).
  primary_url       VARCHAR(500)          NULL,
  github_url        VARCHAR(500)          NULL,
  live_url          VARCHAR(500)          NULL,
  docs_url          VARCHAR(500)          NULL,
  video_url         VARCHAR(500)          NULL,
  start_date        DATE                  NULL,
  end_date          DATE                  NULL,
  client            VARCHAR(120)          NULL,
  role              VARCHAR(120)          NULL,
  team_size         TINYINT UNSIGNED      NULL,
  is_featured       TINYINT(1)        NOT NULL DEFAULT 0,
  open_in_new_tab   TINYINT(1)        NOT NULL DEFAULT 1,
  status            ENUM('draft','published') NOT NULL DEFAULT 'published',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  seo_title         VARCHAR(200)          NULL,
  seo_description   VARCHAR(320)          NULL,
  seo_keywords      VARCHAR(320)          NULL,
  og_media_id       INT UNSIGNED          NULL,
  view_count        INT UNSIGNED      NOT NULL DEFAULT 0,
  created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME              NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_slug (slug),
  KEY idx_projects_category (category_id, sort_order),
  KEY idx_projects_status   (status, deleted_at, sort_order),
  KEY idx_projects_featured (is_featured, sort_order),
  CONSTRAINT fk_projects_category FOREIGN KEY (category_id)       REFERENCES project_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_featured FOREIGN KEY (featured_media_id) REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_og       FOREIGN KEY (og_media_id)       REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  media_id   INT UNSIGNED NOT NULL,
  alt        VARCHAR(255)     NULL,
  caption    VARCHAR(500)     NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_media (project_id, media_id),
  KEY idx_project_images_order (project_id, sort_order),
  CONSTRAINT fk_pimg_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pimg_media   FOREIGN KEY (media_id)   REFERENCES media (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_technologies (
  project_id    INT UNSIGNED      NOT NULL,
  technology_id SMALLINT UNSIGNED NOT NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, technology_id),
  KEY idx_pt_tech (technology_id),
  CONSTRAINT fk_pt_project FOREIGN KEY (project_id)    REFERENCES projects (id)     ON DELETE CASCADE,
  CONSTRAINT fk_pt_tech    FOREIGN KEY (technology_id) REFERENCES technologies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- experience
-- date_label preserves the exact string the site renders today
-- ("Apr 2026 - Present", "2024"). start/end dates drive sorting.
CREATE TABLE IF NOT EXISTS experience (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company              VARCHAR(160) NOT NULL,
  position             VARCHAR(160) NOT NULL,
  employment_type      ENUM('full-time','part-time','internship','freelance','volunteer','contract','other') NOT NULL DEFAULT 'other',
  location             VARCHAR(120)     NULL,
  location_type        ENUM('on-site','hybrid','remote') NULL,
  start_date           DATE             NULL,
  end_date             DATE             NULL,
  date_label           VARCHAR(80)      NULL,
  is_current           TINYINT(1)   NOT NULL DEFAULT 0,
  description          TEXT             NULL,
  company_logo_media_id INT UNSIGNED    NULL,
  company_url          VARCHAR(500)     NULL,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME         NULL,
  PRIMARY KEY (id),
  KEY idx_exp_active (is_active, deleted_at, sort_order),
  KEY idx_exp_dates  (start_date, end_date),
  CONSTRAINT fk_exp_logo FOREIGN KEY (company_logo_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experience_bullets (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  experience_id INT UNSIGNED NOT NULL,
  bullet_type   ENUM('responsibility','achievement','technology') NOT NULL DEFAULT 'responsibility',
  content       VARCHAR(500) NOT NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_bullets_exp (experience_id, bullet_type, sort_order),
  CONSTRAINT fk_bullets_exp FOREIGN KEY (experience_id) REFERENCES experience (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ education
CREATE TABLE IF NOT EXISTS education (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  institution   VARCHAR(200) NOT NULL,
  degree        VARCHAR(200)     NULL,
  field         VARCHAR(160)     NULL,
  start_year    SMALLINT UNSIGNED NULL,
  end_year      SMALLINT UNSIGNED NULL,
  date_label    VARCHAR(80)      NULL,
  is_current    TINYINT(1)   NOT NULL DEFAULT 0,
  grade         VARCHAR(60)      NULL,
  description   TEXT             NULL,
  logo_media_id INT UNSIGNED     NULL,
  location      VARCHAR(120)     NULL,
  website       VARCHAR(500)     NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME         NULL,
  PRIMARY KEY (id),
  KEY idx_edu_active (is_active, deleted_at, sort_order),
  CONSTRAINT fk_edu_logo FOREIGN KEY (logo_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- certifications
CREATE TABLE IF NOT EXISTS certifications (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                   VARCHAR(240) NOT NULL,
  issuer                 VARCHAR(160)     NULL,
  issue_date             DATE             NULL,
  expiry_date            DATE             NULL,
  date_label             VARCHAR(80)      NULL,
  credential_id          VARCHAR(160)     NULL,
  credential_url         VARCHAR(500)     NULL,
  certificate_media_id   INT UNSIGNED     NULL,
  logo_media_id          INT UNSIGNED     NULL,
  description            TEXT             NULL,
  is_featured            TINYINT(1)   NOT NULL DEFAULT 0,
  is_active              TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at             DATETIME         NULL,
  PRIMARY KEY (id),
  KEY idx_cert_active (is_active, deleted_at, sort_order),
  KEY idx_cert_expiry (expiry_date),
  CONSTRAINT fk_cert_file FOREIGN KEY (certificate_media_id) REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_logo FOREIGN KEY (logo_media_id)        REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------- achievements
CREATE TABLE IF NOT EXISTS achievements (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title                VARCHAR(240) NOT NULL,
  description          TEXT             NULL,
  organization         VARCHAR(160)     NULL,
  achieved_on          DATE             NULL,
  date_label           VARCHAR(80)      NULL,
  image_media_id       INT UNSIGNED     NULL,
  certificate_media_id INT UNSIGNED     NULL,
  external_url         VARCHAR(500)     NULL,
  category             VARCHAR(80)      NULL,
  is_featured          TINYINT(1)   NOT NULL DEFAULT 0,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME         NULL,
  PRIMARY KEY (id),
  KEY idx_ach_active (is_active, deleted_at, sort_order),
  KEY idx_ach_date   (achieved_on),
  CONSTRAINT fk_ach_image FOREIGN KEY (image_media_id)       REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT fk_ach_cert  FOREIGN KEY (certificate_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- services
-- icon_type mirrors the current markup: one card uses an <img> SVG,
-- the other three use <ion-icon name="...">.
CREATE TABLE IF NOT EXISTS services (
  id             SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(160) NOT NULL,
  description    TEXT             NULL,
  icon_type      ENUM('ionicon','image') NOT NULL DEFAULT 'ionicon',
  icon_name      VARCHAR(60)      NULL,
  icon_media_id  INT UNSIGNED     NULL,
  icon_alt       VARCHAR(160)     NULL,
  features       TEXT             NULL,
  starting_price VARCHAR(60)      NULL,
  cta_label      VARCHAR(60)      NULL,
  cta_url        VARCHAR(500)     NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_services_active (is_active, sort_order),
  CONSTRAINT fk_services_icon FOREIGN KEY (icon_media_id) REFERENCES media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------- social_links
CREATE TABLE IF NOT EXISTS social_links (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  platform        VARCHAR(60)  NOT NULL,
  label           VARCHAR(80)      NULL,
  url             VARCHAR(500) NOT NULL,
  icon_name       VARCHAR(60)      NULL,
  username        VARCHAR(120)     NULL,
  open_in_new_tab TINYINT(1)   NOT NULL DEFAULT 1,
  show_in_sidebar TINYINT(1)   NOT NULL DEFAULT 1,
  show_in_footer  TINYINT(1)   NOT NULL DEFAULT 0,
  -- Included in the schema.org sameAs array when true.
  include_in_jsonld TINYINT(1) NOT NULL DEFAULT 1,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_social_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- navigation
-- target_page matches the data-page attribute the front-end JS toggles.
CREATE TABLE IF NOT EXISTS navigation (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id       SMALLINT UNSIGNED     NULL,
  label           VARCHAR(60)  NOT NULL,
  url             VARCHAR(500)     NULL,
  target_page     VARCHAR(50)      NULL,
  link_type       ENUM('page','internal','external') NOT NULL DEFAULT 'page',
  icon_name       VARCHAR(60)      NULL,
  open_in_new_tab TINYINT(1)   NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nav_parent (parent_id, sort_order),
  KEY idx_nav_active (is_active, sort_order),
  CONSTRAINT fk_nav_parent FOREIGN KEY (parent_id) REFERENCES navigation (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------- homepage_sections
CREATE TABLE IF NOT EXISTS homepage_sections (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_key VARCHAR(60)  NOT NULL,
  label       VARCHAR(80)  NOT NULL,
  page_key    VARCHAR(50)  NOT NULL DEFAULT 'about',
  title       VARCHAR(160)     NULL,
  subtitle    VARCHAR(255)     NULL,
  icon_name   VARCHAR(60)      NULL,
  is_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  is_locked   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_section_key (section_key),
  KEY idx_section_page (page_key, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
