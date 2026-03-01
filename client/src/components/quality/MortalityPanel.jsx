import { useApi } from '../../hooks/useApi.js';
import Panel from '../Panel.jsx';
import Badge from '../ui/Badge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import styles from './MortalityPanel.module.css';

const MEASURE_LABELS = {
  MORT_30_AMI: 'Heart Attack',
  MORT_30_CABG: 'CABG Surgery',
  MORT_30_COPD: 'COPD',
  MORT_30_HF: 'Heart Failure',
  MORT_30_PN: 'Pneumonia',
  MORT_30_STK: 'Stroke',
};

export default function MortalityPanel() {
  const { data, loading } = useApi('/quality/mortality/summary');

  if (loading) return <Panel title="Mortality Rates"><Skeleton height={200} /></Panel>;
  if (!data?.length) return null;

  return (
    <Panel title="30-Day Mortality by Condition">
      <div className={styles.grid}>
        {data.map((r) => {
          const label = MEASURE_LABELS[r.measure_id] || r.measure_name;
          const rate = Number(r.avg_rate);
          return (
            <div key={r.measure_id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.condition}>{label}</span>
                <span className={styles.count}>{r.hospitals.toLocaleString()} hospitals</span>
              </div>
              <div className={styles.rateRow}>
                <span className={styles.rate}>{rate.toFixed(1)}%</span>
                <div className={styles.badges}>
                  <Badge variant="worse">{r.worse_count} worse</Badge>
                  <Badge variant="better">{r.better_count} better</Badge>
                </div>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${Math.min(rate / 20 * 100, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
