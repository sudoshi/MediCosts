import { useState } from 'react';
import s from './ChangePasswordModal.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0–5
}

function StrengthMeter({ password }) {
  const score = getStrength(password);
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#22c55e'];

  if (!password) return null;

  return (
    <div className={s.strengthMeter}>
      <div className={s.strengthBars}>
        {[1,2,3,4,5].map(i => (
          <div
            key={i}
            className={s.strengthBar}
            style={{ background: i <= score ? colors[score] : undefined }}
          />
        ))}
      </div>
      <span className={s.strengthLabel} style={{ color: colors[score] }}>
        {labels[score]}
      </span>
    </div>
  );
}

export default function ChangePasswordModal({ token, onSuccess }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPw.length < 8) {
      return setError('New password must be at least 8 characters');
    }
    if (newPw !== confirmPw) {
      return setError('Passwords do not match');
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Password change failed');
      } else {
        onSuccess(data.token, data.user);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="cpw-title">
        {/* Header */}
        <div className={s.header}>
          <div className={s.headerIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h2 id="cpw-title" className={s.title}>Set your password</h2>
            <p className={s.subtitle}>
              You're signed in with a temporary password. Choose a permanent one to continue.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Current (temp) password */}
          <div className={s.field}>
            <label className={s.label} htmlFor="cpw-current">Temporary password</label>
            <div className={s.inputWrap}>
              <input
                id="cpw-current"
                className={`${s.input} ${s.inputHasToggle}`}
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="From your email"
                autoComplete="current-password"
                disabled={busy}
              />
              <button
                type="button"
                className={s.pwToggle}
                onClick={() => setShowCurrent(v => !v)}
                tabIndex={-1}
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className={s.field}>
            <label className={s.label} htmlFor="cpw-new">New password</label>
            <div className={s.inputWrap}>
              <input
                id="cpw-new"
                className={`${s.input} ${s.inputHasToggle}`}
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                disabled={busy}
              />
              <button
                type="button"
                className={s.pwToggle}
                onClick={() => setShowNew(v => !v)}
                tabIndex={-1}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <StrengthMeter password={newPw} />
          </div>

          {/* Confirm password */}
          <div className={s.field}>
            <label className={s.label} htmlFor="cpw-confirm">Confirm new password</label>
            <input
              id="cpw-confirm"
              className={s.input}
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          {error && (
            <div className={s.error}>
              <span className={s.errorIcon}><AlertCircleIcon /></span>
              <span className={s.errorText}>{error}</span>
            </div>
          )}

          <button type="submit" className={s.submitBtn} disabled={busy || !currentPw || !newPw || !confirmPw}>
            {busy && <span className={s.spinner} />}
            {busy ? 'Updating...' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
