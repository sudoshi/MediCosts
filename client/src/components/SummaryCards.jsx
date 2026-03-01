import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber, fmtPercent, fmtStars } from '../utils/format';
import styles from './SummaryCards.module.css';

export default function SummaryCards({ drg }) {
  const { data, loading } = useApi(`/stats?drg=${drg}`, [drg]);

  if (loading || !data) return <div className={styles.grid}>{[...Array(7)].map((_, i) => <div key={i} className={styles.card}><div className={styles.skeleton} /></div>)}</div>;

  return (
    <div className={styles.grid}>
      <Card label="Avg Total Payment" value={fmtCurrency(data.weighted_avg_payment)} />
      <Card label="Reimbursement Rate" value={fmtPercent(data.weighted_avg_reimbursement)} />
      <Card label="Total Discharges" value={fmtNumber(data.total_discharges)} />
      <Card label="Providers" value={fmtNumber(data.num_providers)} />
      <Card label="ZIP Codes" value={fmtNumber(data.num_zips)} />
      <Card
        label="Avg Star Rating"
        value={data.avg_star_rating != null ? `${Number(data.avg_star_rating).toFixed(1)}` : '—'}
        extra={data.avg_star_rating != null ? fmtStars(data.avg_star_rating) : null}
      />
      <Card label="Rated Hospitals" value={fmtNumber(data.rated_hospitals)} />
    </div>
  );
}

function Card({ label, value, extra }) {
  return (
    <div className={styles.card}>
      <div className={styles.value}>{value}</div>
      {extra && <div className={styles.extra}>{extra}</div>}
      <div className={styles.label}>{label}</div>
    </div>
  );
}
