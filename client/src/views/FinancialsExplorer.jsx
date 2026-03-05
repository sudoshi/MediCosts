/**
 * FinancialsExplorer — Hospital HCRIS Cost Report financial data explorer.
 * Shows gross charges, beds, occupancy, and uncompensated care by hospital.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './FinancialsExplorer.module.css';

const fmt$ = (v) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString();
function Delta({ current, prev, fmt = fmtN, pct = false }) {
  if (current == null || prev == null || prev == 0) return null;
  const diff = Number(current) - Number(prev);
  const p = ((diff / Number(prev)) * 100).toFixed(1);
  const up = diff > 0;
  return (
    <span style={{ fontSize: 11, color: up ? '#22c55e' : '#ef4444', marginLeft: 6, fontFamily: 'Inter,sans-serif' }}>
      {up ? '▲' : '▼'} {pct ? `${Math.abs(p)}pp` : `${Math.abs(p)}%`}
    </span>
  );
}

function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

const YEARS = [2023, 2024];
const BY_OPTIONS = [
  { value: 'charges',       label: 'Gross Charges' },
  { value: 'beds',          label: 'Bed Capacity' },
  { value: 'uncompensated', label: 'Uncompensated Care' },
  { value: 'occupancy',     label: 'Occupancy' },
];

export default function FinancialsExplorer() {
  const navigate = useNavigate();
  const [year, setYear] = useState(2023);
  const [by, setBy]     = useState('charges');

  const { data: summary } = useApi(`/financials/summary?year=${year}`, [year]);
  const prevYear = year === 2024 ? 2023 : null;
  const { data: prevSummary } = useApi(prevYear ? `/financials/summary?year=${prevYear}` : null, [prevYear]);
  const { data: topData, loading: topLoading } = useApi(
    `/financials/top?year=${year}&by=${by}&limit=30`,
    [year, by]
  );
  const { data: uncompData } = useApi(`/financials/uncompensated?year=${year}&limit=20`, [year]);

  const totals = summary?.totals || {};
  const prevTotals = prevSummary?.totals || {};
  const bySize = summary?.by_bed_size || [];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Hospital Financials</h1>
          <p className={s.subtitle}>
            CMS HCRIS Cost Report data — gross charges, bed capacity, occupancy, and
            uncompensated care for Medicare-certified hospitals (FY2023–2024)
          </p>
        </div>
        <div className={s.yearPicker}>
          {YEARS.map(y => (
            <button
              key={y}
              className={`${s.toggleBtn} ${year === y ? s.active : ''}`}
              onClick={() => setYear(y)}
            >{y}</button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      {!summary && <Skeleton height={80} />}
      {totals.hospitals && (
        <div className={s.kpiRow}>
          <KpiCard label="Hospitals Reporting" value={<>{fmtN(totals.hospitals)}<Delta current={totals.hospitals} prev={prevTotals.hospitals} /></>} />
          <KpiCard label="Avg Gross Charges" value={<>{fmt$(totals.avg_charges)}<Delta current={totals.avg_charges} prev={prevTotals.avg_charges} /></>} />
          <KpiCard label="Total Gross Charges" value={<>${(Number(totals.total_charges)/1e9).toFixed(1)}B<Delta current={totals.total_charges} prev={prevTotals.total_charges} /></>} />
          <KpiCard label="Avg Beds" value={<>{fmtN(totals.avg_beds)}<Delta current={totals.avg_beds} prev={prevTotals.avg_beds} /></>} />
          <KpiCard label="Avg Occupancy" value={<>{totals.avg_occupancy_pct ? `${totals.avg_occupancy_pct}%` : '—'}<Delta current={totals.avg_occupancy_pct} prev={prevTotals.avg_occupancy_pct} pct /></>} />
          <KpiCard label="Total Uncompensated Care" value={<>${(Number(totals.total_uncomp_cost)/1e9).toFixed(1)}B<Delta current={totals.total_uncomp_cost} prev={prevTotals.total_uncomp_cost} /></>} />
          <KpiCard label="Hospitals w/ Charity" value={<>{fmtN(totals.charity_hospitals)}<Delta current={totals.charity_hospitals} prev={prevTotals.charity_hospitals} /></>} />
        </div>
      )}

      <div className={s.grid}>
        {/* By bed size */}
        {bySize.length > 0 && (
          <Panel title="By Hospital Size">
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Hospitals</th>
                  <th>Avg Beds</th>
                  <th>Avg Charges</th>
                  <th>Avg Uncomp Care</th>
                </tr>
              </thead>
              <tbody>
                {bySize.map((r, i) => (
                  <tr key={i}>
                    <td className={s.name}>{r.size_category}</td>
                    <td className={s.mono}>{fmtN(r.hospitals)}</td>
                    <td className={s.mono}>{fmtN(r.avg_beds)}</td>
                    <td className={s.mono}>{fmt$(r.avg_charges)}</td>
                    <td className={s.mono}>{fmt$(r.avg_uncomp_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {/* Top uncompensated care */}
        {uncompData?.results?.length > 0 && (
          <Panel title="Top Uncompensated Care Providers">
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hospital</th>
                  <th>State</th>
                  <th>Beds</th>
                  <th>Uncomp Care Cost</th>
                </tr>
              </thead>
              <tbody>
                {uncompData.results.slice(0, 15).map((r, i) => (
                  <tr
                    key={r.provider_ccn}
                    className={s.clickRow}
                    onClick={() => navigate(`/hospitals/${r.provider_ccn}`)}
                  >
                    <td className={s.rank}>{i + 1}</td>
                    <td className={s.bold}>{r.facility_name || r.provider_ccn}</td>
                    <td className={s.mono}>{r.state || '—'}</td>
                    <td className={s.mono}>{fmtN(r.licensed_beds)}</td>
                    <td className={`${s.mono} ${s.accent}`}>{fmt$(r.uncompensated_care_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      {/* Leaderboard */}
      <Panel title="Leaderboard">
        <div className={s.controls}>
          <div className={s.btnGroup}>
            {BY_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`${s.toggleBtn} ${by === o.value ? s.active : ''}`}
                onClick={() => setBy(o.value)}
              >{o.label}</button>
            ))}
          </div>
          <button className={s.exportBtn} onClick={() => exportCsv(topData?.results, `financials-${by}-${year}.csv`)}>
            ↓ CSV
          </button>
        </div>

        {topLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} height={32} />)}
          </div>
        )}

        {!topLoading && topData?.results && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>CCN</th>
                  <th>FY End</th>
                  <th>Gross Charges</th>
                  <th>Inpatient Charges</th>
                  <th>Beds</th>
                  <th>Inpatient Days</th>
                  <th>Occupancy</th>
                  <th>Uncomp Care Cost</th>
                </tr>
              </thead>
              <tbody>
                {topData.results.map((r, i) => (
                  <tr
                    key={r.provider_ccn}
                    className={s.clickRow}
                    onClick={() => navigate(`/hospitals/${r.provider_ccn}`)}
                  >
                    <td className={s.rank}>{i + 1}</td>
                    <td className={s.mono}>{r.provider_ccn}</td>
                    <td className={s.mono}>{r.fy_end ? new Date(r.fy_end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—'}</td>
                    <td className={`${s.mono} ${s.accent}`}>{fmt$(r.total_patient_charges)}</td>
                    <td className={s.mono}>{fmt$(r.inpatient_charges)}</td>
                    <td className={s.mono}>{fmtN(r.licensed_beds)}</td>
                    <td className={s.mono}>{fmtN(r.total_inpatient_days)}</td>
                    <td className={s.mono}>{r.occupancy_pct ? `${r.occupancy_pct}%` : '—'}</td>
                    <td className={s.mono}>{fmt$(r.uncompensated_care_cost)}</td>
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
