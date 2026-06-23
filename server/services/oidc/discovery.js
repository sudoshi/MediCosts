// =============================================================================
// MediCosts API — OIDC discovery document fetch + 1h cache (Authentik SSO)
// =============================================================================

const cache = new Map();
const TTL_MS = 60 * 60 * 1000;

export async function fetchOidcDiscovery(discoveryUrl) {
  const cached = cache.get(discoveryUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.doc;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(discoveryUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Discovery request failed with status ${res.status}`);
    const doc = await res.json();
    if (
      !doc ||
      typeof doc.issuer !== 'string' ||
      typeof doc.authorization_endpoint !== 'string' ||
      typeof doc.token_endpoint !== 'string' ||
      typeof doc.jwks_uri !== 'string'
    ) {
      throw new Error('OIDC discovery document is missing required endpoints');
    }
    cache.set(discoveryUrl, { doc, expiresAt: Date.now() + TTL_MS });
    return doc;
  } finally {
    clearTimeout(timeout);
  }
}
