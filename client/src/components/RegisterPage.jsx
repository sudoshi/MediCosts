import { useState, useEffect } from 'react';
import s from './RegisterPage.module.css';

const API_STATS = (import.meta.env.VITE_API_URL || '/api') + '/stats';

function useLiveStats() {
  const [fmt, setFmt] = useState(null);
  useEffect(() => {
    fetch(API_STATS).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const M = n => n >= 1e6 ? Math.round(n / 1e6) + 'M+' : n.toLocaleString();
      setFmt({ totalRecords: M(d.total_records), hospitals: d.hospitals?.toLocaleString() + '+' });
    }).catch(() => {});
  }, []);
  return fmt;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AlertCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22V18h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  );
}

export default function RegisterPage({ onSignIn }) {
  const liveStats = useLiveStats();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      return setError('Full name is required');
    }
    if (!EMAIL_RE.test(email)) {
      return setError('Please enter a valid email address');
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      {/* ── LEFT: HERO ── */}
      <div className={s.hero} aria-hidden="true">
        <div className={`${s.orb} ${s.orbBlue}`} />
        <div className={`${s.orb} ${s.orbCyan}`} />
        <div className={`${s.orb} ${s.orbPurple}`} />

        <div className={s.heroContent}>
          <div className={s.heroLogo}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-1 10h-4v4h-4v-4H6v-2h4V7h4v4h4v2z" />
            </svg>
          </div>
          <h1 className={s.heroBrand}>
            Medi<span className={s.heroBrandAccent}>Costs</span>
          </h1>
          <p className={s.heroTagline}>
            Explore Medicare hospital costs, quality ratings, safety metrics,
            and geographic patterns across 5,400+ facilities.
          </p>
          <div className={s.trustRow}>
            <div className={s.trustItem}><span className={s.trustIcon}><DatabaseIcon /></span>CMS Data 2023</div>
            <div className={s.trustItem}><span className={s.trustIcon}><BuildingIcon /></span>{liveStats?.hospitals || '5,400+'} Hospitals</div>
            <div className={s.trustItem}><span className={s.trustIcon}><ShieldIcon /></span>{liveStats?.totalRecords || '47M+'} Records</div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: REGISTER FORM ── */}
      <div className={s.formPanel}>
        <div className={s.card}>
          {success ? (
            <div className={s.successState}>
              <div className={s.successIcon}><CheckCircleIcon /></div>
              <h2 className={s.successTitle}>Check your inbox</h2>
              <p className={s.successText}>
                We sent your temporary password to <strong>{email}</strong>.
                Sign in with it and you'll be prompted to set a permanent password.
              </p>
              <button type="button" className={s.submitBtn} onClick={onSignIn}>
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              <div className={s.header}>
                <h1 className={s.mobileBrand}>
                  Medi<span className={s.heroBrandAccent}>Costs</span>
                </h1>
                <h2 className={s.title}>Create account</h2>
                <p className={s.subtitle}>Request access to the analytics dashboard</p>
              </div>

              <form onSubmit={handleSubmit} autoComplete="on" noValidate>
                <div className={s.field}>
                  <label className={s.label} htmlFor="reg-name">Full name</label>
                  <input
                    id="reg-name"
                    className={s.input}
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    disabled={busy}
                    required
                  />
                </div>

                <div className={s.field}>
                  <label className={s.label} htmlFor="reg-email">Email</label>
                  <input
                    id="reg-email"
                    className={s.input}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    autoComplete="email"
                    disabled={busy}
                    required
                  />
                </div>

                <div className={s.field}>
                  <label className={s.label} htmlFor="reg-phone">
                    Phone <span className={s.optional}>(optional)</span>
                  </label>
                  <input
                    id="reg-phone"
                    className={s.input}
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    autoComplete="tel"
                    disabled={busy}
                  />
                </div>

                {error && (
                  <div className={s.error}>
                    <span className={s.errorIcon}><AlertCircleIcon /></span>
                    <span className={s.errorText}>{error}</span>
                  </div>
                )}

                <button type="submit" className={s.submitBtn} disabled={busy}>
                  {busy && <span className={s.spinner} />}
                  {busy ? 'Sending...' : 'Request access'}
                </button>
              </form>

              <div className={s.footer}>
                <div className={s.footerDivider} />
                <p className={s.switchText}>
                  Already have an account?{' '}
                  <button type="button" className={s.switchLink} onClick={onSignIn}>
                    Sign in
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
