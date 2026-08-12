'use strict';

/** Formatting helpers exposed to every EJS template. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "13 Aug 2005" */
function formatDate(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "13 Aug 2005, 14:32" */
function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(date)}, ${time}`;
}

/** "Aug 2025" - matches the style used in the resume timeline. */
function formatMonthYear(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "3 hours ago" */
function timeAgo(value) {
  const date = toDate(value);
  if (!date) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';

  const units = [
    { limit: 3600, divisor: 60, name: 'minute' },
    { limit: 86400, divisor: 3600, name: 'hour' },
    { limit: 604800, divisor: 86400, name: 'day' },
    { limit: 2592000, divisor: 604800, name: 'week' },
    { limit: 31536000, divisor: 2592000, name: 'month' },
    { limit: Infinity, divisor: 31536000, name: 'year' },
  ];

  for (const unit of units) {
    if (seconds < unit.limit) {
      const count = Math.floor(seconds / unit.divisor);
      return `${count} ${unit.name}${count === 1 ? '' : 's'} ago`;
    }
  }
  return '';
}

/** Whole days from now until `value`; negative when already past. */
function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

/** Seconds to "4m 12s". */
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function truncate(value, length = 100) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

/** Escapes text for safe interpolation into an HTML attribute or body. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** URL-friendly slug. Used for auto-filling slug fields in the admin. */
function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Preserves an existing query string while changing one parameter. */
function withQuery(currentQuery, changes) {
  const params = new URLSearchParams(currentQuery || {});
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

module.exports = {
  formatDate,
  formatDateTime,
  formatMonthYear,
  timeAgo,
  daysUntil,
  formatBytes,
  formatNumber,
  formatDuration,
  truncate,
  escapeHtml,
  slugify,
  initials,
  withQuery,
};
