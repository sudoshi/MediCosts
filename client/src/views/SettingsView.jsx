import { useState, useEffect, useCallback } from 'react';
import Panel from '../components/Panel.jsx';
import s from './SettingsView.module.css';

const API = import.meta.env.VITE_API_URL || '/api';

const DATA_SOURCES = [
  { name: 'Medicare Inpatient (DRGs)', table: 'medicare_inpatient' },
  { name: 'Hospital Info & Quality', table: 'hospital_info' },
  { name: 'HCAHPS Patient Survey', table: 'hcahps_survey' },
  { name: 'Medicare Outpatient', table: 'medicare_outpatient' },
  { name: 'Medicare Physician', table: 'medicare_physician' },
  { name: 'Census Demographics', table: 'census_zcta' },
  { name: 'NHSN HAI Infections', table: 'nhsn_hai' },
  { name: 'Hospital Readmissions (HRRP)', table: 'hospital_readmissions' },
  { name: 'Patient Safety (HAC)', table: 'patient_safety_indicators' },
  { name: 'Timely & Effective Care', table: 'timely_effective_care' },
  { name: 'Complications & Deaths', table: 'complications_deaths' },
  { name: 'Payment & Value of Care', table: 'payment_value_care' },
];

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'clearnetwork', label: 'ClearNetwork Crawler' },
];

function fmt(n) {
  if (n == null) return '\u2014';
  return Number(n).toLocaleString();
}

