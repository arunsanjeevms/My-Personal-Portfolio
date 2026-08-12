'use strict';

/**
 * Small in-process TTL cache.
 *
 * Deliberately not Redis: this is a single-process Express app, the
 * cached payloads are a few kilobytes, and an extra service to operate
 * would buy nothing here. If the app is ever scaled to multiple
 * processes, swap this module's implementation - the interface is the
 * only thing callers depend on.
 *
 * Cached values are invalidated explicitly on admin writes rather than
 * being left to expire, so content changes appear immediately.
 */

const store = new Map();

let hits = 0;
let misses = 0;

function now() {
  return Date.now();
}

function get(key) {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return undefined;
  }
  if (entry.expiresAt !== 0 && entry.expiresAt < now()) {
    store.delete(key);
    misses += 1;
    return undefined;
  }
  hits += 1;
  return entry.value;
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds 0 = never expires (invalidate explicitly)
 */
function set(key, value, ttlSeconds = 300) {
  store.set(key, {
    value,
    expiresAt: ttlSeconds === 0 ? 0 : now() + ttlSeconds * 1000,
  });
  return value;
}

/**
 * Returns the cached value, or runs `producer`, caches and returns it.
 * A rejected producer is never cached.
 */
async function remember(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached !== undefined) return cached;

  const value = await producer();
  set(key, value, ttlSeconds);
  return value;
}

function del(key) {
  return store.delete(key);
}

/** Drops every key starting with `prefix`, e.g. "projects:". */
function invalidatePrefix(prefix) {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function clear() {
  store.clear();
}

/** Removes expired entries. Called periodically so the map cannot grow forever. */
function prune() {
  const current = now();
  let removed = 0;
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt !== 0 && entry.expiresAt < current) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function stats() {
  const total = hits + misses;
  return {
    keys: store.size,
    hits,
    misses,
    hitRate: total ? Number(((hits / total) * 100).toFixed(1)) : 0,
  };
}

module.exports = { get, set, remember, del, invalidatePrefix, clear, prune, stats };
