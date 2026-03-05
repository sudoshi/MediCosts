import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import DrilldownMap from '../components/DrilldownMap.jsx';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars } from '../utils/format.js';
import s from './GeographicAnalysis.module.css';

const API = import.meta.env.VITE_API_URL || '/api';
const METRICS = [
  { key: 'payment',       label: 'Total Payment' },
  { key: 'charges',       label: 'Charges' },
  { key: 'medicare',      label: 'Medicare Payment' },
  { key: 'reimbursement', label: 'Reimbursement Rate' },
];

export default function GeographicAnalysis() {
  const navigate = useNavigate();
  const [selectedDrg, setSelectedDrg] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('payment');
  const { data: stateQuality, loading: loadingQuality } = useApi('/quality/state-summary');
  const { data: drgs } = useApi('/drgs/top50');

  // Find Care Near Me
  const [nearbyZip, setNearbyZip] = useState('');
  const [nearbyRadius, setNearbyRadius] = useState(50);
  const [nearbyResults, setNearbyResults] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // State quality sort
  const [stateSort, setStateSort] = useState('state');
  const [stateSortDir, setStateSortDir] = useState('asc');

  function exportCsv(rows, filename) {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename; a.click();
  }

  // Auto-trigger search when ZIP is exactly 5 digits
  useEffect(() => {
    if (nearbyZip.length === 5) findNearby();
  }, [nearbyZip, nearbyRadius]);

  async function findNearby() {
    if (nearbyZip.length !== 5) return;
    setNearbyLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API}/hospitals/nearby?zip=${nearbyZip}&radius=${nearbyRadius}&sort=star_rating&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNearbyResults(data);
    } catch { setNearbyResults([]); }
    setNearbyLoading(false);
  }

  function handleStateSort(col) {
    if (stateSort === col) setStateSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setStateSort(col); setStateSortDir('asc'); }
  }

  const sortedStateQuality = stateQuality ? [...stateQuality].sort((a, b) => {
    const av = a[stateSort], bv = b[stateSort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
    return stateSortDir === 'asc' ? cmp : -cmp;
  }) : [];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Geographic Analysis</h1>
        <p className={s.subtitle}>Cost and quality variation across the United States</p>
      </header>

      {/* Metric Toggle */}
      <div className={s.metricBar}>
        {METRICS.map(m => (
          <button
            key={m.key}
            className={`${s.metricBtn} ${selectedMetric === m.key ? s.metricActive : ''}`}
            onClick={() => setSelectedMetric(m.key)}
          >{m.label}</button>
        ))}
      </div>

      <div className={s.mapSection}>
        <DrilldownMap drg={selectedDrg} metric={selectedMetric} />
      </div>

      {drgs && (
        <Panel title="Select a DRG to view on map">
          <select className={s.drgSelect} value={selectedDrg} onChange={(e) => setSelectedDrg(e.target.value)}>
            <option value="">All DRGs (National Average)</option>
            {drgs.map((d) => (
              <option key={d.drg_cd} value={d.drg_cd}>{d.drg_cd} — {d.drg_desc}</option>
            ))}
          </select>
        </Panel>
      )}

      {/* Find Care Near Me */}
      <Panel title="Find Care Near Me">
        <div className={s.nearbyControls}>
          <input
            className={s.nearbyInput}
            placeholder="Enter ZIP code"
            maxLength={5}
            value={nearbyZip}
            onChange={e => setNearbyZip(e.target.value.replace(/\D/g, ''))}
          />
          <select className={s.nearbySelect} value={nearbyRadius} onChange={e => setNearbyRadius(Number(e.target.value))}>
            <option value={25}>25 mi</option>
            <option value={50}>50 mi</option>
            <option value={100}>100 mi</option>
            <option value={200}>200 mi</option>
          </select>
          <button className={s.nearbyBtn} onClick={findNearby} disabled={nearbyZip.length !== 5 || nearbyLoading}>
            {nearbyLoading ? 'Searching...' : 'Find Hospitals'}
          </button>
        </div>

        {nearbyLoading ? <Skeleton height={120} /> : nearbyResults && (
          nearbyResults.length === 0 ? (
            <p className={s.nearbyEmpty}>No hospitals found within {nearbyRadius} miles of {nearbyZip}.</p>
          ) : (
            <div className={s.nearbyList}>
              {nearbyResults.map(h => (
                <div key={h.facility_id} className={s.nearbyCard} onClick={() => navigate(`/hospitals/${h.facility_id}`)}>
                  <div className={s.nearbyInfo}>
                    <span className={s.nearbyName}>{h.facility_name}</span>
                    <span className={s.nearbyMeta}>{h.city}, {h.state} · {h.hospital_type}</span>
                  </div>
                  <div className={s.nearbyStats}>
                    <span className={s.nearbyStat}>{h.distance_miles} mi</span>
                    <span className={s.nearbyStars}>{fmtStars(h.star_rating)}</span>
                    <span className={s.nearbyStat}>{fmtCurrency(h.weighted_avg_payment)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Panel>

      {/* State Quality Heatmap Table */}
      {loadingQuality ? <Skeleton height={300} /> : stateQuality?.length > 0 && (
        <Panel title="State Quality Comparison" headerRight={
          <button onClick={() => exportCsv(sortedStateQuality, 'state-quality.csv')} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-dim)', borderRadius: 5, color: 'var(--text-secondary)', fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↓ CSV</button>
        }>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {[
                    { key: 'state', label: 'State' },
                    { key: 'num_hospitals', label: 'Hospitals' },
                    { key: 'avg_star_rating', label: 'Avg Stars' },
                    { key: 'avg_clabsi_sir', label: 'CLABSI SIR' },
                    { key: 'avg_psi_90', label: 'PSI-90' },
                    { key: 'avg_excess_readm_ratio', label: 'Readm Ratio' },
                    { key: 'avg_mortality_rate', label: 'Mortality %' },
                    { key: 'avg_payment', label: 'Avg Payment' },
                    { key: 'total_discharges', label: 'Discharges' },
                  ].map(col => (
                    <th key={col.key} onClick={() => handleStateSort(col.key)} style={{ cursor: 'pointer', userSelect: 'none', color: stateSort === col.key ? 'var(--accent-light)' : undefined }}>
                      {col.label}{stateSort === col.key ? (stateSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStateQuality.map((r) => (
                  <tr key={r.state}>
                    <td className={s.stateCell}>{r.state}</td>
                    <td className={s.mono}>{r.num_hospitals}</td>
                    <td className={s.mono}>
                      <span className={s.starBar} style={{ '--pct': `${Number(r.avg_star_rating) / 5 * 100}%` }}>
                        {Number(r.avg_star_rating).toFixed(1)}
                      </span>
                    </td>
                    <td className={s.mono}>{r.avg_clabsi_sir ? Number(r.avg_clabsi_sir).toFixed(3) : '—'}</td>
                    <td className={s.mono}>{r.avg_psi_90 ? Number(r.avg_psi_90).toFixed(4) : '—'}</td>
                    <td className={s.mono}>{r.avg_excess_readm_ratio ? Number(r.avg_excess_readm_ratio).toFixed(4) : '—'}</td>
                    <td className={s.mono}>{r.avg_mortality_rate ? `${Number(r.avg_mortality_rate).toFixed(1)}%` : '—'}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_payment)}</td>
                    <td className={s.mono}>{Number(r.total_discharges).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
