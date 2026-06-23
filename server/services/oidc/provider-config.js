// =============================================================================
// MediCosts API — OIDC provider configuration (Authentik SSO)
// Env-driven. OIDC is additive: local bcrypt auth (routes/auth.js) is the
// primary, untouched path. The "Login with Authentik" button only appears when
// this provider is publicly available (enabled + discovery_url + client_id +
// redirect_uri all set).
// =============================================================================

function list(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getOidcProviderConfig() {
  return {
    enabled: process.env.OIDC_ENABLED === 'true',
    label: process.env.OIDC_LABEL || 'Authentik',
    discoveryUrl: process.env.OIDC_DISCOVERY_URL || '',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || '',
    scopes: list(process.env.OIDC_SCOPES, ['openid', 'profile', 'email', 'groups']),
    allowedGroups: list(process.env.OIDC_ALLOWED_GROUPS, ['MediCosts Admins']),
    adminGroups: list(process.env.OIDC_ADMIN_GROUPS, ['MediCosts Admins']),
    stateTtlSeconds: Number(process.env.OIDC_STATE_TTL_SECONDS || '300'),
    exchangeTtlSeconds: Number(process.env.OIDC_EXCHANGE_TTL_SECONDS || '60'),
  };
}

export function isOidcPubliclyAvailable(p) {
  return Boolean(p.enabled && p.discoveryUrl && p.clientId && p.redirectUri);
}
