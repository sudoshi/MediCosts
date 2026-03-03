/**
 * Simple in-memory TTL cache for expensive read-only API queries.
 * Usage:
 *   import { cache } from '../lib/cache.js';
 *   const data = await cache('key', 300, () => db.query(...));
 */

const store = new Map(); // key → { value, expiresAt }

/**
 * Get a cached value or compute it.
 * @param {string} key     Cache key
 * @param {number} ttlSec  TTL in seconds
 * @param {Function} fn    Async function to compute the value on miss
 * @returns {Promise<any>}
 */
export async function cache(key, ttlSec, fn) {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expiresAt > now) return entry.value;

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlSec * 1000 });
  return value;
}

/**
 * Invalidate a specific key (or all keys matching a prefix).
 */
export function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Return current cache stats (useful for /health endpoint).
 */
export function stats() {
  const now = Date.now();
  let live = 0, expired = 0;
  for (const entry of store.values()) {
    if (entry.expiresAt > now) live++; else expired++;
  }
  return { size: store.size, live, expired };
}
