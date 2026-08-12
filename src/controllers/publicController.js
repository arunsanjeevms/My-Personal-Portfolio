'use strict';

/**
 * Public site.
 *
 * The portfolio is one page with five tabbed panels, which is how the
 * original site worked. Each tab also has a real URL: the server renders
 * the whole page with that tab pre-activated, and the front-end script
 * updates the address bar as tabs are switched. Real URLs for SEO and
 * sharing, identical UX.
 */

const contentService = require('../services/contentService');
const settingsService = require('../services/settingsService');
const seoService = require('../services/seoService');
const blogService = require('../services/blogService');
const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { asyncHandler, NotFoundError } = require('../utils/errors');
const { config } = require('../config/env');

/** Tab key -> canonical URL. */
const PAGE_URLS = {
  about: '/',
  resume: '/resume',
  projects: '/projects',
  blog: '/blog',
  contact: '/contact',
};

/** Tab key -> SEO record key. */
const SEO_KEYS = {
  about: 'home',
  resume: 'resume',
  projects: 'projects',
  blog: 'blog',
  contact: 'contact',
};

/** Resolves the configured favicon settings to URLs. */
async function getFavicons(settings) {
  const ids = [settings.favicon_media_id, settings.favicon_png_media_id, settings.apple_touch_icon_media_id]
    .filter(Boolean);

  if (!ids.length) return { ico: null, png: null, apple: null, pngMime: 'image/png' };

  const media = await contentService.mediaMap(ids);
  const png = media[settings.favicon_png_media_id];

  return {
    ico: media[settings.favicon_media_id]?.url_path || null,
    png: png?.url_path || null,
    pngMime: png?.mime || 'image/png',
    apple: media[settings.apple_touch_icon_media_id]?.url_path || null,
  };
}

/** Custom head/body code, only when explicitly enabled. */
async function getCustomCode() {
  return cache.remember('public:custom-code', 600, async () => {
    const rows = await db.query('SELECT location, code, is_enabled FROM custom_code WHERE is_enabled = 1');
    const map = {};
    for (const row of rows) if (row.code) map[row.location] = row.code;
    return map;
  }).catch(() => ({}));
}

/**
 * Gathers everything the page template needs.
 * All independent queries run concurrently; most are cache hits.
 */
async function buildPageData(req, activePage) {
  const [
    profile, social, navigation, sections, settings, flags,
    services, education, experience, achievements, certifications, skills,
    projects, projectCategories, themeCss, customCode, favicons,
  ] = await Promise.all([
    contentService.getProfile(),
    contentService.getSocialLinks(),
    contentService.getNavigation(),
    contentService.getSections(),
    settingsService.getAll(),
    settingsService.getFlags(),
    contentService.getServices(),
    contentService.getEducation(),
    contentService.getExperience(),
    contentService.getAchievements(),
    contentService.getCertifications(),
    contentService.getSkills(),
    contentService.getProjects(),
    contentService.getProjectCategories(),
    settingsService.getThemeCss(),
    getCustomCode(),
    settingsService.getAll().then(getFavicons),
  ]);

  const posts = flags.show_blog === false ? [] : await blogService.getPublishedPosts(
    Number(settings.blog_posts_per_page) || 6,
  );

  const meta = await seoService.buildMeta(SEO_KEYS[activePage] || 'home', {
    path: PAGE_URLS[activePage] || '/',
  });
  const jsonLd = await seoService.buildJsonLd({ pageKey: activePage });

  // Do not count the site owner's own visits when they are signed in.
  const analyticsEnabled = flags.enable_analytics !== false
    && !(settings.analytics_exclude_admin && req.session?.user);

  return {
    activePage,
    pageUrls: PAGE_URLS,
    profile: profile || { full_name: '', show_email: 0, show_phone: 0, show_birthday: 0, show_location: 0 },
    social, navigation, sections, settings, flags,
    services, education, experience, achievements, certifications, skills,
    projects, projectCategories, posts,
    meta, jsonLd, themeCss, customCode, favicons,
    analyticsEnabled,
    siteUrl: config.siteUrl,
  };
}

