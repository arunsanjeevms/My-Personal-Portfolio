'use strict';

/**
 * Functional tests: public pages, CRUD, contact form and analytics.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startServer, stopServer, createClient, signIn, resetAuthThrottle, db,
} = require('./helpers');

const seoService = require('../src/services/seoService');
const blogService = require('../src/services/blogService');
const contactController = require('../src/controllers/contactController');
const analyticsService = require('../src/services/analyticsService');
const domainService = require('../src/services/domainService');
const viewHelpers = require('../src/utils/viewHelpers');

const ADMIN_USER = { identifier: 'arun', password: 'CorrectHorse42Battery' };

test.before(async () => {
  await startServer();
  // Clear brute-force counters left by earlier runs.
  await resetAuthThrottle();
});
test.after(async () => { await stopServer(); });

/* =================================================== public pages */

test('every public route renders', async () => {
  const client = createClient();

  for (const path of ['/', '/resume', '/projects', '/blog', '/contact']) {
    const response = await client.request(path);
    assert.equal(response.status, 200, `${path} should render`);
    assert.match(response.body, /<\/html>/, `${path} should return a complete document`);
  }
});

test('the home page renders content from the database', async () => {
  const client = createClient();
  const response = await client.request('/');

  const profile = await db.queryOne('SELECT full_name, professional_title FROM profile WHERE id = 1');

  assert.match(response.body, new RegExp(profile.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(response.body, /data-page="about"/);
  assert.match(response.body, /class="sidebar"/);
});

test('each tab URL activates the right panel', async () => {
  const client = createClient();

  const cases = [['/', 'about'], ['/resume', 'resume'], ['/projects', 'projects'], ['/contact', 'contact']];

  for (const [path, page] of cases) {
    const response = await client.request(path);
    assert.match(
      response.body,
      new RegExp(`class="[^"]*\\bactive\\b[^"]*"\\s+data-page="${page}"`),
      `${path} should open the ${page} panel`,
    );
  }
});

test('the rendered project count matches the database', async () => {
  const client = createClient();
  const response = await client.request('/projects');

  const expected = Number(await db.queryValue(
    "SELECT COUNT(*) AS total FROM projects WHERE status = 'published' AND deleted_at IS NULL",
  ));

  const rendered = (response.body.match(/class="project-item active"/g) || []).length;
  assert.equal(rendered, expected, 'every published project should render');
});

test('sitemap.xml and robots.txt are generated', async () => {
  const client = createClient();

  const sitemap = await client.request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.body, /<urlset/);
  assert.match(sitemap.body, /<loc>/);

  const robots = await client.request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.body, /User-agent/);
  assert.match(robots.body, /Sitemap:/);
});

test('SEO meta tags come from the database', async () => {
  const client = createClient();
  const response = await client.request('/');

  assert.match(response.body, /<meta name="description" content="[^"]+"/);
  assert.match(response.body, /<meta property="og:title"/);
  assert.match(response.body, /<meta name="twitter:card"/);
  assert.match(response.body, /<link rel="canonical"/);
  assert.match(response.body, /application\/ld\+json/);
});

test('JSON-LD is valid JSON with the expected shape', async () => {
  const client = createClient();
  const response = await client.request('/');

  const match = response.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'structured data should be present');

  const data = JSON.parse(match[1]);
  assert.equal(data['@context'], 'https://schema.org');
  assert.ok(Array.isArray(data['@graph']));
  assert.ok(data['@graph'].some((node) => node['@type'] === 'Person'));
  assert.ok(data['@graph'].some((node) => node['@type'] === 'WebSite'));
});

test('healthz reports database connectivity', async () => {
  const client = createClient();
  const response = await client.request('/healthz');

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'ok');
  assert.equal(body.database, true);
  // The probe must not expose configuration.
  assert.ok(!('password' in body) && !('host' in body));
});

/* ========================================================== CRUD */

test('a project can be created, edited and deleted through the admin', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const slug = `test-project-${Date.now()}`;

  // Create
  const created = await client.postForm('/admin/projects', {
    title: 'Automated Test Project',
    slug,
    category_label: 'Testing',
    short_description: 'Created by the test suite.',
    status: 'published',
  }, { tokenFrom: '/admin/projects/new' });

  assert.equal(created.status, 302, 'creating should redirect');

  const row = await db.queryOne('SELECT * FROM projects WHERE slug = ?', [slug]);
  assert.ok(row, 'the project should exist');
  assert.equal(row.title, 'Automated Test Project');

  // Update
  const updated = await client.postForm(`/admin/projects/${row.id}`, {
    title: 'Renamed Test Project',
    slug,
    status: 'published',
  }, { tokenFrom: `/admin/projects/${row.id}/edit` });

  assert.equal(updated.status, 302);
  const after = await db.queryOne('SELECT title FROM projects WHERE id = ?', [row.id]);
  assert.equal(after.title, 'Renamed Test Project');

  // Delete (soft)
  const deleted = await client.postForm(`/admin/projects/${row.id}/delete`, {},
    { tokenFrom: '/admin/projects' });
  assert.equal(deleted.status, 302);

  const removed = await db.queryOne('SELECT deleted_at FROM projects WHERE id = ?', [row.id]);
  assert.ok(removed.deleted_at, 'the project should be soft-deleted');

  // Clean up for real.
  await db.query('DELETE FROM projects WHERE id = ?', [row.id]);
});

