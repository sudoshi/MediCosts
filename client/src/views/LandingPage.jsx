/**
 * LandingPage — public-facing entry point for MediCosts.
 * Shows mission, key stats, data sources, and login CTA.
 * Indexable by search engines (no auth required).
 */

import { useState, useEffect } from 'react';
import LoginPage from '../components/LoginPage';
import RegisterPage from '../components/RegisterPage';
import s from './LandingPage.module.css';

const API_STATS = (import.meta.env.VITE_API_URL || '/api') + '/stats';

function useLiveStats() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(API_STATS).then(r => r.ok ? r.json() : null).then(d => { if (d) setData(d); }).catch(() => {});
  }, []);
  return data;
}

const STATIC_STATS = [
  { value: '3.4×', label: 'Average hospital markup over Medicare rates', sub: 'Hospitals charge 340% of what Medicare pays on average' },
  { value: '$6.6B', label: 'Pharma & device payments to physicians disclosed', sub: 'Track every dollar paid to every doctor — by drug and company' },
  { value: '47M+', label: 'Records across 20+ CMS datasets', sub: 'Hospitals, clinicians, payments, financials, quality, post-acute' },
];

const DATA_SOURCES = [
  { name: 'CMS Inpatient Charges', detail: '146K hospital-DRG pairs, 2023', color: '#3b82f6' },
  { name: 'Hospital Quality (HCAHPS)', detail: '5-star ratings, safety, readmissions', color: '#22d3ee' },
  { name: 'Open Payments', detail: '30M+ pharma payments, $6.6B disclosed, PY2023–2024', color: '#a78bfa' },
  { name: 'HCRIS Cost Reports', detail: 'Hospital financials, FY2023–2024', color: '#34d399' },
  { name: 'HRSA Shortage Areas', detail: '88K primary care / dental / mental health shortage areas', color: '#f87171' },
  { name: 'CDC PLACES', detail: 'Community health at ZIP level, 32K ZIPs', color: '#fbbf24' },
  { name: 'NPI Clinician Directory', detail: '2.7M active providers', color: '#60a5fa' },
  { name: 'Post-Acute Care', detail: '465K hospice, nursing homes, dialysis, rehab, home health', color: '#4ade80' },
  { name: 'Medicare Physician Services', detail: '9.7M service-level claims by provider & procedure', color: '#f97316' },
  { name: 'Part D Drug Spending', detail: '1.4M prescribers · 14K drugs tracked', color: '#e879f9' },
];

const FEATURES = [
  {
    icon: '🏥',
    title: 'Hospital Explorer',
    desc: 'Search 5,400+ hospitals. See charges, quality ratings, readmissions, infections, and patient experience scores side by side.',
  },
  {
    icon: '💊',
    title: 'Industry Payments',
    desc: 'See every dollar pharma and device companies paid to physicians and hospitals — by doctor, by company, by drug.',
  },
  {
    icon: '📍',
    title: 'Shortage Area Alerts',
    desc: 'Know instantly if you\'re in an HRSA-designated shortage area before choosing a provider or estimating costs.',
  },
  {
    icon: '🔍',
    title: 'Cost Estimator',
    desc: 'Find the real price for 500+ procedures at hospitals near you. Compare charges vs. Medicare payments.',
  },
  {
    icon: '👩‍⚕️',
    title: 'Clinician Directory',
    desc: '2.7M+ providers searchable by name, specialty, ZIP, and affiliation — with pharma payment history.',
  },
  {
    icon: '🤖',
    title: 'Abby AI Assistant',
    desc: 'Ask natural language questions about hospital quality, costs, and community health. Powered by Claude.',
  },
];

