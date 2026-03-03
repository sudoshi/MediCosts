/**
 * PaymentsExplorer — CMS Open Payments / Sunshine Act transparency explorer.
 * Shows top recipients, payers, and payment natures.
 * Lets users search for a physician or company by name.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './PaymentsExplorer.module.css';

const fmt$ = (v) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString();

const YEARS = ['all', 2024, 2023];
const BY_OPTIONS = [
  { value: 'physician', label: 'Physicians' },
  { value: 'payer',     label: 'Companies' },
  { value: 'nature',    label: 'Payment Type' },
  { value: 'hospital',  label: 'Hospitals' },
];

export default function PaymentsExplorer() {
  const navigate = useNavigate();

  const [year, setYear] = useState('all');
  const [by, setBy]     = useState('physician');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const yearParam = year === 'all' ? '' : `&year=${year}`;
  const { data: summary } = useApi('/payments/summary', []);
  const { data: topData, loading: topLoading } = useApi(
    `/payments/top?by=${by}&limit=25${yearParam}`,
    [by, year]
  );
  const { data: searchData, loading: searchLoading } = useApi(
    searchQuery.length >= 2 ? `/payments/search?q=${encodeURIComponent(searchQuery)}&limit=20` : null,
    [searchQuery]
  );

  function handleSearch(e) {
    e.preventDefault();
    setSearchQuery(search);
  }

  const totals = summary?.totals || {};
  const byYear = summary?.by_year || [];
  const byNature = summary?.by_nature || [];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Industry Payments</h1>
          <p className={s.subtitle}>
            CMS Open Payments (Sunshine Act) — pharmaceutical &amp; device manufacturer payments to
            physicians and hospitals (PY2023–PY2024)
          </p>
        </div>
      </div>

      {/* Summary KPIs */}
      {!summary && <Skeleton height={80} />}
      {totals.total_payments && (
        <div className={s.kpiRow}>
          <KpiCard label="Total Payments" value={fmtN(totals.total_payments)} />
          <KpiCard label="Total Disclosed" value={fmt$(totals.total_amount)} />
          <KpiCard label="Avg Payment" value={fmt$(totals.avg_amount)} />
          <KpiCard label="Unique Physicians" value={fmtN(totals.unique_physicians)} />
          <KpiCard label="Unique Payers" value={fmtN(totals.unique_payers)} />
        </div>
      )}

      <div className={s.grid}>
        {/* Year-over-year */}
        {byYear.length > 0 && (
          <Panel title="Year Summary">
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Payments</th>
                  <th>Total Amount</th>
                  <th>Physicians</th>
                </tr>
              </thead>
              <tbody>
                {byYear.map((r) => (
                  <tr key={r.payment_year}>
                    <td className={s.bold}>{r.payment_year}</td>
                    <td className={s.mono}>{fmtN(r.num_payments)}</td>
                    <td className={s.mono}>{fmt$(r.total_amount)}</td>
                    <td className={s.mono}>{fmtN(r.unique_physicians)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {/* By nature */}
        {byNature.length > 0 && (
          <Panel title="By Payment Nature">
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Nature</th>
                  <th>Count</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {byNature.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td className={s.name}>{r.payment_nature || '—'}</td>
                    <td className={s.mono}>{fmtN(r.num_payments)}</td>
                    <td className={s.mono}>{fmt$(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      {/* Search */}
      <Panel title="Search Physicians or Companies">
        <form onSubmit={handleSearch} className={s.searchRow}>
          <input
            className={s.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by physician name or company…"
          />
          <button type="submit" className={s.searchBtn}>Search</button>
        </form>

        {searchLoading && <Skeleton height={80} />}

        {searchData && (
          <div className={s.searchResults}>
            {searchData.physicians?.length > 0 && (
              <>
                <p className={s.resultHeader}>Physicians</p>
                <table className={s.table}>
                  <thead>
                    <tr><th>Name</th><th>Specialty</th><th>State</th><th>Payments</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {searchData.physicians.map((p) => (
                      <tr
                        key={p.npi}
                        className={s.clickRow}
                        onClick={() => navigate(`/clinicians/${p.npi}`)}
                      >
                        <td className={s.bold}>{p.name}</td>
                        <td className={s.muted}>{p.specialty || '—'}</td>
                        <td className={s.mono}>{p.state || '—'}</td>
                        <td className={s.mono}>{fmtN(p.num_payments)}</td>
                        <td className={s.mono}>{fmt$(p.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {searchData.payers?.length > 0 && (
              <>
                <p className={s.resultHeader}>Companies / Payers</p>
                <table className={s.table}>
                  <thead>
                    <tr><th>Company</th><th>State</th><th>Payments</th><th>Physicians</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {searchData.payers.map((p, i) => (
                      <tr key={i}>
                        <td className={s.bold}>{p.name}</td>
                        <td className={s.mono}>{p.state || '—'}</td>
                        <td className={s.mono}>{fmtN(p.num_payments)}</td>
                        <td className={s.mono}>{fmtN(p.unique_physicians)}</td>
                        <td className={s.mono}>{fmt$(p.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {!searchData.physicians?.length && !searchData.payers?.length && (
              <p className={s.muted}>No results for "{searchQuery}"</p>
            )}
          </div>
        )}
      </Panel>

      {/* Leaderboard */}
      <Panel title="Leaderboard">
        <div className={s.controls}>
          <div className={s.btnGroup}>
            {BY_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`${s.toggleBtn} ${by === o.value ? s.active : ''}`}
                onClick={() => setBy(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className={s.btnGroup}>
            {YEARS.map((y) => (
              <button
                key={y}
                className={`${s.toggleBtn} ${year === y ? s.active : ''}`}
                onClick={() => setYear(y)}
              >
                {y === 'all' ? 'All Years' : y}
              </button>
            ))}
          </div>
        </div>

        {topLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={32} />)}
          </div>
        )}

        {!topLoading && topData?.results && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  {by === 'physician' && <><th>Physician</th><th>Specialty</th><th>State</th><th>Payers</th></>}
                  {by === 'payer'     && <><th>Company</th><th>State</th><th>Physicians</th><th>Hospitals</th></>}
                  {by === 'nature'    && <><th>Payment Type</th><th>Count</th><th>Avg Amount</th><th>Physicians</th></>}
                  {by === 'hospital'  && <><th>Hospital</th><th>CCN</th><th>Payers</th></>}
                  <th>Payments</th>
                  <th>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {topData.results.map((r, i) => (
                  <tr
                    key={i}
                    className={by === 'physician' || by === 'hospital' ? s.clickRow : ''}
                    onClick={() => {
                      if (by === 'physician' && r.id) navigate(`/clinicians/${r.id}`);
                      if (by === 'hospital'  && r.id) navigate(`/hospitals/${r.id}`);
                    }}
                  >
                    <td className={s.rank}>{i + 1}</td>
                    {by === 'physician' && (
                      <>
                        <td className={s.bold}>{r.name}</td>
                        <td className={s.muted}>{r.specialty || '—'}</td>
                        <td className={s.mono}>{r.state || '—'}</td>
                        <td className={s.mono}>{fmtN(r.unique_payers)}</td>
                      </>
                    )}
                    {by === 'payer' && (
                      <>
                        <td className={s.bold}>{r.name}</td>
                        <td className={s.mono}>{r.state || '—'}</td>
                        <td className={s.mono}>{fmtN(r.unique_physicians)}</td>
                        <td className={s.mono}>{fmtN(r.unique_hospitals)}</td>
                      </>
                    )}
                    {by === 'nature' && (
                      <>
                        <td className={s.bold}>{r.name}</td>
                        <td className={s.mono}>{fmtN(r.num_payments)}</td>
                        <td className={s.mono}>{fmt$(r.avg_amount)}</td>
                        <td className={s.mono}>{fmtN(r.unique_physicians)}</td>
                      </>
                    )}
                    {by === 'hospital' && (
                      <>
                        <td className={s.bold}>{r.name || '—'}</td>
                        <td className={s.mono}>{r.id || '—'}</td>
                        <td className={s.mono}>{fmtN(r.unique_payers)}</td>
                      </>
                    )}
                    <td className={s.mono}>{fmtN(r.num_payments)}</td>
                    <td className={`${s.mono} ${s.amount}`}>{fmt$(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className={s.kpiCard}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
    </div>
  );
}
