'use strict';

/**
 * Test helpers.
 *
 * Tests run against the real application and a real database, because
 * the things most worth testing here - SQL injection resistance, CSRF,
 * session handling, upload validation - are precisely the things mocks
 * would paper over.
 *
 * The server is started once per file on an ephemeral port.
 */

const http = require('node:http');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// Keep test output readable.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const { createApp } = require('../src/app');
const db = require('../src/config/database');
const { closeSessionStore } = require('../src/middleware/session');

let server = null;
let baseUrl = null;

/** Starts the app on a free port. */
async function startServer() {
  if (server) return baseUrl;

  const app = createApp();
  server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
    baseUrl = null;
  }
  closeSessionStore();
  await db.closePool().catch(() => {});
}

/**
 * A fetch wrapper that carries cookies between calls, so a test can sign
 * in and stay signed in.
 */
function createClient() {
  const cookies = new Map();

  function cookieHeader() {
    return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() || [];
    for (const entry of raw) {
      const [pair] = entry.split(';');
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      ...options,
      headers: {
        ...(cookies.size ? { cookie: cookieHeader() } : {}),
        ...(options.headers || {}),
      },
    });

    storeCookies(response);
    const body = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      location: response.headers.get('location'),
      body,
    };
  }

  /** Extracts the CSRF token from a rendered form. */
  async function csrfToken(path) {
    const page = await request(path);
    const match = page.body.match(/name="_csrf" value="([^"]+)"/);
    return match ? match[1] : null;
  }

  async function postForm(path, fields, { token = null, tokenFrom = null } = {}) {
    const csrf = token ?? (tokenFrom ? await csrfToken(tokenFrom) : null);
    const params = new URLSearchParams(fields);
    if (csrf) params.set('_csrf', csrf);

    return request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  }

  return { request, postForm, csrfToken, cookies };
}

/**
 * Clears the brute-force throttles.
 *
 * The suite deliberately performs failed sign-ins, and those count
 * towards the per-IP and per-account limits exactly as they should in
 * production. Without resetting between runs the limits eventually
 * (correctly) refuse the legitimate sign-ins that later tests need, so
 * the counters are cleared as part of test setup rather than the
 * protection being weakened.
 */
async function resetAuthThrottle() {
  await db.query('DELETE FROM login_attempts').catch(() => {});
  await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL').catch(() => {});
}

/** Signs a client in and returns it. */
async function signIn(client, { identifier, password }) {
  const token = await client.csrfToken('/admin/login');
  const response = await client.postForm('/admin/login', { identifier, password }, { token });
  return response;
}

/** Creates a throwaway user for permission tests. */
async function createTestUser({ roleSlug = 'editor', password = 'TestPassword123456' } = {}) {
  const crypto = require('node:crypto');
  const authService = require('../src/services/authService');
  const userRepository = require('../src/repositories/userRepository');

  const email = `test-${crypto.randomBytes(6).toString('hex')}@example.test`;
  const role = await db.queryOne('SELECT id FROM roles WHERE slug = ?', [roleSlug]);

  const id = await userRepository.create({
    uuid: crypto.randomUUID(),
    role_id: role.id,
    name: 'Test User',
    email,
    status: 'active',
    must_change_password: 0,
  });
  await userRepository.setPassword(id, await authService.hashPassword(password));

  return { id, email, password, roleSlug };
}

async function deleteTestUser(id) {
  await db.query('DELETE FROM login_attempts WHERE user_id = ?', [id]).catch(() => {});
  await db.query('DELETE FROM users WHERE id = ?', [id]).catch(() => {});
}

module.exports = {
  startServer,
  stopServer,
  createClient,
  signIn,
  createTestUser,
  resetAuthThrottle,
  deleteTestUser,
  db,
};
