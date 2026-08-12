'use strict';

/**
 * Access to site_settings, feature_flags and theme_settings.
 *
 * All three are read on nearly every request, so they are cached in
 * process and invalidated on write. A database outage falls back to the
 * last known good values rather than taking the public site down.
 */

const db = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

const CACHE_TTL = 600;
const KEY_SETTINGS = 'settings:all';
const KEY_FLAGS = 'settings:flags';
const KEY_THEME = 'settings:theme';

/** Last successful read, used when the database is unreachable. */
const lastKnownGood = { settings: null, flags: null, theme: null };

function coerce(value, type) {
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'boolean':
      return value === '1' || value === 'true' || value === 1 || value === true;
    case 'number': {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case 'media': {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value;
  }
}

/**
 * @returns {Promise<Object<string, *>>} every setting, type-coerced.
 * Secret values are included - callers rendering to a view must use
 * getPublicSettings() or mask them explicitly.
 */
async function getAll() {
  const cached = cache.get(KEY_SETTINGS);
  if (cached) return cached;

  try {
    const rows = await db.query('SELECT setting_key, setting_value, value_type FROM site_settings');
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = coerce(row.setting_value, row.value_type);
    }
    lastKnownGood.settings = settings;
    return cache.set(KEY_SETTINGS, settings, CACHE_TTL);
  } catch (err) {
    logger.error('settings: read failed, serving last known good', { message: err.message });
    return lastKnownGood.settings || {};
  }
}

async function get(key, fallback = null) {
  const settings = await getAll();
  const value = settings[key];
  return value === undefined || value === null ? fallback : value;
}

/** Settings marked is_public, with secrets stripped. Safe for views. */
async function getPublicSettings() {
  const rows = await db.query(
    'SELECT setting_key, setting_value, value_type FROM site_settings WHERE is_public = 1 AND is_secret = 0',
  );
  const settings = {};
  for (const row of rows) settings[row.setting_key] = coerce(row.setting_value, row.value_type);
  return settings;
}

/** Grouped rows for the settings screen. Secret values are masked. */
async function getGrouped() {
  const rows = await db.query(
    `SELECT id, setting_key, setting_value, value_type, setting_group, label,
            description, options_json, is_secret, sort_order
       FROM site_settings
      ORDER BY setting_group ASC, sort_order ASC`,
  );

  const groups = new Map();
  for (const row of rows) {
    const entry = {
      ...row,
      // Never send a stored secret to the browser; show only whether one exists.
      setting_value: row.is_secret ? '' : row.setting_value,
      has_value: row.is_secret ? Boolean(row.setting_value) : undefined,
    };
    if (!groups.has(row.setting_group)) groups.set(row.setting_group, []);
    groups.get(row.setting_group).push(entry);
  }

  return groups;
}

/**
 * Writes several settings in one transaction.
 * @param {Object<string,*>} updates key => value
 * @returns {Promise<{changed: string[], before: object, after: object}>}
 */
async function setMany(updates) {
  const before = await getAll();
  const changed = [];

  await db.transaction(async (connection) => {
    for (const [key, rawValue] of Object.entries(updates)) {
      const [rows] = await connection.execute(
        'SELECT setting_value, value_type, is_secret FROM site_settings WHERE setting_key = ? LIMIT 1',
        [key],
      );
      if (!rows.length) continue;

      const row = rows[0];
      // An empty submission for a secret means "leave it unchanged",
      // because the current value was never sent to the browser.
      if (row.is_secret && (rawValue === '' || rawValue === null || rawValue === undefined)) continue;

      const value = row.value_type === 'boolean'
        ? (rawValue ? '1' : '0')
        : (rawValue === null || rawValue === undefined ? '' : String(rawValue));

      if (value === (row.setting_value ?? '')) continue;

      await connection.execute(
        'UPDATE site_settings SET setting_value = ? WHERE setting_key = ?',
        [value, key],
      );
      changed.push(key);
    }
  });

  if (changed.length) invalidate();

  const after = await getAll();
  return { changed, before, after };
}

async function set(key, value) {
  return setMany({ [key]: value });
}

// ------------------------------------------------------------- flags