function relTime(ts) {
  if (!ts) return '\u2014';
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const colors = {
    running: '#3b82f6',
    completed: '#22c55e',
    completed_with_errors: '#f59e0b',
    failed: '#ef4444',
  };
  const color = colors[status] || '#71717a';
  return (
    <span className={s.badge} style={{ background: `${color}22`, color, borderColor: `${color}44` }}>
      {status === 'running' && <span className={s.pulse} />}
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function durationFmt(seconds) {
  if (!seconds) return '\u2014';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function StatCard({ label, value, highlight, warn }) {
  let cls = s.statCard;
  if (highlight) cls += ` ${s.statHighlight}`;
  if (warn) cls += ` ${s.statWarn}`;
  return (
    <div className={cls}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

/* ---------- ClearNetwork Monitor ---------- */
function ClearNetworkPanel() {
  const [status, setStatus] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [failures, setFailures] = useState([]);
  const [providerStats, setProviderStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [st, ins, jb, fail, ps] = await Promise.all([
        fetch(`${API}/clearnetwork/status`).then(r => r.json()),
        fetch(`${API}/clearnetwork/insurers`).then(r => r.json()),
        fetch(`${API}/clearnetwork/crawl-jobs?limit=20`).then(r => r.json()),
        fetch(`${API}/clearnetwork/failures?limit=20`).then(r => r.json()),
        fetch(`${API}/clearnetwork/provider-stats`).then(r => r.json()),
      ]);
      setStatus(st);
      setInsurers(ins);
      setJobs(jb);
      setFailures(fail);
      setProviderStats(ps);
      setError(null);
    } catch {
      setError('Failed to load ClearNetwork data. Is the clearnetwork schema set up?');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAll]);

  if (loading) return <div className={s.loading}>Loading ClearNetwork status...</div>;
  if (error) return <div className={s.errorBox}>{error}</div>;

  const SUB_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'insurers', label: `Insurers (${insurers.length})` },
    { id: 'jobs', label: `Crawl Jobs (${jobs.length})` },
    { id: 'failures', label: `Failures (${failures.length})` },
  ];

  return (
    <>
      <div className={s.subTabs}>
        {SUB_TABS.map(t => (
          <button key={t.id} className={`${s.subTab} ${subTab === t.id ? s.subTabActive : ''}`}
            onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
        <div className={s.subTabSpacer} />
        <label className={s.autoRefreshLabel}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto-refresh (10s)
        </label>
      </div>

      {subTab === 'overview' && (
        <>
          <div className={s.statsGrid}>
            <StatCard label="Insurers" value={fmt(status.insurers)} />
            <StatCard label="Networks" value={fmt(status.networks)} />
            <StatCard label="Plans" value={fmt(status.plans)} />
            <StatCard label="Provider Links" value={fmt(status.network_links)} />
            <StatCard label="Active Crawls" value={fmt(status.active_crawls)} highlight={status.active_crawls > 0} />
            <StatCard label="Total Crawls" value={fmt(status.total_crawls)} />
            <StatCard label="Failures" value={fmt(status.total_failures)} warn={status.total_failures > 0} />
            <StatCard label="Alert Subs" value={fmt(status.active_alerts)} />
          </div>
          {providerStats && (
            <div className={s.providerSection}>
              <h3 className={s.sectionTitle}>Provider Coverage (NPPES)</h3>
              <div className={s.statsGrid}>
                <StatCard label="Total Providers" value={fmt(providerStats.total_providers)} />
                <StatCard label="Individuals" value={fmt(providerStats.individuals)} />
                <StatCard label="Facilities" value={fmt(providerStats.facilities)} />
                <StatCard label="Geocoded" value={fmt(providerStats.geocoded)} />
                <StatCard label="In Any Network" value={fmt(providerStats.in_any_network)} />
                <StatCard label="Specialties" value={fmt(providerStats.unique_specialties)} />
                <StatCard label="States" value={fmt(providerStats.states_covered)} />
              </div>
            </div>
          )}
        </>
      )}

      {subTab === 'insurers' && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th>Insurer</th><th>Networks</th><th>Plans</th><th>Providers</th>
              <th>Last Crawl</th><th>Status</th><th>Files</th><th>Errors</th>
            </tr></thead>
            <tbody>
              {insurers.map(ins => (
                <tr key={ins.id}>
                  <td>
                    <div className={s.insurerName}>{ins.legal_name}</div>
                    <div className={s.insurerMeta}>{ins.trade_names?.slice(0, 2).join(', ')}{ins.mrf_index_url ? '' : ' (no MRF URL)'}</div>
                  </td>
                  <td>{fmt(ins.network_count)}</td>
                  <td>{fmt(ins.plan_count)}</td>
                  <td>{fmt(ins.provider_count)}</td>
                  <td>{relTime(ins.last_crawled)}</td>
                  <td>{ins.last_crawl_status ? statusBadge(ins.last_crawl_status) : '\u2014'}</td>
                  <td>{ins.last_crawl_files ?? '\u2014'}</td>
                  <td>{ins.last_crawl_errors ?? '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'jobs' && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th>Insurer</th><th>Status</th><th>Started</th><th>Duration</th>
              <th>Files</th><th>Providers</th><th>Errors</th>
            </tr></thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td>{job.insurer_name}</td>
                  <td>{statusBadge(job.status)}</td>
                  <td>{relTime(job.started_at)}</td>
                  <td>{durationFmt(job.duration_seconds)}</td>
                  <td>{fmt(job.files_processed)}</td>
                  <td>{fmt(job.providers_found)}</td>
                  <td className={job.errors > 0 ? s.errorCount : ''}>{fmt(job.errors)}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td colSpan={7} className={s.emptyRow}>No crawl jobs found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'failures' && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Insurer</th><th>URL</th><th>Error</th><th>Retries</th><th>When</th></tr></thead>
            <tbody>
              {failures.map(f => (
                <tr key={f.id}>
                  <td>{f.insurer_name}</td>
                  <td className={s.urlCell} title={f.url}>{f.url?.slice(0, 60)}...</td>
                  <td className={s.errorText}>{f.error_message?.slice(0, 80)}</td>
                  <td>{f.retry_count}</td>
                  <td>{relTime(f.last_attempt)}</td>
                </tr>
              ))}
              {failures.length === 0 && <tr><td colSpan={5} className={s.emptyRow}>No failures recorded</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Main Settings View ---------- */
export default function SettingsView() {
  const [tab, setTab] = useState('general');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  async function refreshViews() {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await fetch(`${API}/admin/refresh-views`, { method: 'POST' });
      const json = await res.json();
      setRefreshMsg(json.message || 'Views refreshed successfully');
    } catch {
      setRefreshMsg('Refresh endpoint not available — run scripts/create-cross-views.js manually');
    }
    setRefreshing(false);
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.subtitle}>Database management, crawler monitoring, and application configuration</p>
      </header>

      <div className={s.topTabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.topTab} ${tab === t.id ? s.topTabActive : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <Panel title="Data Sources">
            <div className={s.sourceGrid}>
              {DATA_SOURCES.map((src) => (
                <div key={src.table} className={s.sourceCard}>
                  <div className={s.sourceDot} />
                  <div className={s.sourceInfo}>
                    <span className={s.sourceName}>{src.name}</span>
                    <span className={s.sourceTable}>medicosts.{src.table}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Materialized Views">
            <p className={s.hint}>Materialized views cache expensive cross-table joins. Refresh after loading new data.</p>
            <button className={s.refreshBtn} onClick={refreshViews} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh All Views'}
            </button>
            {refreshMsg && <p className={s.refreshMsg}>{refreshMsg}</p>}
            <div className={s.viewList}>
              {['mv_top50_drg', 'mv_zip_summary', 'mv_zip_enriched', 'mv_hospital_cost_quality', 'mv_hcahps_summary', 'mv_physician_zip_summary', 'mv_hospital_quality_composite', 'mv_state_quality_summary'].map((v) => (
                <div key={v} className={s.viewItem}>
                  <span className={s.viewName}>{v}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="About">
            <div className={s.about}>
              <p>MediCosts v0.4 — Medicare Hospital Cost & Quality Dashboard</p>
              <p className={s.aboutSub}>Built with React 19, Express, PostgreSQL, Recharts, MapLibre GL</p>
              <p className={s.aboutSub}>Data: CMS Hospital Compare, Medicare Provider Utilization & Payment, ACS Census ZCTA</p>
            </div>
          </Panel>
        </>
      )}

      {tab === 'clearnetwork' && (
        <Panel title="ClearNetwork MRF Crawler">
          <ClearNetworkPanel />
        </Panel>
      )}
    </div>
  );
}
