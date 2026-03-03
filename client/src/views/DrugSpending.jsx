/**
 * DrugSpending — CMS Part D drug spending explorer
 * Route: /drugs
 */

import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './DrugSpending.module.css';

const API = import.meta.env.VITE_API_URL || '/api';

const fmt$ = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString();
const fmtB = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return fmt$(v);
};
const fmtPct = (v) => v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

const SORT_OPTIONS = [
  { value: 'spending', label: 'Total 2023 Spending' },
  { value: 'claims', label: 'Total Claims' },
  { value: 'benes', label: 'Beneficiaries' },
  { value: 'cost_per_claim', label: 'Cost per Claim' },
  { value: 'cost_per_bene', label: 'Cost per Beneficiary' },
  { value: 'cagr', label: '5-Year Growth Rate' },
];

export default function DrugSpending() {
  const [sort, setSort] = useState('spending');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const { data: summary } = useApi('/drugs/summary', []);
  const { data: topData, loading: topLoading } = useApi(`/drugs/top?sort=${sort}&limit=50`, [sort]);

  // Debounced search
  useEffect(() => {
    if (search.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const token = localStorage.getItem('authToken');
        const r = await fetch(`${API}/drugs/search?q=${encodeURIComponent(search)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setSearchResults(d.drugs || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const drugs = searchResults !== null ? searchResults : (topData?.drugs || []);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Part D Drug Spending</h1>
        <p className={s.subtitle}>
          Medicare Part D prescription drug spending from CMS — 5-year trends, cost per beneficiary, and prescriber analytics.
        </p>
      </div>

      {/* KPI row */}
      {summary ? (
        <div className={s.kpiRow}>
          <KpiCard label="Total 2023 Spending" value={fmtB(summary.total_spending_2023)} />
          <KpiCard label="Total Claims" value={fmtN(summary.total_claims_2023)} />
          <KpiCard label="Beneficiaries" value={fmtN(summary.total_benes_2023)} />
          <KpiCard label="Unique Drugs" value={fmtN(summary.unique_drugs)} />
          <KpiCard label="Avg CAGR (2019–2023)" value={fmtPct(summary.avg_cagr_19_23)} />
          <KpiCard label="High-Cost Outliers" value={fmtN(summary.outlier_drugs)} accent />
        </div>
      ) : <Skeleton height={88} />}

      {/* Search + Sort controls */}
      <div className={s.controls}>
        <input
          className={s.searchInput}
          type="text"
          placeholder="Search drug name (brand or generic)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search.length === 0 && (
          <div className={s.sortRow}>
            <span className={s.sortLabel}>Sort by:</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${s.sortBtn} ${sort === opt.value ? s.sortActive : ''}`}
                onClick={() => { setSort(opt.value); setSearch(''); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drug table */}
      <Panel title={searchResults !== null
        ? `Search results for "${search}" — ${drugs.length} found`
        : `Top 50 Drugs — ${SORT_OPTIONS.find(o => o.value === sort)?.label}`
      }>
        {topLoading && !searchResults ? (
          <Skeleton height={400} />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Generic Name</th>
                  <th>Brand Name</th>
                  <th className={s.right}>2023 Spending</th>
                  <th className={s.right}>Claims</th>
                  <th className={s.right}>Beneficiaries</th>
                  <th className={s.right}>Cost/Claim</th>
                  <th className={s.right}>Cost/Bene</th>
                  <th className={s.right}>CAGR '19–'23</th>
                  <th className={s.right}>YoY '22–'23</th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((d, i) => (
                  <tr key={i} className={d.outlier_flag === 'X' ? s.outlierRow : ''}>
                    <td className={s.drugName}>
                      {d.gnrc_name}
                      {d.outlier_flag === 'X' && <span className={s.outlierBadge} title="CMS high-cost outlier">★</span>}
                    </td>
                    <td className={s.brandName}>{d.brnd_name || '—'}</td>
                    <td className={s.right}>{fmtB(d.tot_spending_2023)}</td>
                    <td className={s.right}>{fmtN(d.tot_claims_2023)}</td>
                    <td className={s.right}>{fmtN(d.tot_benes_2023)}</td>
                    <td className={s.right}>{fmt$(d.avg_cost_per_claim_2023)}</td>
                    <td className={s.right}>{fmt$(d.avg_cost_per_bene_2023)}</td>
                    <td className={`${s.right} ${cagrColor(d.cagr_19_23)}`}>
                      {d.cagr_19_23 != null ? `${Number(d.cagr_19_23).toFixed(1)}%` : '—'}
                    </td>
                    <td className={`${s.right} ${yoyColor(d.pct_change_22_23)}`}>
                      {d.pct_change_22_23 != null ? fmtPct(d.pct_change_22_23) : '—'}
                    </td>
                  </tr>
                ))}
                {drugs.length === 0 && (
                  <tr><td colSpan={9} className={s.empty}>
                    {searching ? 'Searching…' : 'No results found.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className={s.sourceNote}>
        Source: CMS Medicare Part D Drug Spending Dashboard 2023.
        Spending figures reflect Medicare Part D payments for FFS beneficiaries.
        CAGR = compound annual growth rate 2019–2023.
        ★ = CMS-flagged high-cost outlier drug.
      </p>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <div className={`${s.kpiCard} ${accent ? s.kpiAccent : ''}`}>
      <span className={s.kpiVal}>{value}</span>
      <span className={s.kpiLabel}>{label}</span>
    </div>
  );
}

function cagrColor(v) {
  if (v == null) return '';
  const n = Number(v);
  if (n > 20) return s.negative;
  if (n > 10) return s.warn;
  if (n < 0) return s.positive;
  return '';
}

function yoyColor(v) {
  if (v == null) return '';
  const n = Number(v);
  if (n > 10) return s.negative;
  if (n < -5) return s.positive;
  return '';
}
