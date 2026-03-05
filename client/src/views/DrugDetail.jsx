/**
 * DrugDetail — CMS Part D drug detail page
 * Route: /drugs/:name
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import s from './DrugDetail.module.css';

const fmt$ = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString();
const fmtB = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return fmt$(v);
};

const TOOLTIP_STYLE = {
  background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8,
  fontFamily: 'JetBrains Mono, monospace', color: '#e4e4e7', fontSize: 12,
};
const AXIS_STYLE = { fill: '#71717a', fontFamily: 'Inter, sans-serif', fontSize: 10 };

function exportCsv(trend, name) {
  if (!trend?.length) return;
  const keys = ['year', 'spending', 'claims', 'cost_per_unit'];
  const csv = [keys.join(','), ...trend.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `drug-trend-${name}.csv`; a.click();
}

export default function DrugDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useApi(`/drugs/detail/${encodeURIComponent(name)}`, [name]);

  if (loading) return (
    <div className={s.page}>
      <Skeleton height={60} />
      <Skeleton height={100} />
      <Skeleton height={300} />
    </div>
  );

  if (error || !data) return (
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => navigate('/drugs')}>← Back to Drugs</button>
      <p className={s.errorMsg}>Drug not found: {name}</p>
    </div>
  );

  const { drug, trend, all_manufacturers } = data;

  const trendData = trend.map(t => ({
    year: String(t.year),
    spending: Number(t.spending) || 0,
    claims: Number(t.claims) || 0,
    cost_per_unit: t.cost_per_unit != null ? Number(t.cost_per_unit) : null,
  }));

  const cagr = drug.cagr_19_23;
  const cagrColor = cagr == null ? '' : Number(cagr) > 20 ? s.red : Number(cagr) > 10 ? s.amber : Number(cagr) < 0 ? s.green : '';

  return (
    <div className={s.page}>
      <div className={s.breadcrumb}>
        <button className={s.backBtn} onClick={() => navigate('/drugs')}>← Part D Drugs</button>
      </div>

      <header className={s.header}>
        <div>
          <h1 className={s.title}>{drug.gnrc_name}</h1>
          {drug.brnd_name && <p className={s.brand}>{drug.brnd_name}</p>}
          <p className={s.mfr}>{drug.mftr_name || '—'}</p>
        </div>
        <div className={s.badges}>
          {drug.outlier_flag === 'X' && (
            <span className={s.outlierBadge}>CMS High-Cost Outlier</span>
          )}
          <button className={s.exportBtn} onClick={() => exportCsv(trendData, drug.gnrc_name)}>
            ↓ CSV
          </button>
        </div>
      </header>

      {/* KPI row */}
      <div className={s.kpiRow}>
        <KpiCard label="2023 Total Spending" value={fmtB(drug.tot_spending_2023)} />
        <KpiCard label="Total Claims" value={fmtN(drug.tot_claims_2023)} />
        <KpiCard label="Beneficiaries" value={fmtN(drug.tot_benes_2023)} />
        <KpiCard label="Cost / Claim" value={fmt$(drug.avg_cost_per_claim_2023)} />
        <KpiCard label="Cost / Beneficiary" value={fmt$(drug.avg_cost_per_bene_2023)} />
        <KpiCard label="5-Yr CAGR" value={cagr != null ? `${Number(cagr).toFixed(1)}%` : '—'} colorClass={cagrColor} />
      </div>

      {/* Charts */}
      <div className={s.chartsRow}>
        <Panel title="5-Year Spending Trend">
          <div className={s.chartWrap}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e21" />
                <XAxis dataKey="year" tick={AXIS_STYLE} />
                <YAxis
                  tickFormatter={v => `$${(v / 1e6).toFixed(0)}M`}
                  tick={AXIS_STYLE}
                  width={60}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={v => [fmtB(v), 'Spending']}
                />
                <Bar dataKey="spending" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="5-Year Cost per Unit">
          <div className={s.chartWrap}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData.filter(d => d.cost_per_unit != null)} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e21" />
                <XAxis dataKey="year" tick={AXIS_STYLE} />
                <YAxis
                  tickFormatter={v => `$${Number(v).toFixed(2)}`}
                  tick={AXIS_STYLE}
                  width={60}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={v => [`$${Number(v).toFixed(2)}`, 'Cost / Unit']}
                />
                <Line dataKey="cost_per_unit" stroke="#22d3ee" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Year-by-year table */}
      <Panel title="Year-by-Year Data">
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Year</th>
                <th className={s.right}>Total Spending</th>
                <th className={s.right}>Claims</th>
                <th className={s.right}>Cost / Unit</th>
              </tr>
            </thead>
            <tbody>
              {trendData.slice().reverse().map(row => (
                <tr key={row.year}>
                  <td className={s.yearCell}>{row.year}</td>
                  <td className={s.right}>{fmtB(row.spending)}</td>
                  <td className={s.right}>{fmtN(row.claims)}</td>
                  <td className={s.right}>{row.cost_per_unit != null ? `$${Number(row.cost_per_unit).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Manufacturers */}
      {all_manufacturers?.length > 1 && (
        <Panel title={`Manufacturers (${all_manufacturers.length})`}>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Manufacturer</th>
                  <th>Brand Name</th>
                  <th className={s.right}>2023 Spending</th>
                  <th className={s.right}>Cost / Claim</th>
                </tr>
              </thead>
              <tbody>
                {all_manufacturers.map((m, i) => (
                  <tr key={i}>
                    <td>{m.mftr_name || '—'}</td>
                    <td className={s.italic}>{m.brnd_name || '—'}</td>
                    <td className={s.right}>{fmtB(m.tot_spending_2023)}</td>
                    <td className={s.right}>{fmt$(m.avg_cost_per_claim_2023)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function KpiCard({ label, value, colorClass }) {
  return (
    <div className={s.kpiCard}>
      <span className={`${s.kpiVal} ${colorClass || ''}`}>{value}</span>
      <span className={s.kpiLabel}>{label}</span>
    </div>
  );
}
