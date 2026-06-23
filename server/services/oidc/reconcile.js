// =============================================================================
// MediCosts API — OIDC user reconciliation (Authentik SSO)
// Resolves an Authentik identity to a row in `users` inside one tx:
//   1. by linked provider_subject (sub)
//   2. by email match
//   3. JIT-create (group-gated)
// Group mapping: members of an admin group get users.role = 'admin'. Local
// bcrypt auth is untouched; this is additive.
// =============================================================================

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../../db.js';

export class OidcAccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OidcAccessDeniedError';
  }
}

function groupMatches(userGroups, allowedGroups) {
  const normalized = new Set(userGroups.map((g) => g.toLowerCase()));
  return allowedGroups.some((g) => normalized.has(g.toLowerCase()));
}

async function unusablePasswordHash() {
  return bcrypt.hash(`oidc:${crypto.randomUUID()}:${crypto.randomBytes(24).toString('hex')}`, 12);
}

const USER_COLUMNS = 'id, email, full_name, role, must_change_password, is_active';

export async function reconcileOidcUser(claims, provider) {
  const isAllowed = groupMatches(claims.groups, provider.allowedGroups);
  const isAdmin = groupMatches(claims.groups, provider.adminGroups);

  if (!isAllowed && !isAdmin) {
    throw new OidcAccessDeniedError('OIDC user is not a member of an allowed MediCosts group');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Match by linked provider subject.
    let { rows } = await client.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.must_change_password, u.is_active
       FROM user_external_identities x
       JOIN users u ON u.id = x.user_id
       WHERE x.provider_type = 'authentik' AND x.provider_subject = $1
       LIMIT 1`,
      [claims.sub],
    );
    let user = rows[0];

    // 2. Match by email.
    if (!user) {
      ({ rows } = await client.query(
        `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [claims.email],
      ));
      user = rows[0];
    }

    if (user && !user.is_active) {
      throw new OidcAccessDeniedError('OIDC user maps to an inactive MediCosts account');
    }

    // 3. JIT-create.
    if (!user) {
      const role = isAdmin ? 'admin' : 'user';
      const passwordHash = await unusablePasswordHash();
      ({ rows } = await client.query(
        `INSERT INTO users (email, full_name, role, password_hash, must_change_password, is_active)
         VALUES ($1, $2, $3, $4, false, true)
         RETURNING ${USER_COLUMNS}`,
        [claims.email, claims.name, role, passwordHash],
      ));
      user = rows[0];
    }

    // Promote existing non-admins who are in an admin group.
    if (isAdmin && user.role !== 'admin') {
      ({ rows } = await client.query(
        `UPDATE users SET role = 'admin' WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [user.id],
      ));
      user = rows[0];
    }

    // Link / refresh the external identity.
    await client.query(
      `INSERT INTO user_external_identities
         (user_id, provider_type, provider_subject, email_at_link, claims, last_login_at)
       VALUES ($1, 'authentik', $2, $3, $4::jsonb, now())
       ON CONFLICT (provider_type, provider_subject)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         email_at_link = EXCLUDED.email_at_link,
         claims = EXCLUDED.claims,
         last_login_at = now(),
         updated_at = now()`,
      [
        user.id,
        claims.sub,
        claims.email,
        JSON.stringify({ email: claims.email, name: claims.name, groups: claims.groups }),
      ],
    );

    await client.query(`UPDATE users SET last_login = now() WHERE id = $1`, [user.id]);

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
