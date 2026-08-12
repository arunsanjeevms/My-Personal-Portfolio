'use strict';

/** Helpers for safely reading facts about the incoming request. */

const { config } = require('../config/env');

/**
 * Best-effort client IP.
 *
 * X-Forwarded-For is only trusted when TRUST_PROXY is on - otherwise any
 * client could spoof the header and defeat rate limiting.
 */
function getClientIp(req) {
  if (config.trustProxy) return req.ip || req.socket?.remoteAddress || '';
  return req.socket?.remoteAddress || req.ip || '';
}

/** User agent, clamped to the column width. */
function getUserAgent(req) {
  return String(req.get('user-agent') || '').slice(0, 255);
}

/** Referrer host only - the full referring URL is never stored. */
function getReferrerHost(req) {
  const referrer = req.get('referer') || req.get('referrer');
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 160);
  } catch {
    return null;
  }
}

/** True for fetch/XHR requests, which want JSON errors rather than HTML. */
function wantsJson(req) {
  if (req.xhr) return true;
  if (req.get('x-requested-with') === 'XMLHttpRequest') return true;
  if (req.path.startsWith('/api/')) return true;
  return Boolean(req.accepts(['html', 'json']) === 'json');
}

/**
 * Validates a post-login redirect target.
 * Only same-site absolute paths are allowed, which blocks open-redirect
 * abuse via ?next=https://evil.example.
 */
function safeRedirectPath(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  if (!value.startsWith('/')) return fallback;
  // "//evil.com" and "/\evil.com" are protocol-relative URLs, not paths.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

module.exports = { getClientIp, getUserAgent, getReferrerHost, wantsJson, safeRedirectPath };
