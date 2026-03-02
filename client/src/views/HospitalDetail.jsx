import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtCompact, fmtNumber, fmtStars, fmtSIR, fmtRatio } from '../utils/format.js';
import { comparisonBadge, sirColor } from '../utils/qualityColors.js';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import s from './HospitalDetail.module.css';

const TT_STYLE = { background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 };
const AXIS_TICK = { fill: '#71717a', fontFamily: 'Inter, sans-serif', fontSize: 10 };

export default function HospitalDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const { data: composite, loading: loadingComposite } = useApi(`/quality/composite/${ccn}`, [ccn]);
  const { data: hai } = useApi(`/quality/hai/hospital/${ccn}`, [ccn]);
  const { data: readm } = useApi(`/quality/readmissions/hospital/${ccn}`, [ccn]);
  const { data: psi } = useApi(`/quality/psi/hospital/${ccn}`, [ccn]);
  const { data: mortality } = useApi(`/quality/mortality/hospital/${ccn}`, [ccn]);
  const { data: timelyCare } = useApi(`/quality/timely-care/hospital/${ccn}`, [ccn]);
  const { data: vbp } = useApi(`/vbp/hospital/${ccn}`, [ccn]);
  const { data: spending } = useApi(`/spending/episode/${ccn}`, [ccn]);
  const { data: unplanned } = useApi(`/unplanned-visits/hospital/${ccn}`, [ccn]);
  const { data: trendRaw } = useApi(`/trends/provider?ccn=${ccn}`, [ccn]);
  const { data: outpatient } = useApi(`/outpatient/provider/${ccn}`, [ccn]);
  const { data: hcahps } = useApi(`/quality/hcahps/hospital/${ccn}`, [ccn]);
  const { data: hospPayments } = useApi(`/payments/hospital/${ccn}`, [ccn]);

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
          <div className={s.heroActions}>
            <button className={s.printBtn} onClick={() => window.print()}>Print Report Card</button>
            <button className={s.addCompareBtn} onClick={() => navigate(`/compare?add=${ccn}`)}>+ Compare</button>
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

        {/* VBP Domain Scores */}
        {vbp && (
          <Panel title="Value-Based Purchasing">
            <div className={s.metricList}>
              {[
                { label: 'Total Performance Score', value: vbp.total_performance_score },
                { label: 'Clinical Outcomes', value: vbp.clinical_outcomes_score_w },
                { label: 'Safety', value: vbp.safety_score_w },
                { label: 'Efficiency & Cost Reduction', value: vbp.efficiency_score_w },
                { label: 'Person & Community Engagement', value: vbp.person_engagement_score_w },
                { label: 'HCAHPS Base Score', value: vbp.hcahps_base_score },
                { label: 'MSPB-1 Performance Rate', value: vbp.mspb_1_performance_rate },
              ].map((m) => (
                <div key={m.label} className={s.metricRow}>
                  <span className={s.metricName}>{m.label}</span>
                  <span className={s.metricValue}>{m.value != null ? Number(m.value).toFixed(2) : '—'}</span>
                </div>
              ))}
            </div>
            {vbp.total_performance_score != null && (
              <div className={s.chartWrap}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[
                    { domain: 'Clinical', score: Number(vbp.clinical_outcomes_score_w) || 0 },
                    { domain: 'Safety', score: Number(vbp.safety_score_w) || 0 },
                    { domain: 'Efficiency', score: Number(vbp.efficiency_score_w) || 0 },
                    { domain: 'Engagement', score: Number(vbp.person_engagement_score_w) || 0 },
                  ]} layout="vertical" margin={{ left: 80, right: 20, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="domain" tick={AXIS_TICK} width={75} />
                    <Tooltip contentStyle={TT_STYLE} />
                    <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        )}

        {/* Unplanned Visits */}
        {unplanned?.length > 0 && (
          <Panel title="Unplanned Hospital Visits">
            <div className={s.metricList}>
              {unplanned.map((r, i) => {
                const badge = comparisonBadge(r.compared_to_national);
                return (
                  <div key={r.measure_id || i} className={s.metricRow}>
                    <span className={s.metricName}>{r.measure_name}</span>
                    <span className={s.metricValue}>{r.score != null ? Number(r.score).toFixed(2) : '—'}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Patient Experience (HCAHPS) */}
        {hcahps && (
          <Panel title="Patient Experience (HCAHPS)">
            <div className={s.hcahpsGrid}>
              {[
                { label: 'Overall', star: hcahps.overall_star },
                { label: 'Nurse Communication', star: hcahps.nurse_comm_star },
                { label: 'Doctor Communication', star: hcahps.doctor_comm_star },
                { label: 'Staff Responsiveness', star: hcahps.staff_responsive_star },
                { label: 'Medicine Communication', star: hcahps.medicine_comm_star },
                { label: 'Discharge Info', star: hcahps.discharge_info_star },
                { label: 'Care Transition', star: hcahps.care_transition_star },
                { label: 'Cleanliness', star: hcahps.cleanliness_star },
                { label: 'Quietness', star: hcahps.quietness_star },
                { label: 'Would Recommend', star: hcahps.recommend_star },
              ].map(m => (
                <div key={m.label} className={s.hcahpsItem}>
                  <span className={s.hcahpsLabel}>{m.label}</span>
                  <span className={s.hcahpsStars}>{fmtStars(m.star)}</span>
                </div>
              ))}
            </div>
            {hcahps.num_surveys && (
              <p className={s.hcahpsSurveys}>Based on {Number(hcahps.num_surveys).toLocaleString()} completed surveys</p>
            )}
          </Panel>
        )}
      </div>

      {/* Episode Spending (full width) */}
      {spending?.length > 0 && (() => {
        const complete = spending.filter(r => r.period?.includes('Complete'));
        return (
          <Panel title="Episode Spending by Claim Type">
            <div className={s.tableWrap}>
              <table className={s.spendTable}>
                <thead>
                  <tr>
                    <th>Claim Type</th>
                    <th>Hospital</th>
                    <th>State Avg</th>
                    <th>National Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {complete.map((r, i) => (
                    <tr key={i}>
                      <td className={s.metricName}>{r.claim_type}</td>
                      <td className={s.metricValue}>{fmtCurrency(r.avg_spndg_per_ep_hospital)}</td>
                      <td className={s.metricValue}>{fmtCurrency(r.avg_spndg_per_ep_state)}</td>
                      <td className={s.metricValue}>{fmtCurrency(r.avg_spndg_per_ep_national)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })()}

      {/* Historical Cost Trend */}
      {trendRaw?.length > 0 && (() => {
        const trend = (Array.isArray(trendRaw) ? trendRaw : trendRaw.results || [])
          .map(r => ({ ...r, year: Number(r.data_year), payment: Number(r.weighted_avg_payment), charges: Number(r.weighted_avg_charges) }))
          .sort((a, b) => a.year - b.year);
        return (
          <Panel title="Historical Cost Trend (2013–2023)">
            <div className={s.chartWrap}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ left: 10, right: 20, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="year" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={TT_STYLE} formatter={(v) => fmtCurrency(v)} />
                  <Line type="monotone" dataKey="payment" name="Avg Payment" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="charges" name="Avg Charges" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        );
      })()}

      {/* Top Outpatient Services */}
      {outpatient?.length > 0 && (
        <Panel title="Top Outpatient Services">
          <div className={s.tableWrap}>
            <table className={s.spendTable}>
              <thead>
                <tr>
                  <th>APC</th>
                  <th>Description</th>
                  <th>Services</th>
                  <th>Avg Charge</th>
                  <th>Avg Medicare</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(outpatient) ? outpatient : outpatient.results || []).slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className={s.metricValue}>{r.apc_cd}</td>
                    <td className={s.metricName}>{r.apc_desc}</td>
                    <td className={s.metricValue}>{fmtNumber(r.total_services)}</td>
                    <td className={s.metricValue}>{fmtCurrency(r.avg_charges)}</td>
                    <td className={s.metricValue}>{fmtCurrency(r.avg_medicare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Industry Payments (Open Payments / Sunshine Act) */}
      {hospPayments?.summary?.total_payments > 0 && (
        <Panel title="Industry Payments — Sunshine Act">
          <div className={s.kpiRow}>
            <KpiCard label="Total Payments" value={fmtNumber(hospPayments.summary.total_payments)} />
            <KpiCard label="Total Amount" value={fmtCurrency(hospPayments.summary.total_amount)} />
            <KpiCard label="Unique Payers" value={fmtNumber(hospPayments.summary.unique_payers)} />
          </div>
          {hospPayments.by_nature?.length > 0 && (
            <div className={s.tableWrap} style={{ marginTop: '1rem' }}>
              <p className={s.sectionLabel}>By Payment Nature</p>
              <table className={s.spendTable}>
                <thead>
                  <tr>
                    <th>Nature</th>
                    <th>Count</th>
                    <th>Total Amount</th>
                    <th>Avg Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {hospPayments.by_nature.map((r, i) => (
                    <tr key={i}>
                      <td className={s.metricName}>{r.payment_nature || '—'}</td>
                      <td className={s.metricValue}>{fmtNumber(r.count)}</td>
                      <td className={s.metricValue}>{fmtCurrency(r.amount)}</td>
                      <td className={s.metricValue}>{fmtCurrency(r.amount / r.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
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
