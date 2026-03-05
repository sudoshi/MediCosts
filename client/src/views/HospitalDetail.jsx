import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { fmtCurrency, fmtCompact, fmtNumber, fmtStars, fmtSIR, fmtRatio } from '../utils/format.js';
import { comparisonBadge, sirColor } from '../utils/qualityColors.js';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import s from './HospitalDetail.module.css';

const TT_STYLE = { background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 };
const AXIS_TICK = { fill: '#71717a', fontFamily: 'Inter, sans-serif', fontSize: 10 };

const DETAIL_TABS = [
  { id: 'quality',    label: 'Quality & Safety' },
  { id: 'cost',       label: 'Cost & Spending' },
  { id: 'community',  label: 'Community & Networks' },
];

export default function HospitalDetail() {
  const { ccn } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quality');

  // Always load — core header data
  const { data: composite, loading: loadingComposite } = useApi(`/quality/composite/${ccn}`, [ccn]);

  // Quality tab — only load when tab is active
  const { data: hai }       = useApi(activeTab === 'quality' ? `/quality/hai/hospital/${ccn}` : null,         [ccn, activeTab]);
  const { data: readm }     = useApi(activeTab === 'quality' ? `/quality/readmissions/hospital/${ccn}` : null, [ccn, activeTab]);
  const { data: psi }       = useApi(activeTab === 'quality' ? `/quality/psi/hospital/${ccn}` : null,         [ccn, activeTab]);
  const { data: mortality }  = useApi(activeTab === 'quality' ? `/quality/mortality/hospital/${ccn}` : null,   [ccn, activeTab]);
  const { data: timelyCare } = useApi(activeTab === 'quality' ? `/quality/timely-care/hospital/${ccn}` : null, [ccn, activeTab]);
  const { data: vbp }        = useApi(activeTab === 'quality' ? `/vbp/hospital/${ccn}` : null,                 [ccn, activeTab]);
  const { data: hcahps }     = useApi(activeTab === 'quality' ? `/quality/hcahps/hospital/${ccn}` : null,      [ccn, activeTab]);
  const { data: unplanned }  = useApi(activeTab === 'quality' ? `/unplanned-visits/hospital/${ccn}` : null,    [ccn, activeTab]);

  // Cost tab — only load when tab is active
  const { data: spending }   = useApi(activeTab === 'cost' ? `/spending/episode/${ccn}` : null,       [ccn, activeTab]);
  const { data: trendRaw }   = useApi(activeTab === 'cost' ? `/trends/provider?ccn=${ccn}` : null,   [ccn, activeTab]);
  const { data: outpatient } = useApi(activeTab === 'cost' ? `/outpatient/provider/${ccn}` : null,   [ccn, activeTab]);
  const { data: financials } = useApi(activeTab === 'cost' ? `/financials/hospital/${ccn}` : null,   [ccn, activeTab]);

  // Community tab — only load when tab is active
  const zip = composite?.zip_code?.replace(/\D/g, '').slice(0, 5);
  const { data: communityHealth } = useApi(activeTab === 'community' && zip ? `/community-health/${zip}` : null,  [ccn, activeTab, zip]);
  const { data: shortageAreas }   = useApi(activeTab === 'community' && zip ? `/shortage-areas?zip=${zip}` : null, [ccn, activeTab, zip]);
  const { data: networkData }     = useApi(activeTab === 'community' ? `/network/hospital/${ccn}` : null,           [ccn, activeTab]);
  const { data: hospPayments }    = useApi(activeTab === 'community' ? `/payments/hospital/${ccn}` : null,          [ccn, activeTab]);

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

      <Tabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className={s.grid}>
        {/* ── Quality & Safety tab ── */}
        {activeTab === 'quality' && sirMeasures.length > 0 && (
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
        {activeTab === 'quality' && psi && (
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
        {activeTab === 'quality' && readm?.length > 0 && (
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
        {activeTab === 'quality' && mortality?.length > 0 && (
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
        {activeTab === 'quality' && timelyCare?.length > 0 && (
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
        {activeTab === 'quality' && vbp && (
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
        {activeTab === 'quality' && unplanned?.length > 0 && (
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
        {activeTab === 'quality' && hcahps && (
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
      {activeTab === 'cost' && spending?.length > 0 && (() => {
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
      {activeTab === 'cost' && trendRaw?.length > 0 && (() => {
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
      {activeTab === 'cost' && outpatient?.length > 0 && (
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

      {/* Hospital Financials (HCRIS Cost Report) */}
      {activeTab === 'cost' && financials?.financials?.length > 0 && (() => {
        const f = financials.financials[0]; // latest year
        return (
          <Panel title={`Cost Report Financials — FY ${f.report_year}`}>
            <div className={s.kpiRow}>
              {f.total_patient_charges && <KpiCard label="Gross Charges" value={fmtCurrency(f.total_patient_charges)} />}
              {f.licensed_beds && <KpiCard label="Licensed Beds" value={fmtNumber(f.licensed_beds)} />}
              {f.total_inpatient_days && <KpiCard label="Inpatient Days" value={fmtNumber(f.total_inpatient_days)} />}
              {f.occupancy_pct && <KpiCard label="Occupancy" value={`${f.occupancy_pct}%`} />}
              {f.uncompensated_care_cost && (
                <KpiCard label="Uncompensated Care Cost" value={fmtCurrency(f.uncompensated_care_cost)} />
              )}
            </div>
            {f.has_charity_program && f.charity_care_charges && (
              <div className={s.metricList} style={{ marginTop: '0.75rem' }}>
                <div className={s.metricRow}>
                  <span className={s.metricName}>Charity Care Program</span>
                  <span className={s.metricValue} style={{ color: 'var(--better)' }}>Yes</span>
                </div>
                {f.charity_care_charges && (
                  <div className={s.metricRow}>
                    <span className={s.metricName}>Charity Care Charges</span>
                    <span className={s.metricValue}>{fmtCurrency(f.charity_care_charges)}</span>
                  </div>
                )}
                {f.charity_care_cost && (
                  <div className={s.metricRow}>
                    <span className={s.metricName}>Charity Care Cost</span>
                    <span className={s.metricValue}>{fmtCurrency(f.charity_care_cost)}</span>
                  </div>
                )}
                {f.uncomp_pct_charges && (
                  <div className={s.metricRow}>
                    <span className={s.metricName}>Uncompensated Care % of Charges</span>
                    <span className={s.metricValue}>{f.uncomp_pct_charges}%</span>
                  </div>
                )}
              </div>
            )}
          </Panel>
        );
      })()}

      {/* Industry Payments (Open Payments / Sunshine Act) */}
      {activeTab === 'community' && hospPayments?.summary?.total_payments > 0 && (
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

      {/* Shortage Area Alerts */}
      {activeTab === 'community' && shortageAreas?.shortage_areas?.length > 0 && (
        <Panel title="Health Professional Shortage Area (HRSA)">
          <div className={s.shortageAlerts}>
            {shortageAreas.shortage_areas.map((a, i) => (
              <div key={i} className={s.shortageChip}>
                <span className={s.shortageScore}>Score {a.hpsa_score ?? '—'}/25</span>
                <span className={s.shortageType}>{a.shortage_type}</span>
                {a.population_served && (
                  <span className={s.shortageNote}>{Number(a.population_served).toLocaleString()} served</span>
                )}
              </div>
            ))}
          </div>
          <p className={s.shortageFooter}>
            HRSA-designated shortage areas indicate insufficient healthcare professionals relative to community need.
            Higher scores = more severe shortage.
          </p>
        </Panel>
      )}

      {/* Insurance Networks (ClearNetwork) */}
      {activeTab === 'community' && networkData && (
        <Panel title="Insurance Networks — In-Network Status">
          {networkData.networks?.length > 0 ? (
            <>
              <div className={s.shortageAlerts}>
                {networkData.networks.map((n, i) => (
                  <div key={i} className={s.networkChip}>
                    <span className={s.networkDot} />
                    <div className={s.networkInfo}>
                      <span className={s.networkName}>{n.network_name}</span>
                      {n.tier && <span className={s.networkTier}>Tier {n.tier}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className={s.shortageFooter}>
                {networkData.matched_name && <>Matched as: <em>{networkData.matched_name}</em> · </>}
                Source: ClearNetwork — {networkData.networks.length} network{networkData.networks.length !== 1 ? 's' : ''} verified.
                Confirm current status with your insurer before scheduling care.
              </p>
            </>
          ) : (
            <p className={s.shortageFooter}>
              {networkData.matched ? 'This hospital was matched but has no active network links.' : 'This hospital was not found in any currently loaded insurance network directory.'}
              {' '}Data available for BCBS MN, BCBS IL, Kaiser Permanente, and UnitedHealthcare.
            </p>
          )}
        </Panel>
      )}

      {/* Community Health Context (CDC PLACES) */}
      {activeTab === 'community' && communityHealth && (
        <Panel title={`Community Health — ZIP ${zip}`}>
          <div className={s.kpiRow}>
            {communityHealth.diabetes_pct != null && (
              <KpiCard label="Diabetes" value={`${communityHealth.diabetes_pct}%`} />
            )}
            {communityHealth.obesity_pct != null && (
              <KpiCard label="Obesity" value={`${communityHealth.obesity_pct}%`} />
            )}
            {communityHealth.heart_disease_pct != null && (
              <KpiCard label="Heart Disease" value={`${communityHealth.heart_disease_pct}%`} />
            )}
            {communityHealth.uninsured_pct != null && (
              <KpiCard label="Uninsured" value={`${communityHealth.uninsured_pct}%`} />
            )}
            {communityHealth.depression_pct != null && (
              <KpiCard label="Depression" value={`${communityHealth.depression_pct}%`} />
            )}
            {communityHealth.smoking_pct != null && (
              <KpiCard label="Smoking" value={`${communityHealth.smoking_pct}%`} />
            )}
          </div>
          <p className={s.shortageFooter}>
            Source: CDC PLACES {communityHealth.data_year} — crude prevalence estimates for adults 18+.
            Population: {communityHealth.total_population?.toLocaleString() ?? '—'}.
          </p>
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
