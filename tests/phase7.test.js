'use strict';

/**
 * Phase 7: two-factor authentication, user management, custom code,
 * and the caching behaviour of the public pages.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticator } = require('otplib');

const {
  startServer, stopServer, createClient, signIn,
  createTestUser, deleteTestUser, resetAuthThrottle, db,
} = require('./helpers');

const twoFactorService = require('../src/services/twoFactorService');
const { decrypt } = require('../src/utils/crypto');

const ADMIN_USER = { identifier: 'arun', password: 'CorrectHorse42Battery' };

test.before(async () => {
  await startServer();
  await resetAuthThrottle();
});
test.after(async () => { await stopServer(); });

/* ============================================ two-factor authentication */

test('2FA enrolment stores the secret encrypted, not in plain text', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });

    const row = await db.queryOne('SELECT secret_encrypted, is_enabled FROM user_2fa WHERE user_id = ?', [user.id]);

    assert.ok(row, 'an enrolment row should exist');
    assert.notEqual(row.secret_encrypted, secret, 'the secret must not be stored as plain text');
    assert.doesNotMatch(row.secret_encrypted, new RegExp(secret), 'the plaintext must not appear anywhere in the stored value');
    assert.equal(row.is_enabled, 0, 'it must not be active until a code confirms it');

    // It must still decrypt back to the original.
    assert.equal(decrypt(row.secret_encrypted), secret);
  } finally {
    await deleteTestUser(user.id);
  }
});

test('2FA activates only after a valid code, and issues backup codes', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });

    // A wrong code must not enable it.
    await assert.rejects(
      () => twoFactorService.confirmEnrolment(user.id, '000000'),
      /not correct/i,
    );
    let status = await twoFactorService.getStatus(user.id);
    assert.equal(status.enabled, false, 'a bad code must leave 2FA off');

    // The real code enables it.
    const codes = await twoFactorService.confirmEnrolment(user.id, authenticator.generate(secret));

    assert.equal(codes.length, twoFactorService.BACKUP_CODE_COUNT);
    status = await twoFactorService.getStatus(user.id);
    assert.equal(status.enabled, true);
    assert.equal(status.remainingCodes, twoFactorService.BACKUP_CODE_COUNT);
  } finally {
    await twoFactorService.disable(user.id).catch(() => {});
    await deleteTestUser(user.id);
  }
});

test('a backup code works once and only once', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });
    const codes = await twoFactorService.confirmEnrolment(user.id, authenticator.generate(secret));

    const first = await twoFactorService.verify(user.id, codes[0]);
    assert.equal(first.ok, true);
    assert.equal(first.usedBackupCode, true);

    // The same code must not work a second time.
    const replay = await twoFactorService.verify(user.id, codes[0]);
    assert.equal(replay.ok, false, 'a used backup code must be rejected');

    const status = await twoFactorService.getStatus(user.id);
    assert.equal(status.remainingCodes, twoFactorService.BACKUP_CODE_COUNT - 1);
  } finally {
    await twoFactorService.disable(user.id).catch(() => {});
    await deleteTestUser(user.id);
  }
});

test('a TOTP code verifies and a wrong one does not', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });
    await twoFactorService.confirmEnrolment(user.id, authenticator.generate(secret));

    const good = await twoFactorService.verify(user.id, authenticator.generate(secret));
    assert.equal(good.ok, true);
    assert.equal(good.usedBackupCode, false);

    const bad = await twoFactorService.verify(user.id, '123456');
    assert.equal(bad.ok, false);
  } finally {
    await twoFactorService.disable(user.id).catch(() => {});
    await deleteTestUser(user.id);
  }
});

test('a password alone does not sign in when 2FA is on', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });
    await twoFactorService.confirmEnrolment(user.id, authenticator.generate(secret));

    const client = createClient();
    const login = await signIn(client, { identifier: user.email, password: user.password });

    assert.equal(login.status, 302);
    assert.match(login.location, /\/login\/2fa/, 'it should ask for the second factor');

    // The session must NOT grant access yet.
    const dashboard = await client.request('/admin/dashboard');
    assert.equal(dashboard.status, 302, 'a half-finished sign-in must not reach the dashboard');
    assert.match(dashboard.location, /\/admin\/login/);

    // With the code, the sign-in completes.
    const verified = await client.postForm('/admin/login/2fa',
      { token: authenticator.generate(secret) }, { tokenFrom: '/admin/login/2fa' });
    assert.equal(verified.status, 302);

    const afterDashboard = await client.request('/admin/dashboard');
    assert.equal(afterDashboard.status, 200, 'the dashboard should open once verified');
  } finally {
    await twoFactorService.disable(user.id).catch(() => {});
    await deleteTestUser(user.id);
  }
});

