import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './RehabDetail.module.css';

export default function RehabDetail({ type = 'irf' }) {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const apiPath = type === 'ltch' ? `/facilities/ltch/${ccn}` : `/facilities/irf/${ccn}`;
  const { data, loading } = useApi(apiPath, [ccn, type]);

  const label = type === 'ltch' ? 'Long-Term Care Hospital' : 'Inpatient Rehabilitation Facility';
  const shortLabel = type === 'ltch' ? 'LTCH' : 'IRF';

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
          <h2>{shortLabel} Not Found</h2>
          <p>No data for CCN: {ccn}</p>
          <button className={s.backBtn} onClick={() => navigate('/post-acute')}>Back to Post-Acute</button>
        </div>
      </div>
    );
  }

  const h = data;
  const measures = h.measures || [];

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
            {h.county && (
              <>
                <span className={s.dot}>·</span>
                <span>{h.county} County</span>
              </>
            )}
            <span className={s.dot}>·</span>
            <span>{label}</span>
          </div>
          <div className={s.heroMeta} style={{ marginTop: 6 }}>
            {h.ownership_type && <span>{h.ownership_type}</span>}
            {h.phone && (
              <>
                {h.ownership_type && <span className={s.dot}>·</span>}
                <span>{h.phone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quality Measures */}
      {measures.length > 0 && (
        <Panel title={`${shortLabel} Quality Measures`}>
          <div className={s.tableWrap}>
            <table className={s.measuresTable}>
              <thead>
                <tr>
                  <th>Measure Code</th>
                  <th>Score</th>
                  <th>Footnote</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m, i) => (
                  <tr key={i}>
                    <td className={s.metricCode}>{m.measure_code}</td>
                    <td className={s.metricValue}>{m.score != null ? Number(m.score).toFixed(2) : '—'}</td>
                    <td className={s.metricMeta}>{m.footnote || '—'}</td>
                    <td className={s.metricMeta}>
                      {m.start_date && m.end_date
                        ? `${m.start_date} — ${m.end_date}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {measures.length === 0 && (
        <Panel title={`${shortLabel} Quality Measures`}>
          <p className={s.empty}>No quality measures available for this facility.</p>
        </Panel>
      )}
    </div>
  );
}
