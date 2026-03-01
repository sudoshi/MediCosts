import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars, fmtSIR, fmtRatio } from '../utils/format.js';
import { comparisonBadge, sirColor } from '../utils/qualityColors.js';
import s from './HospitalDetail.module.css';

export default function HospitalDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data: composite, loading: loadingComposite } = useApi(`/quality/composite/${ccn}`, [ccn]);
  const { data: hai } = useApi(`/quality/hai/hospital/${ccn}`, [ccn]);
  const { data: readm } = useApi(`/quality/readmissions/hospital/${ccn}`, [ccn]);
  const { data: psi } = useApi(`/quality/psi/hospital/${ccn}`, [ccn]);
  const { data: mortality } = useApi(`/quality/mortality/hospital/${ccn}`, [ccn]);
  const { data: timelyCare } = useApi(`/quality/timely-care/hospital/${ccn}`, [ccn]);

  if (loadingComposite) {
    return (
      <div className={s.page}>
        <Skeleton height={120} />
        <Skeleton height={200} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (!composite) {
    return (
      <div className={s.page}>
        <div className={s.notFound}>
          <h2>Hospital Not Found</h2>
          <p>No data for CCN: {ccn}</p>
          <button className={s.backBtn} onClick={() => navigate('/hospitals')}>Back to Explorer</button>
        </div>
      </div>
    );
  }

  const h = composite;
  const sirMeasures = (hai || []).filter((r) => r.measure_id?.endsWith('_SIR'));

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/hospitals')}>
        ← Back to Hospital Explorer
      </button>

      {/* Header */}
      <div className={s.heroCard}>
        <div className={s.heroMain}>
          <h1 className={s.heroName}>{h.facility_name}</h1>
          <div className={s.heroMeta}>
            <span>{h.city}, {h.state} {h.zip_code}</span>
            <span className={s.dot}>·</span>
            <span>{h.hospital_type}</span>
            <span className={s.dot}>·</span>
            <span>{h.hospital_ownership}</span>
          </div>
        </div>
        <div className={s.heroStars}>
          <span className={s.starsValue}>{fmtStars(h.star_rating)}</span>
          <span className={s.starsLabel}>{h.star_rating ? `${h.star_rating}/5 Overall` : 'Not Rated'}</span>
        </div>
      </div>

      {/* KPI row */}
      <div className={s.kpiRow}>
        <KpiCard label="Avg Payment" value={fmtCurrency(h.weighted_avg_payment)} />
        <KpiCard label="Total Discharges" value={h.total_discharges?.toLocaleString() || '—'} />
        <KpiCard label="PSI-90" value={h.psi_90_score ? Number(h.psi_90_score).toFixed(3) : '—'} />
        <KpiCard label="Readm Ratio" value={h.avg_excess_readm_ratio ? fmtRatio(h.avg_excess_readm_ratio) : '—'} />
        <KpiCard label="Mortality" value={h.avg_mortality_rate ? `${Number(h.avg_mortality_rate).toFixed(1)}%` : '—'} />
        <KpiCard label="HAC Penalty" value={h.hac_payment_reduction || '—'} color={h.hac_payment_reduction === 'Yes' ? '#ef4444' : undefined} />
      </div>

      <div className={s.grid}>
        {/* HAI Section */}
        {sirMeasures.length > 0 && (
          <Panel title="Healthcare-Associated Infections">
            <div className={s.metricList}>
              {sirMeasures.map((r) => {
                const badge = comparisonBadge(r.compared_to_national);
                return (
                  <div key={r.measure_id} className={s.metricRow}>
                    <span className={s.metricName}>{r.measure_name?.replace(/:.+/, '')}</span>
                    <span className={s.metricValue} style={{ color: sirColor(r.score) }}>
                      {fmtSIR(r.score)}
                    </span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* PSI Section */}
        {psi && (
          <Panel title="Patient Safety Indicators">
            <div className={s.metricList}>
              {[
                { label: 'PSI-90 Composite', value: psi.psi_90_value },
                { label: 'CLABSI SIR', value: psi.clabsi_sir },
                { label: 'CAUTI SIR', value: psi.cauti_sir },
                { label: 'SSI SIR', value: psi.ssi_sir },
                { label: 'CDI SIR', value: psi.cdi_sir },
                { label: 'MRSA SIR', value: psi.mrsa_sir },
                { label: 'Total HAC Score', value: psi.total_hac_score },
              ].map((m) => (
                <div key={m.label} className={s.metricRow}>
                  <span className={s.metricName}>{m.label}</span>
                  <span className={s.metricValue}>{m.value != null ? Number(m.value).toFixed(4) : '—'}</span>
                </div>
              ))}
              {psi.payment_reduction && (
                <div className={s.metricRow}>
                  <span className={s.metricName}>Payment Reduction</span>
                  <Badge variant={psi.payment_reduction === 'Yes' ? 'worse' : 'better'}>{psi.payment_reduction}</Badge>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Readmissions */}
        {readm?.length > 0 && (
          <Panel title="Readmission Rates (HRRP)">
            <div className={s.metricList}>
              {readm.map((r, i) => (
                <div key={i} className={s.metricRow}>
                  <span className={s.metricName}>{r.measure_name?.replace(/-HRRP$/, '').replace(/^READM-30-/, '')}</span>
                  <span className={s.metricValue}>{r.excess_readmission_ratio ? fmtRatio(r.excess_readmission_ratio) : '—'}</span>
                  {r.excess_readmission_ratio && (
                    <Badge variant={Number(r.excess_readmission_ratio) > 1 ? 'worse' : 'better'}>
                      {Number(r.excess_readmission_ratio) > 1 ? 'Penalized' : 'Not Penalized'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Mortality */}
        {mortality?.length > 0 && (
          <Panel title="Complications & Mortality">
            <div className={s.metricList}>
              {mortality.filter((r) => r.measure_id?.startsWith('MORT_')).map((r) => {
                const badge = comparisonBadge(r.compared_to_national);
                return (
                  <div key={r.measure_id} className={s.metricRow}>
                    <span className={s.metricName}>{r.measure_name}</span>
                    <span className={s.metricValue}>{r.score ? `${Number(r.score).toFixed(1)}%` : '—'}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Timely Care */}
        {timelyCare?.length > 0 && (
          <Panel title="Timely & Effective Care">
            <div className={s.metricList}>
              {timelyCare.filter((r) => ['ED_1b', 'ED_2b', 'OP_18b'].includes(r.measure_id)).map((r) => (
                <div key={r.measure_id} className={s.metricRow}>
                  <span className={s.metricName}>{r.measure_name}</span>
                  <span className={s.metricValue}>{r.score != null ? `${r.score} min` : '—'}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className={s.kpiCard}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}
