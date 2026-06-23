import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Authentik → API callback redirects the browser here with a one-time ?code=.
// We swap it for an app JWT via POST /api/auth/oidc/exchange, then enter the app.
export default function OidcCallback({ onLogin }) {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  // React strict mode double-invokes effects; the one-time code can only be
  // consumed once, so guard with a ref.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get('oidc_error');
    if (oidcError) {
      setError(oidcError);
      return;
    }
    const code = params.get('code');
    if (!code) {
      setError('missing_code');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/oidc/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          setError(data.error || 'sign_in_failed');
          return;
        }
        onLogin(data.token, data.user);
        navigate('/overview', { replace: true });
      } catch {
        setError('network_error');
      }
    })();
  }, [navigate, onLogin]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
        color: '#1f2937',
        textAlign: 'center',
        padding: 24,
      }}
    >
      {error ? (
        <>
          <h2 style={{ margin: 0 }}>Sign-in failed</h2>
          <p style={{ maxWidth: 420, color: '#6b7280' }}>
            {error === 'access_denied'
              ? 'Your account is not authorized for MediCosts. Contact an administrator.'
              : 'We could not complete single sign-on. Please try again.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid #dbeafe',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'medicosts-oidc-spin 0.8s linear infinite',
            }}
          />
          <h2 style={{ margin: 0 }}>Signing you in…</h2>
          <p style={{ color: '#6b7280' }}>Completing Authentik sign-in.</p>
          <style>{'@keyframes medicosts-oidc-spin{to{transform:rotate(360deg)}}'}</style>
        </>
      )}
    </div>
  );
}
