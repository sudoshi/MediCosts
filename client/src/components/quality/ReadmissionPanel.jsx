import { useApi } from '../../hooks/useApi.js';
import Panel from '../Panel.jsx';
import Badge from '../ui/Badge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import styles from './ReadmissionPanel.module.css';

function cleanMeasureName(name) {
  return name.replace(/-HRRP$/, '').replace(/^READM-30-/, '');
}

export default function ReadmissionPanel() {
  const { data: summary, loading: loadingSummary } = useApi('/quality/readmissions/summary');
  const { data: penalties, loading: loadingPenalties } = useApi('/quality/readmissions/penalties?limit=10');

  if (loadingSummary) return <Panel title="Hospital Readmissions (HRRP)"><Skeleton height={240} /></Panel>;

  return (
    <Panel title="Hospital Readmissions Reduction Program">
      <div className={styles.grid}>
        {summary?.map((r) => (
          <div key={r.measure_name} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.measureName}>{cleanMeasureName(r.measure_name)}</span>
              <span className={styles.hospitals}>{r.hospitals.toLocaleString()} hospitals</span>
            </div>
            <div className={styles.ratio}>
              <span className={styles.ratioValue}>{Number(r.avg_ratio).toFixed(4)}</span>
              <span className={styles.ratioLabel}>Avg Excess Ratio</span>
            </div>
            <div className={styles.bars}>
              <div className={styles.barRow}>
                <span className={styles.barLabel}>Penalized</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${(r.penalized_count / r.hospitals) * 100}%`, background: '#ef4444' }} />
                </div>
                <span className={styles.barValue}>{r.penalized_count}</span>
              </div>
              <div className={styles.barRow}>
                <span className={styles.barLabel}>Not Penalized</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${(r.not_penalized_count / r.hospitals) * 100}%`, background: '#22c55e' }} />
                </div>
                <span className={styles.barValue}>{r.not_penalized_count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loadingPenalties && penalties?.length > 0 && (
        <div className={styles.penaltySection}>
          <h4 className={styles.sectionTitle}>Top Penalized Hospitals</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Hospital</th>
                <th>State</th>
                <th>Condition</th>
                <th>Excess Ratio</th>
              </tr>
            </thead>
            <tbody>
              {penalties.map((r, i) => (
                <tr key={i}>
                  <td className={styles.hospitalName}>{r.facility_name}</td>
                  <td>{r.state}</td>
                  <td>{cleanMeasureName(r.measure_name)}</td>
                  <td>
                    <span className={styles.penaltyValue}>{Number(r.excess_readmission_ratio).toFixed(4)}</span>
                    <Badge variant="worse">Penalized</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
