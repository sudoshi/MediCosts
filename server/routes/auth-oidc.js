// =============================================================================
// MediCosts API — Authentik OIDC SSO routes (ADDITIVE — does not touch auth.js)
// GET  /api/auth/providers       — advertises which sign-in methods are live
// GET  /api/auth/oidc/redirect   — start Authorization-Code + PKCE flow
// GET  /api/auth/oidc/callback   — exchange code, validate id_token, reconcile
// POST /api/auth/oidc/exchange   — SPA swaps one-time code for an app JWT
//
// Mints the same JWT shape as routes/auth.js (signToken) so the existing SPA
// auth flow works unchanged. Local bcrypt auth in auth.js is untouched.
// =============================================================================

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { getOidcProviderConfig, isOidcPubliclyAvailable } from '../services/oidc/provider-config.js';
import { fetchOidcDiscovery } from '../services/oidc/discovery.js';
import { validateOidcIdToken } from '../services/oidc/token-validator.js';
import { storeHandshake, consumeHandshake, token, sha256 } from '../services/oidc/handshake.js';
import { reconcileOidcUser, OidcAccessDeniedError } from '../services/oidc/reconcile.js';

const router = Router();
const JWT_EXPIRY = '7d';

// Mirrors routes/auth.js signToken — same claim shape the SPA + requireAuth expect.
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

// GET /api/auth/providers
router.get('/providers', (_req, res) => {
  const p = getOidcProviderConfig();
  const enabled = isOidcPubliclyAvailable(p);
  return res.json({
    local_enabled: true,
    oidc_enabled: enabled,
    oidc_label: enabled ? p.label : null,
    oidc_redirect_path: enabled ? '/auth/oidc/redirect' : null,
  });
});

// GET /api/auth/oidc/redirect
router.get('/oidc/redirect', async (_req, res) => {
  const p = getOidcProviderConfig();
  if (!isOidcPubliclyAvailable(p)) {
    return res.status(404).json({ error: 'OIDC sign-in is not enabled' });
  }
  try {
    const d = await fetchOidcDiscovery(p.discoveryUrl);
    const codeVerifier = token();
    const nonce = token();
    const state = await storeHandshake('state', { nonce, codeVerifier }, p.stateTtlSeconds);

    const u = new URL(d.authorization_endpoint);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', p.clientId);
    u.searchParams.set('redirect_uri', p.redirectUri);
    u.searchParams.set('scope', p.scopes.join(' '));
    u.searchParams.set('state', state);
    u.searchParams.set('nonce', nonce);
    u.searchParams.set('code_challenge', sha256(codeVerifier));
    u.searchParams.set('code_challenge_method', 'S256');
    return res.redirect(u.toString());
  } catch (err) {
    console.error('[oidc] redirect error:', err?.message);
    return res.status(500).json({ error: 'OIDC redirect failed' });
  }
});

// GET /api/auth/oidc/callback
router.get('/oidc/callback', async (req, res) => {
  const appUrl = process.env.APP_URL || '';
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${appUrl}/login?oidc_error=${encodeURIComponent(String(error))}`);
  }
  if (!code || !state) {
    return res.status(400).json({ error: 'OIDC callback is missing code or state' });
  }

  const statePayload = await consumeHandshake(String(state), 'state');
  if (!statePayload) {
    return res.status(400).json({ error: 'OIDC state is invalid or expired' });
  }

  const p = getOidcProviderConfig();
  if (!isOidcPubliclyAvailable(p)) {
    return res.status(404).json({ error: 'OIDC sign-in is not enabled' });
  }

  try {
    const d = await fetchOidcDiscovery(p.discoveryUrl);
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      code_verifier: statePayload.codeVerifier,
    });
    if (p.clientSecret) form.set('client_secret', p.clientSecret);

    const tr = await fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!tr.ok) {
      console.warn('[oidc] token exchange failed:', tr.status);
      return res.redirect(`${appUrl}/login?oidc_error=token_exchange_failed`);
    }
    const tb = await tr.json();
    if (!tb.id_token) {
      return res.redirect(`${appUrl}/login?oidc_error=missing_id_token`);
    }

    const claims = await validateOidcIdToken(tb.id_token, d, p, statePayload.nonce);
    const user = await reconcileOidcUser(claims, p);
    const exchangeCode = await storeHandshake('exchange', { userId: user.id }, p.exchangeTtlSeconds);
    return res.redirect(`${appUrl}/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
  } catch (err) {
    const code2 = err instanceof OidcAccessDeniedError ? 'access_denied' : 'validation_failed';
    console.warn('[oidc] callback failed:', err?.message);
    return res.redirect(`${appUrl}/login?oidc_error=${code2}`);
  }
});

// POST /api/auth/oidc/exchange
router.post('/oidc/exchange', async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  const payload = await consumeHandshake(String(code), 'exchange');
  if (!payload) {
    return res.status(400).json({ error: 'OIDC exchange code is invalid or expired' });
  }

  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, must_change_password
     FROM users WHERE id = $1 AND is_active = true`,
    [payload.userId],
  );
  const user = rows[0];
  if (!user) {
    return res.status(404).json({ error: 'User account not found or disabled' });
  }

  const tk = signToken(user);
  await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

  return res.json({
    token: tk,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      mustChangePassword: user.must_change_password,
    },
  });
});

export default router;
