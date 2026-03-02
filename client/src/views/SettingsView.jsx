import { useState } from 'react';
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

export default function SettingsView() {
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
        <p className={s.subtitle}>Database management and application configuration</p>
      </header>

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
    </div>
  );
}
