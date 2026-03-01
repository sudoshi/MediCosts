import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber, fmtPercent, fmtIncome } from '../utils/format';
import Panel from './Panel';
import ProviderDetail from './ProviderDetail';
import styles from './ZipTable.module.css';

export default function ZipTable({ drg, metric }) {
  const [showDemographics, setShowDemographics] = useState(false);

  const endpoint = showDemographics
    ? `/zips/enriched?drg=${drg}&metric=${metric}`
    : `/zips/top50?drg=${drg}&metric=${metric}`;

  const { data, loading } = useApi(endpoint, [drg, metric, showDemographics]);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedZip, setSelectedZip] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const enrichedData = data ? data.map((r) => ({
    ...r,
    reimbursement_rate: r.avg_covered_charge > 0
      ? Number(r.avg_total_payment) / Number(r.avg_covered_charge)
      : null,
  })) : [];

  const rows = enrichedData.length ? [...enrichedData].sort((a, b) => {
    if (!sortCol) return 0;
    const va = Number(a[sortCol]) || 0;
    const vb = Number(b[sortCol]) || 0;
    return sortAsc ? va - vb : vb - va;
  }) : [];

  const isReimb = metric === 'reimbursement';
  const panelTitle = isReimb
    ? 'Top 50 ZIP Codes by Lowest Reimbursement Rate'
    : 'Top 50 ZIP Codes by Average Price';

  const baseCols = [
    { key: 'zip5', label: 'ZIP Code', fmt: (v) => v },
    { key: 'state_abbr', label: 'State', fmt: (v) => v },
    { key: 'provider_city', label: 'City', fmt: (v) => v },
    { key: 'avg_total_payment', label: 'Avg Payment', fmt: fmtCurrency },
    { key: 'avg_covered_charge', label: 'Avg Charges', fmt: fmtCurrency },
    { key: 'avg_medicare_payment', label: 'Avg Medicare', fmt: fmtCurrency },
    { key: 'reimbursement_rate', label: 'Reimb. Rate', fmt: fmtPercent },
    { key: 'total_discharges', label: 'Discharges', fmt: fmtNumber },
    { key: 'num_providers', label: 'Providers', fmt: fmtNumber },
  ];

  const demoCols = showDemographics
    ? [
        { key: 'median_household_income', label: 'Med. Income', fmt: fmtIncome },
        { key: 'total_population', label: 'Population', fmt: fmtNumber },
      ]
    : [];

  const cols = [...baseCols, ...demoCols];

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
    <Panel title={panelTitle}>
      <div className={styles.toggleRow}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showDemographics}
            onChange={(e) => setShowDemographics(e.target.checked)}
          />
          <span className={styles.toggleLabel}>Show Demographics</span>
        </label>
      </div>
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
