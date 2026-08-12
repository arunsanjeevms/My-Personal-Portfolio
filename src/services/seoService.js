'use strict';

/**
 * SEO: page titles, meta tags, structured data, sitemap and robots.
 *
 * Everything the original index.html hardcoded in <head> is generated
 * here from the database instead.
 */

const db = require('../config/database');
const cache = require('../utils/cache');
const settingsService = require('./settingsService');
const contentService = require('./contentService');
const logger = require('../utils/logger');
const { config } = require('../config/env');

/**
 * Applies the configured title template.
 * Tokens: %page%, %site%, %name%
 */
function applyTemplate(template, { page, site, name }) {
  if (!page) return site || name || '';
  if (!template) return `${page} | ${site}`;

  return template
    .replace(/%page%/g, page)
    .replace(/%site%/g, site || '')
    .replace(/%name%/g, name || '')
    .trim();
}

async function getPageSeo(pageKey) {
  return cache.remember(`public:seo:${pageKey}`, 600, async () => {
    const row = await db.queryOne('SELECT * FROM seo_settings WHERE page_key = ?', [pageKey]);
    if (!row) return null;

    const media = await contentService.mediaMap([row.og_media_id, row.twitter_media_id]);
    return {
      ...row,
      ogImage: media[row.og_media_id] || null,
      twitterImage: media[row.twitter_media_id] || null,
    };
  });
}

/**
 * Builds the complete <head> data for a page.
 *
 * @param {string} pageKey  home | resume | projects | blog | contact | ...
 * @param {object} [overrides] per-record values (a project or post)
 */
async function buildMeta(pageKey, overrides = {}) {
  const [settings, seo, profile] = await Promise.all([
    settingsService.getAll(),
    getPageSeo(pageKey),
    contentService.getProfile(),
  ]);

  const siteName = settings.site_name || 'Portfolio';
  const ownerName = profile?.full_name || settings.site_author || siteName;

  // The home page uses its configured title verbatim; every other page
  // runs through the template so they stay consistent.
  const pageTitleSetting = settings[`${pageKey}_title`];
  let title;
  if (overrides.title) {
    title = applyTemplate(settings.title_template, { page: overrides.title, site: siteName, name: ownerName });
  } else if (pageKey === 'home') {
    title = settings.home_title || siteName;
  } else {
    title = applyTemplate(settings.title_template, {
      page: seo?.meta_title || pageTitleSetting || pageKey,
      site: siteName,
      name: ownerName,
    });
  }

  const description = overrides.description
    || seo?.meta_description
    || settings.default_meta_description
    || profile?.short_bio
    || '';

  const canonical = overrides.canonical
    || seo?.canonical_url
    || `${config.siteUrl}${overrides.path || '/'}`;

  const imageUrl = overrides.image
    || seo?.ogImage?.url_path
    || (profile?.photo?.url_path ?? null);

  return {
    title,
    description,
    keywords: overrides.keywords || seo?.meta_keywords || settings.default_meta_keywords || '',
    canonical,
    robots: seo?.robots || 'index, follow',
    author: settings.site_author || ownerName,
    themeColor: settings.theme_color || '#111318',
    locale: settings.site_locale || 'en_US',
    language: settings.site_language || 'en',
    siteName,
    og: {
      type: overrides.ogType || 'website',
      title: overrides.title ? title : (seo?.og_title || title),
      description: seo?.og_description || description,
      url: canonical,
      image: imageUrl ? absoluteUrl(imageUrl) : null,
      imageAlt: overrides.imageAlt || profile?.photo_alt || ownerName,
    },
    twitter: {
      card: seo?.twitter_card || 'summary_large_image',
      title: seo?.twitter_title || title,
      description: seo?.twitter_description || description,
      image: absoluteUrl(seo?.twitterImage?.url_path || imageUrl),
      handle: settings.twitter_handle || null,
    },
    verification: {
      google: settings.google_site_verification || null,
      bing: settings.bing_site_verification || null,
    },
  };
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${config.siteUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/**
 * schema.org JSON-LD, generated from the database rather than hardcoded.
 * Mirrors the @graph structure the original site used.
 */
async function buildJsonLd({ pageKey = 'home', project = null, post = null } = {}) {
  try {
    const [profile, social, settings, education] = await Promise.all([
      contentService.getProfile(),
      contentService.getSocialLinks(),
      settingsService.getAll(),
      contentService.getEducation(),
    ]);

    if (!profile) return null;

    const siteUrl = config.siteUrl;
    const sameAs = social.filter((link) => link.include_in_jsonld).map((link) => link.url);
    const primaryEducation = education[0];

    const person = {
      '@type': 'Person',
      '@id': `${siteUrl}/#person`,
      name: profile.full_name,
      alternateName: profile.display_name || undefined,
      url: `${siteUrl}/`,
      image: profile.photo ? absoluteUrl(profile.photo.url_path) : undefined,
      description: profile.short_bio || undefined,
      jobTitle: profile.professional_title || undefined,
      email: profile.show_email && profile.email ? `mailto:${profile.email}` : undefined,
      sameAs: sameAs.length ? sameAs : undefined,
    };

    if (primaryEducation) {
      person.alumniOf = {
        '@type': 'CollegeOrUniversity',
        name: primaryEducation.institution,
        url: primaryEducation.website || undefined,
      };
    }

    const graph = [
      person,
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: settings.site_name || profile.full_name,
        publisher: { '@id': `${siteUrl}/#person` },
        inLanguage: settings.site_language || 'en',
      },
      {
        '@type': 'ProfilePage',
        '@id': `${siteUrl}/#profilepage`,
        url: `${siteUrl}/`,
        name: `${profile.display_name || profile.full_name} - Portfolio`,
        mainEntity: { '@id': `${siteUrl}/#person` },
        isPartOf: { '@id': `${siteUrl}/#website` },
      },
    ];

    if (project) {
      graph.push({
        '@type': 'CreativeWork',
        '@id': `${siteUrl}/projects/${project.slug}#project`,
        name: project.title,
        description: project.short_description || undefined,
        url: `${siteUrl}/projects/${project.slug}`,
        image: project.image ? absoluteUrl(project.image.url_path) : undefined,
        author: { '@id': `${siteUrl}/#person` },
      });
    }

    if (post) {
      graph.push({
        '@type': 'Article',
        '@id': `${siteUrl}/blog/${post.slug}#article`,
        headline: post.title,
        description: post.excerpt || undefined,
        datePublished: post.published_at || undefined,
        author: { '@id': `${siteUrl}/#person` },
        mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
      });
    }

    // Drop undefined keys so the emitted JSON stays clean.
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, (key, value) =>
      (value === undefined ? undefined : value), 2);

    // This string is written inside a <script> element. JSON escaping
    // alone does not stop a "</script>" sequence in any field from
    // closing the tag early and turning the rest into markup, so the
    // characters that could form a tag are escaped as unicode. The JSON
    // parses identically.
    return json
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  } catch (err) {
    logger.error('seo: json-ld generation failed', { message: err.message });
    return null;
  }
}

