'use strict';

/**
 * Domain and SSL tracking.
 *
 * IMPORTANT, and stated plainly because it is easy to overclaim:
 * this is a TRACKING dashboard. Express cannot renew a domain, change
 * nameservers or issue a certificate without an explicit integration
 * with a registrar or DNS provider. Nothing here pretends otherwise.
 *
 * What it does do:
 *   - stores what you know about each domain
 *   - counts down to expiry and raises warnings at set thresholds
 *   - reads the live certificate over TLS to confirm the real expiry
 *     date, which is genuinely checkable without any API key
 *
 * `registrar_api_provider` exists so a Cloudflare or registrar
 * integration can be added later without a schema change.
 */

const tls = require('node:tls');
const db = require('../config/database');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const mailService = require('./mailService');

/** Days before expiry at which a warning fires. */
const WARNING_THRESHOLDS = [90, 60, 30, 14, 7, 1];

function daysUntil(date) {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target - startOfToday) / 86400000);
}

/** Maps a day count to a severity used for badges and alerts. */
function expiryLevel(days) {
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  if (days <= 90) return 'notice';
  return 'ok';
}

async function list() {
  const rows = await db.query('SELECT * FROM domains ORDER BY is_primary DESC, domain ASC');

  return rows.map((row) => {
    const domainDays = daysUntil(row.expires_at);
    const sslDays = daysUntil(row.ssl_expires_at);

    return {
      ...row,
      domainDays,
      sslDays,
      domainLevel: expiryLevel(domainDays),
      sslLevel: expiryLevel(sslDays),
    };
  });
}

async function findById(id) {
  return db.queryOne('SELECT * FROM domains WHERE id = ?', [id]);
}

/**
 * Reads the live TLS certificate for a hostname.
 *
 * This is a real check - it opens a TLS connection and reads the
 * certificate the server presents. No API key, no third-party service.
 *
 * @returns {Promise<{ok: boolean, issuer?: string, validTo?: Date, error?: string}>}
 */
function checkCertificate(hostname, port = 443, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already closed */ }
      resolve(result);
    };

    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      // The certificate is inspected even when it fails validation, so a
      // self-signed or expired certificate is reported rather than
      // throwing. This connection never carries data.
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, () => {
      const certificate = socket.getPeerCertificate();

      if (!certificate || !certificate.valid_to) {
        return finish({ ok: false, error: 'No certificate was presented.' });
      }

      return finish({
        ok: true,
        issuer: certificate.issuer?.O || certificate.issuer?.CN || 'Unknown',
        subject: certificate.subject?.CN || hostname,
        validFrom: new Date(certificate.valid_from),
        validTo: new Date(certificate.valid_to),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
      });
    });

    socket.on('error', (err) => finish({ ok: false, error: err.message }));
    socket.on('timeout', () => finish({ ok: false, error: 'Connection timed out.' }));
  });
}

/**
 * Checks one domain's certificate and stores the result.
 */
async function refreshCertificate(domainId) {
  const domain = await findById(domainId);
  if (!domain) return { error: 'Domain not found.' };

  const hostname = domain.domain.replace(/^https?:\/\//, '').split('/')[0];
  const result = await checkCertificate(hostname);

  if (!result.ok) {
    await db.query(
      "UPDATE domains SET ssl_status = 'error', ssl_last_checked_at = NOW() WHERE id = ?",
      [domain.id],
    );
    await recordEvent(domain.id, 'check', `SSL check failed: ${result.error}`);
    return { ok: false, error: result.error };
  }

  const days = daysUntil(result.validTo);
  const status = days === null ? 'unknown'
    : days < 0 ? 'expired'
      : days <= 30 ? 'expiring' : 'valid';

  await db.query(
    `UPDATE domains
        SET ssl_issuer = ?, ssl_expires_at = ?, ssl_status = ?, ssl_last_checked_at = NOW()
      WHERE id = ?`,
    [result.issuer, result.validTo.toISOString().slice(0, 10), status, domain.id],
  );

  await recordEvent(domain.id, 'check',
    `Certificate from ${result.issuer}, valid until ${result.validTo.toISOString().slice(0, 10)} (${days} days)`);

  return { ok: true, issuer: result.issuer, validTo: result.validTo, days, status };
}

async function recordEvent(domainId, eventType, message, userId = null) {
  return db.query(
    'INSERT INTO domain_events (domain_id, event_type, message, occurred_at, created_by) VALUES (?,?,?,NOW(),?)',
    [domainId, eventType, message ? String(message).slice(0, 500) : null, userId],
  );
}

async function events(domainId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 100));
  return db.query(
    `SELECT * FROM domain_events WHERE domain_id = ? ORDER BY occurred_at DESC LIMIT ${safeLimit}`,
    [domainId],
  );
}

