'use strict';

/** Public blog post pages. */

const blogService = require('../services/blogService');
const contentService = require('../services/contentService');
const settingsService = require('../services/settingsService');
const seoService = require('../services/seoService');
const db = require('../config/database');
const { asyncHandler, NotFoundError } = require('../utils/errors');
const { config } = require('../config/env');

/** GET /blog/:slug */
const detail = asyncHandler(async (req, res, next) => {
  const flags = await settingsService.getFlags();
  if (flags.show_blog === false) return next(new NotFoundError('The blog is not available.'));

  const post = await blogService.getPostBySlug(req.params.slug);
  if (!post) return next(new NotFoundError('That post could not be found.'));

  // Medium posts are mirrors, not copies - send the reader to the original.
  if (post.source === 'medium' && post.external_url) {
    return res.redirect(302, post.external_url);
  }

  const [layout, settings, themeCss] = await Promise.all([
    contentService.getLayoutData(),
    settingsService.getAll(),
    settingsService.getThemeCss(),
  ]);

  const meta = await seoService.buildMeta('blog_detail', {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt,
    keywords: post.seo_keywords,
    path: `/blog/${post.slug}`,
    image: post.ogImage?.url_path || post.image?.url_path,
    ogType: 'article',
  });

  db.query('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?', [post.id]).catch(() => {});

  res.render('public/post', {
    ...layout,
    post,
    settings,
    flags,
    themeCss,
    customCode: {},
    favicons: { ico: null, png: null, apple: null, pngMime: 'image/png' },
    meta,
    jsonLd: await seoService.buildJsonLd({ pageKey: 'blog_detail', post }),
    analyticsEnabled: flags.enable_analytics !== false,
    activePage: 'blog',
    pageUrls: require('./publicController').PAGE_URLS,
    siteUrl: config.siteUrl,
  });
});

module.exports = { detail };
