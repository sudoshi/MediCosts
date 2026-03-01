import { useState, useRef } from 'react';
import s from './LoginPage.module.css';

const VALID_USER = 'admin';
const VALID_PASS = 'admin';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  const passRef = useRef(null);

  function attempt(user, pass) {
    if (user === VALID_USER && pass === VALID_PASS) {
      setError('');
      setExiting(true);
      setTimeout(onLogin, 350);
    } else {
      setError('Invalid username or password');
      setPassword('');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    attempt(username, password);
  }

  async function handleQuickLogin() {
    setBusy(true);
    setError('');
    setUsername('');
    setPassword('');

    // brief typing animation
    const user = VALID_USER;
    const pass = VALID_PASS;

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

  const cardClass = [
    s.card,
    shaking ? s.shake : '',
    exiting ? s.cardExit : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={s.backdrop}>
      <form className={cardClass} onSubmit={handleSubmit} autoComplete="off">
        {/* Logo mark */}
        <div className={s.logoMark}>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-1 10h-4v4h-4v-4H6v-2h4V7h4v4h4v2z" />
          </svg>
        </div>

        <div className={s.wordmark}>MediCosts</div>
        <div className={s.subtitle}>Medicare Cost Analysis Dashboard</div>

        {/* Username */}
        <div className={s.fieldGroup}>
          <label className={s.label} htmlFor="username">Username</label>
          <input
            id="username"
            ref={userRef}
            className={s.input}
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Password */}
        <div className={s.fieldGroup}>
          <label className={s.label} htmlFor="password">Password</label>
          <input
            id="password"
            ref={passRef}
            className={s.input}
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Error */}
        <div className={s.error}>{error}</div>

        {/* Actions */}
        <button type="submit" className={s.signInBtn} disabled={busy}>
          Sign In
        </button>
        <button
          type="button"
          className={s.quickBtn}
          onClick={handleQuickLogin}
          disabled={busy}
        >
          Quick Login (admin)
        </button>

        <div className={s.poweredBy}>
          Powered by <span className={s.poweredByName}>Acumenus Data Sciences</span>
        </div>
      </form>
    </div>
  );
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