test('creating a project with a duplicate slug is rejected', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const existing = await db.queryOne(
    'SELECT slug FROM projects WHERE deleted_at IS NULL LIMIT 1',
  );

  const response = await client.postForm('/admin/projects', {
    title: 'Duplicate Slug Test',
    slug: existing.slug,
    status: 'published',
  }, { tokenFrom: '/admin/projects/new' });

  assert.equal(response.status, 400);
  assert.match(response.body, /already used/i);
});

test('a required field is enforced', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const response = await client.postForm('/admin/projects', {
    title: '',
    slug: 'missing-title-test',
  }, { tokenFrom: '/admin/projects/new' });

  assert.equal(response.status, 400);
  assert.match(response.body, /is required/i);

  const row = await db.queryOne('SELECT id FROM projects WHERE slug = ?', ['missing-title-test']);
  assert.equal(row, null, 'nothing should have been written');
});

test('an admin write is recorded in the activity log', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const before = Number(await db.queryValue('SELECT COUNT(*) AS total FROM activity_logs'));

  const slug = `audit-test-${Date.now()}`;
  await client.postForm('/admin/projects', {
    title: 'Audit Test', slug, status: 'draft',
  }, { tokenFrom: '/admin/projects/new' });

  const after = Number(await db.queryValue('SELECT COUNT(*) AS total FROM activity_logs'));
  assert.ok(after > before, 'the action should be logged');

  const entry = await db.queryOne(
    "SELECT * FROM activity_logs WHERE action = 'projects.create' ORDER BY id DESC LIMIT 1",
  );
  assert.match(entry.description, /Audit Test/);
  assert.ok(entry.ip_hash, 'the actor IP hash should be recorded');

  await db.query('DELETE FROM projects WHERE slug = ?', [slug]);
});

/* ================================================== contact form */

test('the contact form stores a genuine message', async () => {
  const client = createClient();

  const response = await client.postForm('/contact', {
    fullname: 'Test Sender',
    email: 'sender@example.test',
    subject: 'Test enquiry',
    message: 'This is a legitimate message sent by the automated test suite.',
  }, { tokenFrom: '/contact' });

  assert.equal(response.status, 200);
  assert.match(response.body, /message has been sent/i);

  const row = await db.queryOne(
    'SELECT * FROM contact_messages WHERE email = ? ORDER BY id DESC LIMIT 1',
    ['sender@example.test'],
  );
  assert.ok(row);
  assert.equal(row.status, 'unread');
  assert.ok(row.ip_hash, 'an IP hash should be stored');
  assert.equal(row.ip_hash.length, 64, 'and it should be a sha256 digest');

  await db.query('DELETE FROM contact_messages WHERE id = ?', [row.id]);
});

test('the honeypot silently discards bot submissions', async () => {
  const client = createClient();
  const before = Number(await db.queryValue('SELECT COUNT(*) AS total FROM contact_messages'));

  const response = await client.postForm('/contact', {
    fullname: 'Spam Bot',
    email: 'bot@spam.test',
    message: 'Buy cheap things at my site.',
    website: 'https://spam.example',   // the honeypot
  }, { tokenFrom: '/contact' });

  // The bot is told it succeeded so it does not learn it was caught.
  assert.equal(response.status, 200);
  assert.match(response.body, /has been sent/i);

  const after = Number(await db.queryValue('SELECT COUNT(*) AS total FROM contact_messages'));
  assert.equal(after, before, 'nothing should have been stored');
});

test('spam scoring flags obvious spam and passes real messages', () => {
  const spam = contactController.scoreSpam({
    name: '12345',
    email: 'x@y.com',
    subject: '',
    message: 'casino crypto investment https://a.com https://b.com https://c.com https://d.com buy followers',
  });
  assert.ok(spam >= 60, `obvious spam should score high, got ${spam}`);

  const genuine = contactController.scoreSpam({
    name: 'Priya Sharma',
    email: 'priya@example.com',
    subject: 'Collaboration',
    message: 'Hi Arun, I saw your hackathon projects and would like to talk about working together.',
  });
  assert.ok(genuine < 40, `a genuine message should score low, got ${genuine}`);
});

test('contact form validation rejects bad input', async () => {
  const client = createClient();

  const response = await client.postForm('/contact', {
    fullname: 'A',
    email: 'not-an-email',
    message: 'short',
  }, { tokenFrom: '/contact' });

  assert.equal(response.status, 400);
});

