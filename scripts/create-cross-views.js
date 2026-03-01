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
      console.log(`✓ mv_hospital_quality_composite: ${parseInt(hqc.rows[0].n).toLocaleString()} hospitals`);

      const sqs = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_state_quality_summary');
      console.log(`✓ mv_state_quality_summary: ${parseInt(sqs.rows[0].n).toLocaleString()} states`);
    } else {
      console.log('⊘ Phase 2 quality tables not loaded yet — skipping composite views.');
    }

    // Verify
    const hcq = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hospital_cost_quality');
    console.log(`✓ mv_hospital_cost_quality: ${parseInt(hcq.rows[0].n).toLocaleString()} hospitals`);

    const hcahps = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_hcahps_summary');
    console.log(`✓ mv_hcahps_summary: ${parseInt(hcahps.rows[0].n).toLocaleString()} hospitals`);

    const ze = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_zip_enriched');
    console.log(`✓ mv_zip_enriched: ${parseInt(ze.rows[0].n).toLocaleString()} rows`);

    // Sample cost vs quality
    const sample = await client.query(`
      SELECT star_rating, COUNT(*)::int AS hospitals,
        AVG(weighted_avg_payment)::int AS avg_payment
      FROM medicosts.mv_hospital_cost_quality
      GROUP BY star_rating ORDER BY star_rating
    `);
    console.log('\n✓ Cost vs Quality summary:');
    sample.rows.forEach((r) =>
      console.log(`    ${r.star_rating} stars: ${r.hospitals} hospitals, avg payment $${r.avg_payment?.toLocaleString()}`)
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
