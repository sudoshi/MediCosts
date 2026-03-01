import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  { id: 'value',  label: 'Value Composite' },
  { id: 'vbp',    label: 'VBP Rankings' },
  { id: 'mspb',   label: 'Spending / Beneficiary' },
];

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function SpendingValue() {
  const [tab, setTab] = useState('value');
  const [state, setState] = useState('');
  const [sort, setSort] = useState({ col: '', dir: 'desc' });
  const stateQ = state ? `?state=${state}` : '';

  const { data: valueData, loading: loadValue } = useApi(
    tab === 'value' ? `/value-composite${stateQ}&limit=200`.replace('?&','?') : null, [tab, state]
  );
  const { data: vbpData, loading: loadVBP } = useApi(
    tab === 'vbp' ? `/vbp/rankings${stateQ}&limit=200`.replace('?&','?') : null, [tab, state]
  );
  const { data: mspbData, loading: loadMSPB } = useApi(
    tab === 'mspb' ? `/spending/per-beneficiary${stateQ}&limit=200`.replace('?&','?') : null, [tab, state]
  );

  const handleSort = (col) => {
    setSort(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortData = (rows) => {
    if (!sort.col || !rows) return rows;
    return [...rows].sort((a, b) => {
      const va = Number(a[sort.col]) || 0;
      const vb = Number(b[sort.col]) || 0;
      return sort.dir === 'desc' ? vb - va : va - vb;
    });
  };

  const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '';

  const vbpChart = useMemo(() => {
    if (!vbpData) return [];
    return vbpData
      .filter(r => r.total_performance_score != null)
      .slice(0, 20)
      .map(r => ({
        name: r.facility_name?.slice(0, 25),
        score: Number(r.total_performance_score),
      }));
  }, [vbpData]);

  const mspbChart = useMemo(() => {
    if (!mspbData) return [];
    return mspbData
      .filter(r => r.mspb_score != null)
      .sort((a, b) => Number(a.mspb_score) - Number(b.mspb_score))
      .slice(0, 20)
      .map(r => ({
        name: r.facility_name?.slice(0, 25),
        score: Number(r.mspb_score),
      }));
  }, [mspbData]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Spending &amp; Value</h1>
        <p className={s.subtitle}>Medicare spending efficiency and value-based purchasing performance</p>
      </header>

      <div className={s.toolbar}>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>State</span>
          <select className={s.select} value={state} onChange={e => { setState(e.target.value); setSort({ col: '', dir: 'desc' }); }}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onTabChange={t => { setTab(t); setSort({ col: '', dir: 'desc' }); }} />

      {/* ── Value Composite ── */}
      {tab === 'value' && (
        <Panel title="Hospital Value Composite">
          {loadValue ? <Skeleton height={400} /> : valueData?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Hospital</th>
                    <th className={s.thLeft}>State</th>
                    <th onClick={() => handleSort('star_rating')}>Stars{arrow('star_rating')}</th>
                    <th onClick={() => handleSort('vbp_total_score')}>VBP Score{arrow('vbp_total_score')}</th>
                    <th onClick={() => handleSort('mspb_score')}>MSPB{arrow('mspb_score')}</th>
                    <th onClick={() => handleSort('weighted_avg_payment')}>Avg Payment{arrow('weighted_avg_payment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(valueData).map(r => (
                    <tr key={r.facility_id}>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.state}>{r.state}</td>
                      <td className={s.stars}>{fmtStars(r.star_rating)}</td>
                      <td className={s.mono}>{r.vbp_total_score != null ? Number(r.vbp_total_score).toFixed(1) : '—'}</td>
                      <td className={s.mono}>{r.mspb_score != null ? Number(r.mspb_score).toFixed(4) : '—'}</td>
                      <td className={s.mono}>{fmtCurrency(r.weighted_avg_payment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No value composite data available. Try selecting a state.</p>}
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
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }}
                    axisLine={false} tickLine={false} width={190} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={v => [v.toFixed(1), 'Score']} />
                  <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
          <Panel title="VBP Domain Scores">
            {loadVBP ? <Skeleton height={400} /> : vbpData?.length > 0 ? (
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
                    {sortData(vbpData).map(r => (
                      <tr key={r.facility_id}>
                        <td className={s.name}>{r.facility_name}</td>
                        <td className={s.state}>{r.state}</td>
                        <td className={s.mono}>{r.total_performance_score != null ? Number(r.total_performance_score).toFixed(1) : '—'}</td>
                        <td className={s.mono}>{r.clinical_outcomes_score_w != null ? Number(r.clinical_outcomes_score_w).toFixed(1) : '—'}</td>
                        <td className={s.mono}>{r.safety_score_w != null ? Number(r.safety_score_w).toFixed(1) : '—'}</td>
                        <td className={s.mono}>{r.efficiency_score_w != null ? Number(r.efficiency_score_w).toFixed(1) : '—'}</td>
                        <td className={s.mono}>{r.person_engagement_score_w != null ? Number(r.person_engagement_score_w).toFixed(1) : '—'}</td>
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
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }}
                    axisLine={false} tickLine={false} width={190} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={v => [v.toFixed(4), 'MSPB']} />
                  <Bar dataKey="score" fill="#22c55e" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
          <Panel title="Spending Per Beneficiary (MSPB-1)">
            {loadMSPB ? <Skeleton height={400} /> : mspbData?.length > 0 ? (
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
                    {sortData(mspbData).map(r => (
                      <tr key={r.facility_id}>
                        <td className={s.name}>{r.facility_name}</td>
                        <td className={s.state}>{r.state}</td>
                        <td className={s.mono}>{r.mspb_score != null ? Number(r.mspb_score).toFixed(4) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={s.emptyMsg}>No MSPB data available.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
