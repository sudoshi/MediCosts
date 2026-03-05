import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Cell, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtNumber, fmtStars } from '../utils/format.js';
import s from './SpendingValue.module.css';

const TOOLTIP_STYLE = {
  background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8,
  fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12,
};
const AXIS_TICK = { fill: '#71717a', fontSize: 10, fontFamily: 'Inter, sans-serif' };

const TABS = [
  { id: 'value',    label: 'Value Composite' },
  { id: 'vbp',      label: 'VBP Rankings' },
  { id: 'mspb',     label: 'Spending / Beneficiary' },
  { id: 'frontier',  label: 'Efficiency Frontier' },
  { id: 'corr',     label: 'Correlations' },
];

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const STAR_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#fbbf24', 4: '#22c55e', 5: '#3b82f6' };
const OWNERSHIP_GROUPS = {
  'Voluntary non-profit - Private': 'Nonprofit', 'Voluntary non-profit - Church': 'Nonprofit',
  'Voluntary non-profit - Other': 'Nonprofit', 'Proprietary': 'For-Profit',
  'Government - Federal': 'Government', 'Government - Hospital District or Authority': 'Government',
  'Government - Local': 'Government', 'Government - State': 'Government',
  'Physician': 'For-Profit', 'Tribal': 'Government',
};

const Y_METRICS = [
  { key: 'vbp_total_score', label: 'VBP Score', higher: true },
  { key: 'star_rating', label: 'Star Rating', higher: true },
  { key: 'mspb_score', label: 'MSPB (lower=better)', higher: false },
  { key: 'psi_90_score', label: 'PSI-90 (lower=better)', higher: false },
  { key: 'avg_excess_readm_ratio', label: 'Readmission Ratio (lower=better)', higher: false },
  { key: 'avg_mortality_rate', label: 'Mortality Rate (lower=better)', higher: false },
];

const CORR_VARS = [
  { key: 'weighted_avg_payment', label: 'Payment' },
  { key: 'vbp_total_score', label: 'VBP Score' },
  { key: 'mspb_score', label: 'MSPB' },
  { key: 'star_rating', label: 'Stars' },
  { key: 'psi_90_score', label: 'PSI-90' },
  { key: 'avg_excess_readm_ratio', label: 'Readm Ratio' },
  { key: 'avg_mortality_rate', label: 'Mortality' },
];

/* ── Helpers ──────────────────────────────────────────────────────── */
function downloadCSV(data, filename) {
  if (!data?.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => v ?? '').join(','));
  const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmtDec(v, d = 1) { return v != null ? Number(v).toFixed(d) : '—'; }
function fmtDec4(v) { return v != null ? Number(v).toFixed(4) : '—'; }

function pearson(x, y) {
  const pairs = x.map((xi, i) => [xi, y[i]]).filter(([a, b]) => a != null && b != null);
  const n = pairs.length;
  if (n < 3) return null;
  const sx = pairs.reduce((s, p) => s + p[0], 0);
  const sy = pairs.reduce((s, p) => s + p[1], 0);
  const sxy = pairs.reduce((s, p) => s + p[0] * p[1], 0);
  const sx2 = pairs.reduce((s, p) => s + p[0] ** 2, 0);
  const sy2 = pairs.reduce((s, p) => s + p[1] ** 2, 0);
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx ** 2) * (n * sy2 - sy ** 2));
  return den === 0 ? 0 : num / den;
}

function paretoFrontier(points) {
  const sorted = [...points].filter(p => p.x != null && p.y != null).sort((a, b) => a.x - b.x);
  const frontier = [];
  let maxY = -Infinity;
  for (const p of sorted) {
    if (p.y > maxY) { frontier.push(p); maxY = p.y; }
  }
  return frontier;
}

/* ── Sub-components ───────────────────────────────────────────────── */
function KpiCard({ label, value, sub, good }) {
  return (
    <div className={s.kpiCard}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {sub && <span className={`${s.kpiSub} ${good === true ? s.good : good === false ? s.bad : ''}`}>{sub}</span>}
    </div>
  );
}

function ExportBtn({ data, filename }) {
  if (!data?.length) return null;
  return <button className={s.exportBtn} onClick={() => downloadCSV(data, filename)} title="Export CSV">↓ CSV</button>;
}

