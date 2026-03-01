import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber, fmtStars } from '../utils/format';
import Panel from './Panel';
import HospitalQualityCard from './HospitalQualityCard';
import styles from './CostVsQualityScatter.module.css';

const OWNERSHIP_COLORS = {
  'Voluntary non-profit - Private':  '#3b82f6',
  'Voluntary non-profit - Church':   '#60a5fa',
  'Voluntary non-profit - Other':    '#93c5fd',
  'Proprietary':                     '#f97316',
  'Government - Federal':            '#22c55e',
  'Government - Hospital District or Authority': '#34d399',
  'Government - Local':              '#4ade80',
  'Government - State':              '#86efac',
  'Physician':                       '#a78bfa',
  'Tribal':                          '#fbbf24',
};

const OWNERSHIP_SHORT = {
  'Voluntary non-profit - Private':  'Nonprofit',
  'Voluntary non-profit - Church':   'Nonprofit (Church)',
  'Voluntary non-profit - Other':    'Nonprofit (Other)',
  'Proprietary':                     'For-Profit',
  'Government - Federal':            'Gov (Federal)',
  'Government - Hospital District or Authority': 'Gov (District)',
  'Government - Local':              'Gov (Local)',
  'Government - State':              'Gov (State)',
  'Physician':                       'Physician',
  'Tribal':                          'Tribal',
};

function ownershipColor(ownership) {
  return OWNERSHIP_COLORS[ownership] || '#71717a';
}

export default function CostVsQualityScatter({ drg }) {
  const { data, loading } = useApi(`/quality/cost-vs-stars?drg=${drg}`, [drg]);
  const [selectedHospital, setSelectedHospital] = useState(null);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      ...d,
      avg_payment: Number(d.avg_payment),
      star_rating: Number(d.star_rating),
      total_discharges: Number(d.total_discharges),
      // Add jitter to star rating so dots don't overlap
      star_jitter: Number(d.star_rating) + (Math.random() - 0.5) * 0.35,
    }));
  }, [data]);

  // Build legend entries from data
  const legendEntries = useMemo(() => {
    if (!chartData.length) return [];
    const seen = new Set();
    return chartData
      .filter((d) => {
        if (seen.has(d.hospital_ownership)) return false;
        seen.add(d.hospital_ownership);
        return true;
      })
      .map((d) => ({
        ownership: d.hospital_ownership,
        color: ownershipColor(d.hospital_ownership),
        label: OWNERSHIP_SHORT[d.hospital_ownership] || d.hospital_ownership,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [chartData]);

  if (selectedHospital) {
    return (
      <Panel title={`${selectedHospital.facility_name} — ${selectedHospital.city}, ${selectedHospital.state}`}>
        <button className={styles.backBtn} onClick={() => setSelectedHospital(null)}>
          ← Back to Cost vs Quality
        </button>
        <HospitalQualityCard ccn={selectedHospital.facility_id} />
      </Panel>
    );
  }

  return (
    <Panel title="Are Expensive Hospitals Better? — Cost vs Star Rating">
      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : (
        <>
          <div className={styles.legend}>
            {legendEntries.map((e) => (
              <span key={e.ownership} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: e.color }} />
                {e.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={600}>
            <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
              <XAxis
                type="number"
                dataKey="avg_payment"
                name="Avg Payment"
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'Inter, sans-serif' }}
                axisLine={{ stroke: '#1e1e21' }}
                tickLine={false}
                label={{
                  value: 'Average Total Payment per Discharge',
                  position: 'insideBottom', offset: -15,
                  fontSize: 11, fill: '#3f3f46', fontFamily: 'Inter, sans-serif',
                }}
              />
              <YAxis
                type="number"
                dataKey="star_jitter"
                name="Star Rating"
                domain={[0.5, 5.5]}
                ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(v) => `${'★'.repeat(v)}`}
                tick={{ fontSize: 12, fill: '#fbbf24', fontFamily: 'Inter, sans-serif' }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: 'CMS Star Rating',
                  angle: -90, position: 'insideLeft', offset: 10,
                  fontSize: 11, fill: '#3f3f46', fontFamily: 'Inter, sans-serif',
                }}
              />
              <ZAxis type="number" dataKey="total_discharges" range={[30, 350]} zAxisId="size" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: '#2a2a2d' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className={styles.tooltip}>
                      <div className={styles.tooltipName}>{d.facility_name}</div>
                      <div className={styles.tooltipSub}>{d.city}, {d.state} · {d.zip_code}</div>
                      <div className={styles.tooltipRow}>
                        <span>Stars:</span>
                        <span className={styles.tooltipStars}>{fmtStars(d.star_rating)}</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Payment:</span>
                        <span>{fmtCurrency(d.avg_payment)}</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Discharges:</span>
                        <span>{fmtNumber(d.total_discharges)}</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Type:</span>
                        <span>{OWNERSHIP_SHORT[d.hospital_ownership] || d.hospital_ownership}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter
                data={chartData}
                fillOpacity={0.65}
                zAxisId="size"
                cursor="pointer"
                onClick={(point) => {
                  const d = point?.payload;
                  if (d) setSelectedHospital(d);
                }}
              >
                {chartData.map((d, i) => (
                  <Cell key={i} fill={ownershipColor(d.hospital_ownership)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </>
      )}
    </Panel>
  );
}
