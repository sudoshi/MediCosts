#!/usr/bin/env node
/**
 * create-cross-views.js
 * Creates materialized views that join data across datasets.
 * Must be run AFTER all individual load scripts.
 *
 * Usage: node scripts/create-cross-views.js
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool();

const VIEWS = `
-- View 1: Hospital Cost + Quality (the "killer" join)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_hospital_cost_quality CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_hospital_cost_quality AS
SELECT
  hi.facility_id                   AS provider_ccn,
  hi.facility_name,
  hi.city,
  hi.state,
  hi.zip_code                      AS zip5,
  hi.hospital_type,
  hi.hospital_ownership,
  hi.emergency_services,
  hi.hospital_overall_rating       AS star_rating,
  SUM(mi.avg_total_payments * mi.total_discharges) / NULLIF(SUM(mi.total_discharges), 0)
    AS weighted_avg_payment,
  SUM(mi.avg_covered_charges * mi.total_discharges) / NULLIF(SUM(mi.total_discharges), 0)
    AS weighted_avg_charges,
  SUM(mi.avg_medicare_payments * mi.total_discharges) / NULLIF(SUM(mi.total_discharges), 0)
    AS weighted_avg_medicare,
  SUM(mi.total_discharges)::int    AS total_discharges,
  COUNT(DISTINCT mi.drg_cd)::int   AS num_drgs
FROM medicosts.hospital_info hi
JOIN medicosts.medicare_inpatient mi
  ON hi.facility_id = mi.provider_ccn
WHERE hi.hospital_overall_rating IS NOT NULL
GROUP BY
  hi.facility_id, hi.facility_name, hi.city, hi.state, hi.zip_code,
  hi.hospital_type, hi.hospital_ownership, hi.emergency_services,
  hi.hospital_overall_rating;

CREATE INDEX idx_mv_hcq_rating  ON medicosts.mv_hospital_cost_quality (star_rating);
CREATE INDEX idx_mv_hcq_ccn     ON medicosts.mv_hospital_cost_quality (provider_ccn);
CREATE INDEX idx_mv_hcq_state   ON medicosts.mv_hospital_cost_quality (state);
CREATE INDEX idx_mv_hcq_zip     ON medicosts.mv_hospital_cost_quality (zip5);

-- View 2: HCAHPS summary per hospital (pivoted key measures)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_hcahps_summary CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_hcahps_summary AS
SELECT
  facility_id,
  MAX(CASE WHEN hcahps_measure_id = 'H_STAR_RATING'
           THEN patient_survey_star_rating END) AS overall_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_1_STAR_RATING'
           THEN patient_survey_star_rating END) AS nurse_comm_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_2_STAR_RATING'
           THEN patient_survey_star_rating END) AS doctor_comm_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_3_STAR_RATING'
           THEN patient_survey_star_rating END) AS staff_responsive_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_5_STAR_RATING'
           THEN patient_survey_star_rating END) AS medicine_comm_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_6_STAR_RATING'
           THEN patient_survey_star_rating END) AS discharge_info_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_COMP_7_STAR_RATING'
           THEN patient_survey_star_rating END) AS care_transition_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_CLEAN_STAR_RATING'
           THEN patient_survey_star_rating END) AS cleanliness_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_QUIET_STAR_RATING'
           THEN patient_survey_star_rating END) AS quietness_star,
  MAX(CASE WHEN hcahps_measure_id = 'H_RECMND_STAR_RATING'
           THEN patient_survey_star_rating END) AS recommend_star,
  MAX(num_completed_surveys) AS num_surveys
FROM medicosts.hcahps_survey
GROUP BY facility_id;

CREATE UNIQUE INDEX idx_mv_hcahps_fac ON medicosts.mv_hcahps_summary (facility_id);

-- View 3: ZIP summary enriched with demographics
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_zip_enriched CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_zip_enriched AS
SELECT
  zs.zip5,
  zs.state_abbr,
  zs.provider_city,
  zs.drg_cd,
  zs.avg_total_payment,
  zs.avg_covered_charge,
  zs.avg_medicare_payment,
  zs.total_discharges,
  zs.num_providers,
  cz.median_household_income,
  cz.total_population
FROM medicosts.mv_zip_summary zs
LEFT JOIN medicosts.census_zcta cz ON zs.zip5 = cz.zcta;

CREATE INDEX idx_mv_ze_zip   ON medicosts.mv_zip_enriched (zip5);
CREATE INDEX idx_mv_ze_drg   ON medicosts.mv_zip_enriched (drg_cd);
CREATE INDEX idx_mv_ze_state ON medicosts.mv_zip_enriched (state_abbr);
`;

/* ── Phase 2: Quality Command Center views ── */
const PHASE2_VIEWS = `
-- View 4: Hospital quality composite (all quality metrics joined)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_hospital_quality_composite CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_hospital_quality_composite AS
SELECT
  hi.facility_id,
  hi.facility_name,
  hi.city,
  hi.state,
  hi.zip_code,
  hi.hospital_type,
  hi.hospital_ownership,
  hi.hospital_overall_rating AS star_rating,
  -- HAI scores (SIR values, lower = better)
  MAX(CASE WHEN hai.measure_id = 'HAI_1_SIR' THEN hai.score END) AS clabsi_sir,
  MAX(CASE WHEN hai.measure_id = 'HAI_2_SIR' THEN hai.score END) AS cauti_sir,
  MAX(CASE WHEN hai.measure_id = 'HAI_3_SIR' THEN hai.score END) AS ssi_colon_sir,
  MAX(CASE WHEN hai.measure_id = 'HAI_5_SIR' THEN hai.score END) AS mrsa_sir,
  MAX(CASE WHEN hai.measure_id = 'HAI_6_SIR' THEN hai.score END) AS cdi_sir,
  -- HAI national comparison
  MAX(CASE WHEN hai.measure_id = 'HAI_1_SIR' THEN hai.compared_to_national END) AS clabsi_vs_national,
  MAX(CASE WHEN hai.measure_id = 'HAI_2_SIR' THEN hai.compared_to_national END) AS cauti_vs_national,
  MAX(CASE WHEN hai.measure_id = 'HAI_6_SIR' THEN hai.compared_to_national END) AS cdi_vs_national,
  -- PSI-90 (wide-format table — one row per hospital)
  psi.psi_90_value AS psi_90_score,
  psi.total_hac_score,
  psi.payment_reduction AS hac_payment_reduction,
  -- Readmission rates (HRRP: excess_readmission_ratio)
  AVG(readm.excess_readmission_ratio)::numeric(6,4) AS avg_excess_readm_ratio,
  COUNT(readm.measure_name) FILTER (WHERE readm.excess_readmission_ratio > 1)::int AS readm_penalized_count,
  -- Mortality rates
  AVG(cd.score) FILTER (WHERE cd.measure_id LIKE 'MORT_%')::numeric(6,3) AS avg_mortality_rate,
  COUNT(cd.measure_id) FILTER (WHERE cd.measure_id LIKE 'MORT_%' AND cd.compared_to_national ILIKE '%worse%')::int AS mortality_worse_count,
  -- ED wait times (cast text score to numeric where possible)
  MAX(CASE WHEN tec.measure_id = 'ED_1b' THEN tec.score END) AS ed_time_admit,
  MAX(CASE WHEN tec.measure_id = 'ED_2b' THEN tec.score END) AS ed_time_decision,
  MAX(CASE WHEN tec.measure_id = 'OP_18b' THEN tec.score END) AS ed_time_outpatient,
  -- Cost (from existing view)
  hcq.weighted_avg_payment::numeric(14,2),
  hcq.total_discharges
FROM medicosts.hospital_info hi
LEFT JOIN medicosts.nhsn_hai hai ON hi.facility_id = hai.facility_id
LEFT JOIN medicosts.patient_safety_indicators psi ON hi.facility_id = psi.facility_id
LEFT JOIN medicosts.hospital_readmissions readm ON hi.facility_id = readm.facility_id
LEFT JOIN medicosts.complications_deaths cd ON hi.facility_id = cd.facility_id
LEFT JOIN medicosts.timely_effective_care tec ON hi.facility_id = tec.facility_id
LEFT JOIN medicosts.mv_hospital_cost_quality hcq ON hi.facility_id = hcq.provider_ccn
GROUP BY
  hi.facility_id, hi.facility_name, hi.city, hi.state, hi.zip_code,
  hi.hospital_type, hi.hospital_ownership, hi.hospital_overall_rating,
  psi.psi_90_value, psi.total_hac_score, psi.payment_reduction,
  hcq.weighted_avg_payment, hcq.total_discharges;

CREATE UNIQUE INDEX idx_mv_hqc_facility ON medicosts.mv_hospital_quality_composite (facility_id);
CREATE INDEX idx_mv_hqc_state    ON medicosts.mv_hospital_quality_composite (state);
CREATE INDEX idx_mv_hqc_rating   ON medicosts.mv_hospital_quality_composite (star_rating);

-- View 5: State-level quality summary
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_state_quality_summary CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_state_quality_summary AS
SELECT
  state,
  COUNT(*)::int AS num_hospitals,
  AVG(star_rating)::numeric(3,1) AS avg_star_rating,
  AVG(clabsi_sir)::numeric(6,3) AS avg_clabsi_sir,
  AVG(cauti_sir)::numeric(6,3) AS avg_cauti_sir,
  AVG(psi_90_score)::numeric(6,4) AS avg_psi_90,
  AVG(avg_excess_readm_ratio)::numeric(6,4) AS avg_excess_readm_ratio,
  AVG(avg_mortality_rate)::numeric(6,3) AS avg_mortality_rate,
  AVG(weighted_avg_payment)::numeric(14,0) AS avg_payment,
  SUM(total_discharges)::int AS total_discharges
FROM medicosts.mv_hospital_quality_composite
WHERE state IS NOT NULL
GROUP BY state
ORDER BY state;

CREATE UNIQUE INDEX idx_mv_sqs_state ON medicosts.mv_state_quality_summary (state);
`;

