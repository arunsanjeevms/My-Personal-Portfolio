'use strict';

/**
 * Public routes.
 *
 * The portfolio is one page with five tabs, and each tab also has a real
 * URL that server-renders with that tab already open.
 */

const express = require('express');

const publicController = require('../../controllers/publicController');
const contactController = require('../../controllers/contactController');
const blogController = require('../../controllers/blogController');
const healthService = require('../../services/healthService');
const analyticsService = require('../../services/analyticsService');
const { contactLimiter, analyticsLimiter } = require('../../middleware/rateLimit');
const { skipCsrf } = require('../../middleware/csrf');
const { asyncHandler } = require('../../utils/errors');

const router = express.Router();

/* ------------------------------------------------------------- pages */
router.get('/', publicController.home);
router.get('/resume', publicController.resume);
router.get('/projects', publicController.projects);
router.get('/projects/:slug', publicController.projectDetail);
router.get('/blog', publicController.blog);
router.get('/blog/:slug', blogController.detail);
router.get('/contact', publicController.contact);

/* ----------------------------------------------------------- contact */
/**
 * Issues a CSRF token for the contact form.
 *
 * The form appears on every page (single-page site), so the token is not
 * rendered into the HTML except on /contact. Fetching it here means a
 * session is only created for someone who actually interacts with the
 * form, and the other pages stay anonymous and cacheable.
 */
router.get('/api/csrf', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ token: res.locals.csrfToken() });
});

router.post('/contact', contactLimiter, contactController.submit);

/* --------------------------------------------------------- downloads */
router.get('/resume.pdf', publicController.resumeDownload);

/* ------------------------------------------------------------ SEO ---*/
router.get('/sitemap.xml', publicController.sitemap);
router.get('/robots.txt', publicController.robots);
router.get('/site.webmanifest', publicController.manifest);

/* --------------------------------------------------------- analytics */
/**
 * The beacon is sent by navigator.sendBeacon, which cannot attach a CSRF
 * header. It is exempted deliberately: the endpoint is unauthenticated,
 * writes only anonymous counters, is rate-limited, and cannot change any
 * user-visible state. Nothing here is worth forging.
 */
router.post('/api/analytics/collect', skipCsrf, analyticsLimiter, asyncHandler(async (req, res) => {
  await analyticsService.recordPageView(req, req.body || {});
  res.status(204).end();
}));

router.post('/api/analytics/event', skipCsrf, analyticsLimiter, asyncHandler(async (req, res) => {
  const { name, path, label, value, meta } = req.body || {};
  if (name) await analyticsService.recordEvent(req, { name, path, label, value, meta });
  res.status(204).end();
}));

/* -------------------------------------------------------------- ops */
router.get('/healthz', asyncHandler(async (req, res) => {
  const liveness = await healthService.getLiveness();
  res.status(liveness.status === 'ok' ? 200 : 503).json(liveness);
}));

module.exports = router;
