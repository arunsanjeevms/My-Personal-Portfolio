-- =====================================================================
-- 006_baseline_data.sql
-- System data the application needs in order to boot: roles,
-- permissions, feature flags, theme variables, settings and SEO rows.
--
-- This is NOT portfolio content - that lives in database/seed.sql and is
-- migrated from index.html in Phase 3. Every statement here is
-- idempotent so re-running is harmless.
-- =====================================================================

-- ---------------------------------------------------------------- roles
INSERT INTO roles (slug, name, description, level, is_system) VALUES
  ('super_admin', 'Super Admin', 'Unrestricted access, including users, custom code, backups and security.', 100, 1),
  ('admin',       'Admin',       'Manages all content, media, settings, SEO and analytics.',                     80, 1),
  ('editor',      'Editor',      'Creates and edits content and media. No settings or user access.',              50, 1),
  ('viewer',      'Viewer',      'Read-only access to the dashboard, content and analytics.',                     10, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), level = VALUES(level);

-- ---------------------------------------------------------- permissions
INSERT INTO permissions (slug, name, group_name, description, sort_order) VALUES
  ('manage_profile',      'Manage profile',        'content',  'Edit identity, contacts, about text and resume metadata.', 10),
  ('manage_projects',     'Manage projects',       'content',  'Full CRUD on projects, categories and galleries.',         20),
  ('manage_experience',   'Manage experience',     'content',  'Full CRUD on work and volunteer experience.',              30),
  ('manage_education',    'Manage education',      'content',  'Full CRUD on education entries.',                          40),
  ('manage_skills',       'Manage skills',         'content',  'Full CRUD on skills and skill categories.',                50),
  ('manage_certifications','Manage certifications','content',  'Full CRUD on certifications.',                             60),
  ('manage_achievements', 'Manage achievements',   'content',  'Full CRUD on achievements.',                               70),
  ('manage_services',     'Manage services',       'content',  'Full CRUD on services.',                                   80),
  ('manage_social',       'Manage social links',   'content',  'Add, edit and reorder social profile links.',              90),
  ('manage_navigation',   'Manage navigation',     'content',  'Control the public navigation menu.',                     100),
  ('manage_sections',     'Manage page sections',  'content',  'Enable, disable, retitle and reorder page sections.',     110),
  ('manage_blog',         'Manage blog',           'content',  'Create, edit, publish and delete blog posts.',            120),
  ('manage_media',        'Manage media',          'media',    'Upload, replace, edit and delete media library files.',   130),
  ('view_messages',       'View messages',         'inbox',    'Read contact form submissions.',                          140),
  ('manage_messages',     'Manage messages',       'inbox',    'Change status, reply, archive, delete and export.',       150),
  ('manage_subscribers',  'Manage subscribers',    'inbox',    'View and export newsletter subscribers.',                 160),
  ('manage_seo',          'Manage SEO',            'settings', 'Edit meta tags, structured data, sitemap and robots.',    170),
  ('manage_settings',     'Manage settings',       'settings', 'Edit site settings, branding, titles and mail config.',   180),
  ('manage_theme',        'Manage theme',          'settings', 'Edit exposed CSS variables and theme defaults.',          190),
  ('manage_redirects',    'Manage redirects',      'settings', 'Create and remove URL redirects.',                        200),
  ('manage_features',     'Manage feature flags',  'settings', 'Toggle site features on and off.',                        210),
  ('manage_analytics',    'Manage analytics',      'insights', 'View analytics and change retention settings.',           220),
  ('view_activity_logs',  'View activity logs',    'insights', 'Read the admin audit trail.',                             230),
  ('manage_domains',      'Manage domains',        'ops',      'Track domains, DNS and SSL expiry.',                       240),
  ('manage_backups',      'Manage backups',        'ops',      'Create, download, delete and restore database backups.',   250),
  ('manage_users',        'Manage users',          'security', 'Create, edit, suspend and delete admin accounts.',         260),
  ('manage_security',     'Manage security',       'security', 'Sessions, login attempts, 2FA policy.',                    270),
  ('manage_custom_code',  'Manage custom code',    'security', 'Inject raw HTML/JS into public pages. Dangerous.',         280)
