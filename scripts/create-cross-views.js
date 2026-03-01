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

async function main() {
  console.log('Creating cross-dataset materialized views …');
  const client = await pool.connect();

  try {
    await client.query(VIEWS);

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
