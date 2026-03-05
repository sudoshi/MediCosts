import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

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
import KpiDomainCard from '../components/quality/KpiDomainCard.jsx';
import HaiChart from '../components/quality/HaiChart.jsx';
import SafetyIndicators from '../components/quality/SafetyIndicators.jsx';
import ReadmissionPanel from '../components/quality/ReadmissionPanel.jsx';
import TimelyCareDashboard from '../components/quality/TimelyCareDashboard.jsx';
import MortalityPanel from '../components/quality/MortalityPanel.jsx';
import StateQualityTable from '../components/quality/StateQualityTable.jsx';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtStars } from '../utils/format.js';
import { DOMAIN_COLORS } from '../utils/qualityColors.js';
import s from './QualityCommandCenter.module.css';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const KPI_ITEMS = [
  { id: 'clinical',           label: 'Clinical',           icon: '♥', color: DOMAIN_COLORS.clinical.main,           dim: DOMAIN_COLORS.clinical.dim },
  { id: 'safety',             label: 'Safety',             icon: '⛨', color: DOMAIN_COLORS.safety.main,             dim: DOMAIN_COLORS.safety.dim },
  { id: 'operational',        label: 'Operations',         icon: '↻', color: DOMAIN_COLORS.operational.main,        dim: DOMAIN_COLORS.operational.dim },
  { id: 'quality',            label: 'Outcomes',           icon: '★', color: DOMAIN_COLORS.quality.main,            dim: DOMAIN_COLORS.quality.dim },
  { id: 'financial',          label: 'Financial',          icon: '$', color: DOMAIN_COLORS.financial.main,          dim: DOMAIN_COLORS.financial.dim },
  { id: 'patient_experience', label: 'Patient Experience', icon: '☺', color: DOMAIN_COLORS.patient_experience.main, dim: DOMAIN_COLORS.patient_experience.dim },
];

