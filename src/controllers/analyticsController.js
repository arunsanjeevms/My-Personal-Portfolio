'use strict';

/** Analytics dashboard and activity log viewer. */

const analyticsService = require('../services/analyticsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const settingsService = require('../services/settingsService');
const db = require('../config/database');
const { asyncHandler } = require('../utils/errors');

/** GET /admin/analytics */
const index = asyncHandler(async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;

  const [overview, series, pages, sources, referrers, devices, browsers, os, live, hasData] =
    await Promise.all([
      analyticsService.getOverview(days),
      analyticsService.getTimeSeries(days),
      analyticsService.getBreakdown('pages', days),
      analyticsService.getBreakdown('sources', days),
      analyticsService.getBreakdown('referrers', days),
      analyticsService.getBreakdown('devices', days),
      analyticsService.getBreakdown('browsers', days),
      analyticsService.getBreakdown('os', days),
      analyticsService.getLiveVisitors(),
      db.queryValue('SELECT COUNT(*) AS total FROM analytics_pageviews'),
    ]);

  res.render('admin/analytics', {
    title: 'Analytics',
    activeNav: 'analytics',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Analytics' },
    ],
    days,
    overview,
    series,
    breakdowns: { pages, sources, referrers, devices, browsers, os },
    live,
    hasData: Number(hasData) > 0,
    settings: await settingsService.getAll(),
  });
});

/** GET /admin/analytics/live - JSON, polled by the live panel. */
const livePoll = asyncHandler(async (req, res) => {
  res.json(await analyticsService.getLiveVisitors());
});

/** GET /admin/analytics/export */
const exportCsv = asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT stat_date, visitors, unique_visitors, new_visitors, pageviews, sessions,
            avg_duration_seconds, bounce_rate, top_path, top_referrer
       FROM analytics_daily ORDER BY stat_date DESC`,
  );

  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Date', 'Visitors', 'Unique', 'New', 'Pageviews', 'Sessions',
    'Avg duration (s)', 'Bounce %', 'Top page', 'Top referrer'];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.stat_date, row.visitors, row.unique_visitors, row.new_visitors, row.pageviews,
      row.sessions, row.avg_duration_seconds, row.bounce_rate, row.top_path, row.top_referrer,
    ].map(escape).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${lines.join('\n')}`);
});

/* ------------------------------------------------------ activity log */

/** GET /admin/activity-logs */
const activityLogs = asyncHandler(async (req, res) => {
  const [result, options, users] = await Promise.all([
    activityLogRepository.search({
      page: req.query.page,
      userId: req.query.user || undefined,
      action: req.query.action || undefined,
      entity: req.query.entity || undefined,
      severity: req.query.severity || undefined,
      search: req.query.q || undefined,
    }),
    activityLogRepository.filterOptions(),
    db.query('SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name ASC'),
  ]);

  res.render('admin/activity-logs', {
    title: 'Activity logs',
    activeNav: 'activity-logs',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Activity logs' },
    ],
    result,
    options,
    users,
    filters: {
      user: req.query.user || '',
      action: req.query.action || '',
      entity: req.query.entity || '',
      severity: req.query.severity || '',
      q: req.query.q || '',
    },
  });
});

module.exports = { index, livePoll, exportCsv, activityLogs };
