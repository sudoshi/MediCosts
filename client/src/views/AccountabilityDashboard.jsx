import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtNumber, fmtStars } from '../utils/format.js';
import s from './AccountabilityDashboard.module.css';

const TABS = [
  { id: 'markups',    label: 'Price Gouging' },
  { id: 'penalties',  label: 'Readmission Penalties' },
  { id: 'hac',        label: 'HAC Scores' },
  { id: 'states',     label: 'State Rankings' },
];

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function AccountabilityDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('markups');
  const [state, setState] = useState('');
  const stateQ = state ? `?state=${state}` : '';

  const { data: summary, loading: loadSum } = useApi('/quality/accountability/summary');
  const { data: markups, loading: loadMark } = useApi(
    tab === 'markups' ? `/quality/accountability/markups${stateQ}&limit=100`.replace('?&', '?') : null, [tab, state]
  );
  const { data: penalties, loading: loadPen } = useApi(
    tab === 'penalties' ? `/quality/readmissions/penalties${stateQ}&limit=100`.replace('?&', '?') : null, [tab, state]
  );
  const { data: hacRaw, loading: loadHac } = useApi(
    tab === 'hac' ? '/quality/psi/summary' : null, [tab]
  );
  const { data: stateRanks, loading: loadStates } = useApi(
    tab === 'states' ? '/quality/accountability/state-rankings' : null, [tab]
  );

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Accountability Dashboard</h1>
        <p className={s.subtitle}>Exposing the worst — penalties, markups, and patient safety failures</p>
      </header>

      {/* Hero Stats */}
      <div className={s.heroRow}>
        {loadSum ? <Skeleton height={80} /> : summary && (
          <>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#ef4444' }}>
                {summary.national_markup ? `${summary.national_markup}x` : '—'}
              </span>
              <span className={s.heroLabel}>National Avg Markup</span>
              <span className={s.heroDesc}>Charges vs. what Medicare actually pays</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#f59e0b' }}>
                {fmtNumber(summary.hospitals_penalized)}
              </span>
              <span className={s.heroLabel}>Hospitals Penalized</span>
              <span className={s.heroDesc}>For excess readmissions (HRRP)</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#ef4444' }}>
                {fmtNumber(summary.hac_penalized)}
              </span>
              <span className={s.heroLabel}>HAC Payment Reductions</span>
              <span className={s.heroDesc}>Hospitals with safety penalties</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#ec4899' }}>
                {summary.avg_patient_star ? `${summary.avg_patient_star}★` : '—'}
              </span>
              <span className={s.heroLabel}>Avg Patient Rating</span>
              <span className={s.heroDesc}>National HCAHPS average</span>
            </div>
          </>
        )}
      </div>

      <div className={s.controls}>
        <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />
        {(tab === 'markups' || tab === 'penalties') && (
          <div className={s.fieldGroup}>
            <span className={s.fieldLabel}>State</span>
            <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
              <option value="">All States</option>
              {STATES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Price Gouging */}
      {tab === 'markups' && (
        <Panel title="Highest Hospital Markup Ratios">
          {loadMark ? <Skeleton height={400} /> : markups?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Hospital</th>
                    <th className={s.thLeft}>City</th>
                    <th>Markup</th>
                    <th>Avg Charges</th>
                    <th>Avg Payment</th>
                    <th>Discharges</th>
                  </tr>
                </thead>
                <tbody>
                  {markups.map(r => (
                    <tr key={r.facility_id} className={s.clickableRow} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.mono}>
                        <span className={s.markupBadge} style={{ background: markupColor(r.markup_ratio) }}>
                          {Number(r.markup_ratio).toFixed(1)}x
                        </span>
                      </td>
                      <td className={s.mono}>{fmtCurrency(r.weighted_avg_charges)}</td>
                      <td className={s.mono}>{fmtCurrency(r.weighted_avg_payment)}</td>
                      <td className={s.mono}>{fmtNumber(r.total_discharges)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No markup data available.</p>}
        </Panel>
      )}

      {/* Readmission Penalties */}
      {tab === 'penalties' && (
        <Panel title="Worst Readmission Penalty Ratios (HRRP)">
          {loadPen ? <Skeleton height={400} /> : penalties?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Hospital</th>
                    <th className={s.thLeft}>Condition</th>
                    <th>State</th>
                    <th>Excess Ratio</th>
                    <th>Predicted Rate</th>
                    <th>Expected Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((r, i) => (
                    <tr key={`${r.facility_id}-${i}`} className={s.clickableRow} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.condition}>{r.measure_name?.replace(/-HRRP$/, '').replace(/^READM-30-/, '')}</td>
                      <td className={s.center}>{r.state}</td>
                      <td className={s.mono}>
                        <span className={s.penaltyBadge}>{Number(r.excess_readmission_ratio).toFixed(4)}</span>
                      </td>
                      <td className={s.mono}>{r.predicted_readm_rate ? Number(r.predicted_readm_rate).toFixed(2) + '%' : '—'}</td>
                      <td className={s.mono}>{r.expected_readm_rate ? Number(r.expected_readm_rate).toFixed(2) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No penalty data available.</p>}
        </Panel>
      )}

      {/* HAC Scores */}
      {tab === 'hac' && (
        <Panel title="Hospital-Acquired Condition (HAC) National Summary">
          {loadHac ? <Skeleton height={300} /> : hacRaw ? (
            <div className={s.hacGrid}>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Avg PSI-90</span>
                <span className={s.hacValue}>{hacRaw.avg_psi_90 ? Number(hacRaw.avg_psi_90).toFixed(4) : '—'}</span>
              </div>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Median PSI-90</span>
                <span className={s.hacValue}>{hacRaw.median_psi_90 ? Number(hacRaw.median_psi_90).toFixed(4) : '—'}</span>
              </div>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Avg HAC Score</span>
                <span className={s.hacValue}>{hacRaw.avg_hac_score ? Number(hacRaw.avg_hac_score).toFixed(3) : '—'}</span>
              </div>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Hospitals Penalized</span>
                <span className={s.hacValue} style={{ color: '#ef4444' }}>{fmtNumber(hacRaw.penalized_count)}</span>
              </div>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Not Penalized</span>
                <span className={s.hacValue} style={{ color: '#22c55e' }}>{fmtNumber(hacRaw.not_penalized_count)}</span>
              </div>
              <div className={s.hacCard}>
                <span className={s.hacLabel}>Hospitals Scored</span>
                <span className={s.hacValue}>{fmtNumber(hacRaw.hospitals)}</span>
              </div>
              <div className={s.hacSirRow}>
                <h3 className={s.sirTitle}>Average Infection Rates (SIR)</h3>
                <div className={s.sirGrid}>
                  {[
                    { label: 'CLABSI', value: hacRaw.avg_clabsi_sir },
                    { label: 'CAUTI', value: hacRaw.avg_cauti_sir },
                    { label: 'SSI', value: hacRaw.avg_ssi_sir },
                    { label: 'CDI', value: hacRaw.avg_cdi_sir },
                    { label: 'MRSA', value: hacRaw.avg_mrsa_sir },
                  ].map(m => (
                    <div key={m.label} className={s.sirCard}>
                      <span className={s.sirLabel}>{m.label}</span>
                      <span className={s.sirValue} style={{ color: sirColor(m.value) }}>
                        {m.value ? Number(m.value).toFixed(4) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : <p className={s.emptyMsg}>No HAC data available.</p>}
        </Panel>
      )}

      {/* State Rankings */}
      {tab === 'states' && (
        <Panel title="State Accountability Rankings">
          {loadStates ? <Skeleton height={400} /> : stateRanks?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th className={s.thLeft}>State</th>
                    <th>Avg Markup</th>
                    <th>Penalized Hospitals</th>
                    <th>Avg Excess Readm</th>
                    <th>Avg HAC Score</th>
                    <th>HAC Penalized</th>
                    <th>Patient Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {stateRanks.map((r, i) => (
                    <tr key={r.state}>
                      <td className={s.rank}>{i + 1}</td>
                      <td className={s.stateCell}>{r.state}</td>
                      <td className={s.mono}>
                        <span className={s.markupBadge} style={{ background: markupColor(r.avg_markup) }}>
                          {Number(r.avg_markup).toFixed(1)}x
                        </span>
                      </td>
                      <td className={s.mono}>{fmtNumber(r.penalized_hospitals)}</td>
                      <td className={s.mono}>{r.avg_excess_ratio ? Number(r.avg_excess_ratio).toFixed(4) : '—'}</td>
                      <td className={s.mono}>{r.avg_hac_score ? Number(r.avg_hac_score).toFixed(2) : '—'}</td>
                      <td className={s.mono}>{fmtNumber(r.hac_penalized)}</td>
                      <td className={s.mono}>{r.avg_patient_star ? fmtStars(r.avg_patient_star) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No state ranking data available.</p>}
        </Panel>
      )}
    </div>
  );
}

function markupColor(ratio) {
  const r = Number(ratio) || 0;
  if (r >= 5) return 'rgba(239, 68, 68, 0.25)';
  if (r >= 4) return 'rgba(245, 158, 11, 0.25)';
  if (r >= 3) return 'rgba(245, 158, 11, 0.15)';
  return 'rgba(113, 113, 122, 0.15)';
}

function sirColor(sir) {
  if (sir == null) return '#71717a';
  const v = Number(sir);
  if (v < 0.7) return '#22c55e';
  if (v < 1.0) return '#f59e0b';
  return '#ef4444';
}
