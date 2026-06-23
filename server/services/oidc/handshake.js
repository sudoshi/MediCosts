// =============================================================================
// MediCosts API — OIDC handshake store (Authentik SSO)
// Single-use, TTL'd artifacts backed by the oidc_handshakes table:
//   'state'    → { nonce, codeVerifier }  (outbound authorize request)
//   'exchange' → { userId }               (one-time SPA token-exchange code)
// =============================================================================

import crypto from 'node:crypto';
import pool from '../../db.js';

export function token() {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

export async function storeHandshake(kind, payload, ttlSeconds) {
  const id = token();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await pool.query(
    `INSERT INTO oidc_handshakes (id, kind, payload, expires_at) VALUES ($1, $2, $3::jsonb, $4)`,
    [id, kind, JSON.stringify(payload), expiresAt],
  );
  return id;
}

export async function consumeHandshake(id, kind) {
  const { rows } = await pool.query(
    `DELETE FROM oidc_handshakes WHERE id = $1 AND kind = $2 AND expires_at > now() RETURNING payload`,
    [id, kind],
  );
  return rows[0]?.payload ?? null;
}
