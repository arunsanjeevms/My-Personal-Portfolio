'use strict';

/** Domains, SSL, backups and scheduled jobs. */

const fsSync = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const domainService = require('../services/domainService');
const backupService = require('../services/backupService');
const activityService = require('../services/activityService');
const jobs = require('../jobs');
const { config } = require('../config/env');
const { asyncHandler, NotFoundError, ValidationError } = require('../utils/errors');

/* ------------------------------------------------------------ domains */

/** GET /admin/domain */
const domains = asyncHandler(async (req, res) => {
  const rows = await domainService.list();

  res.render('admin/domains', {
    title: 'Domains & SSL',
    activeNav: 'domain',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Domains & SSL' },
    ],
    domains: rows,
    events: rows.length ? await domainService.events(rows[0].id, 10) : [],
    formErrors: {},
  });
});

function readDomainForm(body) {
  const text = (value, max) => (value ? String(value).trim().slice(0, max) : null);
  const date = (value) => (value ? String(value).slice(0, 10) : null);

  return {
    domain: text(body.domain, 190)?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    registrar: text(body.registrar, 120),
    registrar_url: text(body.registrar_url, 500),
    purchased_at: date(body.purchased_at),
    registered_at: date(body.registered_at),
    expires_at: date(body.expires_at),
    auto_renew: body.auto_renew ? 1 : 0,
    nameservers: text(body.nameservers, 2000),
    dns_provider: text(body.dns_provider, 120),
    ssl_enabled: body.ssl_enabled ? 1 : 0,
    ssl_expires_at: date(body.ssl_expires_at),
    hosting_provider: text(body.hosting_provider, 120),
    server_ip: text(body.server_ip, 45),
    environment: ['production', 'staging', 'development'].includes(body.environment)
      ? body.environment : 'production',
    is_primary: body.is_primary ? 1 : 0,
    is_active: body.is_active ? 1 : 0,
    notes: text(body.notes, 2000),
  };
}

/** POST /admin/domain */
const createDomain = asyncHandler(async (req, res) => {
  const values = readDomainForm(req.body);

  if (!values.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(values.domain)) {
    throw new ValidationError('Enter a valid domain name, for example arunsanjeev.dev');
  }

  const clash = await db.queryOne('SELECT id FROM domains WHERE domain = ?', [values.domain]);
  if (clash) throw new ValidationError('That domain is already being tracked.');

  // Only one domain can be primary.
  if (values.is_primary) await db.query('UPDATE domains SET is_primary = 0');

  const columns = Object.keys(values);
  const [result] = await db.getPool().execute(
    `INSERT INTO domains (${columns.map((c) => `\`${c}\``).join(',')})
     VALUES (${columns.map(() => '?').join(',')})`,
    Object.values(values),
  );

  await domainService.recordEvent(result.insertId, 'note', 'Added to the tracker', req.session.user.id);

  await activityService.record({
    req,
    action: 'domain.create',
    entity: 'domain',
    entityId: result.insertId,
    description: `Started tracking ${values.domain}`,
  });

  req.flash('success', `${values.domain} added. Run an SSL check to read its live certificate.`);
  res.redirect(`${res.locals.adminPath}/domain`);
});

/** POST /admin/domain/:id */
const updateDomain = asyncHandler(async (req, res) => {
  const before = await domainService.findById(req.params.id);
  if (!before) throw new NotFoundError('That domain is no longer tracked.');

  const values = readDomainForm(req.body);
  if (!values.domain) throw new ValidationError('The domain name is required.');

  if (values.is_primary && !before.is_primary) await db.query('UPDATE domains SET is_primary = 0');

  const columns = Object.keys(values);
  await db.query(
    `UPDATE domains SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(values), before.id],
  );

  const after = await domainService.findById(before.id);

  await activityService.record({
    req,
    action: 'domain.update',
    entity: 'domain',
    entityId: before.id,
    description: `Updated ${after.domain}`,
    before,
    after,
  });

  req.flash('success', 'Domain updated.');
  res.redirect(`${res.locals.adminPath}/domain`);
});

/** POST /admin/domain/:id/check - reads the live TLS certificate. */
const checkDomain = asyncHandler(async (req, res) => {
  const domain = await domainService.findById(req.params.id);
  if (!domain) throw new NotFoundError('That domain is no longer tracked.');

  const result = await domainService.refreshCertificate(domain.id);

  req.flash(result.ok ? 'success' : 'error', result.ok
    ? `Certificate for ${domain.domain}: issued by ${result.issuer}, ${result.days} day(s) remaining.`
    : `Could not read the certificate for ${domain.domain}: ${result.error}`);

  res.redirect(`${res.locals.adminPath}/domain`);
});

