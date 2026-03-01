import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber } from '../utils/format';
import styles from './SummaryCards.module.css';

export default function SummaryCards({ drg }) {
  const { data, loading } = useApi(`/stats?drg=${drg}`, [drg]);

  if (loading || !data) return <div className={styles.grid}>{[...Array(4)].map((_, i) => <div key={i} className={styles.card}><div className={styles.skeleton} /></div>)}</div>;

  return (
    <div className={styles.grid}>
      <Card label="Avg Total Payment" value={fmtCurrency(data.weighted_avg_payment)} />
      <Card label="Total Discharges" value={fmtNumber(data.total_discharges)} />
      <Card label="Providers" value={fmtNumber(data.num_providers)} />
      <Card label="ZIP Codes" value={fmtNumber(data.num_zips)} />
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className={styles.card}>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
