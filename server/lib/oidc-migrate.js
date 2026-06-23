// =============================================================================
// MediCosts — Authentik OIDC schema (ADDITIVE)
// Kept separate from the protected db-migrate.js. Idempotent; runs at startup.
// Tables are accessed pre-authentication, so they carry no must_change_password
// / RLS coupling — purely the OIDC handshake + identity link.
// =============================================================================

import pool from '../db.js';

export async function runOidcMigrations() {
  // Single-use, TTL'd handshake artifacts (PKCE/nonce state + exchange code).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oidc_handshakes (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL CHECK (kind IN ('state', 'exchange')),
      payload    JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS oidc_handshakes_expires_idx ON oidc_handshakes (expires_at);
  `);

  // Links an Authentik subject to a local users row.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_external_identities (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_type    TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_at_link    TEXT,
      claims           JSONB NOT NULL DEFAULT '{}'::jsonb,
      linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at    TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider_type, provider_subject)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_external_identities_user_idx ON user_external_identities (user_id);
  `);

  console.log('✦ oidc_handshakes + user_external_identities tables ready');
}
