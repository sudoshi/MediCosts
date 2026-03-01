import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { sirColor } from '../../utils/qualityColors.js';
import Panel from '../Panel.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import styles from './HaiChart.module.css';

const SIR_MEASURES = ['HAI_1_SIR', 'HAI_2_SIR', 'HAI_3_SIR', 'HAI_5_SIR', 'HAI_6_SIR'];
const LABELS = { HAI_1_SIR: 'CLABSI', HAI_2_SIR: 'CAUTI', HAI_3_SIR: 'SSI Colon', HAI_5_SIR: 'MRSA', HAI_6_SIR: 'CDI' };

export default function HaiChart() {
  const { data, loading } = useApi('/quality/hai/national-summary');

  const chartData = useMemo(() => {
    if (!data) return [];
    return SIR_MEASURES.map((id) => {
      const row = data.find((r) => r.measure_id === id);
      return {
        name: LABELS[id],
        avg_sir: row ? Number(row.avg_sir) : 0,
        median_sir: row ? Number(row.median_sir) : 0,
        hospitals: row ? row.hospitals : 0,
        worse_count: row ? row.worse_count : 0,
        better_count: row ? row.better_count : 0,
      };
    });
  }, [data]);

  if (loading) return <Panel title="Healthcare-Associated Infections"><Skeleton height={240} /></Panel>;

  return (
    <Panel title="Healthcare-Associated Infections (SIR)">
      <p className={styles.hint}>Standardized Infection Ratio — below 1.0 = better than national benchmark</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 }}
            formatter={(v, name) => [Number(v).toFixed(3), name === 'avg_sir' ? 'Avg SIR' : 'Median SIR']}
            labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
          />
          <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Benchmark (1.0)', position: 'right', fill: '#f59e0b', fontSize: 10 }} />
          <Bar dataKey="avg_sir" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={sirColor(entry.avg_sir)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.legend}>
        {chartData.map((d) => (
          <div key={d.name} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: sirColor(d.avg_sir) }} />
            <span className={styles.legendLabel}>{d.name}</span>
            <span className={styles.legendValue}>{d.hospitals.toLocaleString()} hospitals</span>
            <span className={styles.legendBetter}>{d.better_count} better</span>
            <span className={styles.legendWorse}>{d.worse_count} worse</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