ON DUPLICATE KEY UPDATE name = VALUES(name), group_name = VALUES(group_name), description = VALUES(description), sort_order = VALUES(sort_order);

-- Super Admin gets everything, always.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'super_admin';

-- Admin: everything except user management, custom code, backups and
-- security policy - those stay with the owner account.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin'
  AND p.slug NOT IN ('manage_users', 'manage_custom_code', 'manage_backups', 'manage_security');

-- Editor: content and media, plus reading the inbox.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'editor'
  AND (p.group_name IN ('content', 'media') OR p.slug = 'view_messages');

-- Viewer: read-only surfaces only.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'viewer'
  AND p.slug IN ('view_messages', 'manage_analytics', 'view_activity_logs');

-- ------------------------------------------------------- profile record
-- Singleton row so the public site renders even before anything is
-- configured. Real values are migrated from index.html in seed.sql.
INSERT IGNORE INTO profile (id, full_name, display_name, professional_title)
VALUES (1, 'Portfolio Owner', 'Portfolio Owner', 'Developer');

-- --------------------------------------------------------- feature flags
INSERT INTO feature_flags (flag_key, label, description, is_enabled) VALUES
  ('show_about',          'About section',        'Show the About tab and its intro text.',                     1),
  ('show_services',       'Services section',     'Show the "What I''m Pursuing" cards.',                       1),
  ('show_resume',         'Resume tab',           'Show the Resume tab and the download button.',               1),
  ('show_education',      'Education section',    'Show the education timeline.',                               1),
  ('show_experience',     'Experience section',   'Show the experience timeline.',                              1),
  ('show_achievements',   'Achievements section', 'Show the achievements timeline.',                            1),
  ('show_certifications', 'Certifications',       'Show the certifications timeline.',                          1),
  ('show_skills',         'Skills section',       'Show the Core Expertise list.',                              1),
  ('show_projects',       'Projects tab',         'Show the Projects tab.',                                     1),
  ('show_project_details','Project detail pages', 'Enable /projects/:slug pages. Cards link out when off.',     0),
  ('show_blog',           'Blog tab',             'Show the Blog tab.',                                         1),
  ('show_contact',        'Contact tab',          'Show the Contact tab and contact form.',                     1),
  ('show_map',            'Contact map',          'Show the embedded map on the contact page.',                 1),
  ('enable_medium_sync',  'Medium sync',          'Periodically import posts from the Medium RSS feed.',        1),
  ('enable_newsletter',   'Newsletter',           'Enable newsletter subscription capture.',                    0),
  ('enable_analytics',    'Analytics',            'Collect privacy-conscious visitor analytics.',               1),
  ('enable_live_visitors','Live visitors',        'Show the currently-online panel on the dashboard.',          1),
  ('enable_maintenance',  'Maintenance mode',     'Serve the maintenance page to non-admin visitors.',          0),
  ('enable_cookie_notice','Cookie notice',        'Show the cookie/privacy notice bar.',                        0),
  ('enable_backups',      'Scheduled backups',    'Run the nightly database backup job.',                       0)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);

-- -------------------------------------------------------- page sections
INSERT INTO homepage_sections (section_key, label, page_key, title, subtitle, icon_name, is_enabled, is_locked, sort_order) VALUES
  ('about_intro',    'About intro',    'about',    'About me',        NULL, NULL,              1, 1, 10),
  ('services',       'Services',       'about',    'What i''m Pursuing', NULL, NULL,           1, 0, 20),
  ('education',      'Education',      'resume',   'EDUCATION',       NULL, 'book-outline',    1, 0, 10),
  ('experience',     'Experience',     'resume',   'EXPERIENCE',      NULL, 'briefcase-outline', 1, 0, 20),
  ('achievements',   'Achievements',   'resume',   'ACHIEVEMENTS',    NULL, 'trophy-outline',  1, 0, 30),
  ('certifications', 'Certifications', 'resume',   'CERTIFICATIONS',  NULL, 'ribbon-outline',  1, 0, 40),
  ('skills',         'Core Expertise', 'resume',   'Core Expertise',  NULL, NULL,              1, 0, 50),
  ('projects',       'Projects',       'projects', 'Projects',        NULL, NULL,              1, 1, 10),
  ('blog',           'Blog',           'blog',     'Blog',            NULL, NULL,              1, 1, 10),
  ('contact_map',    'Map',            'contact',  NULL,              NULL, NULL,              1, 0, 10),
  ('contact_form',   'Contact form',   'contact',  'Contact Form',    NULL, NULL,              1, 0, 20)
