-- =====================================================================
-- Portfolio CMS - full schema snapshot
--
-- GENERATED FILE. Do not edit by hand.
--   regenerate with:  npm run schema:dump
--   source of truth:  database/migrations/*.sql
--
-- Generated: 2026-08-11T15:48:33.943Z
-- Server:    10.4.32-MariaDB
-- Tables:    51
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- achievements
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `achievements`;
CREATE TABLE `achievements` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(240) NOT NULL,
  `description` text DEFAULT NULL,
  `organization` varchar(160) DEFAULT NULL,
  `achieved_on` date DEFAULT NULL,
  `date_label` varchar(80) DEFAULT NULL,
  `image_media_id` int(10) unsigned DEFAULT NULL,
  `certificate_media_id` int(10) unsigned DEFAULT NULL,
  `external_url` varchar(500) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ach_active` (`is_active`,`deleted_at`,`sort_order`),
  KEY `idx_ach_date` (`achieved_on`),
  KEY `fk_ach_image` (`image_media_id`),
  KEY `fk_ach_cert` (`certificate_media_id`),
  CONSTRAINT `fk_ach_cert` FOREIGN KEY (`certificate_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ach_image` FOREIGN KEY (`image_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `activity_logs`;
CREATE TABLE `activity_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `user_name` varchar(120) DEFAULT NULL,
  `action` varchar(60) NOT NULL,
  `entity` varchar(60) DEFAULT NULL,
  `entity_id` int(10) unsigned DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `before_json` longtext DEFAULT NULL,
  `after_json` longtext DEFAULT NULL,
  `ip_hash` char(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_logs_user` (`user_id`,`created_at`),
  KEY `idx_logs_entity` (`entity`,`entity_id`),
  KEY `idx_logs_action` (`action`,`created_at`),
  KEY `idx_logs_time` (`created_at`),
  KEY `idx_logs_severity` (`severity`,`created_at`),
  CONSTRAINT `fk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- admin_notifications
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `admin_notifications`;
CREATE TABLE `admin_notifications` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `type` varchar(50) NOT NULL,
  `severity` enum('info','success','warning','critical') NOT NULL DEFAULT 'info',
  `title` varchar(200) NOT NULL,
  `body` varchar(500) DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `entity` varchar(60) DEFAULT NULL,
  `entity_id` int(10) unsigned DEFAULT NULL,
  `user_id` int(10) unsigned DEFAULT NULL,
  `dedupe_key` varchar(190) DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notif_dedupe` (`dedupe_key`),
  KEY `idx_notif_read` (`read_at`,`created_at`),
  KEY `idx_notif_user` (`user_id`,`read_at`),
  KEY `idx_notif_type` (`type`,`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- analytics_daily
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `analytics_daily`;
CREATE TABLE `analytics_daily` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `stat_date` date NOT NULL,
  `visitors` int(10) unsigned NOT NULL DEFAULT 0,
  `unique_visitors` int(10) unsigned NOT NULL DEFAULT 0,
  `new_visitors` int(10) unsigned NOT NULL DEFAULT 0,
  `pageviews` int(10) unsigned NOT NULL DEFAULT 0,
  `sessions` int(10) unsigned NOT NULL DEFAULT 0,
  `avg_duration_seconds` int(10) unsigned NOT NULL DEFAULT 0,
  `bounce_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `top_path` varchar(255) DEFAULT NULL,
  `top_referrer` varchar(160) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_daily_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- analytics_events
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `analytics_events`;
CREATE TABLE `analytics_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(60) NOT NULL,
  `path` varchar(255) DEFAULT NULL,
  `label` varchar(160) DEFAULT NULL,
  `value` int(11) DEFAULT NULL,
  `meta_json` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_event_name` (`name`,`created_at`),
  KEY `idx_event_time` (`created_at`),
  KEY `fk_event_session` (`session_id`),
  CONSTRAINT `fk_event_session` FOREIGN KEY (`session_id`) REFERENCES `analytics_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- analytics_pageviews
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `analytics_pageviews`;
CREATE TABLE `analytics_pageviews` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint(20) unsigned NOT NULL,
  `visitor_id` int(10) unsigned NOT NULL,
  `path` varchar(255) NOT NULL,
  `page_key` varchar(60) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `referrer_host` varchar(160) DEFAULT NULL,
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `entity_type` varchar(40) DEFAULT NULL,
  `entity_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pv_session` (`session_id`),
  KEY `idx_pv_visitor` (`visitor_id`),
  KEY `idx_pv_path` (`path`,`created_at`),
  KEY `idx_pv_created` (`created_at`),
  KEY `idx_pv_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `fk_pv_session` FOREIGN KEY (`session_id`) REFERENCES `analytics_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pv_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `analytics_visitors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- analytics_sessions
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `analytics_sessions`;
CREATE TABLE `analytics_sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `visitor_id` int(10) unsigned NOT NULL,
  `session_key` char(36) NOT NULL,
  `started_at` datetime NOT NULL,
  `last_activity_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `pageview_count` smallint(5) unsigned NOT NULL DEFAULT 0,
  `duration_seconds` int(10) unsigned NOT NULL DEFAULT 0,
  `entry_path` varchar(255) DEFAULT NULL,
  `exit_path` varchar(255) DEFAULT NULL,
  `referrer_host` varchar(160) DEFAULT NULL,
  `referrer_type` enum('direct','search','social','referral','internal','campaign') NOT NULL DEFAULT 'direct',
  `utm_source` varchar(80) DEFAULT NULL,
  `utm_medium` varchar(80) DEFAULT NULL,
  `utm_campaign` varchar(120) DEFAULT NULL,
  `is_bounce` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_key` (`session_key`),
  KEY `idx_session_visitor` (`visitor_id`,`started_at`),
  KEY `idx_session_started` (`started_at`),
  KEY `idx_session_active` (`last_activity_at`),
  KEY `idx_session_referrer` (`referrer_type`,`started_at`),
  CONSTRAINT `fk_session_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `analytics_visitors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- analytics_visitors
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `analytics_visitors`;
CREATE TABLE `analytics_visitors` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `visitor_hash` char(64) NOT NULL,
  `first_seen_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `visit_count` int(10) unsigned NOT NULL DEFAULT 1,
  `device_type` enum('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  `browser` varchar(40) DEFAULT NULL,
  `browser_version` varchar(20) DEFAULT NULL,
  `os` varchar(40) DEFAULT NULL,
  `country_code` char(2) DEFAULT NULL,
  `region` varchar(80) DEFAULT NULL,
  `screen_width` smallint(5) unsigned DEFAULT NULL,
  `screen_height` smallint(5) unsigned DEFAULT NULL,
  `language` varchar(12) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visitor_hash` (`visitor_hash`),
  KEY `idx_visitor_last` (`last_seen_at`),
  KEY `idx_visitor_first` (`first_seen_at`),
  KEY `idx_visitor_device` (`device_type`),
  KEY `idx_visitor_country` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- backups
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `backups`;
CREATE TABLE `backups` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `disk_path` varchar(500) NOT NULL,
  `size_bytes` bigint(20) unsigned NOT NULL DEFAULT 0,
  `checksum` char(64) DEFAULT NULL,
  `backup_type` enum('manual','scheduled','pre-restore') NOT NULL DEFAULT 'manual',
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `tables_count` smallint(5) unsigned NOT NULL DEFAULT 0,
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `error_message` varchar(500) DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backup_filename` (`filename`),
  KEY `idx_backup_created` (`created_at`),
  KEY `idx_backup_status` (`status`),
  KEY `fk_backups_created_by` (`created_by`),
  CONSTRAINT `fk_backups_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- blog_categories
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `blog_categories`;
CREATE TABLE `blog_categories` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_cat_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `blog_posts`;
CREATE TABLE `blog_posts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `category_id` smallint(5) unsigned DEFAULT NULL,
  `author_id` int(10) unsigned DEFAULT NULL,
  `title` varchar(240) NOT NULL,
  `slug` varchar(260) NOT NULL,
  `excerpt` varchar(500) DEFAULT NULL,
  `content_html` longtext DEFAULT NULL,
  `featured_media_id` int(10) unsigned DEFAULT NULL,
  `featured_image_url` varchar(500) DEFAULT NULL,
  `source` enum('native','medium') NOT NULL DEFAULT 'native',
  `external_url` varchar(500) DEFAULT NULL,
  `external_guid` varchar(255) DEFAULT NULL,
  `reading_minutes` smallint(5) unsigned DEFAULT NULL,
  `status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `seo_title` varchar(200) DEFAULT NULL,
  `seo_description` varchar(320) DEFAULT NULL,
  `seo_keywords` varchar(320) DEFAULT NULL,
  `og_media_id` int(10) unsigned DEFAULT NULL,
  `view_count` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_posts_slug` (`slug`),
  UNIQUE KEY `uq_posts_guid` (`external_guid`),
  KEY `idx_posts_status` (`status`,`published_at`),
  KEY `idx_posts_source` (`source`,`published_at`),
  KEY `idx_posts_deleted` (`deleted_at`),
  KEY `fk_posts_category` (`category_id`),
  KEY `fk_posts_author` (`author_id`),
  KEY `fk_posts_featured` (`featured_media_id`),
  KEY `fk_posts_og` (`og_media_id`),
  CONSTRAINT `fk_posts_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posts_category` FOREIGN KEY (`category_id`) REFERENCES `blog_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posts_featured` FOREIGN KEY (`featured_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posts_og` FOREIGN KEY (`og_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- blog_post_tags
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `blog_post_tags`;
CREATE TABLE `blog_post_tags` (
  `post_id` int(10) unsigned NOT NULL,
  `tag_id` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`post_id`,`tag_id`),
  KEY `idx_bpt_tag` (`tag_id`),
  CONSTRAINT `fk_bpt_post` FOREIGN KEY (`post_id`) REFERENCES `blog_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bpt_tag` FOREIGN KEY (`tag_id`) REFERENCES `blog_tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- blog_tags
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `blog_tags`;
CREATE TABLE `blog_tags` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `slug` varchar(60) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_tag_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- certifications
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `certifications`;
CREATE TABLE `certifications` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(240) NOT NULL,
  `issuer` varchar(160) DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `date_label` varchar(80) DEFAULT NULL,
  `credential_id` varchar(160) DEFAULT NULL,
  `credential_url` varchar(500) DEFAULT NULL,
  `certificate_media_id` int(10) unsigned DEFAULT NULL,
  `logo_media_id` int(10) unsigned DEFAULT NULL,
  `description` text DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cert_active` (`is_active`,`deleted_at`,`sort_order`),
  KEY `idx_cert_expiry` (`expiry_date`),
  KEY `fk_cert_file` (`certificate_media_id`),
  KEY `fk_cert_logo` (`logo_media_id`),
  CONSTRAINT `fk_cert_file` FOREIGN KEY (`certificate_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cert_logo` FOREIGN KEY (`logo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- contact_messages
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `contact_messages`;
CREATE TABLE `contact_messages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `ip_hash` char(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `referrer` varchar(255) DEFAULT NULL,
  `status` enum('unread','read','replied','archived','spam') NOT NULL DEFAULT 'unread',
  `is_starred` tinyint(1) NOT NULL DEFAULT 0,
  `spam_score` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `admin_notes` text DEFAULT NULL,
  `replied_at` datetime DEFAULT NULL,
  `replied_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_msg_status` (`status`,`deleted_at`,`created_at`),
  KEY `idx_msg_created` (`created_at`),
  KEY `idx_msg_email` (`email`),
  KEY `idx_msg_ip` (`ip_hash`,`created_at`),
  KEY `fk_msg_replied_by` (`replied_by`),
  CONSTRAINT `fk_msg_replied_by` FOREIGN KEY (`replied_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- custom_code
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `custom_code`;
CREATE TABLE `custom_code` (
  `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `location` enum('head','body_start','body_end') NOT NULL,
  `code` longtext DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `notes` varchar(255) DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_code_location` (`location`),
  KEY `fk_code_user` (`updated_by`),
  CONSTRAINT `fk_code_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- domains
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `domains`;
CREATE TABLE `domains` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `domain` varchar(190) NOT NULL,
  `registrar` varchar(120) DEFAULT NULL,
  `registrar_url` varchar(500) DEFAULT NULL,
  `registrar_api_provider` varchar(60) DEFAULT NULL,
  `purchased_at` date DEFAULT NULL,
  `registered_at` date DEFAULT NULL,
  `expires_at` date DEFAULT NULL,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `nameservers` text DEFAULT NULL,
  `dns_provider` varchar(120) DEFAULT NULL,
  `ssl_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `ssl_issuer` varchar(160) DEFAULT NULL,
  `ssl_expires_at` date DEFAULT NULL,
  `ssl_last_checked_at` datetime DEFAULT NULL,
  `ssl_status` enum('unknown','valid','expiring','expired','error') NOT NULL DEFAULT 'unknown',
  `hosting_provider` varchar(120) DEFAULT NULL,
  `server_ip` varchar(45) DEFAULT NULL,
  `environment` enum('production','staging','development') NOT NULL DEFAULT 'production',
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_domain` (`domain`),
  KEY `idx_domain_expiry` (`expires_at`),
  KEY `idx_domain_ssl` (`ssl_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- domain_events
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `domain_events`;
CREATE TABLE `domain_events` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `domain_id` int(10) unsigned NOT NULL,
  `event_type` enum('registered','renewed','expiring','expired','dns_changed','ssl_issued','ssl_renewed','ssl_expiring','ssl_expired','check','note') NOT NULL DEFAULT 'note',
  `message` varchar(500) DEFAULT NULL,
  `occurred_at` datetime NOT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_devent_domain` (`domain_id`,`occurred_at`),
  KEY `fk_devent_user` (`created_by`),
  CONSTRAINT `fk_devent_domain` FOREIGN KEY (`domain_id`) REFERENCES `domains` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_devent_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- education
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `education`;
CREATE TABLE `education` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `institution` varchar(200) NOT NULL,
  `degree` varchar(200) DEFAULT NULL,
  `field` varchar(160) DEFAULT NULL,
  `start_year` smallint(5) unsigned DEFAULT NULL,
  `end_year` smallint(5) unsigned DEFAULT NULL,
  `date_label` varchar(80) DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 0,
  `grade` varchar(60) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `logo_media_id` int(10) unsigned DEFAULT NULL,
  `location` varchar(120) DEFAULT NULL,
  `website` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_edu_active` (`is_active`,`deleted_at`,`sort_order`),
  KEY `fk_edu_logo` (`logo_media_id`),
  CONSTRAINT `fk_edu_logo` FOREIGN KEY (`logo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- experience
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `experience`;
CREATE TABLE `experience` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `company` varchar(160) NOT NULL,
  `position` varchar(160) NOT NULL,
  `employment_type` enum('full-time','part-time','internship','freelance','volunteer','contract','other') NOT NULL DEFAULT 'other',
  `location` varchar(120) DEFAULT NULL,
  `location_type` enum('on-site','hybrid','remote') DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `date_label` varchar(80) DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `company_logo_media_id` int(10) unsigned DEFAULT NULL,
  `company_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_exp_active` (`is_active`,`deleted_at`,`sort_order`),
  KEY `idx_exp_dates` (`start_date`,`end_date`),
  KEY `fk_exp_logo` (`company_logo_media_id`),
  CONSTRAINT `fk_exp_logo` FOREIGN KEY (`company_logo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- experience_bullets
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `experience_bullets`;
CREATE TABLE `experience_bullets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `experience_id` int(10) unsigned NOT NULL,
  `bullet_type` enum('responsibility','achievement','technology') NOT NULL DEFAULT 'responsibility',
  `content` varchar(500) NOT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_bullets_exp` (`experience_id`,`bullet_type`,`sort_order`),
  CONSTRAINT `fk_bullets_exp` FOREIGN KEY (`experience_id`) REFERENCES `experience` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- feature_flags
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `feature_flags`;
CREATE TABLE `feature_flags` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `flag_key` varchar(60) NOT NULL,
  `label` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_flag_key` (`flag_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- homepage_sections
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `homepage_sections`;
CREATE TABLE `homepage_sections` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `section_key` varchar(60) NOT NULL,
  `label` varchar(80) NOT NULL,
  `page_key` varchar(50) NOT NULL DEFAULT 'about',
  `title` varchar(160) DEFAULT NULL,
  `subtitle` varchar(255) DEFAULT NULL,
  `icon_name` varchar(60) DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `is_locked` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section_key` (`section_key`),
  KEY `idx_section_page` (`page_key`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- jobs_log
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `jobs_log`;
CREATE TABLE `jobs_log` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `job_name` varchar(60) NOT NULL,
  `status` enum('running','success','failed','skipped') NOT NULL DEFAULT 'running',
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `message` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_job_name` (`job_name`,`started_at`),
  KEY `idx_job_status` (`status`,`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- login_attempts
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `login_attempts`;
CREATE TABLE `login_attempts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(190) DEFAULT NULL,
  `user_id` int(10) unsigned DEFAULT NULL,
  `ip_hash` char(64) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `success` tinyint(1) NOT NULL DEFAULT 0,
  `reason` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_attempts_email` (`email`,`created_at`),
  KEY `idx_attempts_ip` (`ip_hash`,`created_at`),
  KEY `idx_attempts_time` (`created_at`),
  KEY `fk_attempts_user` (`user_id`),
  CONSTRAINT `fk_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `media`;
CREATE TABLE `media` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `disk_path` varchar(500) NOT NULL,
  `url_path` varchar(500) NOT NULL,
  `mime` varchar(100) NOT NULL,
  `extension` varchar(12) NOT NULL,
  `kind` enum('image','document','other') NOT NULL DEFAULT 'image',
  `size_bytes` int(10) unsigned NOT NULL DEFAULT 0,
  `width` smallint(5) unsigned DEFAULT NULL,
  `height` smallint(5) unsigned DEFAULT NULL,
  `alt` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `caption` varchar(500) DEFAULT NULL,
  `folder` varchar(100) NOT NULL DEFAULT 'general',
  `checksum` char(64) DEFAULT NULL,
  `uploaded_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_media_uuid` (`uuid`),
  UNIQUE KEY `uq_media_filename` (`filename`),
  KEY `idx_media_kind` (`kind`,`deleted_at`),
  KEY `idx_media_folder` (`folder`),
  KEY `idx_media_created` (`created_at`),
  KEY `idx_media_checksum` (`checksum`),
  KEY `fk_media_user` (`uploaded_by`),
  CONSTRAINT `fk_media_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- media_variants
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `media_variants`;
CREATE TABLE `media_variants` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `media_id` int(10) unsigned NOT NULL,
  `variant` enum('thumbnail','medium','large','webp','avif') NOT NULL,
  `disk_path` varchar(500) NOT NULL,
  `url_path` varchar(500) NOT NULL,
  `width` smallint(5) unsigned DEFAULT NULL,
  `height` smallint(5) unsigned DEFAULT NULL,
  `size_bytes` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_variant` (`media_id`,`variant`),
  CONSTRAINT `fk_variant_media` FOREIGN KEY (`media_id`) REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- navigation
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `navigation`;
CREATE TABLE `navigation` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `parent_id` smallint(5) unsigned DEFAULT NULL,
  `label` varchar(60) NOT NULL,
  `url` varchar(500) DEFAULT NULL,
  `target_page` varchar(50) DEFAULT NULL,
  `link_type` enum('page','internal','external') NOT NULL DEFAULT 'page',
  `icon_name` varchar(60) DEFAULT NULL,
  `open_in_new_tab` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_nav_parent` (`parent_id`,`sort_order`),
  KEY `idx_nav_active` (`is_active`,`sort_order`),
  CONSTRAINT `fk_nav_parent` FOREIGN KEY (`parent_id`) REFERENCES `navigation` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- newsletter_subscribers
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `newsletter_subscribers`;
CREATE TABLE `newsletter_subscribers` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(190) NOT NULL,
  `name` varchar(120) DEFAULT NULL,
  `source` varchar(60) DEFAULT NULL,
  `confirm_token_hash` char(64) DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `unsubscribed_at` datetime DEFAULT NULL,
  `ip_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscriber_email` (`email`),
  KEY `idx_sub_confirmed` (`confirmed_at`,`unsubscribed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(60) NOT NULL,
  `name` varchar(120) NOT NULL,
  `group_name` varchar(50) NOT NULL DEFAULT 'general',
  `description` varchar(255) DEFAULT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_slug` (`slug`),
  KEY `idx_permissions_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- profile
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `profile`;
CREATE TABLE `profile` (
  `id` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `full_name` varchar(120) NOT NULL DEFAULT '',
  `display_name` varchar(120) NOT NULL DEFAULT '',
  `professional_title` varchar(160) NOT NULL DEFAULT '',
  `secondary_title` varchar(160) DEFAULT NULL,
  `tagline` varchar(255) DEFAULT NULL,
  `short_bio` varchar(500) DEFAULT NULL,
  `about_html` longtext DEFAULT NULL,
  `long_bio` longtext DEFAULT NULL,
  `photo_media_id` int(10) unsigned DEFAULT NULL,
  `photo_alt` varchar(255) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `email_subject` varchar(255) DEFAULT NULL,
  `email_body` text DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `whatsapp_url` varchar(255) DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `location_html` varchar(255) DEFAULT NULL,
  `city` varchar(80) DEFAULT NULL,
  `state` varchar(80) DEFAULT NULL,
  `country` varchar(80) DEFAULT NULL,
  `show_email` tinyint(1) NOT NULL DEFAULT 1,
  `show_phone` tinyint(1) NOT NULL DEFAULT 1,
  `show_birthday` tinyint(1) NOT NULL DEFAULT 1,
  `show_location` tinyint(1) NOT NULL DEFAULT 1,
  `availability` varchar(120) DEFAULT NULL,
  `current_status` varchar(120) DEFAULT NULL,
  `years_experience` decimal(3,1) DEFAULT NULL,
  `resume_media_id` int(10) unsigned DEFAULT NULL,
  `resume_label` varchar(80) NOT NULL DEFAULT 'Download Resume',
  `resume_version` varchar(30) DEFAULT NULL,
  `resume_updated_at` date DEFAULT NULL,
  `resume_downloads` int(10) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_profile_photo` (`photo_media_id`),
  KEY `fk_profile_resume` (`resume_media_id`),
  CONSTRAINT `fk_profile_photo` FOREIGN KEY (`photo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_profile_resume` FOREIGN KEY (`resume_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `projects`;
CREATE TABLE `projects` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `category_id` smallint(5) unsigned DEFAULT NULL,
  `title` varchar(160) NOT NULL,
  `slug` varchar(180) NOT NULL,
  `category_label` varchar(180) DEFAULT NULL,
  `short_description` varchar(300) DEFAULT NULL,
  `full_description` longtext DEFAULT NULL,
  `featured_media_id` int(10) unsigned DEFAULT NULL,
  `image_alt` varchar(255) DEFAULT NULL,
  `primary_url` varchar(500) DEFAULT NULL,
  `github_url` varchar(500) DEFAULT NULL,
  `live_url` varchar(500) DEFAULT NULL,
  `docs_url` varchar(500) DEFAULT NULL,
  `video_url` varchar(500) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `client` varchar(120) DEFAULT NULL,
  `role` varchar(120) DEFAULT NULL,
  `team_size` tinyint(3) unsigned DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `open_in_new_tab` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('draft','published') NOT NULL DEFAULT 'published',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `seo_title` varchar(200) DEFAULT NULL,
  `seo_description` varchar(320) DEFAULT NULL,
  `seo_keywords` varchar(320) DEFAULT NULL,
  `og_media_id` int(10) unsigned DEFAULT NULL,
  `view_count` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_projects_slug` (`slug`),
  KEY `idx_projects_category` (`category_id`,`sort_order`),
  KEY `idx_projects_status` (`status`,`deleted_at`,`sort_order`),
  KEY `idx_projects_featured` (`is_featured`,`sort_order`),
  KEY `fk_projects_featured` (`featured_media_id`),
  KEY `fk_projects_og` (`og_media_id`),
  CONSTRAINT `fk_projects_category` FOREIGN KEY (`category_id`) REFERENCES `project_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_featured` FOREIGN KEY (`featured_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_og` FOREIGN KEY (`og_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- project_categories
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `project_categories`;
CREATE TABLE `project_categories` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proj_cat_slug` (`slug`),
  KEY `idx_proj_cat_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- project_images
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `project_images`;
CREATE TABLE `project_images` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `media_id` int(10) unsigned NOT NULL,
  `alt` varchar(255) DEFAULT NULL,
  `caption` varchar(500) DEFAULT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_media` (`project_id`,`media_id`),
  KEY `idx_project_images_order` (`project_id`,`sort_order`),
  KEY `fk_pimg_media` (`media_id`),
  CONSTRAINT `fk_pimg_media` FOREIGN KEY (`media_id`) REFERENCES `media` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pimg_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- project_technologies
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `project_technologies`;
CREATE TABLE `project_technologies` (
  `project_id` int(10) unsigned NOT NULL,
  `technology_id` smallint(5) unsigned NOT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`project_id`,`technology_id`),
  KEY `idx_pt_tech` (`technology_id`),
  CONSTRAINT `fk_pt_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pt_tech` FOREIGN KEY (`technology_id`) REFERENCES `technologies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- redirects
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `redirects`;
CREATE TABLE `redirects` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `source_path` varchar(255) NOT NULL,
  `destination` varchar(500) NOT NULL,
  `status_code` smallint(5) unsigned NOT NULL DEFAULT 301,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `hit_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_hit_at` datetime DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_redirect_source` (`source_path`),
  KEY `idx_redirect_active` (`is_active`),
  KEY `fk_redirect_user` (`created_by`),
  CONSTRAINT `fk_redirect_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `level` tinyint(3) unsigned NOT NULL DEFAULT 10,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` tinyint(3) unsigned NOT NULL,
  `permission_id` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- schema_migrations
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `schema_migrations`;
CREATE TABLE `schema_migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `filename` varchar(190) NOT NULL,
  `checksum` char(64) NOT NULL,
  `statements` smallint(5) unsigned NOT NULL DEFAULT 0,
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_migration_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- seo_settings
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `seo_settings`;
CREATE TABLE `seo_settings` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `page_key` varchar(60) NOT NULL,
  `page_label` varchar(100) DEFAULT NULL,
  `page_title` varchar(200) DEFAULT NULL,
  `meta_title` varchar(200) DEFAULT NULL,
  `meta_description` varchar(320) DEFAULT NULL,
  `meta_keywords` varchar(320) DEFAULT NULL,
  `canonical_url` varchar(500) DEFAULT NULL,
  `robots` varchar(120) NOT NULL DEFAULT 'index, follow',
  `og_title` varchar(200) DEFAULT NULL,
  `og_description` varchar(320) DEFAULT NULL,
  `og_media_id` int(10) unsigned DEFAULT NULL,
  `twitter_card` enum('summary','summary_large_image') NOT NULL DEFAULT 'summary_large_image',
  `twitter_title` varchar(200) DEFAULT NULL,
  `twitter_description` varchar(320) DEFAULT NULL,
  `twitter_media_id` int(10) unsigned DEFAULT NULL,
  `jsonld` longtext DEFAULT NULL,
  `in_sitemap` tinyint(1) NOT NULL DEFAULT 1,
  `sitemap_priority` decimal(2,1) NOT NULL DEFAULT 0.8,
  `sitemap_changefreq` enum('always','hourly','daily','weekly','monthly','yearly','never') NOT NULL DEFAULT 'weekly',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_seo_page` (`page_key`),
  KEY `fk_seo_og` (`og_media_id`),
  KEY `fk_seo_twitter` (`twitter_media_id`),
  CONSTRAINT `fk_seo_og` FOREIGN KEY (`og_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_seo_twitter` FOREIGN KEY (`twitter_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `services`;
CREATE TABLE `services` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `icon_type` enum('ionicon','image') NOT NULL DEFAULT 'ionicon',
  `icon_name` varchar(60) DEFAULT NULL,
  `icon_media_id` int(10) unsigned DEFAULT NULL,
  `icon_alt` varchar(160) DEFAULT NULL,
  `features` text DEFAULT NULL,
  `starting_price` varchar(60) DEFAULT NULL,
  `cta_label` varchar(60) DEFAULT NULL,
  `cta_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_services_active` (`is_active`,`sort_order`),
  KEY `fk_services_icon` (`icon_media_id`),
  CONSTRAINT `fk_services_icon` FOREIGN KEY (`icon_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `session_id` varchar(128) NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` mediumtext DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_sessions_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `site_settings`;
CREATE TABLE `site_settings` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` longtext DEFAULT NULL,
  `value_type` enum('string','text','html','number','boolean','json','media','color','select') NOT NULL DEFAULT 'string',
  `setting_group` varchar(50) NOT NULL DEFAULT 'general',
  `label` varchar(160) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `options_json` text DEFAULT NULL,
  `is_secret` tinyint(1) NOT NULL DEFAULT 0,
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_setting_key` (`setting_key`),
  KEY `idx_setting_group` (`setting_group`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- skills
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `skills`;
CREATE TABLE `skills` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `category_id` smallint(5) unsigned DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `level` tinyint(3) unsigned NOT NULL DEFAULT 3,
  `aria_label` varchar(160) DEFAULT NULL,
  `icon_name` varchar(60) DEFAULT NULL,
  `logo_media_id` int(10) unsigned DEFAULT NULL,
  `years_experience` decimal(3,1) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_skills_slug` (`slug`),
  KEY `idx_skills_category` (`category_id`,`sort_order`),
  KEY `idx_skills_active` (`is_active`,`sort_order`),
  KEY `fk_skills_logo` (`logo_media_id`),
  CONSTRAINT `fk_skills_category` FOREIGN KEY (`category_id`) REFERENCES `skill_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_skills_logo` FOREIGN KEY (`logo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- skill_categories
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `skill_categories`;
CREATE TABLE `skill_categories` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `icon_name` varchar(60) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_skill_cat_slug` (`slug`),
  KEY `idx_skill_cat_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- social_links
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `social_links`;
CREATE TABLE `social_links` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `platform` varchar(60) NOT NULL,
  `label` varchar(80) DEFAULT NULL,
  `url` varchar(500) NOT NULL,
  `icon_name` varchar(60) DEFAULT NULL,
  `username` varchar(120) DEFAULT NULL,
  `open_in_new_tab` tinyint(1) NOT NULL DEFAULT 1,
  `show_in_sidebar` tinyint(1) NOT NULL DEFAULT 1,
  `show_in_footer` tinyint(1) NOT NULL DEFAULT 0,
  `include_in_jsonld` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_social_active` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- technologies
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `technologies`;
CREATE TABLE `technologies` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `slug` varchar(60) NOT NULL,
  `icon_name` varchar(60) DEFAULT NULL,
  `color` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tech_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- theme_settings
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `theme_settings`;
CREATE TABLE `theme_settings` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `var_name` varchar(60) NOT NULL,
  `var_value` varchar(160) NOT NULL,
  `default_value` varchar(160) NOT NULL,
  `label` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `group_name` varchar(50) NOT NULL DEFAULT 'colors',
  `input_type` enum('color','text','number','select','font') NOT NULL DEFAULT 'color',
  `options_json` text DEFAULT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_theme_var` (`var_name`),
  KEY `idx_theme_group` (`group_name`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL,
  `role_id` tinyint(3) unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `username` varchar(60) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `avatar_media_id` int(10) unsigned DEFAULT NULL,
  `status` enum('active','suspended') NOT NULL DEFAULT 'active',
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `last_login_at` datetime DEFAULT NULL,
  `last_login_ip_hash` char(64) DEFAULT NULL,
  `failed_login_count` smallint(5) unsigned NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `password_changed_at` datetime DEFAULT NULL,
  `reset_token_hash` char(64) DEFAULT NULL,
  `reset_token_expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_uuid` (`uuid`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_role` (`role_id`),
  KEY `idx_users_status` (`status`,`deleted_at`),
  KEY `idx_users_reset` (`reset_token_hash`),
  KEY `fk_users_avatar` (`avatar_media_id`),
  CONSTRAINT `fk_users_avatar` FOREIGN KEY (`avatar_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_2fa
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `user_2fa`;
CREATE TABLE `user_2fa` (
  `user_id` int(10) unsigned NOT NULL,
  `secret_encrypted` varchar(512) NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `confirmed_at` datetime DEFAULT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_2fa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_2fa_backup_codes
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `user_2fa_backup_codes`;
CREATE TABLE `user_2fa_backup_codes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_backup_user` (`user_id`,`used_at`),
  CONSTRAINT `fk_backup_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
