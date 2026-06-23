# DEVLOG — "Login with Authentik" (OIDC SSO)

**Date:** 2026-06-22
**Author:** Sanjay Udoshi (with Claude Code)
**Status:** Shipped to production (medicosts.acumenus.net)
**Commit:** `feat(auth): add Login with Authentik (OIDC SSO), additive`

---

## Summary

MediCosts now offers a **"Continue with Authentik"** button on the login screen
alongside the existing email/password sign-in. It implements the OpenID Connect
**Authorization Code flow with PKCE**, federating authentication to the Acumenus
Authentik IdP (`auth.acumenus.net`). The 7 "Parthenon Admins" can now sign into
MediCosts as administrators with their Authentik identity.

Purely **additive** — the protected local-auth subsystem (`server/routes/auth.js`,
bcrypt + JWT + temp-password flow, `server/lib/db-migrate.js`) is untouched, per
`.claude/rules/auth-system.md`. MediCosts was the last of the six Acumenus apps to
receive uniform SSO.

## Architecture

Express adaptation of the hand-rolled OIDC pattern used across the fleet. Tokens
never ride in a URL: a one-time exchange code hands the app JWT to the SPA.

```
SPA login → GET /api/auth/providers (is SSO enabled?)
          → click → GET /api/auth/oidc/redirect
                    (PKCE verifier + nonce under random `state`, 302 to Authentik)
Authentik → GET /api/auth/oidc/callback?code&state
                    (consume state → token exchange → validate id_token (jose) →
                     reconcile user → store one-time exchange code →
                     302 to ${APP_URL}/auth/callback?code=…)
SPA       → POST /api/auth/oidc/exchange { code }
                    (consume code → signToken(user) → { token, user })
          → handleLogin(token, user) → /overview
```

### New backend files (`server/`, plain `.js` to match the routes convention)
| File | Role |
|------|------|
| `services/oidc/discovery.js` | Discovery doc fetch + 1h cache |
| `services/oidc/handshake.js` | `state`/`exchange` artifacts in `oidc_handshakes` (pg) |
| `services/oidc/token-validator.js` | `jose` JWKS verify — issuer, audience, 15m, nonce |
| `services/oidc/provider-config.js` | Env-driven config + `isOidcPubliclyAvailable()` |
| `services/oidc/reconcile.js` | sub → email → JIT-create `users` row (group-gated) |
| `routes/auth-oidc.js` | The 4 routes; mounted at `/api/auth` before the requireAuth gate |
| `lib/oidc-migrate.js` | `runOidcMigrations()` — kept separate from protected `db-migrate.js` |

### Changed files
- `server/index.js` — import + mount `authOidcRouter` (before `app.use('/api', requireAuth)`); call `runOidcMigrations()` after `runMigrations()`
- `server/package.json` — add `jose`
- `client/src/components/LoginPage.jsx` — SSO button (gated on `/api/auth/providers`)
- `client/src/components/OidcCallback.jsx` — new `/auth/callback` page
- `client/src/App.jsx` — public `/auth/callback` route

### Database (`runOidcMigrations()`, idempotent at startup)
- `oidc_handshakes` — `id TEXT PK, kind('state'|'exchange'), payload JSONB, expires_at`
- `user_external_identities` — links Authentik `sub` → `users.id` (note: `users.id` is `SERIAL`/int),
  unique `(provider_type, provider_subject)`

Created at startup by the app user against `medicosts` (PGHOST=`pgsql.acumenus.net`,
which is a localhost alias). Tables owned by `smudoshi`. The protected `db-migrate.js`
was deliberately **not** edited — `index.js` chains `runMigrations().then(runOidcMigrations)`.

## Identity reconciliation & roles

`reconcileOidcUser()` (one tx via `pool.connect()` + BEGIN/COMMIT):
1. Match by linked `provider_subject` (sub).
2. Else match by `lower(email)`.
3. Else **JIT-create** a `users` row with an unusable bcrypt hash (satisfies
   `password_hash NOT NULL`), `must_change_password=false`.

Group → role: `OIDC_ADMIN_GROUPS` ("MediCosts Admins") members get `users.role='admin'`.
The exchange mints the same JWT shape as `routes/auth.js` `signToken`
(`{id, email, role, mustChangePassword}`), so the existing SPA + `requireAuth`
middleware work unchanged.

## Authentik provisioning

`scripts/authentik/provision_medicosts_oidc.py` (idempotent) created:
- OAuth2/OpenID provider **"MediCosts OIDC"** (pk 50), confidential, S256, `groups`
  claim mapping, redirect `https://medicosts.acumenus.net/api/auth/oidc/callback`
  (strict — note `/api/auth`, **not** `/api/v1`).
- Application slug **`medicosts-oidc`**.
- Group **"MediCosts Admins"** with the 7 admins, bound to the app.

`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` written to `.env` (gitignored). `APP_URL`
(already present) drives the callback redirect.

## Deployment

Prod = `medicosts.acumenus.net`, Apache `ProxyPass / → 127.0.0.1:3000`, systemd
`medicosts.service` (`node server/dist/index.js`). MediCosts has **no auto-deploy
daemon** — deploy is manual:

```bash
npm --prefix server run build     # tsc (allowJs) → server/dist
npm --prefix client run build     # vite → client/dist (served statically by Express)
sudo systemctl restart medicosts
```

`jose` lives in `server/node_modules` (server has its own; install with
`npm --prefix server install`).

## Verification

- Startup log: `✦ oidc_handshakes + user_external_identities tables ready`
- `GET /api/auth/providers` → `oidc_enabled: true`
- `GET /api/auth/oidc/redirect` → `302` to Authentik authorize (valid client_id,
  redirect_uri, S256, groups scope)
- Discovery resolves; SPA bundle contains the button; Authentik accepts the client.

## Gotchas captured

1. `users.id` is `SERIAL` (int), not UUID → `user_external_identities.user_id INTEGER`.
2. Protected `db-migrate.js` not edited → separate `oidc-migrate.js` chained in `index.js`.
3. Server has its own `node_modules`; `npm --prefix server install` for `jose`.
4. Redirect path is `/api/auth/...` (no `/api/v1` here, unlike Parthenon/Medgnosis/COPE).
