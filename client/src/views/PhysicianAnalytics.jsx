import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtNumber } from '../utils/format.js';
import s from './PhysicianAnalytics.module.css';

export default function PhysicianAnalytics() {
  const [zipSearch, setZipSearch] = useState('');
  const { data: topHcpcs, loading: loadingHcpcs } = useApi('/physician/top-hcpcs?limit=25');
  const { data: zipData, loading: loadingZip } = useApi(
    zipSearch.length === 5 ? `/physician/zip-summary?zip=${zipSearch}` : null,
    [zipSearch]
  );

  const chartData = useMemo(() => {
    if (!topHcpcs) return [];
    return topHcpcs.slice(0, 15).map((r) => ({
      code: r.hcpcs_code,
      desc: r.hcpcs_description?.slice(0, 40),
      avg_charge: Number(r.avg_charge),
      avg_payment: Number(r.avg_payment),
      providers: Number(r.total_providers),
    }));
  }, [topHcpcs]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Physician Analytics</h1>
        <p className={s.subtitle}>9M+ Medicare physician & supplier claims — HCPCS analysis</p>
      </header>

      {/* Top HCPCS */}
      {loadingHcpcs ? <Skeleton height={400} /> : chartData.length > 0 && (
        <Panel title="Top 15 HCPCS by Provider Count">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 220, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="code" tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false} tickLine={false} width={60} />
              <Tooltip
                contentStyle={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 }}
                formatter={(v, name) => [fmtCurrency(v), name === 'avg_charge' ? 'Avg Charge' : 'Avg Payment']}
                labelFormatter={(code) => chartData.find((d) => d.code === code)?.desc || code}
              />
              <Bar dataKey="avg_charge" fill="#3b82f6" fillOpacity={0.4} radius={[0, 2, 2, 0]} maxBarSize={16} name="avg_charge" />
              <Bar dataKey="avg_payment" fill="#22d3ee" radius={[0, 4, 4, 0]} maxBarSize={16} name="avg_payment" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* Full HCPCS Table */}
      {topHcpcs?.length > 0 && (
        <Panel title="Top HCPCS Procedures Nationally">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thLeft}>HCPCS</th>
                  <th className={s.thLeft}>Description</th>
                  <th>Providers</th>
                  <th>Avg Charge</th>
                  <th>Avg Payment</th>
                  <th>Beneficiaries</th>
                </tr>
              </thead>
              <tbody>
                {topHcpcs.map((r) => (
                  <tr key={r.hcpcs_code}>
                    <td className={s.code}>{r.hcpcs_code}</td>
                    <td className={s.desc}>{r.hcpcs_description}</td>
                    <td className={s.mono}>{fmtNumber(r.total_providers)}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_charge)}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_payment)}</td>
                    <td className={s.mono}>{fmtNumber(r.total_beneficiaries)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ZIP Drill-down */}
      <Panel title="ZIP-Level Physician Summary">
        <div className={s.zipSearch}>
          <SearchInput value={zipSearch} onChange={setZipSearch} placeholder="Enter a 5-digit ZIP code..." debounceMs={400} />
        </div>
        {loadingZip && <Skeleton height={200} />}
        {zipData?.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thLeft}>HCPCS</th>
                  <th className={s.thLeft}>Description</th>
                  <th>Providers</th>
                  <th>Avg Charge</th>
                  <th>Avg Payment</th>
                </tr>
              </thead>
              <tbody>
                {zipData.map((r) => (
                  <tr key={r.hcpcs_code}>
                    <td className={s.code}>{r.hcpcs_code}</td>
                    <td className={s.desc}>{r.hcpcs_description || '—'}</td>
                    <td className={s.mono}>{fmtNumber(r.num_providers)}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_charge)}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_payment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {zipSearch.length === 5 && !loadingZip && (!zipData || zipData.length === 0) && (
          <p className={s.emptyMsg}>No physician data for ZIP {zipSearch}</p>
        )}
      </Panel>
    </div>
  );
}