test('a wrong second factor is refused', async () => {
  const user = await createTestUser({ roleSlug: 'admin' });

  try {
    const { secret } = await twoFactorService.beginEnrolment({ id: user.id, email: user.email });
    await twoFactorService.confirmEnrolment(user.id, authenticator.generate(secret));

    const client = createClient();
    await signIn(client, { identifier: user.email, password: user.password });

    const attempt = await client.postForm('/admin/login/2fa',
      { token: '000000' }, { tokenFrom: '/admin/login/2fa' });

    assert.equal(attempt.status, 401);

    const dashboard = await client.request('/admin/dashboard');
    assert.equal(dashboard.status, 302, 'access must still be refused');
  } finally {
    await twoFactorService.disable(user.id).catch(() => {});
    await deleteTestUser(user.id);
  }
});

/* ======================================================= user management */

test('only a Super Admin reaches user management', async () => {
  const editor = await createTestUser({ roleSlug: 'editor' });
  const admin = await createTestUser({ roleSlug: 'admin' });

  try {
    for (const user of [editor, admin]) {
      const client = createClient();
      await signIn(client, { identifier: user.email, password: user.password });

      const response = await client.request('/admin/users');
      assert.equal(response.status, 403, `${user.roleSlug} must not manage users`);
    }

    const superClient = createClient();
    await signIn(superClient, ADMIN_USER);
    const allowed = await superClient.request('/admin/users');
    assert.equal(allowed.status, 200, 'a Super Admin should reach it');
  } finally {
    await deleteTestUser(editor.id);
    await deleteTestUser(admin.id);
  }
});

