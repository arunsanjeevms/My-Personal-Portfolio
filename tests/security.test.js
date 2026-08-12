'use strict';

/**
 * Security tests.
 *
 * These assert the properties that matter most: that authentication
 * cannot be bypassed, that authorisation is enforced server-side, that
 * hostile input reaches the database only as bound parameters, and that
 * uploads are judged by their content rather than their name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startServer, stopServer, createClient, signIn,
  createTestUser, deleteTestUser, resetAuthThrottle, db,
} = require('./helpers');

const mediaService = require('../src/services/mediaService');
const resourceService = require('../src/services/resourceService');
const { hashIp, dailyVisitorHash, encrypt, decrypt, safeCompare } = require('../src/utils/crypto');
const authService = require('../src/services/authService');

test.before(async () => {
  await startServer();
  // Clear brute-force counters left by earlier runs.
  await resetAuthThrottle();
});
test.after(async () => { await stopServer(); });

/* ==================================================== authentication */

test('admin pages redirect to login when signed out', async () => {
  const client = createClient();

  for (const path of ['/admin/dashboard', '/admin/projects', '/admin/settings', '/admin/media']) {
    const response = await client.request(path);
    assert.equal(response.status, 302, `${path} should redirect`);
    assert.match(response.location, /\/admin\/login/, `${path} should go to the login page`);
  }
});

test('login rejects a wrong password with a generic message', async () => {
  const client = createClient();
  const token = await client.csrfToken('/admin/login');

  const response = await client.postForm('/admin/login',
    { identifier: 'arun', password: 'definitely-not-the-password' }, { token });

  assert.equal(response.status, 401);
  assert.match(response.body, /Incorrect email or password/);
  // The message must not reveal whether the account exists.
  assert.doesNotMatch(response.body, /no such user|unknown account|user not found/i);
});

test('login rejects an unknown account with the same message', async () => {
  const client = createClient();
  const token = await client.csrfToken('/admin/login');

  const response = await client.postForm('/admin/login',
    { identifier: 'nobody@nowhere.test', password: 'whatever-password' }, { token });

  assert.equal(response.status, 401);
  assert.match(response.body, /Incorrect email or password/);
});

test('a state-changing POST without a CSRF token is refused', async () => {
  const client = createClient();

  const response = await client.request('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'identifier=arun&password=whatever',
  });

  assert.equal(response.status, 403);
});

test('a CSRF token from one session cannot be used by another', async () => {
  const first = createClient();
  const second = createClient();

  const stolenToken = await first.csrfToken('/admin/login');
  await second.request('/admin/login');   // gives the second client its own session

  const response = await second.postForm('/admin/login',
    { identifier: 'arun', password: 'whatever' }, { token: stolenToken });

  assert.equal(response.status, 403);
});

/* ===================================================== authorisation */

test('an editor cannot reach settings-gated routes', async () => {
  const user = await createTestUser({ roleSlug: 'editor' });

  try {
    const client = createClient();
    const login = await signIn(client, { identifier: user.email, password: user.password });
    assert.equal(login.status, 302, 'the editor should be able to sign in');

    // Allowed for an editor.
    const projects = await client.request('/admin/projects');
    assert.equal(projects.status, 200);

    // Requires manage_settings / manage_backups / manage_users.
    for (const path of ['/admin/settings', '/admin/system', '/admin/backups', '/admin/domain']) {
      const response = await client.request(path);
      assert.equal(response.status, 403, `${path} should be forbidden for an editor`);
    }
  } finally {
    await deleteTestUser(user.id);
  }
});

test('a viewer cannot write content', async () => {
  const user = await createTestUser({ roleSlug: 'viewer' });

  try {
    const client = createClient();
    await signIn(client, { identifier: user.email, password: user.password });

    const response = await client.request('/admin/projects');
    assert.equal(response.status, 403, 'a viewer has no manage_projects permission');
  } finally {
    await deleteTestUser(user.id);
  }
});

/* ==================================================== SQL injection */

