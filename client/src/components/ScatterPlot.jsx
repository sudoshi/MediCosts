import { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis, Cell } from 'recharts';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber } from '../utils/format';
import Panel from './Panel';
import ProviderDetail from './ProviderDetail';

const STATE_COLORS = [
  '#3b82f6', '#22d3ee', '#a78bfa', '#f472b6', '#34d399',
  '#fbbf24', '#f87171', '#60a5fa', '#818cf8', '#2dd4bf',
  '#fb923c', '#a3e635', '#e879f9', '#38bdf8', '#4ade80',
  '#facc15', '#f97316', '#c084fc', '#22c55e', '#06b6d4',
];

export default function ScatterPlot({ drg }) {
  const { data, loading } = useApi(`/zips/scatter?drg=${drg}`, [drg]);
  const [selectedZip, setSelectedZip] = useState(null);

  const { chartData, stateColorMap } = useMemo(() => {
    const points = (data || []).map((d) => ({
      ...d,
      avg_charges: Number(d.avg_charges),
      avg_payment: Number(d.avg_payment),
      total_discharges: Number(d.total_discharges),
    }));
    const states = [...new Set(points.map((d) => d.state_abbr))].sort();
    const colorMap = {};
    states.forEach((s, i) => { colorMap[s] = STATE_COLORS[i % STATE_COLORS.length]; });
    return { chartData: points, stateColorMap: colorMap };
  }, [data]);

  const maxVal = Math.max(
    ...chartData.map((d) => Math.max(d.avg_charges, d.avg_payment)),
    1
  );

  if (selectedZip) {
    return (
      <Panel title={`ZIP ${selectedZip.zip5} — ${selectedZip.provider_city}, ${selectedZip.state_abbr}`}>
        <button
          onClick={() => setSelectedZip(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: '1px solid var(--border-mid)', borderRadius: 6,
            color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 12,
            padding: '6px 14px', cursor: 'pointer', marginBottom: 16, transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
        >
          ← Back to Scatter Plot
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
    <Panel title="Charges vs. Payments by ZIP Code">
      {loading ? (
        <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>Loading…</div>
      ) : (
        <ResponsiveContainer width="100%" height={900}>
          <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
            <XAxis
              type="number"
              dataKey="avg_charges"
              name="Charges"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
              axisLine={{ stroke: '#1e1e21' }}
              tickLine={false}
              label={{ value: 'Avg Covered Charges', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#3f3f46', fontFamily: 'Inter, sans-serif' }}
            />
            <YAxis
              type="number"
              dataKey="avg_payment"
              name="Payment"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Avg Total Payment', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#3f3f46', fontFamily: 'Inter, sans-serif' }}
            />
            <ZAxis type="number" dataKey="total_discharges" range={[30, 400]} zAxisId="size" />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
              stroke="#2a2a2d"
              strokeDasharray="5 4"
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#2a2a2d' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, padding: '12px 16px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxWidth: 240 }}>
                    <div style={{ fontWeight: 600, color: '#e4e4e7', marginBottom: 6, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>{d.zip5} — {d.provider_city}, {d.state_abbr}</div>
                    <div style={{ color: '#71717a', marginBottom: 2 }}>Charges: <span style={{ color: '#e4e4e7' }}>{fmtCurrency(d.avg_charges)}</span></div>
                    <div style={{ color: '#71717a', marginBottom: 2 }}>Payment: <span style={{ color: '#e4e4e7' }}>{fmtCurrency(d.avg_payment)}</span></div>
                    <div style={{ color: '#71717a' }}>Discharges: <span style={{ color: '#e4e4e7' }}>{fmtNumber(d.total_discharges)}</span></div>
                  </div>
                );
              }}
            />
            <Scatter
              data={chartData}
              fillOpacity={0.6}
              zAxisId="size"
              cursor="pointer"
              onClick={(point) => {
                const d = point?.payload;
                if (d) setSelectedZip({ zip5: d.zip5, provider_city: d.provider_city, state_abbr: d.state_abbr });
              }}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={stateColorMap[d.state_abbr] || '#3b82f6'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
