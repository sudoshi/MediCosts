import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Bar, ComposedChart,
} from 'recharts';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtCompact, fmtNumber } from '../utils/format.js';
import { adjustForInflation } from '../utils/cpi.js';
import s from './CostTrends.module.css';

const TOOLTIP_STYLE = {
  background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8,
  fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12,
};
const AXIS_TICK = { fill: '#71717a', fontSize: 10, fontFamily: 'Inter, sans-serif' };
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];
const COLORS_A = { payment: '#3b82f6', charges: '#22d3ee', medicare: '#22c55e' };
const COLORS_B = { payment: '#a855f7', charges: '#ec4899', medicare: '#f59e0b' };

/* ── Helpers ──────────────────────────────────────────────────────── */
function trendStats(data, key) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d[key]).filter(v => v != null && v > 0);
  if (vals.length < 2) return null;
  const first = vals[0], last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const n = vals.length - 1;
  const cagr = (Math.pow(last / first, 1 / n) - 1) * 100;
  const yoy = ((last - prev) / prev) * 100;
  const total = ((last - first) / first) * 100;
  return { latest: last, first, cagr, yoy, total, rising: last > first };
}

function fmtPct(v) {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function authHeaders() {
  const t = localStorage.getItem('authToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function downloadCSV(data, filename) {
  if (!data?.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => v ?? '').join(','));
  const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function applyInflation(data, adjusted) {
  if (!adjusted || !data?.length) return data;
  return data.map(d => {
    const out = { ...d };
    ['payment', 'charges', 'medicare', 'paymentB', 'chargesB', 'medicareB'].forEach(k => {
      if (out[k] != null) out[k] = adjustForInflation(out[k], d.year);
    });
    return out;
  });
}

/* ── Sub-components ───────────────────────────────────────────────── */
function KpiCard({ label, value, delta, invertColor }) {
  const isUp = delta != null && delta > 0;
  const colorCls = delta == null ? '' : ((isUp !== !!invertColor) ? s.deltaRed : s.deltaGreen);
  return (
    <div className={s.kpiCard}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {delta != null && (
        <span className={`${s.kpiDelta} ${colorCls}`}>
          {isUp ? '▲' : '▼'} {fmtPct(delta)} YoY
        </span>
      )}
    </div>
  );
}

function TrendAnnotation({ data, metricKey, label }) {
  const stats = trendStats(data, metricKey);
  if (!stats) return null;
  return (
    <div className={s.trendAnnotation}>
      <span>{label || 'Payment'} CAGR: <span className={stats.cagr > 0 ? s.deltaRed : s.deltaGreen}>{fmtPct(stats.cagr)}/yr</span></span>
      <span>YoY: <span className={stats.yoy > 0 ? s.deltaRed : s.deltaGreen}>{fmtPct(stats.yoy)}</span></span>
      <span>Total: <span className={stats.total > 0 ? s.deltaRed : s.deltaGreen}>{fmtPct(stats.total)}</span></span>
    </div>
  );
}

function ExportBtn({ data, filename }) {
  if (!data?.length) return null;
  return (
    <button className={s.exportBtn} onClick={() => downloadCSV(data, filename)} title="Export CSV">
      ↓ CSV
    </button>
  );
}

function HospitalSearch({ onSelect, query, setQuery, suggestions }) {
  return (
    <div className={s.searchWrap}>
      <input className={s.ccnInput} placeholder="Search by name or enter CCN..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {suggestions.length > 0 && (
        <div className={s.dropdown}>
          {suggestions.map(h => (
            <button key={h.facility_id} className={s.dropdownItem} onClick={() => onSelect(h)}>
              <span className={s.dropdownName}>{h.facility_name}</span>
              <span className={s.dropdownMeta}>{h.city}, {h.state} — {h.facility_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function CostTrends() {
  const navigate = useNavigate();
  const [selectedDrg, setSelectedDrg] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [ccn, setCcn] = useState('');
  const [hospitalQuery, setHospitalQuery] = useState('');
  const [hospitalSuggestions, setHospitalSuggestions] = useState([]);
  const hospitalDebounceRef = useRef(null);
  const [inflationAdj, setInflationAdj] = useState(false);

  // Comparison state
  const [compareDrg, setCompareDrg] = useState(false);
  const [selectedDrgB, setSelectedDrgB] = useState('');
  const [compareHosp, setCompareHosp] = useState(false);
  const [ccnB, setCcnB] = useState('');
  const [hospQueryB, setHospQueryB] = useState('');
  const [hospSuggestionsB, setHospSuggestionsB] = useState([]);
  const hospDebounceRefB = useRef(null);

  // Hospital DRG drill-down
  const [hospDrg, setHospDrg] = useState('');

  const drgPanelRef = useRef(null);

  const { data: drgs } = useApi('/drgs/top50');
  const { data: national, loading: loadingNat } = useApi('/trends/national');
  const { data: drgTrend, loading: loadingDrg } = useApi(
    selectedDrg ? `/trends/drg?drg=${selectedDrg}` : null, [selectedDrg]
  );
  const { data: drgTrendB } = useApi(
    compareDrg && selectedDrgB ? `/trends/drg?drg=${selectedDrgB}` : null, [compareDrg, selectedDrgB]
  );
  const { data: stateTrend, loading: loadingSt } = useApi(
    selectedState && selectedDrg ? `/trends/state?state=${selectedState}&drg=${selectedDrg}` : null,
    [selectedState, selectedDrg]
  );
  const { data: stateSummary, loading: loadingStSum } = useApi(
    selectedState && !selectedDrg ? `/trends/state-summary?state=${selectedState}` : null,
    [selectedState, selectedDrg]
  );
  const { data: provTrend, loading: loadingProv } = useApi(
    ccn.length === 6 && !hospDrg ? `/trends/provider?ccn=${ccn}` : null, [ccn, hospDrg]
  );
  const { data: provDrgTrend, loading: loadingProvDrg } = useApi(
    ccn.length === 6 && hospDrg ? `/trends/provider-drg?ccn=${ccn}&drg=${hospDrg}` : null, [ccn, hospDrg]
  );
  const { data: provTrendB } = useApi(
    compareHosp && ccnB.length === 6 ? `/trends/provider?ccn=${ccnB}` : null, [compareHosp, ccnB]
  );
  const { data: topRising } = useApi('/trends/top-movers?limit=5&direction=desc');
  const { data: topFalling } = useApi('/trends/top-movers?limit=5&direction=asc');

  /* ── Chart data transforms ── */
  const natChart = useMemo(() => {
    if (!national) return [];
    return national.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      medicare: r.weighted_avg_medicare ? Number(r.weighted_avg_medicare) : null,
      discharges: Number(r.total_discharges),
    }));
  }, [national]);

  const drgChart = useMemo(() => {
    if (!drgTrend) return [];
    const base = drgTrend.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      medicare: Number(r.weighted_avg_medicare),
    }));
    if (!compareDrg || !drgTrendB) return base;
    // Merge B data by year
    const bMap = {};
    drgTrendB.forEach(r => { bMap[Number(r.data_year)] = r; });
    return base.map(d => ({
      ...d,
      paymentB: bMap[d.year] ? Number(bMap[d.year].weighted_avg_payment) : null,
      chargesB: bMap[d.year] ? Number(bMap[d.year].weighted_avg_charges) : null,
      medicareB: bMap[d.year] ? Number(bMap[d.year].weighted_avg_medicare) : null,
    }));
  }, [drgTrend, drgTrendB, compareDrg]);

  const stateChart = useMemo(() => {
    const src = stateTrend || stateSummary;
    if (!src) return [];
    return src.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      medicare: r.weighted_avg_medicare ? Number(r.weighted_avg_medicare) : null,
      discharges: Number(r.total_discharges),
    }));
  }, [stateTrend, stateSummary]);

  const provChart = useMemo(() => {
    const src = hospDrg ? provDrgTrend : provTrend;
    if (!src) return [];
    const base = src.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      medicare: r.weighted_avg_medicare ? Number(r.weighted_avg_medicare) : null,
      discharges: Number(r.total_discharges),
    }));
    if (!compareHosp || !provTrendB) return base;
    const bMap = {};
    provTrendB.forEach(r => { bMap[Number(r.data_year)] = r; });
    return base.map(d => ({
      ...d,
      paymentB: bMap[d.year] ? Number(bMap[d.year].weighted_avg_payment) : null,
      chargesB: bMap[d.year] ? Number(bMap[d.year].weighted_avg_charges) : null,
    }));
  }, [provTrend, provDrgTrend, provTrendB, compareHosp, hospDrg]);

  // Apply inflation adjustment
  const natDisplay = useMemo(() => applyInflation(natChart, inflationAdj), [natChart, inflationAdj]);
  const drgDisplay = useMemo(() => applyInflation(drgChart, inflationAdj), [drgChart, inflationAdj]);
  const stateDisplay = useMemo(() => applyInflation(stateChart, inflationAdj), [stateChart, inflationAdj]);
  const provDisplay = useMemo(() => applyInflation(provChart, inflationAdj), [provChart, inflationAdj]);

  const drgLabel = useMemo(() => {
    if (!selectedDrg || !drgs) return '';
    const d = drgs.find(x => x.drg_cd === selectedDrg);
    return d ? `DRG ${d.drg_cd} — ${d.drg_desc}` : selectedDrg;
  }, [selectedDrg, drgs]);

  const drgLabelB = useMemo(() => {
    if (!selectedDrgB || !drgs) return '';
    const d = drgs.find(x => x.drg_cd === selectedDrgB);
    return d ? `DRG ${d.drg_cd} — ${d.drg_desc}` : selectedDrgB;
  }, [selectedDrgB, drgs]);

  const provSrc = hospDrg ? provDrgTrend : provTrend;
  const provLabel = provSrc?.[0]
    ? `${provSrc[0].provider_name} (${provSrc[0].state_abbr})${hospDrg ? ` — DRG ${hospDrg}` : ''}`
    : '';
  const provLabelB = provTrendB?.[0]
    ? `${provTrendB[0].provider_name} (${provTrendB[0].state_abbr})`
    : '';

  /* ── KPI stats ── */
  const natPayStats = trendStats(natDisplay, 'payment');
  const natChgStats = trendStats(natDisplay, 'charges');
  const natVolStats = trendStats(natChart, 'discharges'); // volume not inflation-adjusted
  const chargeToPayment = natDisplay.length > 0
    ? (natDisplay[natDisplay.length - 1].charges / natDisplay[natDisplay.length - 1].payment) : null;
  const prevRatio = natDisplay.length >= 2
    ? (natDisplay[natDisplay.length - 2].charges / natDisplay[natDisplay.length - 2].payment) : null;
  const ratioYoy = chargeToPayment && prevRatio
    ? ((chargeToPayment - prevRatio) / prevRatio) * 100 : null;

  /* ── Hospital autocomplete ── */
  const API = import.meta.env.VITE_API_URL || '/api';
  useEffect(() => {
    clearTimeout(hospitalDebounceRef.current);
    if (!hospitalQuery || hospitalQuery.length < 2) { setHospitalSuggestions([]); return; }
    hospitalDebounceRef.current = setTimeout(() => {
      fetch(`${API}/quality/search?q=${encodeURIComponent(hospitalQuery)}&limit=8`, { headers: authHeaders() })
        .then(r => r.json()).then(setHospitalSuggestions).catch(() => setHospitalSuggestions([]));
    }, 250);
    return () => clearTimeout(hospitalDebounceRef.current);
  }, [hospitalQuery]);
  useEffect(() => {
    clearTimeout(hospDebounceRefB.current);
    if (!hospQueryB || hospQueryB.length < 2) { setHospSuggestionsB([]); return; }
    hospDebounceRefB.current = setTimeout(() => {
      fetch(`${API}/quality/search?q=${encodeURIComponent(hospQueryB)}&limit=8`, { headers: authHeaders() })
        .then(r => r.json()).then(setHospSuggestionsB).catch(() => setHospSuggestionsB([]));
    }, 250);
    return () => clearTimeout(hospDebounceRefB.current);
  }, [hospQueryB]);

  function selectHospital(h) {
    setCcn(h.facility_id);
    setHospitalQuery('');
    setHospitalSuggestions([]);
  }
  function selectHospitalB(h) {
    setCcnB(h.facility_id);
    setHospQueryB('');
    setHospSuggestionsB([]);
  }
  function handleHospInput(val, primary = true) {
    if (/^\d+$/.test(val)) {
      (primary ? setCcn : setCcnB)(val.slice(0, 6));
      (primary ? setHospitalQuery : setHospQueryB)('');
    } else {
      (primary ? setHospitalQuery : setHospQueryB)(val);
      (primary ? setCcn : setCcnB)('');
    }
  }

  /* ── Comparison stats tables ── */
  function ComparisonTable({ dataA, dataB, labelA, labelB, keys }) {
    return (
      <div className={s.compTable}>
        <table>
          <thead>
            <tr><th></th><th>{labelA}</th><th>{labelB}</th><th>Delta</th></tr>
          </thead>
          <tbody>
            {keys.map(({ key, label, fmt }) => {
              const a = trendStats(dataA, key);
              const b = trendStats(dataB, key);
              if (!a || !b) return null;
              const delta = a.latest && b.latest ? ((a.latest - b.latest) / b.latest) * 100 : null;
              return (
                <tr key={key}>
                  <td className={s.compLabel}>{label}</td>
                  <td>{fmt(a.latest)}</td>
                  <td>{fmt(b.latest)}</td>
                  <td className={delta > 0 ? s.deltaRed : s.deltaGreen}>{fmtPct(delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const inflLabel = inflationAdj ? ' (2023$)' : '';

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerRow}>
          <div>
            <h1 className={s.title}>Cost Trends</h1>
            <p className={s.subtitle}>
              Medicare inpatient cost trends 2013–2023 — 11 years of historical data
              {inflationAdj && <span className={s.inflBadge}> Inflation-Adjusted</span>}
            </p>
          </div>
          <div className={s.headerControls}>
            <div className={s.toggleWrap}>
              <button className={`${s.toggleBtn} ${!inflationAdj ? s.toggleActive : ''}`}
                onClick={() => setInflationAdj(false)}>Nominal</button>
              <button className={`${s.toggleBtn} ${inflationAdj ? s.toggleActive : ''}`}
                onClick={() => setInflationAdj(true)}>2023$</button>
            </div>
          </div>
        </div>
      </header>

      {/* ── KPI Row ── */}
      {loadingNat ? <Skeleton height={80} /> : natDisplay.length > 0 && (
        <div className={s.kpiRow}>
          <KpiCard
            label={`Avg Payment (${natDisplay[natDisplay.length - 1].year})${inflLabel}`}
            value={fmtCurrency(natPayStats?.latest)}
            delta={natPayStats?.yoy}
          />
          <KpiCard
            label={`Avg Charges (${natDisplay[natDisplay.length - 1].year})${inflLabel}`}
            value={fmtCurrency(natChgStats?.latest)}
            delta={natChgStats?.yoy}
          />
          <KpiCard
            label={`Total Discharges (${natChart[natChart.length - 1].year})`}
            value={fmtCompact(natVolStats?.latest)}
            delta={natVolStats?.yoy}
            invertColor
          />
          <KpiCard
            label="Payment CAGR (11yr)"
            value={natPayStats ? `${fmtPct(natPayStats.cagr)}/yr` : '—'}
          />
          <KpiCard
            label="Charge-to-Payment Ratio"
            value={chargeToPayment ? `${chargeToPayment.toFixed(2)}x` : '—'}
            delta={ratioYoy}
          />
        </div>
      )}

      {/* ── National Summary ── */}
      <Panel title="National Cost Trend" headerRight={<ExportBtn data={natDisplay} filename="national-trend.csv" />}>
        {loadingNat ? <Skeleton height={320} /> : natDisplay.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={natDisplay} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis yAxisId="cost" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={fmtCompact} />
                <YAxis yAxisId="vol" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name === 'discharges' ? fmtNumber(v) : fmtCurrency(v), name]} />
                <Bar yAxisId="vol" dataKey="discharges" fill="#3b82f6" fillOpacity={0.15} radius={[2,2,0,0]} />
                <Line yAxisId="cost" type="monotone" dataKey="payment" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="cost" type="monotone" dataKey="charges" stroke="#22d3ee" strokeWidth={2} dot={false} />
                {natDisplay[0]?.medicare != null && (
                  <Line yAxisId="cost" type="monotone" dataKey="medicare" stroke="#22c55e" strokeWidth={2} dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <div className={s.legend}>
              <span><span className={s.legendDot} style={{ background: '#3b82f6' }} />Avg Payment</span>
              <span><span className={s.legendDot} style={{ background: '#22d3ee' }} />Avg Charges</span>
              {natDisplay[0]?.medicare != null && (
                <span><span className={s.legendDot} style={{ background: '#22c55e' }} />Medicare Payment</span>
              )}
              <span><span className={s.legendDot} style={{ background: 'rgba(59,130,246,0.15)' }} />Discharges</span>
            </div>
            <TrendAnnotation data={natDisplay} metricKey="payment" label="Payment" />
          </>
        )}
      </Panel>

      {/* ── Top Movers ── */}
      {(topRising || topFalling) && (
        <Panel title="Biggest Movers — 11-Year Payment CAGR">
          <div className={s.moversGrid}>
            <div className={s.moversCol}>
              <h4 className={s.moversHeading}>
                <span className={s.deltaRed}>▲</span> Fastest Rising
              </h4>
              {topRising?.map((d, i) => (
                <button key={d.drg_cd} className={s.moverRow}
                  onClick={() => { setSelectedDrg(d.drg_cd); drgPanelRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
                  <span className={s.moverRank}>{i + 1}</span>
                  <span className={s.moverDrg}>{d.drg_cd}</span>
                  <span className={s.moverDesc}>{d.drg_desc?.slice(0, 50)}</span>
                  <span className={`${s.moverCagr} ${s.deltaRed}`}>{fmtPct(Number(d.cagr_pct))}/yr</span>
                </button>
              ))}
            </div>
            <div className={s.moversCol}>
              <h4 className={s.moversHeading}>
                <span className={s.deltaGreen}>▼</span> Fastest Falling
              </h4>
              {topFalling?.map((d, i) => (
                <button key={d.drg_cd} className={s.moverRow}
                  onClick={() => { setSelectedDrg(d.drg_cd); drgPanelRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
                  <span className={s.moverRank}>{i + 1}</span>
                  <span className={s.moverDrg}>{d.drg_cd}</span>
                  <span className={s.moverDesc}>{d.drg_desc?.slice(0, 50)}</span>
                  <span className={`${s.moverCagr} ${s.deltaGreen}`}>{fmtPct(Number(d.cagr_pct))}/yr</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* ── DRG Trend ── */}
      <div ref={drgPanelRef}>
        <Panel title={drgLabel || 'DRG Cost Trend'}
          headerRight={<>
            <button className={`${s.compareToggle} ${compareDrg ? s.compareActive : ''}`}
              onClick={() => { setCompareDrg(!compareDrg); if (compareDrg) setSelectedDrgB(''); }}>
              {compareDrg ? 'Single' : 'Compare'}
            </button>
            <ExportBtn data={drgDisplay} filename={`drg-${selectedDrg}-trend.csv`} />
          </>}
        >
          <div className={s.controls}>
            <div className={s.fieldGroup}>
              <span className={s.fieldLabel}>{compareDrg ? 'DRG A' : 'DRG'}</span>
              <select className={s.select} value={selectedDrg} onChange={e => setSelectedDrg(e.target.value)}>
                <option value="">Select a DRG…</option>
                {drgs?.map(d => (
                  <option key={d.drg_cd} value={d.drg_cd}>
                    {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            {compareDrg && (
              <div className={s.fieldGroup}>
                <span className={s.fieldLabel}>DRG B</span>
                <select className={s.select} value={selectedDrgB} onChange={e => setSelectedDrgB(e.target.value)}>
                  <option value="">Select a DRG…</option>
                  {drgs?.filter(d => d.drg_cd !== selectedDrg).map(d => (
                    <option key={d.drg_cd} value={d.drg_cd}>
                      {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {loadingDrg ? <Skeleton height={300} /> : drgDisplay.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={drgDisplay} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [fmtCurrency(v), name.replace('B', ' (B)')]} />
                  <Line type="monotone" dataKey="payment" stroke={COLORS_A.payment} strokeWidth={2} dot={{ r: 3 }} name="payment" />
                  <Line type="monotone" dataKey="charges" stroke={COLORS_A.charges} strokeWidth={2} dot={{ r: 3 }} name="charges" />
                  <Line type="monotone" dataKey="medicare" stroke={COLORS_A.medicare} strokeWidth={2} dot={{ r: 3 }} name="medicare" />
                  {compareDrg && drgDisplay[0]?.paymentB != null && (
                    <>
                      <Line type="monotone" dataKey="paymentB" stroke={COLORS_B.payment} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="paymentB" />
                      <Line type="monotone" dataKey="chargesB" stroke={COLORS_B.charges} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="chargesB" />
                      <Line type="monotone" dataKey="medicareB" stroke={COLORS_B.medicare} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="medicareB" />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
              {compareDrg && drgLabelB && (
                <div className={s.compareLegend}>
                  <span>Solid: {drgLabel}</span>
                  <span>Dashed: {drgLabelB}</span>
                </div>
              )}
              <TrendAnnotation data={drgDisplay} metricKey="payment" label="Payment" />
              {compareDrg && drgTrendB && (
                <ComparisonTable
                  dataA={drgDisplay} dataB={drgTrendB.map(r => ({ year: Number(r.data_year), payment: Number(r.weighted_avg_payment), charges: Number(r.weighted_avg_charges) }))}
                  labelA={`DRG ${selectedDrg}`} labelB={`DRG ${selectedDrgB}`}
                  keys={[
                    { key: 'payment', label: 'Latest Avg Payment', fmt: fmtCurrency },
                    { key: 'charges', label: 'Latest Avg Charges', fmt: fmtCurrency },
                  ]}
                />
              )}
            </>
          ) : selectedDrg ? (
            <p className={s.emptyMsg}>No trend data available for this DRG.</p>
          ) : null}
        </Panel>
      </div>

      {/* ── State Trend ── */}
      <Panel title={
        selectedState && selectedDrg ? `${selectedState} — DRG ${selectedDrg} Trend`
        : selectedState ? `${selectedState} — All-DRG Summary`
        : 'State DRG Trend'
      } headerRight={<ExportBtn data={stateDisplay} filename={`state-${selectedState}-trend.csv`} />}>
        <div className={s.controls}>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>State</span>
            <select className={s.select} value={selectedState} onChange={e => setSelectedState(e.target.value)}>
              <option value="">Select state…</option>
              {STATES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>DRG (optional)</span>
            <select className={s.select} value={selectedDrg} onChange={e => setSelectedDrg(e.target.value)}>
              <option value="">All DRGs</option>
              {drgs?.map(d => (
                <option key={d.drg_cd} value={d.drg_cd}>
                  {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(loadingSt || loadingStSum) ? <Skeleton height={300} /> : stateDisplay.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stateDisplay} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis yAxisId="cost" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                <YAxis yAxisId="vol" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name === 'discharges' ? fmtNumber(v) : fmtCurrency(v), name]} />
                <Bar yAxisId="vol" dataKey="discharges" fill="#3b82f6" fillOpacity={0.15} radius={[2,2,0,0]} />
                <Line yAxisId="cost" type="monotone" dataKey="payment" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="cost" type="monotone" dataKey="charges" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
                {stateDisplay[0]?.medicare != null && (
                  <Line yAxisId="cost" type="monotone" dataKey="medicare" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <TrendAnnotation data={stateDisplay} metricKey="payment" label="Payment" />
          </>
        ) : selectedState ? (
          <p className={s.emptyMsg}>
            {selectedDrg ? `No trend data for ${selectedState} — DRG ${selectedDrg}.` : 'Loading…'}
          </p>
        ) : null}
      </Panel>

      {/* ── Hospital Trend ── */}
      <Panel title={provLabel || 'Hospital Cost Trend'}
        headerRight={<>
          <button className={`${s.compareToggle} ${compareHosp ? s.compareActive : ''}`}
            onClick={() => { setCompareHosp(!compareHosp); if (compareHosp) { setCcnB(''); setHospQueryB(''); } }}>
            {compareHosp ? 'Single' : 'Compare'}
          </button>
          <ExportBtn data={provDisplay} filename={`hospital-${ccn}-trend.csv`} />
        </>}
      >
        <div className={s.controls}>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>{compareHosp ? 'Hospital A' : 'Hospital'}</span>
            <div className={s.searchWrap}>
              <input className={s.ccnInput} placeholder="Search by name or enter CCN..."
                value={hospitalQuery || ccn}
                onChange={e => handleHospInput(e.target.value, true)}
              />
              {hospitalSuggestions.length > 0 && (
                <div className={s.dropdown}>
                  {hospitalSuggestions.map(h => (
                    <button key={h.facility_id} className={s.dropdownItem} onClick={() => selectHospital(h)}>
                      <span className={s.dropdownName}>{h.facility_name}</span>
                      <span className={s.dropdownMeta}>{h.city}, {h.state} — {h.facility_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {compareHosp && (
            <div className={s.fieldGroup}>
              <span className={s.fieldLabel}>Hospital B</span>
              <div className={s.searchWrap}>
                <input className={s.ccnInput} placeholder="Search by name or enter CCN..."
                  value={hospQueryB || ccnB}
                  onChange={e => handleHospInput(e.target.value, false)}
                />
                {hospSuggestionsB.length > 0 && (
                  <div className={s.dropdown}>
                    {hospSuggestionsB.map(h => (
                      <button key={h.facility_id} className={s.dropdownItem} onClick={() => selectHospitalB(h)}>
                        <span className={s.dropdownName}>{h.facility_name}</span>
                        <span className={s.dropdownMeta}>{h.city}, {h.state} — {h.facility_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>DRG (optional)</span>
            <select className={s.select} value={hospDrg} onChange={e => setHospDrg(e.target.value)}>
              <option value="">All DRGs</option>
              {drgs?.map(d => (
                <option key={d.drg_cd} value={d.drg_cd}>
                  {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(loadingProv || loadingProvDrg) ? <Skeleton height={300} /> : provDisplay.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={provDisplay} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis yAxisId="cost" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                <YAxis yAxisId="vol" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={fmtCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name.includes('discharges') ? fmtNumber(v) : fmtCurrency(v), name.replace('B', ' (B)')]} />
                <Bar yAxisId="vol" dataKey="discharges" fill="#3b82f6" fillOpacity={0.15} radius={[2,2,0,0]} />
                <Line yAxisId="cost" type="monotone" dataKey="payment" stroke={COLORS_A.payment} strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="cost" type="monotone" dataKey="charges" stroke={COLORS_A.charges} strokeWidth={2} dot={{ r: 3 }} />
                {provDisplay[0]?.medicare != null && (
                  <Line yAxisId="cost" type="monotone" dataKey="medicare" stroke={COLORS_A.medicare} strokeWidth={2} dot={{ r: 3 }} />
                )}
                {compareHosp && provDisplay[0]?.paymentB != null && (
                  <>
                    <Line yAxisId="cost" type="monotone" dataKey="paymentB" stroke={COLORS_B.payment} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                    <Line yAxisId="cost" type="monotone" dataKey="chargesB" stroke={COLORS_B.charges} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {compareHosp && provLabelB && (
              <div className={s.compareLegend}>
                <span>Solid: {provLabel}</span>
                <span>Dashed: {provLabelB}</span>
              </div>
            )}
            <TrendAnnotation data={provDisplay} metricKey="payment" label="Payment" />
            {compareHosp && provTrendB && (
              <ComparisonTable
                dataA={provDisplay} dataB={provTrendB.map(r => ({ year: Number(r.data_year), payment: Number(r.weighted_avg_payment), charges: Number(r.weighted_avg_charges) }))}
                labelA={provLabel || `CCN ${ccn}`} labelB={provLabelB || `CCN ${ccnB}`}
                keys={[
                  { key: 'payment', label: 'Latest Avg Payment', fmt: fmtCurrency },
                  { key: 'charges', label: 'Latest Avg Charges', fmt: fmtCurrency },
                ]}
              />
            )}
            <button className={s.detailLink} onClick={() => navigate(`/hospitals/${ccn}`)}>
              View Hospital Details →
            </button>
          </>
        ) : ccn.length === 6 ? (
          <p className={s.emptyMsg}>No trend data found for CCN {ccn}{hospDrg ? ` — DRG ${hospDrg}` : ''}.</p>
        ) : null}
      </Panel>
    </div>
  );
}
