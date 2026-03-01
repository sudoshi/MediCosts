import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/useApi';
import Panel from './Panel';

const NUM_BINS = 30;

export default function PriceHistogram({ drg, metric }) {
  const { data, loading } = useApi(`/zips/histogram?drg=${drg}&metric=${metric}`, [drg, metric]);

  const bins = useMemo(() => {
    if (!data || data.length === 0) return [];
    const prices = data.map((d) => Number(d.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const step = (max - min) / NUM_BINS || 1;

    const buckets = Array.from({ length: NUM_BINS }, (_, i) => ({
      range: `$${Math.round((min + i * step) / 1000)}k`,
      rangeMin: min + i * step,
      rangeMax: min + (i + 1) * step,
      count: 0,
    }));

    for (const p of prices) {
      const idx = Math.min(Math.floor((p - min) / step), NUM_BINS - 1);
      buckets[idx].count++;
    }

    return buckets;
  }, [data]);

  return (
    <Panel title="Price Distribution Across ZIP Codes">
      {loading ? (
        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>Loading…</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={bins} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
              axisLine={{ stroke: '#1e1e21' }}
              tickLine={false}
              interval={Math.floor(NUM_BINS / 8)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, padding: '10px 14px', color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    <div style={{ color: '#71717a', marginBottom: 4 }}>${Math.round(d.rangeMin).toLocaleString()} – ${Math.round(d.rangeMax).toLocaleString()}</div>
                    <div><span style={{ color: '#3b82f6', fontWeight: 700 }}>{d.count}</span> ZIP codes</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" fill="#3b82f6" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