/* ── Custom scatter tooltip ───────────────────────────────────────── */
function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className={s.scatterTip}>
      <strong>{d.facility_name}</strong>
      <span>{d.city}, {d.state}</span>
      <span>Stars: {fmtStars(d.star_rating)}</span>
      <span>VBP: {fmtDec(d.vbp_total_score)}</span>
      <span>MSPB: {fmtDec4(d.mspb_score)}</span>
      <span>Payment: {fmtCurrency(d.weighted_avg_payment)}</span>
      <span>Discharges: {fmtNumber(d.total_discharges)}</span>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function SpendingValue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('value');
  const [state, setState] = useState('');
  const [sort, setSort] = useState({ col: '', dir: 'desc' });
  const [searchQ, setSearchQ] = useState('');
  const [hospType, setHospType] = useState('');
  const [ownership, setOwnership] = useState('');
  const [minStars, setMinStars] = useState(0);
  const [yMetric, setYMetric] = useState('vbp_total_score');
  const [zoomDomain, setZoomDomain] = useState(null); // { x: [min,max], y: [min,max] }
  const scatterRef = useRef(null);
  const stateQ = state ? `?state=${state}` : '';

  // Always load value-composite (needed for frontier + correlations too)
  const { data: valueData, loading: loadValue } = useApi(
    `/value-composite${stateQ}`.replace('?&', '?'), [state]
  );
  const { data: summary } = useApi(
    `/value-composite/summary${stateQ}`.replace('?&', '?'), [state]
  );
  const { data: vbpData, loading: loadVBP } = useApi(
    tab === 'vbp' ? `/vbp/rankings${stateQ}&limit=500`.replace('?&', '?') : null, [tab, state]
  );
  const { data: mspbData, loading: loadMSPB } = useApi(
    tab === 'mspb' ? `/spending/per-beneficiary${stateQ}&limit=500`.replace('?&', '?') : null, [tab, state]
  );

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    if (!valueData) return [];
    let rows = valueData;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      rows = rows.filter(r => r.facility_name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || r.facility_id?.includes(q));
    }
    if (hospType) rows = rows.filter(r => r.hospital_type === hospType);
    if (ownership) rows = rows.filter(r => OWNERSHIP_GROUPS[r.hospital_ownership] === ownership);
    if (minStars > 0) rows = rows.filter(r => Number(r.star_rating) >= minStars);
    return rows;
  }, [valueData, searchQ, hospType, ownership, minStars]);

  const filteredVbp = useMemo(() => {
    if (!vbpData) return [];
    if (!searchQ) return vbpData;
    const q = searchQ.toLowerCase();
    return vbpData.filter(r => r.facility_name?.toLowerCase().includes(q) || r.facility_id?.includes(q));
  }, [vbpData, searchQ]);

  const filteredMspb = useMemo(() => {
    if (!mspbData) return [];
    if (!searchQ) return mspbData;
    const q = searchQ.toLowerCase();
    return mspbData.filter(r => r.facility_name?.toLowerCase().includes(q) || r.facility_id?.includes(q));
  }, [mspbData, searchQ]);

  /* ── Sorting ── */
  const handleSort = (col) => setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  const sortData = (rows) => {
    if (!sort.col || !rows) return rows;
    return [...rows].sort((a, b) => {
      const va = Number(a[sort.col]) || 0, vb = Number(b[sort.col]) || 0;
      return sort.dir === 'desc' ? vb - va : va - vb;
    });
  };
  const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '';

  /* ── Chart data ── */
  const vbpChart = useMemo(() => {
    if (!filteredVbp.length) return [];
    return filteredVbp.filter(r => r.total_performance_score != null).slice(0, 20)
      .map(r => ({ name: r.facility_name?.slice(0, 25), score: Number(r.total_performance_score) }));
  }, [filteredVbp]);

  const mspbChart = useMemo(() => {
    if (!filteredMspb.length) return [];
    return [...filteredMspb].filter(r => r.mspb_score != null)
      .sort((a, b) => Number(a.mspb_score) - Number(b.mspb_score)).slice(0, 20)
      .map(r => ({ name: r.facility_name?.slice(0, 25), score: Number(r.mspb_score) }));
  }, [filteredMspb]);

  /* ── Scatter data ── */
  const scatterData = useMemo(() => {
    return filtered.filter(r => r.weighted_avg_payment != null && r[yMetric] != null)
      .map(r => ({ ...r, x: Number(r.weighted_avg_payment), y: Number(r[yMetric]), z: Number(r.total_discharges) || 100 }));
  }, [filtered, yMetric]);

  const yMeta = Y_METRICS.find(m => m.key === yMetric) || Y_METRICS[0];
  const frontier = useMemo(() => {
    if (!scatterData.length) return [];
    const pts = yMeta.higher ? scatterData : scatterData.map(d => ({ ...d, y: -d.y }));
    const f = paretoFrontier(pts);
    return yMeta.higher ? f : f.map(p => ({ ...p, y: -p.y }));
  }, [scatterData, yMeta]);

  /* ── Scatter zoom ── */
  const scatterExtent = useMemo(() => {
    if (!scatterData.length) return null;
    const xs = scatterData.map(d => d.x), ys = scatterData.map(d => d.y);
    return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
  }, [scatterData]);

  // Reset zoom when metric or data changes
  const prevYMetric = useRef(yMetric);
  if (yMetric !== prevYMetric.current) { prevYMetric.current = yMetric; if (zoomDomain) setZoomDomain(null); }

  const handleScatterWheel = useCallback((e) => {
    e.preventDefault();
    if (!scatterExtent) return;
    const factor = e.deltaY > 0 ? 1.15 : 0.87; // scroll down = zoom out, up = zoom in
    setZoomDomain(prev => {
      const cur = prev || scatterExtent;
      const xRange = cur.x[1] - cur.x[0], yRange = cur.y[1] - cur.y[0];
      // Get mouse position as fraction of chart area
      const rect = scatterRef.current?.getBoundingClientRect();
      const mx = rect ? Math.max(0, Math.min(1, (e.clientX - rect.left - 40) / (rect.width - 60))) : 0.5;
      const my = rect ? Math.max(0, Math.min(1, (e.clientY - rect.top - 10) / (rect.height - 40))) : 0.5;
      const newXRange = xRange * factor, newYRange = yRange * factor;
      const xCenter = cur.x[0] + xRange * mx, yCenter = cur.y[0] + yRange * (1 - my);
      return {
        x: [xCenter - newXRange * mx, xCenter + newXRange * (1 - mx)],
        y: [yCenter - newYRange * (1 - my), yCenter + newYRange * my],
      };
    });
  }, [scatterExtent]);

  /* ── Correlation matrix ── */
  const corrMatrix = useMemo(() => {
    if (!filtered.length) return [];
    const vectors = CORR_VARS.map(v => filtered.map(r => r[v.key] != null ? Number(r[v.key]) : null));
    return CORR_VARS.map((_, i) => CORR_VARS.map((_, j) => pearson(vectors[i], vectors[j])));
  }, [filtered]);

  /* ── Hospital types from data ── */
  const hospTypes = useMemo(() => {
    if (!valueData) return [];
    return [...new Set(valueData.map(r => r.hospital_type).filter(Boolean))].sort();
  }, [valueData]);

  /* ── KPIs ── */
  const natVbp = summary?.nat_avg_vbp ? Number(summary.nat_avg_vbp) : null;
  const natMspb = summary?.nat_avg_mspb ? Number(summary.nat_avg_mspb) : null;
  const natPay = summary?.nat_avg_payment ? Number(summary.nat_avg_payment) : null;

  function vsNat(val, nat, lower) {
    if (val == null || nat == null) return { sub: null, good: null };
    const delta = val - nat;
    const pct = ((delta / nat) * 100).toFixed(1);
    const sign = delta > 0 ? '+' : '';
    const isBetter = lower ? delta < 0 : delta > 0;
    return { sub: `vs National: ${sign}${pct}%`, good: isBetter };
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Spending &amp; Value</h1>
        <p className={s.subtitle}>Medicare spending efficiency, value-based purchasing, and quality-cost analysis</p>
      </header>

      {/* ── Toolbar ── */}
      <div className={s.toolbar}>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>State</span>
          <select className={s.select} value={state} onChange={e => { setState(e.target.value); setSort({ col: '', dir: 'desc' }); }}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Hospital Type</span>
          <select className={s.select} value={hospType} onChange={e => setHospType(e.target.value)}>
            <option value="">All Types</option>
            {hospTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Ownership</span>
          <select className={s.select} value={ownership} onChange={e => setOwnership(e.target.value)}>
            <option value="">All</option>
            <option value="Nonprofit">Nonprofit</option>
            <option value="For-Profit">For-Profit</option>
            <option value="Government">Government</option>
          </select>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Min Stars</span>
          <select className={s.select} style={{ minWidth: 80 }} value={minStars} onChange={e => setMinStars(Number(e.target.value))}>
            <option value={0}>Any</option>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Search</span>
          <input className={s.searchInput} placeholder="Hospital name, city, or CCN..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
      </div>

      {/* ── KPI Row ── */}
      {summary && (
        <div className={s.kpiRow}>
          {tab === 'value' && <>
            <KpiCard label="Hospitals" value={fmtNumber(summary.hospital_count)} />
            <KpiCard label="Avg VBP Score" value={fmtDec(summary.avg_vbp_score)} {...vsNat(Number(summary.avg_vbp_score), natVbp, false)} />
            <KpiCard label="Avg MSPB" value={fmtDec4(summary.avg_mspb_score)} {...vsNat(Number(summary.avg_mspb_score), natMspb, true)} />
            <KpiCard label="Avg Payment" value={fmtCurrency(summary.avg_payment)} {...vsNat(Number(summary.avg_payment), natPay, true)} />
            <KpiCard label="Avg Stars" value={fmtDec(summary.avg_star_rating)} />
          </>}
          {tab === 'vbp' && <>
            <KpiCard label="Hospitals" value={fmtNumber(summary.hospital_count)} />
            <KpiCard label="Avg VBP Score" value={fmtDec(summary.avg_vbp_score)} {...vsNat(Number(summary.avg_vbp_score), natVbp, false)} />
            <KpiCard label="Avg PSI-90" value={fmtDec4(summary.avg_psi_90)} {...vsNat(Number(summary.avg_psi_90), Number(summary.nat_avg_psi_90), true)} />
            <KpiCard label="Avg Readm Ratio" value={fmtDec4(summary.avg_readm_ratio)} {...vsNat(Number(summary.avg_readm_ratio), Number(summary.nat_avg_readm), true)} />
          </>}
          {tab === 'mspb' && <>
            <KpiCard label="Hospitals" value={fmtNumber(summary.hospital_count)} />
            <KpiCard label="Avg MSPB" value={fmtDec4(summary.avg_mspb_score)} {...vsNat(Number(summary.avg_mspb_score), natMspb, true)} />
            <KpiCard label="Avg Payment" value={fmtCurrency(summary.avg_payment)} {...vsNat(Number(summary.avg_payment), natPay, true)} />
            <KpiCard label="Avg Mortality" value={`${fmtDec(summary.avg_mortality)}%`} {...vsNat(Number(summary.avg_mortality), Number(summary.nat_avg_mortality), true)} />
          </>}
          {tab === 'frontier' && <>
            <KpiCard label="Hospitals Plotted" value={fmtNumber(scatterData.length)} />
            <KpiCard label="Nat Avg Payment" value={fmtCurrency(natPay)} />
            <KpiCard label="Nat Avg VBP" value={fmtDec(natVbp)} />
            <KpiCard label="Frontier Hospitals" value={fmtNumber(frontier.length)} sub="Pareto optimal" />
          </>}
          {tab === 'corr' && <>
            <KpiCard label="Hospitals Analyzed" value={fmtNumber(filtered.length)} />
            <KpiCard label="Metrics Correlated" value="7 × 7" />
          </>}
        </div>
      )}

      <Tabs tabs={TABS} activeTab={tab} onTabChange={t => { setTab(t); setSort({ col: '', dir: 'desc' }); }} />

      {/* ── Value Composite ── */}
      {tab === 'value' && (
        <Panel title="Hospital Value Composite" headerRight={<ExportBtn data={filtered} filename={`value-composite-${state || 'all'}.csv`} />}>
          {loadValue ? <Skeleton height={400} /> : filtered.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Hospital</th>
                    <th className={s.thLeft}>State</th>
                    <th onClick={() => handleSort('star_rating')}>Stars{arrow('star_rating')}</th>
                    <th onClick={() => handleSort('vbp_total_score')}>VBP{arrow('vbp_total_score')}</th>
                    <th onClick={() => handleSort('mspb_score')}>MSPB{arrow('mspb_score')}</th>
                    <th onClick={() => handleSort('weighted_avg_payment')}>Avg Pay{arrow('weighted_avg_payment')}</th>
                    <th onClick={() => handleSort('psi_90_score')}>PSI-90{arrow('psi_90_score')}</th>
                    <th onClick={() => handleSort('avg_excess_readm_ratio')}>Readm{arrow('avg_excess_readm_ratio')}</th>
                    <th onClick={() => handleSort('avg_mortality_rate')}>Mortality{arrow('avg_mortality_rate')}</th>
                    <th onClick={() => handleSort('total_hac_score')}>HAC{arrow('total_hac_score')}</th>
                    <th onClick={() => handleSort('total_discharges')}>Disch.{arrow('total_discharges')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(filtered).map(r => {
                    const readmBad = r.avg_excess_readm_ratio != null && Number(r.avg_excess_readm_ratio) > 1;
                    const mortBad = summary?.nat_avg_mortality && r.avg_mortality_rate != null && Number(r.avg_mortality_rate) > Number(summary.nat_avg_mortality);
                    const psiBad = summary?.nat_avg_psi_90 && r.psi_90_score != null && Number(r.psi_90_score) > Number(summary.nat_avg_psi_90);
                    return (
                      <tr key={r.facility_id} className={s.clickableRow} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                        <td className={s.name}>{r.facility_name}</td>
                        <td className={s.state}>{r.state}</td>
                        <td className={s.stars}>{fmtStars(r.star_rating)}</td>
                        <td className={s.mono}>{fmtDec(r.vbp_total_score)}</td>
                        <td className={s.mono}>{fmtDec4(r.mspb_score)}</td>
                        <td className={s.mono}>{fmtCurrency(r.weighted_avg_payment)}</td>
                        <td className={`${s.mono} ${psiBad ? s.warnAmber : ''}`}>{fmtDec4(r.psi_90_score)}</td>
                        <td className={`${s.mono} ${readmBad ? s.warnRed : ''}`}>{fmtDec4(r.avg_excess_readm_ratio)}</td>
                        <td className={`${s.mono} ${mortBad ? s.warnRed : ''}`}>{r.avg_mortality_rate != null ? `${fmtDec(r.avg_mortality_rate)}%` : '—'}</td>
                        <td className={s.mono}>{fmtDec(r.total_hac_score, 2)}</td>
                        <td className={s.mono}>{fmtNumber(r.total_discharges)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No value composite data available.</p>}
        </Panel>
      )}

      {/* ── VBP Rankings ── */}
      {tab === 'vbp' && (
        <>
          {vbpChart.length > 0 && (
            <Panel title="Top 20 by Total Performance Score">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={vbpChart} layout="vertical" margin={{ top: 4, right: 16, left: 200, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={190} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v.toFixed(1), 'Score']} />
                  {natVbp && <ReferenceLine x={natVbp} stroke="#71717a" strokeDasharray="4 4" label={{ value: `Nat Avg: ${natVbp}`, fill: '#71717a', fontSize: 10, position: 'top' }} />}
                  <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
          <Panel title="VBP Domain Scores" headerRight={<ExportBtn data={filteredVbp} filename={`vbp-rankings-${state || 'all'}.csv`} />}>
            {loadVBP ? <Skeleton height={400} /> : filteredVbp.length > 0 ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.thLeft}>Hospital</th>
                      <th className={s.thLeft}>State</th>
                      <th onClick={() => handleSort('total_performance_score')}>Total{arrow('total_performance_score')}</th>
                      <th onClick={() => handleSort('clinical_outcomes_score_w')}>Clinical{arrow('clinical_outcomes_score_w')}</th>
                      <th onClick={() => handleSort('safety_score_w')}>Safety{arrow('safety_score_w')}</th>
                      <th onClick={() => handleSort('efficiency_score_w')}>Efficiency{arrow('efficiency_score_w')}</th>
                      <th onClick={() => handleSort('person_engagement_score_w')}>Person{arrow('person_engagement_score_w')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortData(filteredVbp).map(r => (
                      <tr key={r.facility_id} className={s.clickableRow} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                        <td className={s.name}>{r.facility_name}</td>
                        <td className={s.state}>{r.state}</td>
                        <td className={s.mono}>{fmtDec(r.total_performance_score)}</td>
                        <td className={s.mono}>{fmtDec(r.clinical_outcomes_score_w)}</td>
                        <td className={s.mono}>{fmtDec(r.safety_score_w)}</td>
                        <td className={s.mono}>{fmtDec(r.efficiency_score_w)}</td>
                        <td className={s.mono}>{fmtDec(r.person_engagement_score_w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={s.emptyMsg}>No VBP ranking data available.</p>}
          </Panel>
        </>
      )}

      {/* ── Spending Per Beneficiary ── */}
      {tab === 'mspb' && (
        <>
          {mspbChart.length > 0 && (
            <Panel title="Top 20 Most Efficient (Lowest MSPB)">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={mspbChart} layout="vertical" margin={{ top: 4, right: 16, left: 200, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={190} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v.toFixed(4), 'MSPB']} />
                  {natMspb && <ReferenceLine x={natMspb} stroke="#71717a" strokeDasharray="4 4" label={{ value: `Nat Avg: ${natMspb.toFixed(4)}`, fill: '#71717a', fontSize: 10, position: 'top' }} />}
                  <Bar dataKey="score" fill="#22c55e" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
          <Panel title="Spending Per Beneficiary (MSPB-1)" headerRight={<ExportBtn data={filteredMspb} filename={`mspb-${state || 'all'}.csv`} />}>
            {loadMSPB ? <Skeleton height={400} /> : filteredMspb.length > 0 ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.thLeft}>Hospital</th>
                      <th className={s.thLeft}>State</th>
                      <th onClick={() => handleSort('mspb_score')}>MSPB{arrow('mspb_score')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortData(filteredMspb).map(r => (
                      <tr key={r.facility_id} className={s.clickableRow} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                        <td className={s.name}>{r.facility_name}</td>
                        <td className={s.state}>{r.state}</td>
                        <td className={s.mono}>{fmtDec4(r.mspb_score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={s.emptyMsg}>No MSPB data available.</p>}
          </Panel>
        </>
      )}

      {/* ── Efficiency Frontier ── */}
      {tab === 'frontier' && (
        <Panel title="Cost vs Quality — Efficiency Frontier"
          headerRight={<>
            <div className={s.fieldGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <span className={s.fieldLabel} style={{ marginBottom: 0 }}>Y-Axis:</span>
              <select className={s.select} style={{ minWidth: 160 }} value={yMetric} onChange={e => setYMetric(e.target.value)}>
                {Y_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <ExportBtn data={scatterData} filename={`efficiency-frontier-${state || 'all'}.csv`} />
            {zoomDomain && <button className={s.exportBtn} onClick={() => setZoomDomain(null)} title="Reset zoom">Reset Zoom</button>}
          </>}
        >
          {loadValue ? <Skeleton height={500} /> : scatterData.length > 0 ? (
            <>
              {!zoomDomain && (
                <div className={s.quadrantLabels}>
                  <div className={s.quadGrid}>
                    <span className={s.qLabel} style={{ color: '#22c55e' }}>Value Leaders</span>
                    <span className={s.qLabel} style={{ color: '#71717a' }}>High Quality, High Cost</span>
                    <span className={s.qLabel} style={{ color: '#71717a' }}>Low Cost, Low Quality</span>
                    <span className={s.qLabel} style={{ color: '#ef4444' }}>Value Laggards</span>
                  </div>
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div ref={scatterRef} onWheel={handleScatterWheel} style={{ cursor: zoomDomain ? 'zoom-in' : 'default' }}>
                <ResponsiveContainer width="100%" height={520}>
                  <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis type="number" dataKey="x" name="Payment"
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                      tick={AXIS_TICK} axisLine={false} tickLine={false}
                      domain={zoomDomain ? zoomDomain.x : ['auto', 'auto']}
                      allowDataOverflow={!!zoomDomain}
                      label={{ value: 'Average Total Payment per Discharge', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#3f3f46' }}
                    />
                    <YAxis type="number" dataKey="y" name={yMeta.label}
                      tick={AXIS_TICK} axisLine={false} tickLine={false}
                      domain={zoomDomain ? zoomDomain.y : ['auto', 'auto']}
                      allowDataOverflow={!!zoomDomain}
                      label={{ value: yMeta.label, angle: -90, position: 'insideLeft', offset: -5, fontSize: 11, fill: '#3f3f46' }}
                      reversed={!yMeta.higher}
                    />
                    <ZAxis type="number" dataKey="z" range={[20, 400]} />
                    <Tooltip content={<ScatterTooltip />} />
                    {natPay && <ReferenceLine x={natPay} stroke="#71717a" strokeDasharray="4 4" />}
                    {natVbp && yMetric === 'vbp_total_score' && <ReferenceLine y={natVbp} stroke="#71717a" strokeDasharray="4 4" />}
                    <Scatter data={scatterData} onClick={(d) => navigate(`/hospitals/${d.facility_id}`)}>
                      {scatterData.map((d, i) => (
                        <Cell key={i} fill={STAR_COLORS[Number(d.star_rating)] || '#71717a'} fillOpacity={0.7} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className={s.scatterLegend}>
                {[1,2,3,4,5].map(n => (
                  <span key={n}><span className={s.legendDot} style={{ background: STAR_COLORS[n] }} />{n}★</span>
                ))}
                <span style={{ marginLeft: 12, color: 'var(--text-tertiary)', fontSize: 11 }}>
                  Bubble size = discharge volume{!zoomDomain ? ' · Scroll to zoom' : ''}
                </span>
              </div>
              {frontier.length > 2 && (
                <p className={s.frontierNote}>
                  Pareto frontier: {frontier.length} hospitals where no other has both lower cost and higher {yMeta.label.toLowerCase().replace(' (lower=better)', '')}
                </p>
              )}
            </>
          ) : <p className={s.emptyMsg}>No data available for scatter plot.</p>}
        </Panel>
      )}

      {/* ── Correlations ── */}
      {tab === 'corr' && (
        <Panel title="Metric Correlations — Pearson r" headerRight={<ExportBtn data={
          corrMatrix.length ? CORR_VARS.map((v, i) => {
            const row = { metric: v.label };
            CORR_VARS.forEach((w, j) => { row[w.label] = corrMatrix[i]?.[j]?.toFixed(3) || ''; });
            return row;
          }) : null
        } filename={`correlations-${state || 'all'}.csv`} />}>
          {loadValue ? <Skeleton height={400} /> : corrMatrix.length > 0 ? (
            <div className={s.corrWrap}>
              <table className={s.corrTable}>
                <thead>
                  <tr>
                    <th></th>
                    {CORR_VARS.map(v => <th key={v.key}>{v.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CORR_VARS.map((v, i) => (
                    <tr key={v.key}>
                      <td className={s.corrRowLabel}>{v.label}</td>
                      {CORR_VARS.map((_, j) => {
                        const r = corrMatrix[i]?.[j];
                        const abs = r != null ? Math.abs(r) : 0;
                        const bg = r == null ? 'transparent'
                          : r > 0 ? `rgba(59,130,246,${abs * 0.5})`
                          : `rgba(239,68,68,${abs * 0.5})`;
                        return (
                          <td key={j} className={s.corrCell} style={{ background: bg }}>
                            {r != null ? r.toFixed(2) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={s.corrLegend}>
                <span style={{ color: '#3b82f6' }}>Blue = positive correlation</span>
                <span style={{ color: '#ef4444' }}>Red = negative correlation</span>
                <span style={{ color: '#71717a' }}>Stronger color = stronger relationship</span>
              </div>
            </div>
          ) : <p className={s.emptyMsg}>Not enough data for correlation analysis.</p>}
        </Panel>
      )}
    </div>
  );
}
