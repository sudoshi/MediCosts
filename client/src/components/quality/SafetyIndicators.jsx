import { useApi } from '../../hooks/useApi.js';
import Panel from '../Panel.jsx';
import Badge from '../ui/Badge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import styles from './SafetyIndicators.module.css';

export default function SafetyIndicators() {
  const { data, loading } = useApi('/quality/psi/summary');

  if (loading) return <Panel title="Patient Safety (HAC Reduction Program)"><Skeleton height={180} /></Panel>;
  if (!data) return null;

  const metrics = [
    { label: 'PSI-90 Composite', value: data.avg_psi_90, median: data.median_psi_90, benchmark: 1.0 },
    { label: 'Total HAC Score', value: data.avg_hac_score },
    { label: 'CLABSI SIR', value: data.avg_clabsi_sir, benchmark: 1.0 },
    { label: 'CAUTI SIR', value: data.avg_cauti_sir, benchmark: 1.0 },
    { label: 'SSI SIR', value: data.avg_ssi_sir, benchmark: 1.0 },
    { label: 'CDI SIR', value: data.avg_cdi_sir, benchmark: 1.0 },
    { label: 'MRSA SIR', value: data.avg_mrsa_sir, benchmark: 1.0 },
  ];

  return (
    <Panel title="Patient Safety (HAC Reduction Program)">
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{Number(data.hospitals).toLocaleString()}</span>
          <span className={styles.statLabel}>Hospitals Scored</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: '#ef4444' }}>{data.penalized_count}</span>
          <span className={styles.statLabel}>Payment Penalty</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: '#22c55e' }}>{data.not_penalized_count}</span>
          <span className={styles.statLabel}>No Penalty</span>
        </div>
      </div>
      <div className={styles.grid}>
        {metrics.map((m) => {
          const v = m.value != null ? Number(m.value) : null;
          const variant = v == null ? 'neutral' : m.benchmark && v < m.benchmark ? 'better' : m.benchmark && v > m.benchmark ? 'worse' : 'same';
          return (
            <div key={m.label} className={styles.metric}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={styles.metricValue}>{v != null ? v.toFixed(4) : '—'}</span>
              {m.benchmark && v != null && <Badge variant={variant}>{v < m.benchmark ? 'Below Benchmark' : v > m.benchmark ? 'Above Benchmark' : 'At Benchmark'}</Badge>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
