import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtStars, fmtNumber } from '../utils/format.js';
import s from './DialysisDetail.module.css';

function categoryBadge(cat) {
  if (!cat) return { label: 'N/A', variant: 'neutral' };
  const lower = cat.toLowerCase();
  if (lower.includes('better') || lower.includes('below')) return { label: cat, variant: 'better' };
  if (lower.includes('worse') || lower.includes('above')) return { label: cat, variant: 'worse' };
  if (lower.includes('expected') || lower.includes('average')) return { label: cat, variant: 'same' };
  return { label: cat, variant: 'neutral' };
}

export default function DialysisDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useApi(`/post-acute/dialysis/${ccn}`, [ccn]);

  if (loading) {
    return (
      <div className={s.page}>
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={s.page}>
        <div className={s.notFound}>
          <h2>Dialysis Facility Not Found</h2>
          <p>No data for CCN: {ccn}</p>
          <button className={s.backBtn} onClick={() => navigate('/post-acute')}>Back to Post-Acute</button>
        </div>
      </div>
    );
  }

  const d = data;
  const outcomes = [
    { label: 'Mortality Rate', value: d.mortality_rate, category: d.survival_category, suffix: '%' },
    { label: 'Hospitalization Rate', value: d.hospitalization_rate, category: d.hospitalization_category, suffix: '%' },
    { label: 'Readmission Rate', value: d.readmission_rate, category: d.readmission_category, suffix: '%' },
    { label: 'Transfusion Rate', value: d.transfusion_rate, category: d.transfusion_category, suffix: '%' },
    { label: 'ED Visit Ratio', value: d.ed_visit_ratio, category: d.ed_visit_category, suffix: '' },
  ];

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/post-acute')}>
        ← Back to Post-Acute Care
      </button>

      {/* Hero */}
      <div className={s.heroCard}>
        <div className={s.heroMain}>
          <h1 className={s.heroName}>{d.facility_name}</h1>
          <div className={s.heroMeta}>
            <span>{d.city}, {d.state} {d.zip_code}</span>
            {d.county && (
              <>
                <span className={s.dot}>·</span>
                <span>{d.county} County</span>
              </>
            )}
          </div>
        </div>
        <div className={s.heroStars}>
          <span className={s.starsValue}>{fmtStars(d.five_star)}</span>
          <span className={s.starsLabel}>{d.five_star ? `${d.five_star}/5 Star Rating` : 'Not Rated'}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className={s.kpiRow}>
        <KpiCard label="Stations" value={fmtNumber(d.num_stations)} />
        <KpiCard label="Mortality" value={d.mortality_rate != null ? `${Number(d.mortality_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="Hospitalization" value={d.hospitalization_rate != null ? `${Number(d.hospitalization_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="Readmission" value={d.readmission_rate != null ? `${Number(d.readmission_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="Transfusion" value={d.transfusion_rate != null ? `${Number(d.transfusion_rate).toFixed(1)}%` : '—'} />
      </div>

      <div className={s.grid}>
        {/* Facility Info */}
        <Panel title="Facility Information">
          <div className={s.metricList}>
            <MetricRow label="Profit Status" value={d.profit_status || '—'} />
            <MetricRow label="Chain Organization" value={d.chain_organization || '—'} />
            <MetricRow label="Number of Stations" value={fmtNumber(d.num_stations)} />
          </div>
        </Panel>

        {/* Clinical Outcomes */}
        <Panel title="Clinical Outcomes">
          <div className={s.metricList}>
            {outcomes.map((o) => {
              const badge = categoryBadge(o.category);
              return (
                <div key={o.label} className={s.metricRow}>
                  <span className={s.metricName}>{o.label}</span>
                  <span className={s.metricValue}>
                    {o.value != null ? `${Number(o.value).toFixed(2)}${o.suffix}` : '—'}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className={s.kpiCard}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className={s.metricRow}>
      <span className={s.metricName}>{label}</span>
      <span className={s.metricValue}>{value}</span>
    </div>
  );
}
