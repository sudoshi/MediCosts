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
import { DOMAIN_COLORS } from '../utils/qualityColors.js';
import s from './QualityCommandCenter.module.css';

export default function QualityCommandCenter() {
  const [activeDomain, setActiveDomain] = useState('clinical');
  const { data: psiData } = useApi('/quality/psi/summary');
  const { data: readmData } = useApi('/quality/readmissions/summary');
  const { data: mortalityData } = useApi('/quality/mortality/summary');
  const { data: stateData } = useApi('/quality/state-summary');

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
    return {
      clinical: { value: avgMort, subtitle: `${mortalityData?.length || 0} conditions tracked` },
      safety: { value: psiData?.avg_psi_90 ? Number(psiData.avg_psi_90).toFixed(3) : '—', subtitle: `${psiData?.hospitals?.toLocaleString() || '—'} hospitals scored` },
      operational: { value: avgReadm, subtitle: `${readmData?.length || 0} conditions tracked` },
      quality: { value: stateData?.length ? (stateData.reduce((s, r) => s + Number(r.avg_star_rating), 0) / stateData.length).toFixed(1) : '—', subtitle: `National avg star rating` },
      financial: { value: avgPayment, subtitle: `Avg Medicare payment` },
    };
  }, [psiData, readmData, mortalityData, stateData]);

  const KPI_ITEMS = [
    { id: 'clinical',    label: 'Clinical',    icon: '♥',  color: DOMAIN_COLORS.clinical.main,    dim: DOMAIN_COLORS.clinical.dim },
    { id: 'safety',      label: 'Safety',      icon: '⛨',  color: DOMAIN_COLORS.safety.main,      dim: DOMAIN_COLORS.safety.dim },
    { id: 'operational', label: 'Operations',   icon: '↻',  color: DOMAIN_COLORS.operational.main, dim: DOMAIN_COLORS.operational.dim },
    { id: 'quality',     label: 'Outcomes',     icon: '★',  color: DOMAIN_COLORS.quality.main,     dim: DOMAIN_COLORS.quality.dim },
    { id: 'financial',   label: 'Financial',    icon: '$',  color: DOMAIN_COLORS.financial.main,   dim: DOMAIN_COLORS.financial.dim },
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
        {activeDomain === 'financial' && <StateQualityTable />}
      </div>
    </div>
  );
}