/* ── Phase 3: Enrichment views (historical + new datasets) ── */
const PHASE3_VIEWS = `
-- View 6: Hospital episode cost profile (spending by claim type, summarized per hospital)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_hospital_episode_cost CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_hospital_episode_cost AS
SELECT
  sbc.facility_id,
  hi.facility_name,
  hi.state,
  hi.zip_code,
  hi.hospital_overall_rating AS star_rating,
  -- Pre-admission spending
  SUM(CASE WHEN sbc.period LIKE '%Prior%' THEN sbc.avg_spndg_per_ep_hospital ELSE 0 END) AS pre_admission_spend,
  -- During index admission
  SUM(CASE WHEN sbc.period LIKE '%During%' THEN sbc.avg_spndg_per_ep_hospital ELSE 0 END) AS during_admission_spend,
  -- Post-discharge (1-30 days)
  SUM(CASE WHEN sbc.period LIKE '%After%' THEN sbc.avg_spndg_per_ep_hospital ELSE 0 END) AS post_discharge_spend,
  -- Complete episode total
  SUM(CASE WHEN sbc.period LIKE '%Complete%' THEN sbc.avg_spndg_per_ep_hospital ELSE 0 END) AS complete_episode_spend,
  -- National comparison
  SUM(CASE WHEN sbc.period LIKE '%Complete%' THEN sbc.avg_spndg_per_ep_national ELSE 0 END) AS national_episode_spend
FROM medicosts.hospital_spending_by_claim sbc
JOIN medicosts.hospital_info hi ON sbc.facility_id = hi.facility_id
GROUP BY sbc.facility_id, hi.facility_name, hi.state, hi.zip_code, hi.hospital_overall_rating;

CREATE UNIQUE INDEX idx_mv_hec_facility ON medicosts.mv_hospital_episode_cost (facility_id);
CREATE INDEX idx_mv_hec_state ON medicosts.mv_hospital_episode_cost (state);

-- View 7: Enhanced hospital value composite (quality + VBP + MSPB + unplanned visits)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_hospital_value_composite CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_hospital_value_composite AS
SELECT
  hqc.facility_id,
  hqc.facility_name,
  hqc.city,
  hqc.state,
  hqc.zip_code,
  hqc.star_rating,
  hqc.weighted_avg_payment,
  hqc.total_discharges,
  -- Quality metrics from composite
  hqc.clabsi_sir,
  hqc.cauti_sir,
  hqc.psi_90_score,
  hqc.total_hac_score,
  hqc.avg_excess_readm_ratio,
  hqc.avg_mortality_rate,
  -- VBP scores
  vbp.total_performance_score AS vbp_total_score,
  vbp.clinical_outcomes_score_w AS vbp_clinical_score,
  vbp.safety_score_w AS vbp_safety_score,
  vbp.efficiency_score_w AS vbp_efficiency_score,
  vbp.person_engagement_score_w AS vbp_person_score,
  -- MSPB
  spb.mspb_score,
  -- Unplanned visits (pivoted key measures)
  MAX(CASE WHEN uv.measure_id = 'READM_30_HOSP_WIDE' THEN uv.score END) AS readm_30_all_cause,
  MAX(CASE WHEN uv.measure_id = 'EDAC_30_AMI' THEN uv.score END) AS edac_30_ami,
  MAX(CASE WHEN uv.measure_id = 'EDAC_30_HF' THEN uv.score END) AS edac_30_hf,
  MAX(CASE WHEN uv.measure_id = 'EDAC_30_PN' THEN uv.score END) AS edac_30_pn,
  -- Episode cost
  hec.complete_episode_spend,
  hec.national_episode_spend
FROM medicosts.mv_hospital_quality_composite hqc
LEFT JOIN medicosts.hospital_vbp vbp ON hqc.facility_id = vbp.facility_id
LEFT JOIN medicosts.spending_per_beneficiary spb ON hqc.facility_id = spb.facility_id
LEFT JOIN medicosts.unplanned_hospital_visits uv ON hqc.facility_id = uv.facility_id
LEFT JOIN medicosts.mv_hospital_episode_cost hec ON hqc.facility_id = hec.facility_id
GROUP BY
  hqc.facility_id, hqc.facility_name, hqc.city, hqc.state, hqc.zip_code,
  hqc.star_rating, hqc.weighted_avg_payment, hqc.total_discharges,
  hqc.clabsi_sir, hqc.cauti_sir, hqc.psi_90_score, hqc.total_hac_score,
  hqc.avg_excess_readm_ratio, hqc.avg_mortality_rate,
  vbp.total_performance_score, vbp.clinical_outcomes_score_w, vbp.safety_score_w,
  vbp.efficiency_score_w, vbp.person_engagement_score_w,
  spb.mspb_score, hec.complete_episode_spend, hec.national_episode_spend;

CREATE UNIQUE INDEX idx_mv_hvc_facility ON medicosts.mv_hospital_value_composite (facility_id);
CREATE INDEX idx_mv_hvc_state ON medicosts.mv_hospital_value_composite (state);
CREATE INDEX idx_mv_hvc_vbp ON medicosts.mv_hospital_value_composite (vbp_total_score);

-- View 8: Post-acute care landscape (state-level summary of nursing homes, home health, hospice, dialysis)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_post_acute_landscape CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_post_acute_landscape AS
SELECT
  s.state,
  -- Nursing homes
  nh.num_nursing_homes,
  nh.avg_nh_overall_rating,
  nh.avg_nh_health_rating,
  nh.avg_nh_staffing_rating,
  -- Home health
  hh.num_hh_agencies,
  hh.avg_hh_quality_star,
  hh.avg_hh_dtc_rate,
  hh.avg_hh_ppr_rate,
  hh.avg_hh_spend_per_episode,
  -- Dialysis
  dl.num_dialysis_facilities,
  dl.avg_dl_five_star,
  dl.avg_dl_mortality_rate,
  dl.avg_dl_readmission_rate,
  -- IRF
  irf.num_irf_facilities,
  -- LTCH
  ltch.num_ltch_facilities
FROM (SELECT DISTINCT state FROM medicosts.hospital_info WHERE state IS NOT NULL) s
LEFT JOIN (
  SELECT state, COUNT(*)::int AS num_nursing_homes,
    AVG(overall_rating)::NUMERIC(3,1) AS avg_nh_overall_rating,
    AVG(health_inspection_rating)::NUMERIC(3,1) AS avg_nh_health_rating,
    AVG(staffing_rating)::NUMERIC(3,1) AS avg_nh_staffing_rating
  FROM medicosts.nursing_home_info GROUP BY state
) nh ON s.state = nh.state
LEFT JOIN (
  SELECT state, COUNT(*)::int AS num_hh_agencies,
    AVG(quality_star_rating)::NUMERIC(3,1) AS avg_hh_quality_star,
    AVG(dtc_rate)::NUMERIC(8,4) AS avg_hh_dtc_rate,
    AVG(ppr_rate)::NUMERIC(8,4) AS avg_hh_ppr_rate,
    AVG(medicare_spend_per_episode)::NUMERIC(12,2) AS avg_hh_spend_per_episode
  FROM medicosts.home_health_agencies GROUP BY state
) hh ON s.state = hh.state
LEFT JOIN (
  SELECT state, COUNT(*)::int AS num_dialysis_facilities,
    AVG(five_star)::NUMERIC(3,1) AS avg_dl_five_star,
    AVG(mortality_rate)::NUMERIC(8,4) AS avg_dl_mortality_rate,
    AVG(readmission_rate)::NUMERIC(8,4) AS avg_dl_readmission_rate
  FROM medicosts.dialysis_facilities GROUP BY state
) dl ON s.state = dl.state
LEFT JOIN (
  SELECT state, COUNT(*)::int AS num_irf_facilities
  FROM medicosts.irf_info GROUP BY state
) irf ON s.state = irf.state
LEFT JOIN (
  SELECT state, COUNT(*)::int AS num_ltch_facilities
  FROM medicosts.ltch_info GROUP BY state
) ltch ON s.state = ltch.state;

CREATE UNIQUE INDEX idx_mv_pal_state ON medicosts.mv_post_acute_landscape (state);
`;

