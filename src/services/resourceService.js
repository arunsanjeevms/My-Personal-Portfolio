'use strict';

/**
 * Coercion and validation for declared resources.
 *
 * Turns raw form input into typed column values and reports per-field
 * errors. Anything not declared in the schema is discarded, so a crafted
 * form post cannot set columns the UI does not expose.
 */

const resourceRepository = require('../repositories/resourceRepository');
const { slugify } = require('../utils/viewHelpers');

/** HTML permitted in richtext fields. Everything else is stripped. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li',
  'h3', 'h4', 'h5', 'blockquote', 'code', 'pre', 'span', 'hr',
]);

/**
 * Minimal, allowlist-based HTML sanitiser.
 *
 * Removes script/style/iframe wholesale, drops any tag not on the
 * allowlist, and strips every attribute except href/title on links -
 * which blocks on* event handlers and javascript: URLs.
 *
 * Applied on write AND on render, so content stored before a rule change
 * is still cleaned on the way out.
 */
function sanitizeHtml(input) {
  if (!input) return null;

  let html = String(input);

  // Remove dangerous elements together with their contents.
  html = html.replace(/<(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, '');

  // Filter remaining tags against the allowlist.
  html = html.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tagName, attributes) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';

    if (match.startsWith('</')) return `</${tag}>`;

    if (tag === 'a') {
      const hrefMatch = attributes.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim();
      // Only allow schemes that cannot execute script.
      const safeHref = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href) ? href : '';
      return safeHref
        ? `<a href="${safeHref.replace(/"/g, '&quot;')}" rel="noopener noreferrer">`
        : '<a>';
    }

    // Every other allowed tag keeps no attributes at all.
    return `<${tag}>`;
  });

  return html.trim() || null;
}

/**
 * Coerces one submitted value to the shape its column expects.
 * @returns {*} the value to persist
 */
function coerceValue(field, raw) {
  switch (field.type) {
    case 'checkbox':
      // Unchecked boxes are simply absent from the POST body.
      return raw === 'on' || raw === '1' || raw === 'true' || raw === true ? 1 : 0;

    case 'number': {
      if (raw === '' || raw === undefined || raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }

    case 'level': {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return field.default ?? 3;
      return Math.min(5, Math.max(1, parsed));
    }

    case 'media': {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    case 'date':
      // '' would become 0000-00-00; NULL is what an empty date means.
      return raw ? String(raw).slice(0, 10) : null;

    case 'richtext':
      return sanitizeHtml(raw);

    case 'tags':
      // Stored as a newline-delimited list, edited as a textarea.
      if (!raw) return null;
      return String(raw)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n') || null;

    case 'slug':
      return raw ? slugify(raw) : null;

    default: {
      if (raw === undefined || raw === null) return null;
      const value = String(raw).trim();
      if (!value) return null;
      return field.maxLength ? value.slice(0, field.maxLength) : value;
    }
  }
}

/**
 * Builds the persistable payload and collects field errors.
 *
 * @returns {Promise<{values: object, errors: Object<string,string>}>}
 */
async function buildPayload(resource, body, { existingId = null } = {}) {
  const values = {};
  const errors = {};

  for (const field of resource.fields) {
    let value = coerceValue(field, body[field.name]);

    // A field left blank on the form arrives as null, but several columns
    // are NOT NULL with a database default (sort_order, status,
    // employment_type...). Fall back to the schema default when there is
    // one, and omit the column entirely when it is marked omitWhenEmpty
    // so the database default applies instead of an explicit NULL.
    if (value === null && field.type !== 'checkbox') {
      if (field.default !== undefined) {
        value = field.default;
      } else if (field.omitWhenEmpty) {
        continue;
      }
    }

    if (field.required && (value === null || value === '' || value === 0 && field.type !== 'number')) {
      // A required checkbox is a contradiction; only flag real emptiness.
      if (field.type !== 'checkbox') {
        errors[field.name] = `${field.label} is required.`;
      }
    }

    if (value !== null) {
      if (field.type === 'url' && !/^(https?:\/\/|mailto:|tel:|\/)/i.test(value)) {
        errors[field.name] = 'Enter a full URL starting with https://';
      }
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        errors[field.name] = 'Enter a valid email address.';
      }
      if (field.maxLength && String(value).length > field.maxLength) {
        errors[field.name] = `Keep this under ${field.maxLength} characters.`;
      }
    }

    values[field.name] = value;
  }

  // Slugs must be unique within the resource.
  const slugField = resource.fields.find((field) => field.type === 'slug');
  if (slugField && values[slugField.name]) {
    if (await resourceRepository.slugTaken(resource, values[slugField.name], existingId)) {
      errors[slugField.name] = 'That slug is already used. Choose another.';
    }
  }

  return { values, errors };
}

/**
 * Turns a stored row into the shape the form expects (dates as
 * yyyy-mm-dd, booleans as booleans).
 */
function toFormValues(resource, row) {
  if (!row) return {};

  const values = {};
  for (const field of resource.fields) {
    const raw = row[field.name];

    if (field.type === 'checkbox') {
      values[field.name] = Boolean(raw);
    } else if (field.type === 'date' && raw) {
      values[field.name] = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
    } else {
      values[field.name] = raw ?? '';
    }
  }

  return values;
}

/** Defaults for a blank create form. */
function defaultValues(resource) {
  const values = {};
  for (const field of resource.fields) {
    values[field.name] = field.default ?? (field.type === 'checkbox' ? false : '');
  }
  return values;
}

/** Field list grouped for the form layout, preserving declaration order. */
function groupFields(resource) {
  const groups = new Map();
  for (const field of resource.fields) {
    const group = field.group || 'Details';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(field);
  }
  return groups;
}

module.exports = {
  sanitizeHtml,
  coerceValue,
  buildPayload,
  toFormValues,
  defaultValues,
  groupFields,
};
