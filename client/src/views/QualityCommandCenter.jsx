import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import DomainTabs from '../components/quality/DomainTabs.jsx';
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

export default function QualityCommandCenter() {
  const [activeDomain, setActiveDomain] = useState('clinical');
  const { data: psiData } = useApi('/quality/psi/summary');
  const { data: readmData } = useApi('/quality/readmissions/summary');
  const { data: mortalityData } = useApi('/quality/mortality/summary');
  const { data: stateData } = useApi('/quality/state-summary');
  const { data: vbpData, loading: loadVbp } = useApi('/vbp/rankings?limit=200');
  const { data: hcahpsData, loading: loadHcahps } = useApi('/quality/hcahps/summary');

  // VBP state-level aggregation for the financial tab
  const vbpByState = useMemo(() => {
    if (!vbpData) return [];
    const map = new Map();
    for (const r of vbpData) {
      if (!r.state) continue;
      if (!map.has(r.state)) map.set(r.state, { state: r.state, scores: [], clinical: [], safety: [], efficiency: [], engagement: [] });
      const s = map.get(r.state);
      if (r.total_performance_score != null) s.scores.push(Number(r.total_performance_score));
      if (r.clinical_outcomes_score_w != null) s.clinical.push(Number(r.clinical_outcomes_score_w));
      if (r.safety_score_w != null) s.safety.push(Number(r.safety_score_w));
      if (r.efficiency_score_w != null) s.efficiency.push(Number(r.efficiency_score_w));
      if (r.person_engagement_score_w != null) s.engagement.push(Number(r.person_engagement_score_w));
    }
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return [...map.entries()].map(([state, d]) => ({
      state,
      hospitals: d.scores.length,
      avg_total: avg(d.scores),
      avg_clinical: avg(d.clinical),
      avg_safety: avg(d.safety),
      avg_efficiency: avg(d.efficiency),
      avg_engagement: avg(d.engagement),
    })).sort((a, b) => a.state.localeCompare(b.state));
  }, [vbpData]);

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
    const avgHcahps = hcahpsData?.length
      ? (hcahpsData.reduce((s, r) => s + Number(r.avg_overall_star || 0), 0) / hcahpsData.length).toFixed(1)
      : '—';
    const totalSurveys = hcahpsData?.length
      ? hcahpsData.reduce((s, r) => s + (Number(r.total_surveys) || 0), 0).toLocaleString()
      : '—';
    return {
      clinical: { value: avgMort, subtitle: `${mortalityData?.length || 0} conditions tracked` },
      safety: { value: psiData?.avg_psi_90 ? Number(psiData.avg_psi_90).toFixed(3) : '—', subtitle: `${psiData?.hospitals?.toLocaleString() || '—'} hospitals scored` },
      operational: { value: avgReadm, subtitle: `${readmData?.length || 0} conditions tracked` },
      quality: { value: stateData?.length ? (stateData.reduce((s, r) => s + Number(r.avg_star_rating), 0) / stateData.length).toFixed(1) : '—', subtitle: `National avg star rating` },
      financial: { value: avgPayment, subtitle: `Avg Medicare payment` },
      patient_experience: { value: avgHcahps + '★', subtitle: `${totalSurveys} surveys` },
    };
  }, [psiData, readmData, mortalityData, stateData, hcahpsData]);

  const KPI_ITEMS = [
    { id: 'clinical',           label: 'Clinical',           icon: '♥',  color: DOMAIN_COLORS.clinical.main,           dim: DOMAIN_COLORS.clinical.dim },
    { id: 'safety',             label: 'Safety',             icon: '⛨',  color: DOMAIN_COLORS.safety.main,             dim: DOMAIN_COLORS.safety.dim },
    { id: 'operational',        label: 'Operations',         icon: '↻',  color: DOMAIN_COLORS.operational.main,        dim: DOMAIN_COLORS.operational.dim },
    { id: 'quality',            label: 'Outcomes',           icon: '★',  color: DOMAIN_COLORS.quality.main,            dim: DOMAIN_COLORS.quality.dim },
    { id: 'financial',          label: 'Financial',          icon: '$',  color: DOMAIN_COLORS.financial.main,          dim: DOMAIN_COLORS.financial.dim },
    { id: 'patient_experience', label: 'Patient Experience', icon: '☺',  color: DOMAIN_COLORS.patient_experience.main, dim: DOMAIN_COLORS.patient_experience.dim },
  ];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Quality Command Center</h1>
        <p className={s.subtitle}>National hospital quality metrics from CMS Hospital Compare</p>
      </header>

      {/* KPI Cards */}
      <div className={s.kpiGrid}>
        {KPI_ITEMS.map((item) => (
          <KpiDomainCard
            key={item.id}
            title={item.label}
            value={kpis[item.id]?.value || '—'}
            subtitle={kpis[item.id]?.subtitle || ''}
            color={item.color}
            dim={item.dim}
            icon={item.icon}
            active={activeDomain === item.id}
            onClick={() => setActiveDomain(item.id)}
          />
        ))}
      </div>

      {/* Domain Tabs */}
      <div className={s.tabBar}>
        <DomainTabs activeDomain={activeDomain} onDomainChange={setActiveDomain} />
      </div>

      {/* Domain Content */}
      <div className={s.content}>
        {activeDomain === 'clinical' && (
          <>
            <HaiChart />
            <MortalityPanel />
          </>
        )}
        {activeDomain === 'safety' && <SafetyIndicators />}
        {activeDomain === 'operational' && (
          <>
            <ReadmissionPanel />
            <TimelyCareDashboard />
          </>
        )}
        {activeDomain === 'quality' && <StateQualityTable />}

        {/* Financial — VBP Performance by State */}
        {activeDomain === 'financial' && (
          <Panel title="Value-Based Purchasing by State">
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
        )}

        {/* Patient Experience — HCAHPS by State */}
        {activeDomain === 'patient_experience' && (
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
        )}
      </div>
    </div>
  );
}