/**
 * Nightly job: check every active domain and raise warnings.
 *
 * `dedupe_key` includes the threshold, so each threshold notifies once
 * rather than every night.
 */
async function runExpiryChecks({ notify = true } = {}) {
  const domains = await list();
  const warnings = [];

  for (const domain of domains) {
    if (!domain.is_active) continue;

    // Refresh the certificate first so the warning uses live data.
    if (domain.ssl_enabled) {
      await refreshCertificate(domain.id).catch((err) =>
        logger.warn('domains: certificate check failed', { domain: domain.domain, message: err.message }));
    }

    const refreshed = await findById(domain.id);
    const checks = [
      { kind: 'domain', days: daysUntil(refreshed.expires_at), expiresAt: refreshed.expires_at },
      { kind: 'ssl', days: daysUntil(refreshed.ssl_expires_at), expiresAt: refreshed.ssl_expires_at },
    ];

    for (const check of checks) {
      if (check.days === null) continue;

      // Fire at the tightest threshold the countdown has crossed.
      const threshold = WARNING_THRESHOLDS.find((value) => check.days <= value && check.days > 0);
      const expired = check.days <= 0;
      if (!threshold && !expired) continue;

      const label = check.kind === 'ssl' ? 'SSL certificate' : 'Domain registration';
      const severity = expired || check.days <= 7 ? 'critical' : check.days <= 30 ? 'warning' : 'info';

      warnings.push({ domain: refreshed.domain, ...check, severity });

      if (!notify) continue;

      await notificationService.create({
        type: `${check.kind}_expiry`,
        severity,
        title: expired
          ? `${label} for ${refreshed.domain} has expired`
          : `${label} for ${refreshed.domain} expires in ${check.days} days`,
        body: check.expiresAt ? `Expires ${new Date(check.expiresAt).toISOString().slice(0, 10)}` : null,
        link: '/domain',
        entity: 'domain',
        entityId: refreshed.id,
        // One notification per domain, per kind, per threshold.
        dedupeKey: `${check.kind}:${refreshed.id}:${expired ? 'expired' : threshold}`,
      });

      if (severity === 'critical') {
        await mailService.sendExpiryWarning({
          kind: check.kind,
          domain: refreshed.domain,
          daysRemaining: check.days,
          expiresAt: check.expiresAt,
        }).catch((err) => logger.warn('domains: warning email failed', { message: err.message }));
      }

      await recordEvent(refreshed.id, expired ? `${check.kind}_expired` : `${check.kind}_expiring`,
        `${label} ${expired ? 'has expired' : `expires in ${check.days} days`}`);
    }
  }

  return { checked: domains.length, warnings };
}

/** Summary for the dashboard tile. */
async function getSummary() {
  const domains = await list();
  const active = domains.filter((domain) => domain.is_active);

  return {
    configured: active.length > 0,
    total: active.length,
    domains: active.slice(0, 5),
    critical: active.filter((domain) =>
      ['expired', 'critical'].includes(domain.domainLevel)
      || ['expired', 'critical'].includes(domain.sslLevel)).length,
  };
}

module.exports = {
  list,
  findById,
  checkCertificate,
  refreshCertificate,
  recordEvent,
  events,
  runExpiryChecks,
  getSummary,
  daysUntil,
  expiryLevel,
  WARNING_THRESHOLDS,
};
