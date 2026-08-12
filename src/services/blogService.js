'use strict';

/**
 * Blog: native posts plus a server-side mirror of the Medium feed.
 *
 * The original site fetched Medium from the browser through
 * api.rss2json.com on every visit. That made the blog tab depend on a
 * third-party service at request time, leaked every visitor to it, and
 * showed "Loading latest blog posts…" whenever it was slow.
 *
 * The feed is now fetched on the server on a schedule, parsed, sanitised
 * and cached in blog_posts. The page renders from the database.
 */

const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const settingsService = require('./settingsService');
const contentService = require('./contentService');
const { sanitizeHtml } = require('./resourceService');
const { slugify } = require('../utils/viewHelpers');

const FETCH_TIMEOUT_MS = 10000;

/** Posts for the public blog tab. */
async function getPublishedPosts(limit = 6) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 6, 50));

  return cache.remember(`public:posts:${safeLimit}`, 300, async () => {
    const rows = await db.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.featured_media_id, p.featured_image_url,
              p.source, p.external_url, p.published_at, p.reading_minutes,
              c.name AS category_name
         FROM blog_posts p
         LEFT JOIN blog_categories c ON c.id = p.category_id
        WHERE p.status = 'published'
          AND p.deleted_at IS NULL
          AND (p.published_at IS NULL OR p.published_at <= NOW())
        ORDER BY p.published_at DESC, p.id DESC
        LIMIT ${safeLimit}`,
    );

    const media = await contentService.mediaMap(rows.map((row) => row.featured_media_id));
    return rows.map((row) => ({ ...row, image: media[row.featured_media_id] || null }));
  }).catch((err) => {
    logger.error('blog: could not load posts', { message: err.message });
    return [];
  });
}

async function getPostBySlug(slug) {
  const post = await db.queryOne(
    `SELECT p.*, c.name AS category_name, u.name AS author_name
       FROM blog_posts p
       LEFT JOIN blog_categories c ON c.id = p.category_id
       LEFT JOIN users u ON u.id = p.author_id
      WHERE p.slug = ? AND p.status = 'published' AND p.deleted_at IS NULL
      LIMIT 1`,
    [slug],
  );
  if (!post) return null;

  const media = await contentService.mediaMap([post.featured_media_id, post.og_media_id]);
  return {
    ...post,
    content_html: sanitizeHtml(post.content_html),
    image: media[post.featured_media_id] || null,
    ogImage: media[post.og_media_id] || null,
  };
}

/** Rough reading time at ~200 words per minute. */
function readingMinutes(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Strips tags and collapses whitespace, for excerpts. */
function toPlainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Minimal RSS/Atom item parser.
 *
 * A dedicated XML library would be heavier than the job needs, and this
 * only ever reads a feed the site owner configured. Values are extracted
 * with narrow patterns and everything is sanitised before storage.
 */
function parseFeed(xml) {
  const items = [];
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemPattern) || [];

  const pick = (block, tag) => {
    const cdata = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
    const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    return (block.match(cdata)?.[1] ?? block.match(plain)?.[1] ?? '').trim();
  };

  for (const block of matches) {
    const title = toPlainText(pick(block, 'title'));
    const link = toPlainText(pick(block, 'link'));
    if (!title || !link) continue;

    const description = pick(block, 'description') || pick(block, 'content:encoded');
    const guid = toPlainText(pick(block, 'guid')) || link;
    const pubDate = toPlainText(pick(block, 'pubDate'));

    // Medium puts the hero image in the content HTML.
    const imageMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);

    items.push({
      title,
      link,
      guid,
      pubDate: pubDate ? new Date(pubDate) : null,
      description,
      image: imageMatch?.[1] || null,
      categories: (block.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || [])
        .map((tag) => toPlainText(tag.replace(/<\/?category[^>]*>/gi, ''))),
    });
  }

  return items;
}

/**
 * Fetches the configured Medium feed and upserts each item.
 *
 * Idempotent: external_guid carries a unique constraint, so re-running
 * updates rather than duplicating.
 *
 * @returns {Promise<{fetched: number, created: number, updated: number}>}
 */
async function syncMediumFeed({ force = false } = {}) {
  const settings = await settingsService.getAll();
  const flags = await settingsService.getFlags();

  if (!force && flags.enable_medium_sync === false) {
    return { skipped: true, reason: 'Medium sync is disabled.' };
  }

  const feedUrl = settings.medium_feed_url;
  if (!feedUrl) return { skipped: true, reason: 'No Medium feed URL is configured.' };

  let xml;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PortfolioCMS/2.0 (+feed sync)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Feed responded ${response.status}`);
    xml = await response.text();
  } catch (err) {
    logger.warn('blog: medium feed fetch failed', { message: err.message });
    return { error: err.message, fetched: 0, created: 0, updated: 0 };
  }

  const items = parseFeed(xml);
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const excerptText = toPlainText(item.description);
    const excerpt = excerptText.length > 300 ? `${excerptText.slice(0, 297)}...` : excerptText;

    const existing = await db.queryOne(
      'SELECT id FROM blog_posts WHERE external_guid = ? LIMIT 1',
      [item.guid],
    );

    if (existing) {
      await db.query(
        `UPDATE blog_posts
            SET title = ?, excerpt = ?, external_url = ?, featured_image_url = ?,
                published_at = ?, reading_minutes = ?
          WHERE id = ?`,
        [
          item.title, excerpt, item.link, item.image,
          item.pubDate, readingMinutes(excerptText), existing.id,
        ],
      );
      updated += 1;
      continue;
    }

    // Keep slugs unique against native posts that may share a title.
    let slug = slugify(item.title) || `medium-${Date.now()}`;
    const clash = await db.queryOne('SELECT id FROM blog_posts WHERE slug = ? LIMIT 1', [slug]);
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;

    await db.query(
      `INSERT INTO blog_posts
         (title, slug, excerpt, source, external_url, external_guid, featured_image_url,
          status, published_at, reading_minutes)
       VALUES (?, ?, ?, 'medium', ?, ?, ?, 'published', ?, ?)`,
      [
        item.title, slug, excerpt, item.link, item.guid, item.image,
        item.pubDate, readingMinutes(excerptText),
      ],
    );
    created += 1;
  }

  cache.invalidatePrefix('public:posts');
  logger.info('blog: medium sync complete', { fetched: items.length, created, updated });

  return { fetched: items.length, created, updated };
}

module.exports = {
  getPublishedPosts,
  getPostBySlug,
  syncMediumFeed,
  parseFeed,
  toPlainText,
  readingMinutes,
};
