import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtStars, fmtNumber, fmtCurrency } from '../utils/format.js';
import s from './NursingHomeDetail.module.css';

export default function NursingHomeDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useApi(`/post-acute/nursing-home/${ccn}`, [ccn]);

  if (loading) {
    return (
      <div className={s.page}>
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={s.page}>
        <div className={s.notFound}>
          <h2>Nursing Home Not Found</h2>
          <p>No data for CCN: {ccn}</p>
          <button className={s.backBtn} onClick={() => navigate('/post-acute')}>Back to Post-Acute</button>
        </div>
      </div>
    );
  }

  const h = data;
  const quality = h.quality_measures || [];

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/post-acute')}>
        ← Back to Post-Acute Care
      </button>

      {/* Hero */}
      <div className={s.heroCard}>
        <div className={s.heroMain}>
          <h1 className={s.heroName}>{h.provider_name}</h1>
          <div className={s.heroMeta}>
            <span>{h.city}, {h.state} {h.zip_code}</span>
            {h.ownership_type && (
              <>
                <span className={s.dot}>·</span>
                <span>{h.ownership_type}</span>
              </>
            )}
          </div>
        </div>
        <div className={s.starChips}>
          <StarChip label="Overall" rating={h.overall_rating} />
          <StarChip label="Health Insp." rating={h.health_inspection_rating} />
          <StarChip label="Quality" rating={h.qm_rating} />
          <StarChip label="Staffing" rating={h.staffing_rating} />
        </div>
      </div>

      {/* KPI Row */}
      <div className={s.kpiRow}>
        <KpiCard label="Beds" value={fmtNumber(h.number_of_beds)} />
        <KpiCard label="Avg Residents/Day" value={h.avg_residents_per_day ? Number(h.avg_residents_per_day).toFixed(1) : '—'} />
        <KpiCard label="RN Hrs/Resident" value={h.rn_hours_per_resident ? Number(h.rn_hours_per_resident).toFixed(2) : '—'} />
        <KpiCard label="Total Nurse Hrs/Res" value={h.total_nurse_hours_per_res ? Number(h.total_nurse_hours_per_res).toFixed(2) : '—'} />
        <KpiCard label="Total Penalties" value={fmtNumber(h.total_penalties)} />
      </div>

      <div className={s.grid}>
        {/* Fines & Penalties */}
        <Panel title="Fines & Penalties">
          <div className={s.metricList}>
            <MetricRow label="Number of Fines" value={fmtNumber(h.number_of_fines)} />
            <MetricRow label="Total Fine Amount" value={fmtCurrency(h.total_fines_dollars)} />
            <MetricRow label="Total Penalties" value={fmtNumber(h.total_penalties)} />
          </div>
        </Panel>

        {/* Staffing */}
        <Panel title="Staffing Details">
          <div className={s.metricList}>
            <MetricRow label="RN Hours per Resident Day" value={h.rn_hours_per_resident ? Number(h.rn_hours_per_resident).toFixed(2) : '—'} />
            <MetricRow label="Total Nurse Hours per Resident Day" value={h.total_nurse_hours_per_res ? Number(h.total_nurse_hours_per_res).toFixed(2) : '—'} />
            <MetricRow label="Number of Beds" value={fmtNumber(h.number_of_beds)} />
            <MetricRow label="Avg Residents per Day" value={h.avg_residents_per_day ? Number(h.avg_residents_per_day).toFixed(1) : '—'} />
          </div>
        </Panel>
      </div>

      {/* Quality Measures */}
      {quality.length > 0 && (
        <Panel title="Quality Measures">
          <div className={s.tableWrap}>
            <table className={s.qualityTable}>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Resident Type</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>4-Qtr Avg</th>
                </tr>
              </thead>
              <tbody>
                {quality.map((m, i) => (
                  <tr key={i}>
                    <td className={s.metricName}>{m.measure_description}</td>
                    <td className={s.metricMeta}>{m.resident_type}</td>
                    <td className={s.metricValue}>{m.q1_score != null ? Number(m.q1_score).toFixed(1) : '—'}</td>
                    <td className={s.metricValue}>{m.q2_score != null ? Number(m.q2_score).toFixed(1) : '—'}</td>
                    <td className={s.metricValue}>{m.q3_score != null ? Number(m.q3_score).toFixed(1) : '—'}</td>
                    <td className={s.metricValue}>{m.q4_score != null ? Number(m.q4_score).toFixed(1) : '—'}</td>
                    <td className={s.metricValue}>{m.four_quarter_avg != null ? Number(m.four_quarter_avg).toFixed(1) : '—'}</td>
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

function StarChip({ label, rating }) {
  return (
    <div className={s.starChip}>
      <span className={s.starChipLabel}>{label}</span>
      <span className={s.starChipValue}>{fmtStars(rating)}</span>
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

function MetricRow({ label, value }) {
  return (
    <div className={s.metricRow}>
      <span className={s.metricName}>{label}</span>
      <span className={s.metricValue}>{value}</span>
    </div>
  );
}
