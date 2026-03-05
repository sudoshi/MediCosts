import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

const ExportBtn = ({ data, filename }) => (
  <button
    onClick={() => exportCsv(data, filename)}
    style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-dim)', borderRadius: 5, color: 'var(--text-secondary)', fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
    onMouseEnter={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--text-primary)'; }}
    onMouseLeave={e => { e.target.style.borderColor = 'var(--border-dim)'; e.target.style.color = 'var(--text-secondary)'; }}
  >↓ CSV</button>
);
import { fmtCurrency, fmtNumber, fmtStars } from '../utils/format.js';
import s from './AccountabilityDashboard.module.css';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function AccountabilityDashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState('');
  const qs = state ? `state=${state}&` : '';

  const { data: summary,    loading: loadSum    } = useApi('/quality/accountability/summary');
  const { data: markups,    loading: loadMark   } = useApi(`/quality/accountability/markups?${qs}limit=100`,  [state]);
  const { data: penalties,  loading: loadPen    } = useApi(`/quality/readmissions/penalties?${qs}limit=100`, [state]);
  const { data: hacRaw,     loading: loadHacS   } = useApi('/quality/psi/summary');
  const { data: hacList,    loading: loadHac    } = useApi(`/quality/psi/list?${qs}limit=100`,               [state]);
  const { data: stateRanks, loading: loadStates } = useApi('/quality/accountability/state-rankings');

  // APIs return data sorted worst-first — [0] is the single worst in each category
  const worstMarkup  = markups?.[0]  || null;
  const worstPenalty = penalties?.[0] || null;
  const worstHac     = hacList?.[0]  || null;

  // Phase 4 — max values for row heat (dataset is already sorted DESC so [0] is max)
  const maxMarkup = Number(worstMarkup?.markup_ratio) || 0;
  const maxExcess = Number(worstPenalty?.excess_readmission_ratio) || 0;
  const maxHac    = Number(worstHac?.total_hac_score) || 0;

  // Phase 2 — multi-offense repeat offenders
  const multiOffenders = useMemo(
    () => computeMultiOffenders(markups, penalties, hacList),
    [markups, penalties, hacList],
  );

  // Phase 3 — composite accountability failure index
  const compositeRankings = useMemo(
    () => computeCompositeScores(markups, penalties, hacList),
    [markups, penalties, hacList],
  );

  const coreLoading = loadMark || loadPen || loadHac;

  return (
    <div className={s.page}>

      {/* ── Header row ── */}
      <div className={s.headerRow}>
        <div>
          <h1 className={s.title}>Accountability Dashboard</h1>
          <p className={s.subtitle}>Penalties, markups, and patient safety failures — exposed</p>
        </div>
        <div className={s.stateFilter}>
          <span className={s.fieldLabel}>Filter by State</span>
          <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      {/* ── Hero Stats ── */}
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

      {/* ════════════════════════════════════════════ */}
      {/* Phase 1 — Spotlight: single worst per category */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>⚠ Worst Offenders — Top Flagged Facilities</span>
        <span className={s.sectionLabelLine} />
      </div>

      {coreLoading ? (
        <div className={s.spotlightGrid}>
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : (
        <div className={s.spotlightGrid}>

          {/* Worst Markup */}
          <div
            className={`${s.spotlightCard} ${s.spotlightRed}`}
            onClick={() => worstMarkup && navigate(`/hospitals/${worstMarkup.facility_id}`)}
            title={worstMarkup ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Price Gouging · Highest Markup</div>
            <div className={s.spotlightMetric} style={{ color: '#ef4444' }}>
              {worstMarkup ? `${Number(worstMarkup.markup_ratio).toFixed(1)}×` : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>charge-to-payment ratio</div>
            <div className={s.spotlightName}>{worstMarkup?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{worstMarkup ? `${worstMarkup.city}, ${worstMarkup.state}` : ''}</div>
            {worstMarkup && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  Bills patients <strong>{Number(worstMarkup.markup_ratio).toFixed(1)}×</strong> what Medicare pays — {fmtCurrency(worstMarkup.weighted_avg_charges)} avg charge
                  vs. {fmtCurrency(worstMarkup.weighted_avg_payment)} reimbursement
                </div>
              </>
            )}
          </div>

          {/* Worst Readmission */}
          <div
            className={`${s.spotlightCard} ${s.spotlightAmber}`}
            onClick={() => worstPenalty && navigate(`/hospitals/${worstPenalty.facility_id}`)}
            title={worstPenalty ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Readmissions · Worst HRRP Penalty</div>
            <div className={s.spotlightMetric} style={{ color: '#f97316' }}>
              {worstPenalty ? Number(worstPenalty.excess_readmission_ratio).toFixed(3) : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>excess readmission ratio</div>
            <div className={s.spotlightName}>{worstPenalty?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{worstPenalty?.state || ''}</div>
            {worstPenalty && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  Readmits <strong>{Number(worstPenalty.excess_readmission_ratio).toFixed(3)}×</strong> more patients than expected — condition:{' '}
                  {worstPenalty.measure_name?.replace(/-HRRP$/, '').replace(/^READM-30-/, '') || 'unknown'}
                </div>
              </>
            )}
          </div>

          {/* Worst HAC */}
          <div
            className={`${s.spotlightCard} ${s.spotlightRose}`}
            onClick={() => worstHac && navigate(`/hospitals/${worstHac.facility_id}`)}
            title={worstHac ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Patient Safety · Highest HAC Score</div>
            <div className={s.spotlightMetric} style={{ color: '#e879f9' }}>
              {worstHac?.total_hac_score ? Number(worstHac.total_hac_score).toFixed(2) : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>total HAC score</div>
            <div className={s.spotlightName}>{worstHac?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{worstHac?.state || ''}</div>
            {worstHac && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  HAC score {Number(worstHac.total_hac_score).toFixed(2)} — CMS{' '}
                  {worstHac.payment_reduction === 'Yes'
                    ? 'imposed a payment reduction penalty'
                    : 'flagged for elevated infection and safety risk'}
                  {worstHac.clabsi_sir != null && ` · CLABSI SIR ${Number(worstHac.clabsi_sir).toFixed(2)}`}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* Phase 2 — Multi-offense repeat offenders     */}
      {/* ════════════════════════════════════════════ */}
      <Panel title="Repeat Offenders — Worst Across Multiple Categories">
        {coreLoading ? <Skeleton height={250} /> : multiOffenders.length > 0 ? (
          <>
            <p className={s.panelNote}>
              Hospitals appearing in the top 20% worst performers in two or more accountability
              categories simultaneously — the most systemically problematic facilities.
            </p>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Hospital</th>
                    <th>State</th>
                    <th className={s.thLeft}>Failure Categories</th>
                    <th>Markup</th>
                    <th>Excess Readm</th>
                    <th>HAC Score</th>
                  </tr>
                </thead>
                <tbody>
                  {multiOffenders.map(r => (
                    <tr
                      key={r.facility_id}
                      className={s.clickableRow}
                      onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                      style={r.offense_count >= 3 ? { background: 'rgba(239,68,68,0.07)' } : {}}
                    >
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.center}>{r.state}</td>
                      <td>
                        <div className={s.offenseBadges}>
                          {r.offenses.includes('markup')      && <span className={`${s.offenseBadge} ${s.obRed}`}>Price Gouging</span>}
                          {r.offenses.includes('readmission') && <span className={`${s.offenseBadge} ${s.obAmber}`}>Readmissions</span>}
                          {r.offenses.includes('hac')         && <span className={`${s.offenseBadge} ${s.obRose}`}>HAC/Safety</span>}
                        </div>
                      </td>
                      <td className={s.mono}>
                        {r.markup_ratio != null
                          ? <span className={s.markupBadge} style={{ background: markupColor(r.markup_ratio) }}>
                              {r.markup_ratio.toFixed(1)}x
                            </span>
                          : <span className={s.muted}>—</span>}
                      </td>
                      <td className={s.mono}>
                        {r.excess_ratio != null
                          ? <span className={s.penaltyBadge}>{r.excess_ratio.toFixed(4)}</span>
                          : <span className={s.muted}>—</span>}
                      </td>
                      <td className={s.mono}>
                        {r.hac_score != null
                          ? <span style={{ color: '#e879f9', fontWeight: 700 }}>{r.hac_score.toFixed(3)}</span>
                          : <span className={s.muted}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className={s.emptyMsg}>
            {coreLoading ? '' : 'No hospitals found in top 20% worst across multiple categories for this filter.'}
          </p>
        )}
      </Panel>

      {/* ════════════════════════════════════════════ */}
      {/* Phase 3 — Composite accountability failure index */}
      {/* ════════════════════════════════════════════ */}
      <Panel title="Accountability Failure Index — Composite Rankings" headerRight={<ExportBtn data={compositeRankings} filename={`accountability-composite-${state||'all'}.csv`} />}>
        {coreLoading ? <Skeleton height={400} /> : compositeRankings.length > 0 ? (
          <>
            <p className={s.panelNote}>
              Weighted percentile composite across price gouging (35%), excess readmissions (25%),
              HAC safety score (30%), and patient rating (10%). Score 0–100; higher = worse.
            </p>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th className={s.thLeft}>Hospital</th>
                    <th>State</th>
                    <th className={s.thLeft}>Failure Score</th>
                    <th>Markup</th>
                    <th>Excess Readm</th>
                    <th>HAC Score</th>
                    <th>Stars</th>
                  </tr>
                </thead>
                <tbody>
                  {compositeRankings.map((r, i) => (
                    <tr
                      key={r.facility_id}
                      className={s.clickableRow}
                      onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                      style={{ background: compositeRowBg(r.composite) }}
                    >
                      <td className={s.rank}>{i + 1}</td>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.center}>{r.state}</td>
                      <td className={s.scoreCell}>
                        <div className={s.scoreRow}>
                          <span className={s.scoreNum} style={{ color: compositeColor(r.composite) }}>
                            {r.composite.toFixed(0)}
                          </span>
                          <div className={s.scoreBar}>
                            <div
                              className={s.scoreBarFill}
                              style={{
                                width: `${r.composite}%`,
                                background: compositeGradient(r.composite),
                              }}
                            />
                          </div>
                        </div>
                        <div className={s.subScores}>
                          <span className={s.subScore} style={{ background: pctColor(r.markup_pct) }} title={`Markup percentile: ${r.markup_pct?.toFixed(0)}%`}>M</span>
                          <span className={s.subScore} style={{ background: pctColor(r.excess_pct) }} title={`Readmission percentile: ${r.excess_pct?.toFixed(0)}%`}>R</span>
                          <span className={s.subScore} style={{ background: pctColor(r.hac_pct) }}   title={`HAC percentile: ${r.hac_pct?.toFixed(0)}%`}>H</span>
                          <span className={s.subScore} style={{ background: pctColor(r.star_pct) }}  title={`Star rating percentile (inverted): ${r.star_pct?.toFixed(0)}%`}>S</span>
                        </div>
                      </td>
                      <td className={s.mono} style={{ color: pctColor(r.markup_pct) }}>
                        {r.markup_ratio ? `${r.markup_ratio.toFixed(1)}x` : <span className={s.muted}>—</span>}
                      </td>
                      <td className={s.mono} style={{ color: pctColor(r.excess_pct) }}>
                        {r.excess_ratio != null ? r.excess_ratio.toFixed(4) : <span className={s.muted}>—</span>}
                      </td>
                      <td className={s.mono} style={{ color: pctColor(r.hac_pct) }}>
                        {r.hac_score != null ? r.hac_score.toFixed(3) : <span className={s.muted}>—</span>}
                      </td>
                      <td className={s.center}>{r.star_rating ? fmtStars(r.star_rating) : <span className={s.muted}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className={s.emptyMsg}>Insufficient data to compute composite rankings.</p>
        )}
      </Panel>

      {/* ════════════════════════════════════════════ */}
      {/* Phase 4 row heat applied to all existing panels */}
      {/* ════════════════════════════════════════════ */}

      {/* Price Gouging */}
      <Panel title="Highest Hospital Markup Ratios — Price Gouging" headerRight={<ExportBtn data={markups} filename={`markups-${state||'all'}.csv`} />}>
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
                  <tr
                    key={r.facility_id}
                    className={s.clickableRow}
                    onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    style={rowHeat(r.markup_ratio, maxMarkup)}
                  >
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

      {/* Readmission Penalties */}
      <Panel title="Worst Readmission Penalty Ratios (HRRP)" headerRight={<ExportBtn data={penalties} filename={`readmission-penalties-${state||'all'}.csv`} />}>
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
                  <tr
                    key={`${r.facility_id}-${i}`}
                    className={s.clickableRow}
                    onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    style={rowHeat(r.excess_readmission_ratio, maxExcess)}
                  >
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

      {/* HAC National Summary */}
      <Panel title="Hospital-Acquired Condition (HAC) National Summary">
        {loadHacS ? <Skeleton height={200} /> : hacRaw ? (
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
                  { label: 'CAUTI',  value: hacRaw.avg_cauti_sir  },
                  { label: 'SSI',    value: hacRaw.avg_ssi_sir    },
                  { label: 'CDI',    value: hacRaw.avg_cdi_sir    },
                  { label: 'MRSA',   value: hacRaw.avg_mrsa_sir   },
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

      {/* HAC Hospital List */}
      <Panel title="Hospital HAC Scores" headerRight={<ExportBtn data={hacList} filename={`hac-scores-${state||'all'}.csv`} />}>
        {loadHac ? <Skeleton height={400} /> : hacList?.length > 0 ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thLeft}>Hospital</th>
                  <th>State</th>
                  <th>HAC Score</th>
                  <th>PSI-90</th>
                  <th>Penalized</th>
                  <th>CLABSI</th>
                  <th>CAUTI</th>
                  <th>Stars</th>
                </tr>
              </thead>
              <tbody>
                {hacList.map(r => (
                  <tr
                    key={r.facility_id}
                    className={s.clickableRow}
                    onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    style={rowHeat(r.total_hac_score, maxHac)}
                  >
                    <td className={s.name}>{r.facility_name}</td>
                    <td className={s.center}>{r.state}</td>
                    <td className={s.mono}>{r.total_hac_score ? Number(r.total_hac_score).toFixed(3) : '—'}</td>
                    <td className={s.mono}>{r.psi_90_value ? Number(r.psi_90_value).toFixed(4) : '—'}</td>
                    <td className={s.center}>
                      <span style={{ color: r.payment_reduction === 'Yes' ? '#ef4444' : '#22c55e' }}>
                        {r.payment_reduction || '—'}
                      </span>
                    </td>
                    <td className={s.mono} style={{ color: sirColor(r.clabsi_sir) }}>
                      {r.clabsi_sir ? Number(r.clabsi_sir).toFixed(3) : '—'}
                    </td>
                    <td className={s.mono} style={{ color: sirColor(r.cauti_sir) }}>
                      {r.cauti_sir ? Number(r.cauti_sir).toFixed(3) : '—'}
                    </td>
                    <td className={s.center}>{fmtStars(r.star_rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={s.emptyMsg}>No hospital HAC data available.</p>}
      </Panel>

      {/* State Rankings */}
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

    </div>
  );
}

/* ── Phase 2: Multi-offense repeat offenders ── */
function computeMultiOffenders(markups, penalties, hacList) {
  if (!markups?.length || !penalties?.length || !hacList?.length) return [];
  const TOP_N = 20;

  const topMarkupIds = new Set(
    markups.slice(0, TOP_N).map(r => String(r.facility_id))
  );

  // Deduplicate penalties by facility, keep worst ratio
  const penByFac = new Map();
  penalties.forEach(r => {
    const id = String(r.facility_id);
    const ratio = Number(r.excess_readmission_ratio) || 0;
    if (!penByFac.has(id) || ratio > penByFac.get(id).ratio) {
      penByFac.set(id, { ...r, ratio });
    }
  });
  const topPenaltyIds = new Set(
    [...penByFac.values()]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, TOP_N)
      .map(r => String(r.facility_id))
  );

  // HAC list is already sorted by hac_score DESC
  const topHacIds = new Set(
    hacList.slice(0, TOP_N).map(r => String(r.facility_id))
  );

  const allIds = [...new Set([...topMarkupIds, ...topPenaltyIds, ...topHacIds])];

  return allIds
    .map(id => {
      const mk = markups.find(r => String(r.facility_id) === id);
      const pe = penByFac.get(id);
      const hc = hacList.find(r => String(r.facility_id) === id);

      const offenses = [
        topMarkupIds.has(id) && 'markup',
        topPenaltyIds.has(id) && 'readmission',
        topHacIds.has(id) && 'hac',
      ].filter(Boolean);

      if (offenses.length < 2) return null;

      return {
        facility_id: id,
        facility_name: (mk || pe || hc)?.facility_name || id,
        state:        (mk || pe || hc)?.state || '',
        offenses,
        offense_count: offenses.length,
        markup_ratio: mk ? Number(mk.markup_ratio) : null,
        excess_ratio: pe ? pe.ratio : null,
        hac_score:    hc ? Number(hc.total_hac_score) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.offense_count - a.offense_count || (b.markup_ratio || 0) - (a.markup_ratio || 0));
}

/* ── Phase 3: Composite accountability failure index ── */
function computeCompositeScores(markups, penalties, hacList) {
  if (!markups?.length) return [];

  // Build unified facility map starting from markups
  const facMap = new Map();
  markups.forEach(r => {
    facMap.set(String(r.facility_id), {
      facility_id:   String(r.facility_id),
      facility_name: r.facility_name,
      state:         r.state,
      markup_ratio:  Number(r.markup_ratio) || 0,
      excess_ratio:  null,
      hac_score:     null,
      star_rating:   null,
    });
  });

  // Merge worst excess readmission per facility
  const penByFac = {};
  penalties?.forEach(r => {
    const id = String(r.facility_id);
    const ratio = Number(r.excess_readmission_ratio) || 0;
    if (!penByFac[id] || ratio > penByFac[id]) penByFac[id] = ratio;
  });
  Object.entries(penByFac).forEach(([id, ratio]) => {
    const f = facMap.get(id);
    if (f) f.excess_ratio = ratio;
  });

  // Merge HAC data
  hacList?.forEach(r => {
    const f = facMap.get(String(r.facility_id));
    if (f) {
      f.hac_score   = r.total_hac_score != null ? Number(r.total_hac_score) : null;
      f.star_rating = r.star_rating     != null ? Number(r.star_rating)     : null;
    }
  });

  const facilities = [...facMap.values()];

  // Compute percentile rank within visible data (0 = best, 100 = worst)
  const rankPct = (val, arr) => {
    if (val == null) return null;
    const sorted = arr.filter(v => v != null).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const below = sorted.filter(v => v < val).length;
    return (below / sorted.length) * 100;
  };

  const mkVals  = facilities.map(f => f.markup_ratio).filter(v => v > 0);
  const exVals  = facilities.map(f => f.excess_ratio).filter(v => v != null);
  const hcVals  = facilities.map(f => f.hac_score).filter(v => v != null);
  const stVals  = facilities.map(f => f.star_rating).filter(v => v != null && v > 0);

  facilities.forEach(f => {
    f.markup_pct = rankPct(f.markup_ratio > 0 ? f.markup_ratio : null, mkVals);
    f.excess_pct = rankPct(f.excess_ratio, exVals);
    f.hac_pct    = rankPct(f.hac_score, hcVals);
    // Stars: lower = worse, so invert
    f.star_pct   = f.star_rating != null ? 100 - rankPct(f.star_rating, stVals) : null;

    const terms = [
      { val: f.markup_pct, w: 0.35 },
      { val: f.excess_pct, w: 0.25 },
      { val: f.hac_pct,    w: 0.30 },
      { val: f.star_pct,   w: 0.10 },
    ].filter(t => t.val != null);

    if (!terms.length) { f.composite = 0; return; }
    const totalW = terms.reduce((s, t) => s + t.w, 0);
    f.composite = terms.reduce((s, t) => s + t.val * t.w, 0) / totalW;
  });

  return facilities
    .filter(f => f.composite > 5)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 25);
}

/* ── Color helpers ── */
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

// Phase 4 — row background heat based on severity relative to max in dataset
function rowHeat(value, maxVal) {
  if (!maxVal || value == null) return {};
  const ratio = Number(value) / maxVal;
  if (ratio < 0.55) return {};
  const alpha = ((ratio - 0.55) / 0.45) * 0.14;
  return { background: `rgba(239, 68, 68, ${alpha.toFixed(3)})` };
}

// Phase 3 — sub-score dot color based on percentile (higher = worse)
function pctColor(pct) {
  if (pct == null) return '#3f3f46';
  if (pct >= 80) return '#ef4444';
  if (pct >= 60) return '#f97316';
  if (pct >= 40) return '#f59e0b';
  if (pct >= 20) return '#a3a3a3';
  return '#3f3f46';
}

// Phase 3 — composite score bar color
function compositeGradient(score) {
  if (score >= 75) return '#ef4444';
  if (score >= 50) return '#f97316';
  if (score >= 30) return '#f59e0b';
  return '#71717a';
}

function compositeColor(score) {
  if (score >= 75) return '#ef4444';
  if (score >= 50) return '#f97316';
  if (score >= 30) return '#f59e0b';
  return '#a3a3a3';
}

function compositeRowBg(score) {
  if (score >= 80) return 'rgba(239,68,68,0.08)';
  if (score >= 65) return 'rgba(249,115,22,0.06)';
  if (score >= 50) return 'rgba(245,158,11,0.04)';
  return '';
}
