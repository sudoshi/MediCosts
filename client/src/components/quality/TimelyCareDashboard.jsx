import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import Panel from '../Panel.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import styles from './TimelyCareDashboard.module.css';

const ED_LABELS = { ED_1b: 'ED Arrival → Departure (Admits)', ED_2b: 'Admit Decision → Departure', OP_18b: 'ED Time (Outpatient)' };
const COLORS = ['#3b82f6', '#a78bfa', '#22d3ee'];

export default function TimelyCareDashboard() {
  const { data, loading } = useApi('/quality/timely-care/ed-comparison');

  const chartData = useMemo(() => {
    if (!data) return [];
    const grouped = {};
    data.forEach((r) => {
      const key = r.measure_id;
      if (!grouped[key]) grouped[key] = { scores: [], label: ED_LABELS[key] || key };
      grouped[key].scores.push(Number(r.score));
    });
    return Object.entries(grouped).map(([id, g]) => {
      const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
      const median = g.scores.sort((a, b) => a - b)[Math.floor(g.scores.length / 2)];
      return { name: g.label, measure_id: id, avg: Math.round(avg), median: Math.round(median), hospitals: g.scores.length };
    });
  }, [data]);

  if (loading) return <Panel title="Timely & Effective Care"><Skeleton height={240} /></Panel>;

  return (
    <Panel title="Emergency Department Wait Times">
      <p className={styles.hint}>Average minutes by measure across all reporting hospitals</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 180, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} unit=" min" />
          <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={170} />
          <Tooltip
            contentStyle={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 }}
            formatter={(v) => [`${v} min`, 'Avg Wait']}
          />
          <Bar dataKey="avg" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.stats}>
        {chartData.map((d, i) => (
          <div key={d.measure_id} className={styles.statCard}>
            <div className={styles.statDot} style={{ background: COLORS[i % COLORS.length] }} />
            <div className={styles.statInfo}>
              <span className={styles.statName}>{d.name}</span>
              <span className={styles.statDetail}>{d.hospitals} hospitals reporting</span>
            </div>
            <div className={styles.statValues}>
              <span className={styles.statAvg}>{d.avg} min avg</span>
              <span className={styles.statMedian}>{d.median} min median</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
