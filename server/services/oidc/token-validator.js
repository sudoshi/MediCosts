// =============================================================================
// MediCosts API — OIDC ID-token validation (Authentik SSO)
// Verifies signature (remote JWKS), issuer, audience, expiry and nonce via jose.
// =============================================================================

import { createRemoteJWKSet, jwtVerify } from 'jose';

export async function validateOidcIdToken(idToken, discovery, provider, expectedNonce) {
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: provider.clientId,
    maxTokenAge: '15m',
    clockTolerance: 30,
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error('OIDC nonce mismatch');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = (typeof payload.email === 'string' ? payload.email : '').toLowerCase();
  const name = (typeof payload.name === 'string' ? payload.name : '') || email;

  if (!sub || !email || !name) {
    throw new Error('OIDC id token is missing required user claims');
  }

  let groups = [];
  if (Array.isArray(payload.groups)) {
    groups = payload.groups.filter((g) => typeof g === 'string' && g.length > 0);
  } else if (typeof payload.groups === 'string' && payload.groups.length > 0) {
    groups = [payload.groups];
  }

  return { sub, email, name, groups };
}