/* ==================================================== analytics */

test('the analytics beacon records a pageview without a CSRF token', async () => {
  const client = createClient();
  const before = Number(await db.queryValue('SELECT COUNT(*) AS total FROM analytics_pageviews'));

  const response = await client.request('/api/analytics/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/test-page', title: 'Test', pageKey: 'about' }),
  });

  assert.equal(response.status, 204);

  const after = Number(await db.queryValue('SELECT COUNT(*) AS total FROM analytics_pageviews'));
  assert.ok(after > before, 'the pageview should be recorded');

  await db.query("DELETE FROM analytics_pageviews WHERE path = '/test-page'");
});

test('user-agent parsing classifies devices and bots', () => {
  const bot = analyticsService.parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)');
  assert.equal(bot.device, 'bot');

  const mobile = analyticsService.parseUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
  );
  assert.equal(mobile.device, 'mobile');
  assert.equal(mobile.os, 'iOS');

  const desktop = analyticsService.parseUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  );
  assert.equal(desktop.device, 'desktop');
  assert.equal(desktop.browser, 'Chrome');
  assert.equal(desktop.os, 'Windows');
});

test('referrer classification buckets traffic sources', () => {
  assert.equal(analyticsService.classifyReferrer(null, 'example.com'), 'direct');
  assert.equal(analyticsService.classifyReferrer('www.google.com', 'example.com'), 'search');
  assert.equal(analyticsService.classifyReferrer('www.linkedin.com', 'example.com'), 'social');
  assert.equal(analyticsService.classifyReferrer('example.com', 'example.com'), 'internal');
  assert.equal(analyticsService.classifyReferrer('some-blog.net', 'example.com'), 'referral');
});

/* ======================================================= services */

test('the title template substitutes its tokens', () => {
  const built = seoService.applyTemplate('%page% | %site%', {
    page: 'Projects', site: 'Arun Sanjeev', name: 'Arun',
  });
  assert.equal(built, 'Projects | Arun Sanjeev');

  const reversed = seoService.applyTemplate('%name% · %page%', {
    page: 'Contact', site: 'Portfolio', name: 'Arun Sanjeev',
  });
  assert.equal(reversed, 'Arun Sanjeev · Contact');
});

test('the RSS parser extracts feed items', () => {
  const feed = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[My First Post]]></title>
      <link>https://medium.com/@user/first-post-abc123</link>
      <guid>https://medium.com/p/abc123</guid>
      <pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<img src="https://cdn.example/hero.jpg"><p>Some content here.</p>]]></description>
    </item>
  </channel></rss>`;

  const items = blogService.parseFeed(feed);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'My First Post');
  assert.equal(items[0].guid, 'https://medium.com/p/abc123');
  assert.equal(items[0].image, 'https://cdn.example/hero.jpg');
  assert.ok(items[0].pubDate instanceof Date);
});

test('domain expiry levels map correctly', () => {
  assert.equal(domainService.expiryLevel(-1), 'expired');
  assert.equal(domainService.expiryLevel(3), 'critical');
  assert.equal(domainService.expiryLevel(20), 'warning');
  assert.equal(domainService.expiryLevel(60), 'notice');
  assert.equal(domainService.expiryLevel(200), 'ok');
  assert.equal(domainService.expiryLevel(null), 'unknown');
});

test('view helpers format predictably', () => {
  assert.equal(viewHelpers.slugify('Hello World! & Friends'), 'hello-world-friends');
  assert.equal(viewHelpers.initials('Arun Sanjeev'), 'AS');
  assert.equal(viewHelpers.formatBytes(1536), '1.5 KB');
  assert.equal(viewHelpers.formatDuration(90), '1m 30s');
  assert.equal(viewHelpers.truncate('abcdefghij', 5), 'abcd…');
  assert.equal(viewHelpers.escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('safeRedirectPath blocks open redirects', () => {
  const { safeRedirectPath } = require('../src/utils/request');

  assert.equal(safeRedirectPath('/admin/projects', '/fallback'), '/admin/projects');
  assert.equal(safeRedirectPath('https://evil.example', '/fallback'), '/fallback');
  assert.equal(safeRedirectPath('//evil.example', '/fallback'), '/fallback');
  assert.equal(safeRedirectPath('/\\evil.example', '/fallback'), '/fallback');
  assert.equal(safeRedirectPath('', '/fallback'), '/fallback');
});

/* ======================================================= caching */

test('a content write invalidates the public cache', async () => {
  const cache = require('../src/utils/cache');
  const contentService = require('../src/services/contentService');

  await contentService.getProjects();
  assert.ok(cache.get('public:projects'), 'projects should now be cached');

  contentService.invalidate();
  assert.equal(cache.get('public:projects'), undefined, 'the cache should have been cleared');
});
