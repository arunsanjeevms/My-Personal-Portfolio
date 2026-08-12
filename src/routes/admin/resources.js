'use strict';

/**
 * Mounts CRUD routes for every declared resource.
 *
 * Each resource gets the same seven routes, each guarded by the
 * permission declared in its schema. Adding a resource to
 * config/resources.js is enough - nothing here needs editing.
 */

const express = require('express');

const { RESOURCES } = require('../../config/resources');
const { buildController } = require('../../controllers/resourceController');
const { requirePermission } = require('../../middleware/auth');
const { adminWriteLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

for (const key of Object.keys(RESOURCES)) {
  const controller = buildController(key);
  const guard = requirePermission(controller.resource.permission);
  const base = `/${key}`;

  // Read
  router.get(base, guard, controller.index);
  router.get(`${base}/new`, guard, controller.create);
  router.get(`${base}/:id(\\d+)/edit`, guard, controller.edit);

  // Write - all POST, all CSRF-protected by the global middleware
  router.post(base, guard, adminWriteLimiter, controller.store);
  router.post(`${base}/reorder`, guard, adminWriteLimiter, controller.reorder);
  router.post(`${base}/:id(\\d+)`, guard, adminWriteLimiter, controller.update);
  router.post(`${base}/:id(\\d+)/delete`, guard, adminWriteLimiter, controller.destroy);
  router.post(`${base}/:id(\\d+)/toggle`, guard, adminWriteLimiter, controller.toggle);
  router.post(`${base}/:id(\\d+)/move`, guard, adminWriteLimiter, controller.move);
}

module.exports = router;
