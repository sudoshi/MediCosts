import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber } from '../utils/format';
import Panel from './Panel';
import ProviderDetail from './ProviderDetail';
import styles from './ZipTable.module.css';

export default function ZipTable({ drg, metric }) {
  const { data, loading } = useApi(`/zips/top50?drg=${drg}&metric=${metric}`, [drg, metric]);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedZip, setSelectedZip] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const rows = data ? [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const va = Number(a[sortCol]) || 0;
    const vb = Number(b[sortCol]) || 0;
    return sortAsc ? va - vb : vb - va;
  }) : [];

  const cols = [
    { key: 'zip5', label: 'ZIP Code', fmt: (v) => v },
    { key: 'state_abbr', label: 'State', fmt: (v) => v },
    { key: 'provider_city', label: 'City', fmt: (v) => v },
    { key: 'avg_total_payment', label: 'Avg Payment', fmt: fmtCurrency },
    { key: 'avg_covered_charge', label: 'Avg Charges', fmt: fmtCurrency },
    { key: 'avg_medicare_payment', label: 'Avg Medicare', fmt: fmtCurrency },
    { key: 'total_discharges', label: 'Discharges', fmt: fmtNumber },
    { key: 'num_providers', label: 'Providers', fmt: fmtNumber },
  ];

  if (selectedZip) {
    return (
      <Panel title={`ZIP ${selectedZip.zip5} — ${selectedZip.provider_city}, ${selectedZip.state_abbr}`}>
        <button className={styles.backBtn} onClick={() => setSelectedZip(null)}>
          ← Back to Top 50
        </button>
        <ProviderDetail
          zip={selectedZip.zip5}
          city={selectedZip.provider_city}
          state={selectedZip.state_abbr}
          drg={drg}
        />
      </Panel>
    );
  }

  return (
    <Panel title="Top 50 ZIP Codes by Average Price">
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading…</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} onClick={() => handleSort(c.key)} className={styles.sortable}>
                    {c.label} {sortCol === c.key ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`${i % 2 ? styles.odd : ''} ${styles.clickable}`}
                  onClick={() => setSelectedZip({ zip5: r.zip5, provider_city: r.provider_city, state_abbr: r.state_abbr })}
                >
                  {cols.map((c) => (
                    <td key={c.key}>{c.fmt(r[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