ON DUPLICATE KEY UPDATE label = VALUES(label), page_key = VALUES(page_key), icon_name = VALUES(icon_name);

-- ------------------------------------------------------ theme variables
-- Every var_name below already exists in assets/css/style.css :root.
-- Nothing new is invented; the admin only overrides these values.
INSERT INTO theme_settings (var_name, var_value, default_value, label, description, group_name, input_type, sort_order) VALUES
  ('--orange-yellow-crayola', 'hsl(45, 100%, 72%)', 'hsl(45, 100%, 72%)', 'Primary accent',      'Gold accent used for headings, icons and highlights.', 'colors', 'color', 10),
  ('--vegas-gold',            'hsl(45, 54%, 58%)',  'hsl(45, 54%, 58%)',  'Secondary accent',    'Muted gold used for secondary emphasis.',              'colors', 'color', 20),
  ('--smoky-black',           'hsl(0, 0%, 7%)',     'hsl(0, 0%, 7%)',     'Page background',     'Outermost page background.',                           'colors', 'color', 30),
  ('--eerie-black-1',         'hsl(240, 2%, 13%)',  'hsl(240, 2%, 13%)',  'Card background',     'Sidebar and content card background.',                 'colors', 'color', 40),
  ('--eerie-black-2',         'hsl(240, 2%, 12%)',  'hsl(240, 2%, 12%)',  'Surface background',  'Inner surfaces and inputs.',                           'colors', 'color', 50),
  ('--onyx',                  'hsl(240, 1%, 17%)',  'hsl(240, 1%, 17%)',  'Raised surface',      'Buttons and raised panels.',                           'colors', 'color', 60),
  ('--jet',                   'hsl(0, 0%, 22%)',    'hsl(0, 0%, 22%)',    'Border',              'Separators and card borders.',                         'colors', 'color', 70),
  ('--white-1',               'hsl(0, 0%, 100%)',   'hsl(0, 0%, 100%)',   'Heading text',        'Primary heading colour.',                              'colors', 'color', 80),
  ('--white-2',               'hsl(0, 0%, 98%)',    'hsl(0, 0%, 98%)',    'Strong text',         'Near-white body emphasis.',                            'colors', 'color', 90),
  ('--light-gray',            'hsl(0, 0%, 84%)',    'hsl(0, 0%, 84%)',    'Body text',           'Default paragraph colour.',                            'colors', 'color', 100),
  ('--bittersweet-shimmer',   'hsl(0, 43%, 51%)',   'hsl(0, 43%, 51%)',   'Error / danger',      'Form errors and destructive actions.',                 'colors', 'color', 110),
  ('--ff-poppins',            '''Poppins'', sans-serif', '''Poppins'', sans-serif', 'Font family', 'Site typeface. Changing this may require a new font link.', 'typography', 'font', 120)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), default_value = VALUES(default_value);

-- --------------------------------------------------------- site settings
-- Defaults mirror what index.html currently outputs, so switching the
-- site over to the CMS produces byte-identical head tags.
INSERT INTO site_settings (setting_key, setting_value, value_type, setting_group, label, description, is_secret, is_public, sort_order) VALUES
  -- branding
  ('site_name',              'Arun Sanjeev Portfolio', 'string','branding','Site name','Used in og:site_name and the admin header.',0,1,10),
  ('site_short_name',        'Arun Sanjeev',           'string','branding','Short name','Used where space is tight (manifest, mobile).',0,1,20),
  ('logo_media_id',          '',      'media','branding','Logo','Primary logo.',0,1,30),
  ('logo_light_media_id',    '',      'media','branding','Light logo','Logo for light backgrounds.',0,1,40),
  ('logo_dark_media_id',     '',      'media','branding','Dark logo','Logo for dark backgrounds.',0,1,50),
  ('footer_logo_media_id',   '',      'media','branding','Footer logo','Optional footer mark.',0,1,60),
  ('favicon_media_id',       '',      'media','branding','Favicon (.ico)','Classic favicon.',0,1,70),
  ('favicon_png_media_id',   '',      'media','branding','Favicon (PNG/SVG)','Modern favicon.',0,1,80),
  ('apple_touch_icon_media_id','',    'media','branding','Apple touch icon','180x180 PNG for iOS.',0,1,90),
  ('theme_color',            '#111318','color','branding','Browser theme colour','Sets the meta theme-color tag.',0,1,100),
  -- titles
  ('title_template',         '%page% | %site%','string','titles','Title template','Tokens: %page%, %site%, %name%.',0,1,10),
  ('home_title',             'Arun Sanjeev | MLSA | Full Stack Developer, AI and Cyber Security','string','titles','Home title','Home page uses this verbatim, not the template.',0,1,20),
  ('resume_title',           'Resume',       'string','titles','Resume title','',0,1,30),
  ('projects_title',         'Projects',     'string','titles','Projects title','',0,1,40),
  ('blog_title',             'Blog',         'string','titles','Blog title','',0,1,50),
  ('contact_title',          'Contact',      'string','titles','Contact title','',0,1,60),
  ('error_404_title',        'Page Not Found','string','titles','404 title','',0,1,70),
  ('maintenance_title',      'Be Right Back','string','titles','Maintenance title','',0,1,80),
  -- meta defaults
  ('default_meta_description','Official portfolio of Arun Sanjeev M S - Full Stack Developer, AI Builder, and Cyber Security Enthusiast. Explore projects, certifications, achievements, and leadership journey.','text','meta','Default meta description','Fallback when a page has none.',0,1,10),
  ('default_meta_keywords',  '',      'text','meta','Default keywords','Comma separated.',0,1,20),
  ('default_og_media_id',    '',      'media','meta','Default Open Graph image','1200x630 recommended.',0,1,30),
  ('twitter_card_media_id',  '',      'media','meta','Default X/Twitter image','',0,1,40),
  ('twitter_handle',         '',      'string','meta','X/Twitter handle','Including the @.',0,1,50),
  ('site_author',            'Arun Sanjeev M S','string','meta','Author','meta name="author".',0,1,60),
  ('site_locale',            'en_US', 'string','meta','Locale','og:locale.',0,1,70),
  ('site_language',          'en',    'string','meta','Language','html lang attribute.',0,1,80),
  -- contact
  ('contact_email',          'msarunsanjeev@gmail.com','string','contact','Public email','',0,1,10),
  ('contact_phone',          '+91 94926 33000','string','contact','Public phone','',0,1,20),
  ('contact_address',        'Namakkal, Tamil Nadu, India','text','contact','Address','',0,1,30),
  ('contact_location',       'Namakkal, Tamil Nadu','string','contact','Location label','',0,1,40),
  ('google_maps_url',        'https://maps.google.com/maps?q=namakkal&t=&z=10&ie=UTF8&iwloc=&output=embed','text','contact','Map embed URL','Google Maps embed src.',0,1,50),
  -- footer
  ('footer_text',            '', 'text','footer','Footer text','',0,1,10),
  ('copyright_text',         'Arun Sanjeev','string','footer','Copyright holder','',0,1,20),
  ('copyright_year_start',   '2024','number','footer','Copyright start year','Renders as "2024 - current year".',0,1,30),
  -- site status and maintenance
  ('site_status',            'published','select','status','Website status','published | private | maintenance',0,0,10),
  ('maintenance_message',    'The site is being updated. Please check back shortly.','text','status','Maintenance message','',0,1,20),
  ('maintenance_allow_admin','1','boolean','status','Allow admin during maintenance','Logged-in admins bypass the maintenance page.',0,0,30),
  -- analytics
  ('analytics_retention_days','365','number','analytics','Raw data retention (days)','Raw pageviews older than this are deleted after rollup.',0,0,10),
  ('analytics_exclude_admin','1','boolean','analytics','Exclude logged-in admins','Do not count your own visits.',0,0,20),
  ('analytics_session_minutes','30','number','analytics','Session timeout (minutes)','Inactivity that ends a session.',0,0,30),
  ('live_visitor_window_minutes','5','number','analytics','Live visitor window (minutes)','Activity window for "currently online".',0,0,40),
  -- privacy
  ('cookie_notice_text',     'This site uses privacy-friendly analytics. No personal data is sold or shared.','text','privacy','Cookie notice text','',0,1,10),
  ('privacy_policy_url',     '', 'string','privacy','Privacy policy URL','',0,1,20),
  ('terms_url',              '', 'string','privacy','Terms URL','',0,1,30),
  -- mail (smtp_password is masked in the UI and excluded from exports)
  ('smtp_host',              '', 'string','mail','SMTP host','',0,0,10),
  ('smtp_port',              '587','number','mail','SMTP port','',0,0,20),
  ('smtp_secure',            '0','boolean','mail','Use TLS/SSL','Enable for port 465.',0,0,30),
  ('smtp_user',              '', 'string','mail','SMTP username','',0,0,40),
  ('smtp_password',          '', 'string','mail','SMTP password','Stored encrypted, never shown in full.',1,0,50),
  ('mail_from_name',         'Arun Sanjeev','string','mail','From name','',0,0,60),
  ('mail_from_email',        '', 'string','mail','From email','',0,0,70),
  ('mail_reply_to',          '', 'string','mail','Reply-to','',0,0,80),
  ('notify_on_contact',      '1','boolean','mail','Email me on new message','',0,0,90),
  ('notify_email',           '', 'string','mail','Notification email','Defaults to the public contact email.',0,0,100),
  -- blog
  ('medium_feed_url',        'https://medium.com/feed/@msarunsanjeev','string','blog','Medium RSS feed','Synced server-side and cached.',0,0,10),
  ('medium_profile_url',     'https://medium.com/@msarunsanjeev','string','blog','Medium profile URL','',0,1,20),
  ('medium_sync_hours',      '6','number','blog','Sync interval (hours)','',0,0,30),
  ('blog_posts_per_page',    '6','number','blog','Posts per page','',0,1,40),
  -- integrations (interfaces only - no fake integrations)
  ('github_username',        'arunsanjeevms','string','integrations','GitHub username','',0,1,10),
  ('google_site_verification','','string','integrations','Google site verification','',0,0,20),
  ('bing_site_verification', '', 'string','integrations','Bing site verification','',0,0,30),
  -- security policy
  ('login_max_attempts',     '5','number','security','Max failed logins','Before temporary lockout.',0,0,10),
  ('login_lockout_minutes',  '15','number','security','Lockout duration (minutes)','',0,0,20),
  ('require_2fa_super_admin','0','boolean','security','Require 2FA for Super Admin','',0,0,30)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), value_type = VALUES(value_type), setting_group = VALUES(setting_group), is_secret = VALUES(is_secret), sort_order = VALUES(sort_order);

