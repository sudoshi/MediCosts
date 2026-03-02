import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Bar, ComposedChart, Legend,
} from 'recharts';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtCompact, fmtNumber } from '../utils/format.js';
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

export default function CostTrends() {
  const navigate = useNavigate();
  const [selectedDrg, setSelectedDrg] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [ccn, setCcn] = useState('');

  const { data: drgs, loading: loadingDrgs } = useApi('/drgs/top50');
  const { data: national, loading: loadingNat } = useApi('/trends/national');
  const { data: drgTrend, loading: loadingDrg } = useApi(
    selectedDrg ? `/trends/drg?drg=${selectedDrg}` : null, [selectedDrg]
  );
  const { data: stateTrend, loading: loadingSt } = useApi(
    selectedState && selectedDrg ? `/trends/state?state=${selectedState}&drg=${selectedDrg}` : null,
    [selectedState, selectedDrg]
  );
  const { data: provTrend, loading: loadingProv } = useApi(
    ccn.length === 6 ? `/trends/provider?ccn=${ccn}` : null, [ccn]
  );

  const natChart = useMemo(() => {
    if (!national) return [];
    return national.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      discharges: Number(r.total_discharges),
    }));
  }, [national]);

  const drgChart = useMemo(() => {
    if (!drgTrend) return [];
    return drgTrend.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      medicare: Number(r.weighted_avg_medicare),
    }));
  }, [drgTrend]);

  const stateChart = useMemo(() => {
    if (!stateTrend) return [];
    return stateTrend.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      discharges: Number(r.total_discharges),
    }));
  }, [stateTrend]);

  const provChart = useMemo(() => {
    if (!provTrend) return [];
    return provTrend.map(r => ({
      year: Number(r.data_year),
      payment: Number(r.weighted_avg_payment),
      charges: Number(r.weighted_avg_charges),
      discharges: Number(r.total_discharges),
    }));
  }, [provTrend]);

  const drgLabel = useMemo(() => {
    if (!selectedDrg || !drgs) return '';
    const d = drgs.find(x => x.drg_cd === selectedDrg);
    return d ? `DRG ${d.drg_cd} — ${d.drg_desc}` : selectedDrg;
  }, [selectedDrg, drgs]);

  const provLabel = provTrend?.[0]
    ? `${provTrend[0].provider_name} (${provTrend[0].state_abbr})`
    : '';

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Cost Trends</h1>
        <p className={s.subtitle}>Medicare inpatient cost trends 2013–2023 — 11 years of historical data</p>
      </header>

      {/* ── National Summary ── */}
      <Panel title="National Cost Trend">
        {loadingNat ? <Skeleton height={320} /> : natChart.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={natChart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
              </ComposedChart>
            </ResponsiveContainer>
            <div className={s.legend}>
              <span><span className={s.legendDot} style={{ background: '#3b82f6' }} />Avg Payment</span>
              <span><span className={s.legendDot} style={{ background: '#22d3ee' }} />Avg Charges</span>
              <span><span className={s.legendDot} style={{ background: 'rgba(59,130,246,0.15)' }} />Discharges</span>
            </div>
          </>
        )}
      </Panel>

      {/* ── DRG Trend ── */}
      <Panel title={drgLabel || 'DRG Cost Trend'}>
        <div className={s.controls}>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>DRG</span>
            <select className={s.select} value={selectedDrg} onChange={e => setSelectedDrg(e.target.value)}>
              <option value="">Select a DRG…</option>
              {drgs?.map(d => (
                <option key={d.drg_cd} value={d.drg_cd}>
                  {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loadingDrg ? <Skeleton height={300} /> : drgChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={drgChart} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [fmtCurrency(v), name]} />
              <Line type="monotone" dataKey="payment" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="charges" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="medicare" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : selectedDrg ? (
          <p className={s.emptyMsg}>No trend data available for this DRG.</p>
        ) : null}
      </Panel>

      {/* ── State Trend ── */}
      <Panel title={selectedState && selectedDrg ? `${selectedState} — DRG ${selectedDrg} Trend` : 'State DRG Trend'}>
        <div className={s.controls}>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>State</span>
            <select className={s.select} value={selectedState} onChange={e => setSelectedState(e.target.value)}>
              <option value="">Select state…</option>
              {STATES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>DRG</span>
            <select className={s.select} value={selectedDrg} onChange={e => setSelectedDrg(e.target.value)}>
              <option value="">Select a DRG…</option>
              {drgs?.map(d => (
                <option key={d.drg_cd} value={d.drg_cd}>
                  {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loadingSt ? <Skeleton height={300} /> : stateChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stateChart} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [name === 'discharges' ? fmtNumber(v) : fmtCurrency(v), name]} />
              <Line type="monotone" dataKey="payment" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="charges" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : selectedState && selectedDrg ? (
          <p className={s.emptyMsg}>No trend data for {selectedState} — DRG {selectedDrg}.</p>
        ) : null}
      </Panel>

      {/* ── Hospital Trend ── */}
      <Panel title={provLabel || 'Hospital Cost Trend'}>
        <div className={s.controls}>
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>Hospital CCN</span>
            <input className={s.ccnInput} placeholder="e.g. 050454"
              value={ccn} onChange={e => setCcn(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
        </div>
        {loadingProv ? <Skeleton height={300} /> : provChart.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={provChart} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="year" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name === 'discharges' ? fmtNumber(v) : fmtCurrency(v), name]} />
                <Line type="monotone" dataKey="payment" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="charges" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <button className={s.detailLink} onClick={() => navigate(`/hospitals/${ccn}`)}>
              View Hospital Details →
            </button>
          </>
        ) : ccn.length === 6 ? (
          <p className={s.emptyMsg}>No trend data found for CCN {ccn}.</p>
        ) : null}
      </Panel>
    </div>
  );
}
