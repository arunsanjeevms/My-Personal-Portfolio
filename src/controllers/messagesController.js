'use strict';

/** Contact message inbox. */

const db = require('../config/database');
const activityService = require('../services/activityService');
const notificationService = require('../services/notificationService');
const { asyncHandler, NotFoundError, ValidationError } = require('../utils/errors');

const STATUSES = ['unread', 'read', 'replied', 'archived', 'spam'];

/** Counts per status, for the inbox filter chips. */
async function getCounts() {
  const rows = await db.query(
    'SELECT status, COUNT(*) AS total FROM contact_messages WHERE deleted_at IS NULL GROUP BY status',
  );

  const counts = { all: 0 };
  for (const status of STATUSES) counts[status] = 0;
  for (const row of rows) {
    counts[row.status] = Number(row.total);
    counts.all += Number(row.total);
  }
  return counts;
}

/** GET /admin/messages */
const index = asyncHandler(async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const search = String(req.query.q || '').trim();

  const clauses = ['deleted_at IS NULL'];
  const params = [];

  if (status) { clauses.push('status = ?'); params.push(status); }
  if (search) {
    clauses.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const [rows, total, counts] = await Promise.all([
    db.query(
      `SELECT id, name, email, subject, LEFT(message, 160) AS preview, status,
              is_starred, spam_score, created_at
         FROM contact_messages ${whereSql}
        ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`,
      params,
    ),
    db.queryValue(`SELECT COUNT(*) AS total FROM contact_messages ${whereSql}`, params),
    getCounts(),
  ]);

  res.render('admin/messages', {
    title: 'Messages',
    activeNav: 'messages',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Messages' },
    ],
    result: {
      rows,
      total: Number(total) || 0,
      page,
      perPage,
      pages: Math.max(1, Math.ceil((Number(total) || 0) / perPage)),
    },
    counts,
    activeStatus: status,
    searchTerm: search,
    statuses: STATUSES,
  });
});

/** GET /admin/messages/:id */
const show = asyncHandler(async (req, res) => {
  const message = await db.queryOne(
    'SELECT * FROM contact_messages WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  );
  if (!message) throw new NotFoundError('That message no longer exists.');

  // Opening an unread message marks it read.
  if (message.status === 'unread') {
    await db.query("UPDATE contact_messages SET status = 'read' WHERE id = ?", [message.id]);
    message.status = 'read';
  }

  res.render('admin/message-detail', {
    title: `Message from ${message.name}`,
    activeNav: 'messages',
    breadcrumbs: [
      { label: 'Messages', url: `${res.locals.adminPath}/messages` },
      { label: message.name },
    ],
    message,
    statuses: STATUSES,
  });
});

/** POST /admin/messages/:id/status */
const updateStatus = asyncHandler(async (req, res) => {
  const message = await db.queryOne('SELECT * FROM contact_messages WHERE id = ?', [req.params.id]);
  if (!message) throw new NotFoundError('That message no longer exists.');

  const status = req.body.status;
  if (!STATUSES.includes(status)) throw new ValidationError('Unknown status.');

  const replied = status === 'replied';
  await db.query(
    `UPDATE contact_messages
        SET status = ?, replied_at = ${replied ? 'NOW()' : 'replied_at'},
            replied_by = ${replied ? '?' : 'replied_by'}
      WHERE id = ?`,
    replied ? [status, req.session.user.id, message.id] : [status, message.id],
  );

  await activityService.record({
    req,
    action: 'message.status',
    entity: 'contact_message',
    entityId: message.id,
    description: `Marked message from ${message.name} as ${status}`,
  });

  req.flash('success', `Message marked as ${status}.`);
  res.redirect(req.get('referer') || `${res.locals.adminPath}/messages`);
});

/** POST /admin/messages/:id/star */
const toggleStar = asyncHandler(async (req, res) => {
  const message = await db.queryOne('SELECT id, is_starred FROM contact_messages WHERE id = ?', [req.params.id]);
  if (!message) throw new NotFoundError('That message no longer exists.');

  await db.query('UPDATE contact_messages SET is_starred = ? WHERE id = ?',
    [message.is_starred ? 0 : 1, message.id]);

  res.redirect(req.get('referer') || `${res.locals.adminPath}/messages`);
});

/** POST /admin/messages/:id/notes */
const saveNotes = asyncHandler(async (req, res) => {
  const message = await db.queryOne('SELECT id FROM contact_messages WHERE id = ?', [req.params.id]);
  if (!message) throw new NotFoundError('That message no longer exists.');

  await db.query('UPDATE contact_messages SET admin_notes = ? WHERE id = ?',
    [String(req.body.admin_notes || '').slice(0, 5000) || null, message.id]);

  req.flash('success', 'Notes saved.');
  res.redirect(`${res.locals.adminPath}/messages/${message.id}`);
});

/** POST /admin/messages/:id/delete */
const destroy = asyncHandler(async (req, res) => {
  const message = await db.queryOne('SELECT * FROM contact_messages WHERE id = ?', [req.params.id]);
  if (!message) throw new NotFoundError('That message no longer exists.');

  await db.query('UPDATE contact_messages SET deleted_at = NOW() WHERE id = ?', [message.id]);

  await activityService.record({
    req,
    action: 'message.delete',
    entity: 'contact_message',
    entityId: message.id,
    description: `Deleted message from ${message.name}`,
    severity: 'warning',
  });

  req.flash('success', 'Message deleted.');
  res.redirect(`${res.locals.adminPath}/messages`);
});

/** GET /admin/messages/export - CSV of non-deleted messages. */
const exportCsv = asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT id, name, email, subject, message, status, spam_score, created_at
       FROM contact_messages WHERE deleted_at IS NULL ORDER BY created_at DESC`,
  );

  // ip_hash and user_agent are deliberately excluded from exports.
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const header = ['ID', 'Name', 'Email', 'Subject', 'Message', 'Status', 'Spam score', 'Received'];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      row.id, row.name, row.email, row.subject, row.message,
      row.status, row.spam_score, new Date(row.created_at).toISOString(),
    ].map(escape).join(','));
  }

  await activityService.record({
    req,
    action: 'message.export',
    entity: 'contact_message',
    description: `Exported ${rows.length} message(s) to CSV`,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="messages-${new Date().toISOString().slice(0, 10)}.csv"`);
  // BOM so Excel opens UTF-8 correctly.
  res.send(`﻿${lines.join('\n')}`);
});

/* --------------------------------------------------- notifications */

/** GET /admin/notifications */
const notifications = asyncHandler(async (req, res) => {
  const result = await notificationService.list({
    page: req.query.page,
    unreadOnly: req.query.filter === 'unread',
    userId: req.session.user.id,
  });

  res.render('admin/notifications', {
    title: 'Notifications',
    activeNav: 'notifications',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Notifications' },
    ],
    result,
    unreadOnly: req.query.filter === 'unread',
  });
});

/** POST /admin/notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(req.params.id, req.session.user.id);
  res.redirect(req.get('referer') || `${res.locals.adminPath}/notifications`);
});

/** POST /admin/notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllRead(req.session.user.id);
  req.flash('success', `${count} notification(s) marked as read.`);
  res.redirect(`${res.locals.adminPath}/notifications`);
});

module.exports = {
  index, show, updateStatus, toggleStar, saveNotes, destroy, exportCsv,
  notifications, markRead, markAllRead, getCounts,
};
