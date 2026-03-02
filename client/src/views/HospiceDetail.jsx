import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './HospiceDetail.module.css';

export default function HospiceDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useApi(`/post-acute/hospice/${ccn}`, [ccn]);

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
          <h2>Hospice Provider Not Found</h2>
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
          <h1 className={s.heroName}>{h.facility_name}</h1>
          <div className={s.heroMeta}>
            <span>{h.city}, {h.state} {h.zip_code}</span>
            {h.county && (
              <>
                <span className={s.dot}>·</span>
                <span>{h.county} County</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quality Measures */}
      {measures.length > 0 && (
        <Panel title="Quality Measures">
          <div className={s.tableWrap}>
            <table className={s.measuresTable}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Measure</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m, i) => (
                  <tr key={i}>
                    <td className={s.metricMeta}>{m.measure_code}</td>
                    <td className={s.metricName}>{m.measure_name}</td>
                    <td className={s.metricValue}>{m.score != null ? Number(m.score).toFixed(1) : '—'}</td>
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