test('injection payloads in the login field do not execute', async () => {
  const payloads = [
    "admin' OR '1'='1",
    "' OR 1=1--",
    "admin'; DROP TABLE users;--",
    '" OR ""="',
    "' UNION SELECT 1,2,3,4,5,6,7,8,9,10--",
    "'; UPDATE users SET role_id=1;--",
  ];

  for (const payload of payloads) {
    const client = createClient();
    const token = await client.csrfToken('/admin/login');
    const response = await client.postForm('/admin/login',
      { identifier: payload, password: 'x' }, { token });

    assert.ok([401, 400, 429].includes(response.status),
      `payload "${payload}" should be rejected, got ${response.status}`);
  }

  // The table is still there and still populated.
  const count = await db.queryValue('SELECT COUNT(*) AS total FROM users');
  assert.ok(Number(count) > 0, 'the users table must survive');
});

test('injection payloads in query parameters do not execute', async () => {
  const client = createClient();
  await signIn(client, { identifier: 'arun', password: 'CorrectHorse42Battery' });

  const payloads = [
    "?q=' OR 1=1--",
    '?page=1;DROP TABLE projects',
    '?orderBy=id;DELETE FROM projects',
    '?category_id=1 OR 1=1',
  ];

  for (const payload of payloads) {
    const response = await client.request(`/admin/projects${payload}`);
    assert.ok([200, 400].includes(response.status),
      `"${payload}" should be handled safely, got ${response.status}`);
  }

  const count = await db.queryValue('SELECT COUNT(*) AS total FROM projects');
  assert.ok(Number(count) > 0, 'the projects table must survive');
});

test('the repository rejects an unknown column instead of interpolating it', async () => {
  const resourceRepository = require('../src/repositories/resourceRepository');
  const repository = resourceRepository.forResource('projects');

  assert.throws(() => repository.assertColumn('id; DROP TABLE users'), /Unknown field/);
  assert.throws(() => repository.buildOrderBy('id; DELETE FROM projects'), /Unknown field/);
  assert.throws(() => repository.buildWhere({ 'title; DROP TABLE x': 'y' }), /Unknown field/);
});

/* ============================================================== XSS */

test('the sanitiser strips scripts and event handlers', async () => {
  const cases = [
    ['<script>alert(1)</script>', /script/i],
    ['<img src=x onerror="alert(1)">', /onerror/i],
    ['<a href="javascript:alert(1)">click</a>', /javascript:/i],
    ['<iframe src="https://evil.example"></iframe>', /iframe/i],
    ['<div onclick="steal()">text</div>', /onclick/i],
    ['<style>body{display:none}</style>', /style/i],
  ];

  for (const [input, forbidden] of cases) {
    const output = resourceService.sanitizeHtml(input) || '';
    assert.doesNotMatch(output, forbidden, `"${input}" should be neutralised, got "${output}"`);
  }
});

test('the sanitiser keeps legitimate formatting', () => {
  const output = resourceService.sanitizeHtml(
    '<p>Hello <b>world</b> and <i>others</i></p><ul><li>one</li></ul>',
  );

  assert.match(output, /<p>/);
  assert.match(output, /<b>/);
  assert.match(output, /<li>/);
});

test('a safe link survives sanitising and gains rel=noopener', () => {
  const output = resourceService.sanitizeHtml('<a href="https://example.com">link</a>');
  assert.match(output, /href="https:\/\/example\.com"/);
  assert.match(output, /rel="noopener noreferrer"/);
});

/* =================================================== file uploads */

test('upload type detection reads magic bytes, not the filename', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12)]);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(12)]);

  assert.equal(mediaService.sniffType(png), 'png');
  assert.equal(mediaService.sniffType(jpeg), 'jpeg');
  assert.equal(mediaService.sniffType(pdf), 'pdf');

  // A PHP web shell named "photo.png" is still rejected: the name is
  // never consulted, only the bytes.
  const webshell = Buffer.from('<?php system($_GET["c"]); ?>                ');
  assert.equal(mediaService.sniffType(webshell), null);

  // Same for a Windows executable and a shell script.
  assert.equal(mediaService.sniffType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00')), null);
  assert.equal(mediaService.sniffType(Buffer.from('#!/bin/sh\nrm -rf /   ')), null);
});

