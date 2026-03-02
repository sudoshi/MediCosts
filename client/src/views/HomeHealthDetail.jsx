import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtStars, fmtCurrency } from '../utils/format.js';
import s from './HomeHealthDetail.module.css';

function categoryBadge(cat) {
  if (!cat) return { label: 'N/A', variant: 'neutral' };
  const lower = cat.toLowerCase();
  if (lower.includes('better') || lower.includes('below') || lower.includes('above average')) return { label: cat, variant: 'better' };
  if (lower.includes('worse') || lower.includes('below average')) return { label: cat, variant: 'worse' };
  if (lower.includes('same') || lower.includes('average')) return { label: cat, variant: 'same' };
  return { label: cat, variant: 'neutral' };
}

// DTC: higher is better. PPR/PPH: lower is better.
function dtcBadge(cat) {
  if (!cat) return { label: 'N/A', variant: 'neutral' };
  const lower = cat.toLowerCase();
  if (lower.includes('above')) return { label: cat, variant: 'better' };
  if (lower.includes('below')) return { label: cat, variant: 'worse' };
  if (lower.includes('same') || lower.includes('average')) return { label: cat, variant: 'same' };
  return { label: cat, variant: 'neutral' };
}

function pprBadge(cat) {
  if (!cat) return { label: 'N/A', variant: 'neutral' };
  const lower = cat.toLowerCase();
  if (lower.includes('below')) return { label: cat, variant: 'better' };
  if (lower.includes('above')) return { label: cat, variant: 'worse' };
  if (lower.includes('same') || lower.includes('average')) return { label: cat, variant: 'same' };
  return { label: cat, variant: 'neutral' };
}

export default function HomeHealthDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useApi(`/post-acute/home-health/${ccn}`, [ccn]);

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
          <h2>Home Health Agency Not Found</h2>
          <p>No data for CCN: {ccn}</p>
          <button className={s.backBtn} onClick={() => navigate('/post-acute')}>Back to Post-Acute</button>
        </div>
      </div>
    );
  }

  const h = data;

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/post-acute')}>
        ← Back to Post-Acute Care
      </button>

      {/* Hero */}
      <div className={s.heroCard}>
        <div className={s.heroMain}>
          <h1 className={s.heroName}>{h.provider_name}</h1>
          <div className={s.heroMeta}>
            <span>{h.city}, {h.state} {h.zip_code}</span>
            {h.ownership_type && (
              <>
                <span className={s.dot}>·</span>
                <span>{h.ownership_type}</span>
              </>
            )}
          </div>
        </div>
        <div className={s.heroStars}>
          <span className={s.starsValue}>{fmtStars(h.quality_star_rating)}</span>
          <span className={s.starsLabel}>{h.quality_star_rating ? `${h.quality_star_rating}/5 Quality` : 'Not Rated'}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className={s.kpiRow}>
        <KpiCard label="Quality Star" value={h.quality_star_rating ? `${h.quality_star_rating}/5` : '—'} />
        <KpiCard label="DTC Rate" value={h.dtc_rate != null ? `${Number(h.dtc_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="PPR Rate" value={h.ppr_rate != null ? `${Number(h.ppr_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="PPH Rate" value={h.pph_rate != null ? `${Number(h.pph_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="Medicare $/Episode" value={fmtCurrency(h.medicare_spend_per_episode)} />
      </div>

      {/* Outcome Rates */}
      <Panel title="Outcome Rates">
        <div className={s.metricList}>
          <div className={s.metricRow}>
            <span className={s.metricName}>Discharge to Community (DTC)</span>
            <span className={s.metricValue}>{h.dtc_rate != null ? `${Number(h.dtc_rate).toFixed(1)}%` : '—'}</span>
            <Badge variant={dtcBadge(h.dtc_category).variant}>{dtcBadge(h.dtc_category).label}</Badge>
          </div>
          <div className={s.metricRow}>
            <span className={s.metricName}>Potentially Preventable Readmission (PPR)</span>
            <span className={s.metricValue}>{h.ppr_rate != null ? `${Number(h.ppr_rate).toFixed(1)}%` : '—'}</span>
            <Badge variant={pprBadge(h.ppr_category).variant}>{pprBadge(h.ppr_category).label}</Badge>
          </div>
          <div className={s.metricRow}>
            <span className={s.metricName}>Potentially Preventable Hospitalization (PPH)</span>
            <span className={s.metricValue}>{h.pph_rate != null ? `${Number(h.pph_rate).toFixed(1)}%` : '—'}</span>
            <Badge variant={pprBadge(h.pph_category).variant}>{pprBadge(h.pph_category).label}</Badge>
          </div>
        </div>
      </Panel>

      {/* Agency Details */}
      <Panel title="Agency Details">
        <div className={s.metricList}>
          <MetricRow label="Ownership Type" value={h.ownership_type || '—'} />
          <MetricRow label="Medicare Spend per Episode" value={fmtCurrency(h.medicare_spend_per_episode)} />
        </div>
      </Panel>
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