/** POST /admin/domain/:id/delete */
const deleteDomain = asyncHandler(async (req, res) => {
  const domain = await domainService.findById(req.params.id);
  if (!domain) throw new NotFoundError('That domain is no longer tracked.');

  await db.query('DELETE FROM domains WHERE id = ?', [domain.id]);

  await activityService.record({
    req,
    action: 'domain.delete',
    entity: 'domain',
    entityId: domain.id,
    description: `Stopped tracking ${domain.domain}`,
    severity: 'warning',
  });

  req.flash('success', `${domain.domain} removed from the tracker. The domain itself is untouched.`);
  res.redirect(`${res.locals.adminPath}/domain`);
});

/* ------------------------------------------------------------ backups */

/** GET /admin/backups */
const backups = asyncHandler(async (req, res) => {
  const rows = await backupService.list();

  // Flag any backup whose file has gone missing from disk.
  const withStatus = rows.map((row) => ({
    ...row,
    fileExists: row.status === 'completed' ? fsSync.existsSync(row.disk_path) : false,
  }));

  res.render('admin/backups', {
    title: 'Backups',
    activeNav: 'backups',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Backups' },
    ],
    backups: withStatus,
    jobHistory: await jobs.history(10),
    scheduledJobs: jobs.listJobs(),
    backupDir: config.storage.backupDir,
  });
});

/** POST /admin/backups */
const createBackup = asyncHandler(async (req, res) => {
  try {
    const backup = await backupService.create({ userId: req.session.user.id, type: 'manual' });

    await activityService.record({
      req,
      action: 'backup.create',
      entity: 'backup',
      entityId: backup.id,
      description: `Created backup ${backup.filename}`,
    });

    req.flash('success', `Backup created (${backup.filename}).`);
  } catch (err) {
    req.flash('error', `Backup failed: ${err.message}`);
  }

  res.redirect(`${res.locals.adminPath}/backups`);
});

/** GET /admin/backups/:id/download */
const downloadBackup = asyncHandler(async (req, res) => {
  const check = await backupService.verify(req.params.id);
  if (!check.ok) throw new NotFoundError(`That backup cannot be downloaded: ${check.reason}`);

  const backup = await backupService.findById(req.params.id);

  await activityService.record({
    req,
    action: 'backup.download',
    entity: 'backup',
    entityId: backup.id,
    description: `Downloaded ${backup.filename}`,
    severity: 'warning',
  });

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(backup.filename)}"`);
  res.sendFile(check.path);
});

/** POST /admin/backups/:id/restore - destructive, typed confirmation required. */
const restoreBackup = asyncHandler(async (req, res) => {
  const backup = await backupService.findById(req.params.id);
  if (!backup) throw new NotFoundError('That backup no longer exists.');

  // The UI asks the user to type RESTORE; this is the server-side check.
  if (String(req.body.confirm || '').trim().toUpperCase() !== 'RESTORE') {
    throw new ValidationError('Type RESTORE to confirm. Nothing has been changed.');
  }

  try {
    const result = await backupService.restore(backup.id, { userId: req.session.user.id });

    await activityService.record({
      req,
      action: 'backup.restore',
      entity: 'backup',
      entityId: backup.id,
      description: `Restored ${result.restored} (safety backup: ${result.safetyBackup})`,
      severity: 'critical',
    });

    req.flash('success',
      `Database restored from ${result.restored}. A safety backup of the previous state was saved as ${result.safetyBackup}.`);
  } catch (err) {
    req.flash('error', `Restore failed: ${err.message}`);
  }

  res.redirect(`${res.locals.adminPath}/backups`);
});

/** POST /admin/backups/:id/delete */
const deleteBackup = asyncHandler(async (req, res) => {
  const backup = await backupService.remove(req.params.id);

  await activityService.record({
    req,
    action: 'backup.delete',
    entity: 'backup',
    entityId: backup.id,
    description: `Deleted backup ${backup.filename}`,
    severity: 'warning',
  });

  req.flash('success', 'Backup deleted.');
  res.redirect(`${res.locals.adminPath}/backups`);
});

/** POST /admin/jobs/:name/run */
const runJobNow = asyncHandler(async (req, res) => {
  try {
    const result = await jobs.runNow(req.params.name);

    await activityService.record({
      req,
      action: 'job.run',
      entity: 'job',
      description: `Ran ${req.params.name} manually`,
    });

    req.flash(result?.error ? 'error' : 'success', result?.error
      ? `${req.params.name} failed: ${result.error}`
      : `${req.params.name} finished.`);
  } catch (err) {
    req.flash('error', err.message);
  }

  res.redirect(req.get('referer') || `${res.locals.adminPath}/backups`);
});

module.exports = {
  domains, createDomain, updateDomain, checkDomain, deleteDomain,
  backups, createBackup, downloadBackup, restoreBackup, deleteBackup,
  runJobNow,
};
