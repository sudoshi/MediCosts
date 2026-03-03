import pool from '../db.js';

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                   SERIAL PRIMARY KEY,
      email                TEXT NOT NULL UNIQUE,
      full_name            TEXT NOT NULL,
      phone                TEXT,
      password_hash        TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT true,
      is_active            BOOLEAN NOT NULL DEFAULT true,
      role                 TEXT NOT NULL DEFAULT 'user',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login           TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
  `);
  console.log('✦ users table ready');

  // Abby conversation persistence (Phase 4.3)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abby_sessions (
      session_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_active  TIMESTAMPTZ NOT NULL DEFAULT now(),
      message_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS abby_sessions_user_idx ON abby_sessions (user_id, last_active DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abby_messages (
      id          BIGSERIAL PRIMARY KEY,
      session_id  UUID NOT NULL REFERENCES abby_sessions(session_id) ON DELETE CASCADE,
      role        VARCHAR(20) NOT NULL,
      content     TEXT NOT NULL,
      tool_calls  JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS abby_messages_session_idx ON abby_messages (session_id, created_at ASC);
  `);
  console.log('✦ abby_sessions + abby_messages tables ready');
}