test('SVG sanitising removes scripts and external references', () => {
  const hostile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">
    <script>alert(1)</script>
    <foreignObject><body onload="alert(2)"/></foreignObject>
    <a xlink:href="javascript:alert(3)"><rect onclick="alert(4)"/></a>
  </svg>`);

  const cleaned = mediaService.sanitizeSvg(hostile).toString();

  assert.doesNotMatch(cleaned, /<script/i);
  assert.doesNotMatch(cleaned, /foreignObject/i);
  assert.doesNotMatch(cleaned, /javascript:/i);
  assert.doesNotMatch(cleaned, /onload|onclick/i);
  assert.match(cleaned, /<svg/i, 'the SVG itself should survive');
});

/* ======================================================== privacy */

test('IP hashing is stable, salted and irreversible', () => {
  const ip = '203.0.113.42';

  assert.equal(hashIp(ip), hashIp(ip), 'the same IP should hash consistently');
  assert.notEqual(hashIp(ip), hashIp('203.0.113.43'), 'different IPs should differ');
  assert.doesNotMatch(hashIp(ip), /203\.0\.113/, 'the hash must not contain the address');
  assert.equal(hashIp(ip).length, 64);
});

test('visitor hashes cannot be linked across days', () => {
  const ip = '203.0.113.42';
  const ua = 'Mozilla/5.0';

  const today = new Date('2026-01-15T10:00:00Z');
  const alsoToday = new Date('2026-01-15T23:00:00Z');
  const tomorrow = new Date('2026-01-16T10:00:00Z');

  assert.equal(
    dailyVisitorHash(ip, ua, today),
    dailyVisitorHash(ip, ua, alsoToday),
    'the same visitor should be countable within one day',
  );
  assert.notEqual(
    dailyVisitorHash(ip, ua, today),
    dailyVisitorHash(ip, ua, tomorrow),
    'the same visitor must not be linkable across days',
  );
});

test('no raw IP column exists in any analytics or message table', async () => {
  const rows = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME REGEXP '^(ip|ip_address|remote_addr|client_ip)$'`,
  );

  assert.equal(rows.length, 0,
    `found a raw IP column: ${rows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`).join(', ')}`);
});

/* ======================================================== crypto */

test('encryption round-trips and detects tampering', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const payload = encrypt(secret);

  assert.notEqual(payload, secret, 'the stored value must not be the plaintext');
  assert.equal(decrypt(payload), secret);

  // Flipping any byte of the ciphertext must fail the auth tag.
  const parts = payload.split(':');
  const tampered = Buffer.from(parts[2], 'base64');
  tampered[0] ^= 0xff;
  parts[2] = tampered.toString('base64');

  assert.throws(() => decrypt(parts.join(':')));
});

test('constant-time comparison behaves like equality', () => {
  assert.ok(safeCompare('same-value', 'same-value'));
  assert.ok(!safeCompare('a-value', 'another-value'));
  assert.ok(!safeCompare('short', 'a-much-longer-value'));
  assert.ok(!safeCompare('', 'x'));
});

/* ================================================ password policy */

test('the password policy rejects weak choices', () => {
  const weak = ['short', 'password123456', 'aaaaaaaaaaaaaa', '123456789012', 'admin1234567'];

  for (const password of weak) {
    const problems = authService.validatePasswordStrength(password, {
      email: 'user@example.com', name: 'Test User',
    });
    assert.ok(problems.length > 0, `"${password}" should be rejected`);
  }

  const strong = authService.validatePasswordStrength('correct-horse-battery-42', {
    email: 'user@example.com', name: 'Test User',
  });
  assert.equal(strong.length, 0, 'a long passphrase should be accepted');
});

test('a password containing the account email is rejected', () => {
  const problems = authService.validatePasswordStrength('arunsanjeev-2026!', {
    email: 'arunsanjeev@example.com', name: 'Arun',
  });
  assert.ok(problems.some((problem) => /email/i.test(problem)));
});

/* ================================================== error handling */

test('404 and error pages leak no stack trace', async () => {
  const client = createClient();
  const response = await client.request('/this-route-does-not-exist');

  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body, /at Object\.|node_modules|\.js:\d+:\d+/,
    'a stack trace must never reach the browser');
});

test('security headers are present on public pages', async () => {
  const client = createClient();
  const response = await client.request('/');

  assert.ok(response.headers.get('content-security-policy'), 'CSP should be set');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-powered-by'), null, 'Express should not advertise itself');
});

test('admin pages are marked no-store and noindex', async () => {
  const client = createClient();
  const response = await client.request('/admin/login');

  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
});