/** Renders the portfolio with `activePage` open. */
function renderPage(activePage) {
  return asyncHandler(async (req, res) => {
    const data = await buildPageData(req, activePage);

    // A page with no profile row at all means the CMS was never set up;
    // fall back to the original static file rather than a broken render.
    if (!data.profile.full_name) {
      logger.warn('public: profile is empty, serving the static snapshot');
      return res.sendFile(require('node:path').join(config.rootDir, 'index.html'));
    }

    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.render('public/index', data);
  });
}

const home = renderPage('about');
const resume = renderPage('resume');
const projects = renderPage('projects');
const blog = renderPage('blog');
const contact = renderPage('contact');

/** GET /projects/:slug - feature-flagged detail page. */
const projectDetail = asyncHandler(async (req, res, next) => {
  const enabled = await settingsService.isEnabled('show_project_details', false);
  if (!enabled) return next(new NotFoundError('Project pages are not enabled.'));

  const project = await contentService.getProjectBySlug(req.params.slug);
  if (!project) return next(new NotFoundError('That project could not be found.'));

  const [layout, settings, flags, themeCss, customCode] = await Promise.all([
    contentService.getLayoutData(),
    settingsService.getAll(),
    settingsService.getFlags(),
    settingsService.getThemeCss(),
    getCustomCode(),
  ]);

  const meta = await seoService.buildMeta('project_detail', {
    title: project.seo_title || project.title,
    description: project.seo_description || project.short_description,
    keywords: project.seo_keywords,
    path: `/projects/${project.slug}`,
    image: project.ogImage?.url_path || project.image?.url_path,
    imageAlt: project.image_alt,
    ogType: 'article',
  });

  // Fire-and-forget; a counter must never delay or fail a page render.
  db.query('UPDATE projects SET view_count = view_count + 1 WHERE id = ?', [project.id])
    .catch(() => {});

  res.render('public/project', {
    ...layout,
    project,
    settings,
    flags,
    themeCss,
    customCode,
    favicons: await getFavicons(settings),
    meta,
    jsonLd: await seoService.buildJsonLd({ pageKey: 'project_detail', project }),
    analyticsEnabled: flags.enable_analytics !== false,
    activePage: 'projects',
    pageUrls: PAGE_URLS,
    siteUrl: config.siteUrl,
  });
});

/** GET /resume.pdf - serves the current resume and counts the download. */
const resumeDownload = asyncHandler(async (req, res, next) => {
  const profile = await contentService.getProfile();
  if (!profile?.resume) return next(new NotFoundError('No resume has been uploaded yet.'));

  const media = await db.queryOne('SELECT disk_path, original_name FROM media WHERE id = ?', [profile.resume_media_id]);
  if (!media) return next(new NotFoundError('No resume has been uploaded yet.'));

  db.query('UPDATE profile SET resume_downloads = resume_downloads + 1 WHERE id = 1').catch(() => {});

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('application/pdf');
  return res.sendFile(media.disk_path);
});

/** GET /sitemap.xml */
const sitemap = asyncHandler(async (req, res) => {
  res.type('application/xml').send(await seoService.buildSitemap());
});

/** GET /robots.txt */
const robots = asyncHandler(async (req, res) => {
  res.type('text/plain').send(await seoService.buildRobots());
});

/** GET /site.webmanifest */
const manifest = asyncHandler(async (req, res) => {
  const settings = await settingsService.getAll();
  const favicons = await getFavicons(settings);

  res.type('application/manifest+json').json({
    name: settings.site_name || 'Portfolio',
    short_name: settings.site_short_name || settings.site_name || 'Portfolio',
    start_url: '/',
    display: 'standalone',
    background_color: settings.theme_color || '#111318',
    theme_color: settings.theme_color || '#111318',
    icons: favicons.png ? [{ src: favicons.png, sizes: 'any', type: favicons.pngMime }] : [],
  });
});

module.exports = {
  home, resume, projects, blog, contact,
  projectDetail, resumeDownload,
  sitemap, robots, manifest,
  buildPageData, PAGE_URLS,
};