async function getFlags() {
  const cached = cache.get(KEY_FLAGS);
  if (cached) return cached;

  try {
    const rows = await db.query('SELECT flag_key, is_enabled FROM feature_flags');
    const flags = {};
    for (const row of rows) flags[row.flag_key] = Boolean(row.is_enabled);
    lastKnownGood.flags = flags;
    return cache.set(KEY_FLAGS, flags, CACHE_TTL);
  } catch (err) {
    logger.error('settings: flag read failed, serving last known good', { message: err.message });
    return lastKnownGood.flags || {};
  }
}

/** Unknown flags default to `fallback` so a missing row never hides content. */
async function isEnabled(flagKey, fallback = true) {
  const flags = await getFlags();
  return flagKey in flags ? flags[flagKey] : fallback;
}

async function listFlags() {
  return db.query(
    'SELECT id, flag_key, label, description, is_enabled, updated_at FROM feature_flags ORDER BY flag_key ASC',
  );
}

/** @param {Object<string, boolean>} updates */
async function setFlags(updates) {
  const changed = [];
  await db.transaction(async (connection) => {
    for (const [flagKey, enabled] of Object.entries(updates)) {
      const [result] = await connection.execute(
        'UPDATE feature_flags SET is_enabled = ? WHERE flag_key = ?',
        [enabled ? 1 : 0, flagKey],
      );
      if (result.affectedRows) changed.push(flagKey);
    }
  });
  if (changed.length) cache.del(KEY_FLAGS);
  return changed;
}

// ------------------------------------------------------------- theme

/** @returns {Promise<Array<{var_name: string, var_value: string}>>} */
async function getThemeVariables() {
  const cached = cache.get(KEY_THEME);
  if (cached) return cached;

  try {
    const rows = await db.query(
      `SELECT var_name, var_value, default_value, label, description, group_name,
              input_type, options_json, sort_order
         FROM theme_settings
        ORDER BY group_name ASC, sort_order ASC`,
    );
    lastKnownGood.theme = rows;
    return cache.set(KEY_THEME, rows, CACHE_TTL);
  } catch (err) {
    logger.error('settings: theme read failed, serving last known good', { message: err.message });
    return lastKnownGood.theme || [];
  }
}

/**
 * Builds the :root override block injected into the public <head>.
 * Only variables that differ from their stylesheet default are emitted,
 * so the CSS file stays the source of truth for everything untouched.
 *
 * Values are filtered to a conservative character set - this string is
 * written into a <style> tag, so it must not be able to close the tag.
 */
async function getThemeCss() {
  const variables = await getThemeVariables();
  const overrides = variables.filter((row) => row.var_value !== row.default_value);
  if (!overrides.length) return '';

  const safe = overrides
    .filter((row) => /^--[a-z0-9-]+$/i.test(row.var_name))
    .filter((row) => !/[<>{};]/.test(row.var_value))
    .map((row) => `  ${row.var_name}: ${row.var_value};`);

  return safe.length ? `:root {\n${safe.join('\n')}\n}` : '';
}

async function setThemeVariables(updates) {
  const changed = [];
  await db.transaction(async (connection) => {
    for (const [varName, value] of Object.entries(updates)) {
      if (!/^--[a-z0-9-]+$/i.test(varName)) continue;
      if (/[<>{};]/.test(String(value))) continue;
      const [result] = await connection.execute(
        'UPDATE theme_settings SET var_value = ? WHERE var_name = ?',
        [String(value).slice(0, 160), varName],
      );
      if (result.affectedRows) changed.push(varName);
    }
  });
  if (changed.length) cache.del(KEY_THEME);
  return changed;
}

async function resetTheme() {
  await db.query('UPDATE theme_settings SET var_value = default_value');
  cache.del(KEY_THEME);
}

function invalidate() {
  cache.del(KEY_SETTINGS);
  cache.del(KEY_FLAGS);
  cache.del(KEY_THEME);
  cache.invalidatePrefix('public:');
}

module.exports = {
  getAll,
  get,
  set,
  setMany,
  getPublicSettings,
  getGrouped,
  getFlags,
  isEnabled,
  listFlags,
  setFlags,
  getThemeVariables,
  getThemeCss,
  setThemeVariables,
  resetTheme,
  invalidate,
};
