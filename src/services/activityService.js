'use strict';

/**
 * Audit trail.
 *
 * Every admin action that changes state should call record(). Logging is
 * best-effort: a failure here is reported but never propagated, because
 * an audit write must not be able to fail the user's actual operation.
 */

const activityLogRepository = require('../repositories/activityLogRepository');
const logger = require('../utils/logger');
const { hashIp } = require('../utils/crypto');
const { getClientIp, getUserAgent } = require('../utils/request');

/** Never written into a before/after diff. */
const SENSITIVE_FIELDS = new Set([
  'password', 'password_hash', 'confirm_password', 'current_password', 'new_password',
  'secret_encrypted', 'reset_token_hash', 'code_hash', 'smtp_password', 'session_secret',
  'encryption_key', 'api_key', 'access_key',
]);

/**
 * Reduces two records to just the fields that actually changed, so the
 * log stays readable and small.
 *
 * @returns {{before: object, after: object}|null} null when nothing changed
 */
function diff(before = {}, after = {}) {
  const changedBefore = {};
  const changedAfter = {};

  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of keys) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) continue;

    const previous = before?.[key];
    const next = after?.[key];

    const normalise = (value) => {
      if (value instanceof Date) return value.toISOString();
      if (value === null || value === undefined) return null;
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    };

    if (normalise(previous) === normalise(next)) continue;

    changedBefore[key] = normalise(previous);
    changedAfter[key] = normalise(next);
  }

  return Object.keys(changedAfter).length ? { before: changedBefore, after: changedAfter } : null;
}

function serialise(value) {
  if (!value) return null;
  try {
    const json = JSON.stringify(value);
    // Column is LONGTEXT, but there is no reason to store megabytes.
    return json.length > 60000 ? JSON.stringify({ truncated: true, size: json.length }) : json;
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {import('express').Request} [options.req] supplies user, IP hash and UA
 * @param {string} options.action        e.g. 'project.update'
 * @param {string} [options.entity]      e.g. 'project'
 * @param {number} [options.entityId]
 * @param {string} [options.description] human-readable summary
 * @param {object} [options.before]
 * @param {object} [options.after]
 * @param {'info'|'warning'|'critical'} [options.severity]
 */
async function record({
  req = null,
  action,
  entity = null,
  entityId = null,
  description = null,
  before = null,
  after = null,
  severity = 'info',
} = {}) {
  try {
    const user = req?.session?.user || null;
    const changes = before || after ? diff(before, after) : null;

    await activityLogRepository.create({
      user_id: user?.id || null,
      user_name: user?.name || user?.email || 'system',
      action,
      entity,
      entity_id: entityId,
      description: description ? String(description).slice(0, 255) : null,
      before_json: serialise(changes?.before),
      after_json: serialise(changes?.after),
      ip_hash: req ? hashIp(getClientIp(req)) : null,
      user_agent: req ? getUserAgent(req) : null,
      severity,
    });

    logger.admin(action, {
      user: user?.email || 'system',
      entity,
      entityId,
      description,
      fields: changes ? Object.keys(changes.after) : undefined,
    });
  } catch (err) {
    // Audit logging must never break the operation it is describing.
    logger.error('activity: failed to write audit record', { action, message: err.message });
  }
}

module.exports = { record, diff };