export default function QualityCommandCenter() {
  const navigate = useNavigate();
  const [state, setState] = useState('');
  const qs = state ? `state=${state}&` : '';

  const { data: psiData }                               = useApi('/quality/psi/summary');
  const { data: readmData }                             = useApi('/quality/readmissions/summary');
  const { data: mortalityData }                         = useApi('/quality/mortality/summary');
  const { data: stateData }                             = useApi('/quality/state-summary');
  const { data: vbpData,       loading: loadVbp }       = useApi('/vbp/rankings?limit=200');
  const { data: hcahpsData,    loading: loadHcahps }    = useApi(`/quality/hcahps/summary?${qs}`,                          [state]);
  const { data: compositeData, loading: loadComposite } = useApi(`/quality/composite?${qs}sort=psi_90_score&order=desc&limit=25`, [state]);
  const { data: penaltiesData, loading: loadPen }       = useApi(`/quality/readmissions/penalties?${qs}limit=50`,          [state]);

  // Phase 3 — spotlight sources
  const worstSafety  = compositeData?.[0] || null;
  const worstReadm   = penaltiesData?.[0]  || null;
  const worstPatient = useMemo(
    () => compositeData
      ?.filter(r => Number(r.star_rating) > 0)
      .sort((a, b) => Number(a.star_rating) - Number(b.star_rating))[0] || null,
    [compositeData],
  );

  // Phase 4 — row heat baseline
  const maxPsi = Number(worstSafety?.psi_90_score) || 0;

  // VBP state aggregation (no state filter — VBP endpoint doesn't support it)
  const vbpByState = useMemo(() => {
    if (!vbpData) return [];
    const map = new Map();
    for (const r of vbpData) {
      if (!r.state) continue;
      if (!map.has(r.state)) map.set(r.state, { state: r.state, scores: [], clinical: [], safety: [], efficiency: [], engagement: [] });
      const e = map.get(r.state);
      if (r.total_performance_score   != null) e.scores.push(Number(r.total_performance_score));
      if (r.clinical_outcomes_score_w != null) e.clinical.push(Number(r.clinical_outcomes_score_w));
      if (r.safety_score_w            != null) e.safety.push(Number(r.safety_score_w));
      if (r.efficiency_score_w        != null) e.efficiency.push(Number(r.efficiency_score_w));
      if (r.person_engagement_score_w != null) e.engagement.push(Number(r.person_engagement_score_w));
    }
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return [...map.entries()].map(([st, d]) => ({
      state: st,
      hospitals:      d.scores.length,
      avg_total:      avg(d.scores),
      avg_clinical:   avg(d.clinical),
      avg_safety:     avg(d.safety),
      avg_efficiency: avg(d.efficiency),
      avg_engagement: avg(d.engagement),
    })).sort((a, b) => a.state.localeCompare(b.state));
  }, [vbpData]);

  // KPI headline values
  const kpis = useMemo(() => {
    const avgMort = mortalityData?.length
      ? (mortalityData.reduce((s, r) => s + Number(r.avg_rate), 0) / mortalityData.length).toFixed(1) + '%'
      : '—';
    const avgReadm = readmData?.length
      ? (readmData.reduce((s, r) => s + Number(r.avg_ratio), 0) / readmData.length).toFixed(4)
      : '—';
    const avgPayment = stateData?.length
      ? '$' + Math.round(stateData.reduce((s, r) => s + Number(r.avg_payment || 0), 0) / stateData.length).toLocaleString()
      : '—';
    const avgHcahps    = hcahpsData?.length
      ? (hcahpsData.reduce((s, r) => s + Number(r.avg_overall_star || 0), 0) / hcahpsData.length).toFixed(1)
      : '—';
    const totalSurveys = hcahpsData?.length
      ? hcahpsData.reduce((s, r) => s + (Number(r.total_surveys) || 0), 0).toLocaleString()
      : '—';
    return {
      clinical:           { value: avgMort,    subtitle: `${mortalityData?.length || 0} conditions tracked` },
      safety:             { value: psiData?.avg_psi_90 ? Number(psiData.avg_psi_90).toFixed(3) : '—', subtitle: `${psiData?.hospitals?.toLocaleString() || '—'} hospitals scored` },
      operational:        { value: avgReadm,   subtitle: `${readmData?.length || 0} conditions tracked` },
      quality:            { value: stateData?.length ? (stateData.reduce((s, r) => s + Number(r.avg_star_rating), 0) / stateData.length).toFixed(1) : '—', subtitle: 'National avg star rating' },
      financial:          { value: avgPayment, subtitle: 'Avg Medicare payment' },
      patient_experience: { value: avgHcahps + '★', subtitle: `${totalSurveys} surveys` },
    };
  }, [psiData, readmData, mortalityData, stateData, hcahpsData]);

  const spotlightLoading = loadComposite || loadPen;

  return (
    <div className={s.page}>

      {/* ── Header row: title left, state filter right ── */}
      <div className={s.headerRow}>
        <div>
          <h1 className={s.title}>Quality Command Center</h1>
          <p className={s.subtitle}>National hospital quality metrics from CMS Hospital Compare</p>
        </div>
        <div className={s.stateFilter}>
          <span className={s.fieldLabel}>Filter by State</span>
          <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      {/* ── KPI Cards (pure display) ── */}
      <div className={s.kpiGrid}>
        {KPI_ITEMS.map(item => (
          <KpiDomainCard
            key={item.id}
            title={item.label}
            value={kpis[item.id]?.value || '—'}
            subtitle={kpis[item.id]?.subtitle || ''}
            color={item.color}
            dim={item.dim}
            icon={item.icon}
          />
        ))}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* Phase 3 — Spotlight: worst per quality domain */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>⚠ Worst Quality Performers</span>
        <span className={s.sectionLabelLine} />
      </div>

      {spotlightLoading ? (
        <div className={s.spotlightGrid}>
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : (
        <div className={s.spotlightGrid}>

          {/* Worst Patient Safety (PSI-90) */}
          <div
            className={`${s.spotlightCard} ${s.spotlightRed}`}
            onClick={() => worstSafety && navigate(`/hospitals/${worstSafety.facility_id}`)}
            title={worstSafety ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Patient Safety · Worst PSI-90</div>
            <div className={s.spotlightMetric} style={{ color: '#ef4444' }}>
              {worstSafety?.psi_90_score ? Number(worstSafety.psi_90_score).toFixed(3) : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>PSI-90 composite score</div>
            <div className={s.spotlightName}>{worstSafety?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>
              {worstSafety ? [worstSafety.city, worstSafety.state].filter(Boolean).join(', ') : ''}
            </div>
            {worstSafety && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  PSI-90 of <strong>{Number(worstSafety.psi_90_score).toFixed(3)}</strong> — CMS composite of serious preventable harm events
                  {worstSafety.avg_excess_readm_ratio > 1 &&
                    ` · excess readmission ratio ${Number(worstSafety.avg_excess_readm_ratio).toFixed(3)}`}
                </div>
              </>
            )}
          </div>

          {/* Worst Readmission Penalty */}
          <div
            className={`${s.spotlightCard} ${s.spotlightAmber}`}
            onClick={() => worstReadm && navigate(`/hospitals/${worstReadm.facility_id}`)}
            title={worstReadm ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Readmissions · Worst HRRP Penalty</div>
            <div className={s.spotlightMetric} style={{ color: '#f97316' }}>
              {worstReadm ? Number(worstReadm.excess_readmission_ratio).toFixed(3) : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>excess readmission ratio</div>
            <div className={s.spotlightName}>{worstReadm?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{worstReadm?.state || ''}</div>
            {worstReadm && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  Readmits <strong>{Number(worstReadm.excess_readmission_ratio).toFixed(3)}×</strong> more patients than expected
                  {worstReadm.measure_name &&
                    ` — ${worstReadm.measure_name.replace(/-HRRP$/, '').replace(/^READM-30-/, '')}`}
                </div>
              </>
            )}
          </div>

          {/* Worst Patient Experience */}
          <div
            className={`${s.spotlightCard} ${s.spotlightRose}`}
            onClick={() => worstPatient && navigate(`/hospitals/${worstPatient.facility_id}`)}
            title={worstPatient ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Patient Experience · Lowest Rating</div>
            <div className={s.spotlightMetric} style={{ color: '#e879f9' }}>
              {worstPatient?.star_rating ? `${worstPatient.star_rating}★` : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>HCAHPS overall star rating</div>
            <div className={s.spotlightName}>{worstPatient?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>
              {worstPatient ? [worstPatient.city, worstPatient.state].filter(Boolean).join(', ') : ''}
            </div>
            {worstPatient && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightIndictment}>
                  Rated <strong>{worstPatient.star_rating} star</strong> by patients
                  {worstPatient.psi_90_score ? ` · PSI-90 ${Number(worstPatient.psi_90_score).toFixed(3)}` : ''}
                  {worstPatient.avg_mortality_rate ? `, mortality ${Number(worstPatient.avg_mortality_rate).toFixed(1)}%` : ''}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* Phase 4 — Composite quality failure leaderboard */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Composite Quality Failure Index</span>
        <span className={s.sectionLabelLine} />
      </div>

      <Panel title="Worst Composite Quality — Top 25 by Patient Safety Score" headerRight={<ExportBtn data={compositeData} filename={`composite-quality-${state||'all'}.csv`} />}>
        {loadComposite ? <Skeleton height={400} /> : compositeData?.length > 0 ? (
          <div className={s.tableWrap}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: 28 }}>#</th>
                  <th style={{ textAlign: 'left' }}>Hospital</th>
                  <th>State</th>
                  <th>PSI-90</th>
                  <th>Excess Readm</th>
                  <th>Avg Mortality</th>
                  <th>Stars</th>
                  <th>Avg Payment</th>
                </tr>
              </thead>
              <tbody>
                {compositeData.map((r, i) => (
                  <tr
                    key={r.facility_id}
                    className={s.clickableRow}
                    onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    style={rowHeat(r.psi_90_score, maxPsi)}
                  >
                    <td className={s.rankCell}>{i + 1}</td>
                    <td className={s.nameCell}>{r.facility_name}</td>
                    <td className={s.mono}>{r.state}</td>
                    <td className={s.mono} style={{ color: psiColor(r.psi_90_score) }}>
                      {r.psi_90_score ? Number(r.psi_90_score).toFixed(3) : '—'}
                    </td>
                    <td className={s.mono} style={{ color: readmColor(r.avg_excess_readm_ratio) }}>
                      {r.avg_excess_readm_ratio ? Number(r.avg_excess_readm_ratio).toFixed(4) : '—'}
                    </td>
                    <td className={s.mono}>
                      {r.avg_mortality_rate ? Number(r.avg_mortality_rate).toFixed(1) + '%' : '—'}
                    </td>
                    <td className={s.mono}>{fmtStars(r.star_rating)}</td>
                    <td className={s.mono}>
                      {r.weighted_avg_payment
                        ? '$' + Number(r.weighted_avg_payment).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={s.emptyMsg}>No composite quality data available.</p>}
      </Panel>

      {/* ════════════════════════════════════════════ */}
      {/* Patient Safety                               */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Patient Safety</span>
        <span className={s.sectionLabelLine} />
      </div>

      <HaiChart />
      <SafetyIndicators />

      {/* ════════════════════════════════════════════ */}
      {/* Clinical Outcomes                            */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Clinical Outcomes</span>
        <span className={s.sectionLabelLine} />
      </div>

      <MortalityPanel />

      {/* ════════════════════════════════════════════ */}
      {/* Readmissions & Timely Care                   */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Readmissions & Timely Care</span>
        <span className={s.sectionLabelLine} />
      </div>

      <ReadmissionPanel />
      <TimelyCareDashboard />

      {/* ════════════════════════════════════════════ */}
      {/* Patient Experience                           */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Patient Experience (HCAHPS)</span>
        <span className={s.sectionLabelLine} />
      </div>

      <Panel title="Patient Experience by State (HCAHPS)">
        {loadHcahps ? <Skeleton height={300} /> : hcahpsData?.length > 0 ? (
          <div className={s.tableWrap}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>State</th>
                  <th>Hospitals</th>
                  <th>Overall</th>
                  <th>Nurse Comm</th>
                  <th>Doctor Comm</th>
                  <th>Cleanliness</th>
                  <th>Quietness</th>
                  <th>Recommend</th>
                  <th>Surveys</th>
                </tr>
              </thead>
              <tbody>
                {hcahpsData.map(r => (
                  <tr key={r.state}>
                    <td className={s.stateCell}>{r.state}</td>
                    <td className={s.mono}>{r.hospitals}</td>
                    <td className={s.mono}>{fmtStars(r.avg_overall_star)}</td>
                    <td className={s.mono}>{fmtStars(r.avg_nurse_star)}</td>
                    <td className={s.mono}>{fmtStars(r.avg_doctor_star)}</td>
                    <td className={s.mono}>{fmtStars(r.avg_cleanliness_star)}</td>
                    <td className={s.mono}>{fmtStars(r.avg_quietness_star)}</td>
                    <td className={s.mono}>{fmtStars(r.avg_recommend_star)}</td>
                    <td className={s.mono}>{Number(r.total_surveys).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={s.emptyMsg}>No HCAHPS data available.</p>}
      </Panel>

      {/* ════════════════════════════════════════════ */}
      {/* Value-Based Purchasing                       */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>Value-Based Purchasing</span>
        <span className={s.sectionLabelLine} />
      </div>

      <Panel title="Value-Based Purchasing Performance by State">
        {loadVbp ? <Skeleton height={300} /> : vbpByState.length > 0 ? (
          <div className={s.tableWrap}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>State</th>
                  <th>Hospitals</th>
                  <th>Avg Total Score</th>
                  <th>Clinical</th>
                  <th>Safety</th>
                  <th>Efficiency</th>
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {vbpByState.map(r => (
                  <tr key={r.state}>
                    <td className={s.stateCell}>{r.state}</td>
                    <td className={s.mono}>{r.hospitals}</td>
                    <td className={s.mono}>{r.avg_total?.toFixed(1) ?? '—'}</td>
                    <td className={s.mono}>{r.avg_clinical?.toFixed(1) ?? '—'}</td>
                    <td className={s.mono}>{r.avg_safety?.toFixed(1) ?? '—'}</td>
                    <td className={s.mono}>{r.avg_efficiency?.toFixed(1) ?? '—'}</td>
                    <td className={s.mono}>{r.avg_engagement?.toFixed(1) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={s.emptyMsg}>No VBP data available.</p>}
      </Panel>

      {/* ════════════════════════════════════════════ */}
      {/* State Quality Overview                       */}
      {/* ════════════════════════════════════════════ */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>State Quality Overview</span>
        <span className={s.sectionLabelLine} />
      </div>

      <StateQualityTable />

    </div>
  );
}

/* ── Color helpers ── */

function psiColor(score) {
  if (score == null) return '#71717a';
  const v = Number(score);
  if (v > 1.5) return '#ef4444';
  if (v > 1.0) return '#f97316';
  if (v > 0.5) return '#f59e0b';
  return '#22c55e';
}

function readmColor(ratio) {
  if (ratio == null) return '#71717a';
  const v = Number(ratio);
  if (v > 1.2) return '#ef4444';
  if (v > 1.1) return '#f97316';
  if (v > 1.0) return '#f59e0b';
  return '#71717a';
}

function rowHeat(value, maxVal) {
  if (!maxVal || value == null) return {};
  const ratio = Number(value) / maxVal;
  if (ratio < 0.55) return {};
  const alpha = ((ratio - 0.55) / 0.45) * 0.14;
  return { background: `rgba(239, 68, 68, ${alpha.toFixed(3)})` };
}