async function main() {
  console.log('Creating cross-dataset materialized views …');
  const client = await pool.connect();

  try {
    await client.query(VIEWS);

    // Phase 2 quality views (only if tables exist)
    const phase2Tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'medicosts' AND tablename = 'nhsn_hai'
    `);
    if (phase2Tables.rows.length > 0) {
      console.log('Creating Phase 2 quality composite views …');
      await client.query(PHASE2_VIEWS);

      const hqc = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hospital_quality_composite');
      console.log(`  mv_hospital_quality_composite: ${parseInt(hqc.rows[0].n).toLocaleString()} hospitals`);

      const sqs = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_state_quality_summary');
      console.log(`  mv_state_quality_summary: ${parseInt(sqs.rows[0].n).toLocaleString()} states`);
    } else {
      console.log('Phase 2 quality tables not loaded yet — skipping composite views.');
    }

    // Phase 3 enrichment views (only if new tables exist)
    const phase3Tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'medicosts' AND tablename = 'hospital_spending_by_claim'
    `);
    if (phase3Tables.rows.length > 0) {
      console.log('Creating Phase 3 enrichment views …');
      await client.query(PHASE3_VIEWS);

      const hec = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hospital_episode_cost');
      console.log(`  mv_hospital_episode_cost: ${parseInt(hec.rows[0].n).toLocaleString()} hospitals`);

      const hvc = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hospital_value_composite');
      console.log(`  mv_hospital_value_composite: ${parseInt(hvc.rows[0].n).toLocaleString()} hospitals`);

      const pal = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_post_acute_landscape');
      console.log(`  mv_post_acute_landscape: ${parseInt(pal.rows[0].n).toLocaleString()} states`);
    } else {
      console.log('Phase 3 enrichment tables not loaded yet — skipping.');
    }

    // Verify base views
    const hcq = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hospital_cost_quality');
    console.log(`  mv_hospital_cost_quality: ${parseInt(hcq.rows[0].n).toLocaleString()} hospitals`);

    const hcahps = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hcahps_summary');
    console.log(`  mv_hcahps_summary: ${parseInt(hcahps.rows[0].n).toLocaleString()} hospitals`);

    const ze = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_zip_enriched');
    console.log(`  mv_zip_enriched: ${parseInt(ze.rows[0].n).toLocaleString()} rows`);

    // Sample cost vs quality
    const sample = await client.query(`
      SELECT star_rating, COUNT(*)::int AS hospitals,
        AVG(weighted_avg_payment)::int AS avg_payment
      FROM medicosts.mv_hospital_cost_quality
      GROUP BY star_rating ORDER BY star_rating
    `);
    console.log('\nCost vs Quality summary:');
    sample.rows.forEach((r) =>
      console.log(`    ${r.star_rating} stars: ${r.hospitals} hospitals, avg payment $${r.avg_payment?.toLocaleString()}`)
    );

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
