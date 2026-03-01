import { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import Panel from '../Panel.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { fmtCurrency } from '../../utils/format.js';
import styles from './StateQualityTable.module.css';

const COLUMNS = [
  { key: 'state', label: 'State', align: 'left' },
  { key: 'num_hospitals', label: 'Hospitals', align: 'right' },
  { key: 'avg_star_rating', label: 'Avg Stars', align: 'right' },
  { key: 'avg_clabsi_sir', label: 'CLABSI SIR', align: 'right' },
  { key: 'avg_psi_90', label: 'PSI-90', align: 'right' },
  { key: 'avg_excess_readm_ratio', label: 'Readm Ratio', align: 'right' },
  { key: 'avg_mortality_rate', label: 'Mortality %', align: 'right' },
  { key: 'avg_payment', label: 'Avg Payment', align: 'right' },
];

export default function StateQualityTable() {
  const { data, loading } = useApi('/quality/state-summary');
  const [sortCol, setSortCol] = useState('state');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      av = Number(av) || 0; bv = Number(bv) || 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [data, sortCol, sortDir]);

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  if (loading) return <Panel title="State Quality Summary"><Skeleton height={300} /></Panel>;

  return (
    <Panel title="State Quality Summary">
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`${styles.th} ${sortCol === c.key ? styles.sorted : ''}`}
                  style={{ textAlign: c.align }} onClick={() => handleSort(c.key)}>
                  {c.label}
                  {sortCol === c.key && <span className={styles.arrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.state} className={styles.row}>
                <td className={styles.stateCell}>{r.state}</td>
                <td className={styles.mono}>{r.num_hospitals}</td>
                <td className={styles.mono}>{Number(r.avg_star_rating).toFixed(1)}</td>
                <td className={styles.mono}>{r.avg_clabsi_sir ? Number(r.avg_clabsi_sir).toFixed(3) : '—'}</td>
                <td className={styles.mono}>{r.avg_psi_90 ? Number(r.avg_psi_90).toFixed(4) : '—'}</td>
                <td className={styles.mono}>{r.avg_excess_readm_ratio ? Number(r.avg_excess_readm_ratio).toFixed(4) : '—'}</td>
                <td className={styles.mono}>{r.avg_mortality_rate ? Number(r.avg_mortality_rate).toFixed(1) : '—'}%</td>
                <td className={styles.mono}>{fmtCurrency(r.avg_payment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