/** Generates sitemap.xml from the database. */
async function buildSitemap() {
  return cache.remember('public:sitemap', 3600, async () => {
    const [seoRows, projects, flags] = await Promise.all([
      db.query('SELECT page_key, sitemap_priority, sitemap_changefreq FROM seo_settings WHERE in_sitemap = 1'),
      contentService.getProjects(),
      settingsService.getFlags(),
    ]);

    const pathFor = {
      home: '/', resume: '/resume', projects: '/projects', blog: '/blog', contact: '/contact',
    };

    const urls = [];

    for (const row of seoRows) {
      const urlPath = pathFor[row.page_key];
      if (!urlPath) continue;
      if (row.page_key === 'blog' && flags.show_blog === false) continue;
      if (row.page_key === 'contact' && flags.show_contact === false) continue;

      urls.push({
        loc: `${config.siteUrl}${urlPath}`,
        priority: Number(row.sitemap_priority).toFixed(1),
        changefreq: row.sitemap_changefreq,
      });
    }

    if (flags.show_project_details) {
      const detail = seoRows.find((row) => row.page_key === 'project_detail');
      for (const project of projects) {
        urls.push({
          loc: `${config.siteUrl}/projects/${project.slug}`,
          priority: detail ? Number(detail.sitemap_priority).toFixed(1) : '0.7',
          changefreq: detail?.sitemap_changefreq || 'monthly',
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const body = urls.map((url) => [
      '  <url>',
      `    <loc>${escapeXml(url.loc)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${url.changefreq}</changefreq>`,
      `    <priority>${url.priority}</priority>`,
      '  </url>',
    ].join('\n')).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Generates robots.txt, respecting the site's published state. */
async function buildRobots() {
  const settings = await settingsService.getAll();
  const isPublic = settings.site_status === 'published';

  if (!isPublic) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

function invalidate() {
  cache.invalidatePrefix('public:seo');
  cache.del('public:sitemap');
}

module.exports = {
  buildMeta,
  buildJsonLd,
  buildSitemap,
  buildRobots,
  getPageSeo,
  applyTemplate,
  absoluteUrl,
  invalidate,
};