export default function LandingPage({ onLogin, onRegister }) {
  const liveStats = useLiveStats();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Build dynamic stats — replace placeholders when live data arrives
  const M = n => n >= 1e6 ? Math.round(n / 1e6) + 'M+' : n?.toLocaleString() || '—';
  const B = n => n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : '$' + Math.round(n / 1e6) + 'M';
  const STATS = liveStats ? [
    { value: '3.4×', label: 'Average hospital markup over Medicare rates', sub: 'Hospitals charge 340% of what Medicare pays on average' },
    { value: B(liveStats.open_payments_dollars), label: 'Pharma & device payments to physicians disclosed', sub: `${M(liveStats.open_payments)} payment records from ${liveStats.clinicians ? Math.round(liveStats.clinicians / 1e6) + 'M+' : '2.7M+'} providers` },
    { value: M(liveStats.total_records), label: 'Records across 20+ CMS datasets', sub: `${liveStats.hospitals?.toLocaleString()}+ hospitals · ${M(liveStats.clinicians)} clinicians · ${M(liveStats.physician_services)} Medicare claims` },
  ] : STATIC_STATS;

  if (showRegister) {
    return (
      <RegisterPage
        onSignIn={() => { setShowRegister(false); setShowLogin(true); }}
      />
    );
  }

  if (showLogin) {
    return (
      <LoginPage
        onLogin={onLogin}
        onRegister={() => { setShowLogin(false); setShowRegister(true); }}
      />
    );
  }

  return (
    <div className={s.page}>
      {/* ── Meta for SEO ── */}
      <title>MediCosts — Hospital Cost & Quality Transparency</title>

      {/* ── Nav ── */}
      <nav className={s.nav}>
        <div className={s.navBrand}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className={s.logoMark}>
            <rect width="28" height="28" rx="7" fill="#3b82f6" fillOpacity="0.15"/>
            <path d="M14 5v18M5 14h18" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className={s.brandName}>MediCosts</span>
        </div>
        <div className={s.navActions}>
          <a href="#data" className={s.navLink}>Data Sources</a>
          <a href="#features" className={s.navLink}>Features</a>
          <a href="/blog" className={s.navLink}>Blog</a>
          <button className={s.loginBtn} onClick={() => setShowLogin(true)}>Sign In</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroEyebrow}>Healthcare Transparency — Powered by Public CMS Data</div>
        <h1 className={s.heroTitle}>
          Know what hospitals<br />
          <span className={s.heroAccent}>actually charge</span> — and why.
        </h1>
        <p className={s.heroSub}>
          MediCosts aggregates {liveStats ? M(liveStats.total_records) : '47M+'} records from 20+ CMS datasets to put hospital costs,
          quality ratings, physician payments, and community health data in one place — so you can
          make informed healthcare decisions before the bill arrives.
        </p>
        <div className={s.heroCtas}>
          <button className={s.ctaPrimary} onClick={() => setShowLogin(true)}>
            Explore the Data →
          </button>
          <a href="#features" className={s.ctaSecondary}>See what's inside</a>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className={s.statsRow}>
        {STATS.map((st, i) => (
          <div key={i} className={s.statCard}>
            <span className={s.statValue}>{st.value}</span>
            <span className={s.statLabel}>{st.label}</span>
            <span className={s.statSub}>{st.sub}</span>
          </div>
        ))}
      </section>

      {/* ── Features ── */}
      <section className={s.section} id="features">
        <h2 className={s.sectionTitle}>What you can explore</h2>
        <div className={s.featureGrid}>
          {FEATURES.map((f, i) => (
            <div key={i} className={s.featureCard}>
              <span className={s.featureIcon}>{f.icon}</span>
              <h3 className={s.featureTitle}>{f.title}</h3>
              <p className={s.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Data Sources ── */}
      <section className={s.section} id="data">
        <h2 className={s.sectionTitle}>Built on publicly mandated CMS data</h2>
        <p className={s.sectionSub}>
          All data is sourced from federal agencies under freedom-of-information and regulatory
          transparency mandates. No patient data. No PHI. Just the facts hospitals are required to disclose.
        </p>
        <div className={s.sourceGrid}>
          {DATA_SOURCES.map((d, i) => (
            <div key={i} className={s.sourceChip} style={{ borderColor: d.color + '40' }}>
              <span className={s.sourceDot} style={{ background: d.color }} />
              <div>
                <div className={s.sourceName}>{d.name}</div>
                <div className={s.sourceDetail}>{d.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className={s.ctaBanner}>
        <h2 className={s.ctaBannerTitle}>Healthcare transparency is a right, not a privilege.</h2>
        <p className={s.ctaBannerSub}>
          MediCosts makes federally-mandated data actually usable — for patients, advocates, researchers, and journalists.
        </p>
        <button className={s.ctaPrimary} onClick={() => setShowLogin(true)}>
          Start Exploring — Free →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className={s.footer}>
        <div className={s.footerLinks}>
          <span className={s.footerBrand}>MediCosts</span>
          <span className={s.footerSep}>·</span>
          <span className={s.footerNote}>
            Data: CMS, HRSA, CDC PLACES · All data is publicly mandated federal disclosure · No PHI stored
          </span>
        </div>
        <div className={s.footerNote}>
          Built to save lives and billions. Not affiliated with CMS or any insurer.
        </div>
      </footer>
    </div>
  );
}