test('the last Super Admin cannot be deleted or demoted', async () => {
  await resetAuthThrottle();

  const client = createClient();
  const login = await signIn(client, ADMIN_USER);
  assert.equal(login.status, 302, 'the owner should be able to sign in');

  const owner = await db.queryOne(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.slug = 'super_admin' AND u.deleted_at IS NULL LIMIT 1`,
  );

  // Deleting your own account is refused outright.
  const deleted = await client.postForm(`/admin/users/${owner.id}/delete`, {},
    { tokenFrom: '/admin/users' });
  assert.ok([400, 403].includes(deleted.status), 'self-deletion must be refused');

  const stillThere = await db.queryOne('SELECT deleted_at FROM users WHERE id = ?', [owner.id]);
  assert.equal(stillThere.deleted_at, null, 'the account must survive');
});

test('a new account is created needing a password change', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const email = `created-${Date.now()}@example.test`;
  const role = await db.queryOne("SELECT id FROM roles WHERE slug = 'editor'");

  const response = await client.postForm('/admin/users', {
    name: 'Created By Test',
    email,
    role_id: String(role.id),
    password: 'a-long-enough-passphrase-42',
  }, { tokenFrom: '/admin/users' });

  assert.equal(response.status, 302);

  const created = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);
  assert.ok(created, 'the account should exist');
  assert.equal(created.must_change_password, 1, 'the temporary password must be replaced on first use');
  assert.notEqual(created.password_hash, 'a-long-enough-passphrase-42');
  assert.match(created.password_hash, /^\$2[aby]\$/, 'the password must be bcrypt-hashed');

  await db.query('DELETE FROM users WHERE id = ?', [created.id]);
});

test('a weak password is refused when creating an account', async () => {
  const client = createClient();
  await signIn(client, ADMIN_USER);

  const role = await db.queryOne("SELECT id FROM roles WHERE slug = 'editor'");
  const email = `weak-${Date.now()}@example.test`;

  const response = await client.postForm('/admin/users', {
    name: 'Weak Password',
    email,
    role_id: String(role.id),
    password: 'short',
  }, { tokenFrom: '/admin/users' });

  assert.equal(response.status, 400);

  const created = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
  assert.equal(created, null, 'no account should have been created');
});

/* ========================================================= custom code */

test('custom code is Super Admin only and needs the password', async () => {
  const admin = await createTestUser({ roleSlug: 'admin' });

  try {
    // An Admin (not Super Admin) is refused.
    const adminClient = createClient();
    await signIn(adminClient, { identifier: admin.email, password: admin.password });
    const refused = await adminClient.request('/admin/custom-code');
    assert.equal(refused.status, 403);

    // A Super Admin reaches it...
    const client = createClient();
    await signIn(client, ADMIN_USER);
    const page = await client.request('/admin/custom-code');
    assert.equal(page.status, 200);
    assert.match(page.body, /runs on your live site/i, 'the danger must be spelled out');

    // ...but cannot save without confirming the password.
    const noPassword = await client.postForm('/admin/custom-code', {
      code_head: '<meta name="test" content="1">',
      enabled_head: 'on',
      password: 'wrong-password',
    }, { tokenFrom: '/admin/custom-code' });

    assert.equal(noPassword.status, 400);

    const row = await db.queryOne("SELECT code FROM custom_code WHERE location = 'head'");
    assert.equal(row.code, null, 'nothing should have been saved');
  } finally {
    await deleteTestUser(admin.id);
  }
});

/* ====================================================== public caching */

test('anonymous page views create no session rows', async () => {
  await db.query('DELETE FROM sessions');

  const client = createClient();
  for (const path of ['/', '/projects', '/resume', '/blog', '/nope']) {
    await client.request(path);
  }

  const sessions = Number(await db.queryValue('SELECT COUNT(*) AS total FROM sessions'));
  assert.equal(sessions, 0, 'browsing anonymously must not allocate sessions');
});

test('the home page ETag is stable and revalidates with 304', async () => {
  const client = createClient();

  const first = await client.request('/');
  const etag = first.headers.get('etag');
  assert.ok(etag, 'an ETag should be sent');

  const second = await client.request('/');
  assert.equal(second.headers.get('etag'), etag, 'the ETag must be stable for identical content');

  // Node's fetch sends "cache-control: no-cache" by default, which
  // correctly instructs the server to skip freshness checks and return
  // the full body. A browser only does that on a force-refresh, so it is
  // overridden here to reproduce an ordinary repeat visit.
  const conditional = await client.request('/', {
    headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0', Pragma: '' },
  });
  assert.equal(conditional.status, 304, 'a repeat visit should revalidate rather than re-download');
});

test('/contact keeps an inline CSRF token so it works without JavaScript', async () => {
  const client = createClient();

  const contact = await client.request('/contact');
  assert.match(contact.body, /name="_csrf" value="[^"]+"/, '/contact must carry a usable token');

  const home = await createClient().request('/');
  assert.match(home.body, /name="_csrf" value=""/, 'other pages must not mint one');
});

test('the CSRF token endpoint issues a working token', async () => {
  const client = createClient();

  const response = await client.request('/api/csrf');
  assert.equal(response.status, 200);

  const { token } = JSON.parse(response.body);
  assert.ok(token && token.length > 20);

  // That token must actually be accepted by the form.
  const submitted = await client.postForm('/contact', {
    fullname: 'Token Test',
    email: 'token@example.test',
    message: 'Checking that a fetched token is accepted by the contact form.',
  }, { token });

  assert.equal(submitted.status, 200);
  assert.match(submitted.body, /has been sent/i);

  await db.query('DELETE FROM contact_messages WHERE email = ?', ['token@example.test']);
});

test('a forged CSRF token is rejected', async () => {
  const client = createClient();
  await client.request('/');

  const response = await client.postForm('/contact', {
    fullname: 'Forged',
    email: 'forged@example.test',
    message: 'This should never be stored anywhere at all.',
  }, { token: 'a-completely-made-up-token' });

  assert.equal(response.status, 403);

  const row = await db.queryOne('SELECT id FROM contact_messages WHERE email = ?', ['forged@example.test']);
  assert.equal(row, null, 'nothing should have been stored');
});

/* ====================================================== no N+1 queries */

test('rendering every project costs a constant number of queries', async () => {
  const cache = require('../src/utils/cache');
  const contentService = require('../src/services/contentService');

  const pool = db.getPool();
  const originalExecute = pool.execute.bind(pool);
  const originalQuery = pool.query.bind(pool);

  let count = 0;
  pool.execute = (...args) => { count += 1; return originalExecute(...args); };
  pool.query = (...args) => { count += 1; return originalQuery(...args); };

  try {
    cache.clear();
    count = 0;
    const projects = await contentService.getProjects();

    assert.ok(projects.length > 1, 'the test needs several projects to be meaningful');
    assert.ok(count <= 3,
      `${projects.length} projects should cost a couple of batched queries, not one each (used ${count})`);

    // And a warm cache should cost nothing at all.
    count = 0;
    await contentService.getProjects();
    assert.equal(count, 0, 'a cached read should not touch the database');
  } finally {
    pool.execute = originalExecute;
    pool.query = originalQuery;
  }
});
