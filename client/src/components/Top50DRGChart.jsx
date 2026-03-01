import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { scaleLinear } from 'd3-scale';
import { interpolateYlOrRd, interpolateReimbursement } from './colorScale';
import { fmtCurrency, fmtNumber, fmtPercent } from '../utils/format';
import Panel from './Panel';

const METRIC_KEY = {
  payment: 'weighted_avg_payment',
  charges: 'weighted_avg_charges',
  medicare: 'weighted_avg_medicare',
  reimbursement: 'weighted_avg_reimbursement',
};

export default function Top50DRGChart({ drgs, metric, onDrgSelect }) {
  const key = METRIC_KEY[metric] || 'weighted_avg_payment';
  const isReimb = metric === 'reimbursement';
  const colorFn = isReimb ? interpolateReimbursement : interpolateYlOrRd;

  const data = useMemo(() => {
    const sorted = [...drgs].sort((a, b) => Number(b[key]) - Number(a[key]));
    return sorted.map((d) => ({
      ...d,
      drg_label: `${d.drg_cd} – ${(d.drg_desc || '').slice(0, 50)}`,
    }));
  }, [drgs, key]);

  const domain = [0, Math.max(...data.map((d) => Number(d[key])))];
  const colorScale = scaleLinear().domain(domain).range([0.2, 1]);

  return (
    <Panel title="Top 50 Most Expensive DRGs">
      <ResponsiveContainer width="100%" height={1500}>
        <BarChart data={data} layout="vertical" barCategoryGap="20%" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
          <XAxis
            type="number"
            tickFormatter={isReimb ? (v) => `${(v * 100).toFixed(0)}%` : (v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
            axisLine={{ stroke: '#1e1e21' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="drg_label"
            width={320}
            tick={{ fontSize: 11, fill: '#a1a1aa', fontFamily: 'Inter, sans-serif' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'rgba(59, 130, 246, 0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, padding: '12px 16px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxWidth: 360 }}>
                  <div style={{ fontWeight: 600, color: '#e4e4e7', marginBottom: 4, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>DRG {d.drg_cd}</div>
                  <div style={{ color: '#71717a', marginBottom: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.4 }}>{d.drg_desc?.slice(0, 100)}</div>
                  <div style={{ color: '#71717a' }}>Payment: <span style={{ color: '#e4e4e7' }}>{fmtCurrency(d.weighted_avg_payment)}</span></div>
                  <div style={{ color: '#71717a' }}>Charges: <span style={{ color: '#e4e4e7' }}>{fmtCurrency(d.weighted_avg_charges)}</span></div>
                  <div style={{ color: '#71717a' }}>Reimb. Rate: <span style={{ color: '#e4e4e7' }}>{fmtPercent(d.weighted_avg_reimbursement)}</span></div>
                  <div style={{ color: '#71717a' }}>Discharges: <span style={{ color: '#e4e4e7' }}>{fmtNumber(d.total_discharges)}</span></div>
                  <div style={{ color: '#71717a' }}>Providers: <span style={{ color: '#e4e4e7' }}>{fmtNumber(d.num_providers)}</span></div>
                </div>
              );
            }}
          />
          <Bar dataKey={key} radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => onDrgSelect?.(d?.drg_cd)}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFn(colorScale(Number(d[key])))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
