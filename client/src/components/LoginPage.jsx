import { useState, useRef } from 'react';
import s from './LoginPage.module.css';

const VALID_USER = 'admin';
const VALID_PASS = 'admin';

/* ── Inline SVG icons ── */

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

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

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

/* ── Login page ── */

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);

  function attempt(user, pass) {
    if (user === VALID_USER && pass === VALID_PASS) {
      setError('');
      setExiting(true);
      setTimeout(onLogin, 350);
    } else {
      setError('Invalid username or password');
      setPassword('');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    attempt(username, password);
  }

  async function handleQuickFill(user, pass) {
    setBusy(true);
    setError('');
    setUsername('');
    setPassword('');

    for (let i = 0; i <= user.length; i++) {
      await delay(40);
      setUsername(user.slice(0, i));
    }
    for (let i = 0; i <= pass.length; i++) {
      await delay(40);
      setPassword(pass.slice(0, i));
    }

    await delay(200);
    setBusy(false);
    attempt(user, pass);
  }

  return (
    <main className={s.page}>
      {/* ── LEFT: ATMOSPHERIC HERO ── */}
      <div className={s.hero} aria-hidden="true">
        {/* Drifting luminous orbs */}
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
            and geographic patterns across 4,700+ facilities — all in one
            powerful analytics dashboard.
          </p>

          <div className={s.trustRow}>
            <div className={s.trustItem}>
              <span className={s.trustIcon}><DatabaseIcon /></span>
              CMS Data 2023
            </div>
            <div className={s.trustItem}>
              <span className={s.trustIcon}><BuildingIcon /></span>
              4,700+ Hospitals
            </div>
            <div className={s.trustItem}>
              <span className={s.trustIcon}><ShieldIcon /></span>
              9M+ Records
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: LOGIN FORM ── */}
      <div className={s.formPanel}>
        <div className={`${s.card} ${exiting ? s.cardExit : ''}`}>
          <div className={s.header}>
            <h1 className={s.mobileBrand}>
              Medi<span className={s.heroBrandAccent}>Costs</span>
            </h1>
            <h2 className={s.title}>Welcome back</h2>
            <p className={s.subtitle}>Sign in to the analytics dashboard</p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="on">
            {/* Username */}
            <div className={s.field}>
              <label className={s.label} htmlFor="login-user">Username</label>
              <div className={s.inputWrap}>
                <input
                  id="login-user"
                  ref={userRef}
                  className={s.input}
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  disabled={busy}
                />
              </div>
            </div>

            {/* Password */}
            <div className={s.field}>
              <label className={s.label} htmlFor="login-pass">Password</label>
              <div className={s.inputWrap}>
                <input
                  id="login-pass"
                  className={`${s.input} ${s.inputHasToggle}`}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  disabled={busy}
                />
                <button
                  type="button"
                  className={s.pwToggle}
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className={s.rememberRow}>
              <input
                type="checkbox"
                className={s.checkbox}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className={s.checkboxLabel}>Remember me on this device</span>
            </label>

            {/* Error */}
            {error && (
              <div className={s.error}>
                <span className={s.errorIcon}><AlertCircleIcon /></span>
                <span className={s.errorText}>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" className={s.submitBtn} disabled={busy}>
              {busy && <span className={s.spinner} />}
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Demo quick-fill */}
          <div className={s.demoSection}>
            <span className={s.demoLabel}>Quick demo login</span>
            <div className={s.demoRow}>
              <button
                type="button"
                className={s.demoBtn}
                onClick={() => handleQuickFill('admin', 'admin')}
                disabled={busy}
              >
                Admin
              </button>
            </div>
          </div>

          <div className={s.footer}>
            <div className={s.footerDivider} />
            <div className={s.cmsBadge}>
              <span className={s.cmsDot} />
              Powered by Acumenus Data Sciences
            </div>
            <p className={s.footerText}>
              Medicare cost and quality analytics platform
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