-- ---------------------------------------------------------- SEO records
INSERT INTO seo_settings (page_key, page_label, meta_title, robots, in_sitemap, sitemap_priority, sitemap_changefreq) VALUES
  ('home',           'Home',              'Arun Sanjeev | MLSA | Full Stack Developer, AI and Cyber Security', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1', 1, 1.0, 'weekly'),
  ('resume',         'Resume',            NULL, 'index, follow', 1, 0.9, 'monthly'),
  ('projects',       'Projects',          NULL, 'index, follow', 1, 0.9, 'weekly'),
  ('project_detail', 'Project detail',    NULL, 'index, follow', 1, 0.7, 'monthly'),
  ('blog',           'Blog',              NULL, 'index, follow', 1, 0.8, 'weekly'),
  ('blog_detail',    'Blog post',         NULL, 'index, follow', 1, 0.7, 'monthly'),
  ('contact',        'Contact',           NULL, 'index, follow', 1, 0.6, 'yearly'),
  ('error_404',      '404',               NULL, 'noindex, follow', 0, 0.1, 'never'),
  ('maintenance',    'Maintenance',       NULL, 'noindex, nofollow', 0, 0.1, 'never')
ON DUPLICATE KEY UPDATE page_label = VALUES(page_label);

-- -------------------------------------------------------- custom code
INSERT IGNORE INTO custom_code (location, code, is_enabled) VALUES
  ('head', NULL, 0), ('body_start', NULL, 0), ('body_end', NULL, 0);
