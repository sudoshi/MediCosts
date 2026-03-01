import styles from './DRGSelector.module.css';

const METRICS = [
  { value: 'payment',  label: 'Avg Total Payment' },
  { value: 'charges',  label: 'Avg Covered Charges (billed)' },
  { value: 'medicare', label: 'Avg Medicare Payment' },
];

export default function DRGSelector({ drgs, selectedDrg, onDrgChange, metric, onMetricChange }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.field}>
        <label htmlFor="drg-select">Diagnosis Related Group (DRG):</label>
        <select id="drg-select" value={selectedDrg} onChange={(e) => onDrgChange(e.target.value)}>
          <option value="ALL">All 50 Most Expensive DRGs (combined)</option>
          {drgs.map((d) => (
            <option key={d.drg_cd} value={d.drg_cd}>
              {d.drg_cd} – {d.drg_desc.slice(0, 80)}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label>Price metric:</label>
        <div className={styles.radios}>
          {METRICS.map((m) => (
            <label key={m.value} className={styles.radio}>
              <input
                type="radio"
                name="metric"
                value={m.value}
                checked={metric === m.value}
                onChange={() => onMetricChange(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
