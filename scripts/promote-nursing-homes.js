#!/usr/bin/env node
/**
 * promote-nursing-homes.js
 * Promotes stage nursing home tables → medicosts.nursing_home_info + medicosts.nursing_home_quality
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const pool = new pg.Pool();

async function main() {
  const client = await pool.connect();
  try {
    // --- Provider Information ---
    console.log('Creating medicosts.nursing_home_info …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.nursing_home_info CASCADE;
      CREATE TABLE medicosts.nursing_home_info (
        id                        SERIAL PRIMARY KEY,
        provider_ccn              VARCHAR(10) NOT NULL,
        provider_name             TEXT NOT NULL,
        city                      TEXT,
        state                     VARCHAR(2) NOT NULL,
        zip_code                  VARCHAR(5),
        county                    TEXT,
        ownership_type            TEXT,
        number_of_beds            INTEGER,
        avg_residents_per_day     NUMERIC(8,1),
        provider_type             TEXT,
        in_hospital               BOOLEAN,
        overall_rating            SMALLINT,
        health_inspection_rating  SMALLINT,
        qm_rating                SMALLINT,
        staffing_rating           SMALLINT,
        rn_hours_per_resident     NUMERIC(6,2),
        total_nurse_hours_per_res NUMERIC(6,2),
        rn_turnover               NUMERIC(6,2),
        total_nurse_turnover      NUMERIC(6,2),
        number_of_fines           INTEGER,
        total_fines_dollars       NUMERIC(12,2),
        total_penalties           INTEGER,
        latitude                  NUMERIC(10,6),
        longitude                 NUMERIC(10,6)
      );
    `);

    console.log('Inserting nursing home info from stage …');
    const r1 = await client.query(`
      INSERT INTO medicosts.nursing_home_info
        (provider_ccn, provider_name, city, state, zip_code, county,
         ownership_type, number_of_beds, avg_residents_per_day, provider_type, in_hospital,
         overall_rating, health_inspection_rating, qm_rating, staffing_rating,
         rn_hours_per_resident, total_nurse_hours_per_res,
         rn_turnover, total_nurse_turnover,
         number_of_fines, total_fines_dollars, total_penalties,
         latitude, longitude)
      SELECT
        cms_certification_number_ccn,
        provider_name,
        city_town,
        state,
        LEFT(zip_code, 5),
        county_parish,
        ownership_type,
        CASE WHEN number_of_certified_beds ~ '^[0-9]+$' THEN number_of_certified_beds::INTEGER ELSE NULL END,
        CASE WHEN average_number_of_residents_per_day ~ '^\-?[0-9]+\.?[0-9]*$' THEN average_number_of_residents_per_day::NUMERIC(8,1) ELSE NULL END,
        provider_type,
        CASE WHEN LOWER(provider_resides_in_hospital) IN ('y', 'yes', 'true') THEN true
             WHEN LOWER(provider_resides_in_hospital) IN ('n', 'no', 'false') THEN false
             ELSE NULL END,
        CASE WHEN overall_rating ~ '^[0-9]+$' THEN overall_rating::SMALLINT ELSE NULL END,
        CASE WHEN health_inspection_rating ~ '^[0-9]+$' THEN health_inspection_rating::SMALLINT ELSE NULL END,
        CASE WHEN qm_rating ~ '^[0-9]+$' THEN qm_rating::SMALLINT ELSE NULL END,
        CASE WHEN staffing_rating ~ '^[0-9]+$' THEN staffing_rating::SMALLINT ELSE NULL END,
        CASE WHEN reported_rn_staffing_hours_per_resident_per_day ~ '^\-?[0-9]+\.?[0-9]*$' THEN reported_rn_staffing_hours_per_resident_per_day::NUMERIC(6,2) ELSE NULL END,
        CASE WHEN reported_total_nurse_staffing_hours_per_resident_per_day ~ '^\-?[0-9]+\.?[0-9]*$' THEN reported_total_nurse_staffing_hours_per_resident_per_day::NUMERIC(6,2) ELSE NULL END,
        CASE WHEN registered_nurse_turnover ~ '^\-?[0-9]+\.?[0-9]*$' THEN registered_nurse_turnover::NUMERIC(6,2) ELSE NULL END,
        CASE WHEN total_nursing_staff_turnover ~ '^\-?[0-9]+\.?[0-9]*$' THEN total_nursing_staff_turnover::NUMERIC(6,2) ELSE NULL END,
        CASE WHEN number_of_fines ~ '^[0-9]+$' THEN number_of_fines::INTEGER ELSE NULL END,
        CASE WHEN total_amount_of_fines_in_dollars ~ '^\-?[0-9]+\.?[0-9]*$' THEN total_amount_of_fines_in_dollars::NUMERIC(12,2) ELSE NULL END,
        CASE WHEN total_number_of_penalties ~ '^[0-9]+$' THEN total_number_of_penalties::INTEGER ELSE NULL END,
        CASE WHEN latitude ~ '^\-?[0-9]+\.?[0-9]*$' THEN latitude::NUMERIC(10,6) ELSE NULL END,
        CASE WHEN longitude ~ '^\-?[0-9]+\.?[0-9]*$' THEN longitude::NUMERIC(10,6) ELSE NULL END
      FROM stage.nursing_homes_including_rehab_services__provider_information
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  Inserted ${r1.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE UNIQUE INDEX idx_nhi_ccn   ON medicosts.nursing_home_info (provider_ccn);
      CREATE INDEX idx_nhi_state        ON medicosts.nursing_home_info (state);
      CREATE INDEX idx_nhi_rating       ON medicosts.nursing_home_info (overall_rating);
      CREATE INDEX idx_nhi_zip          ON medicosts.nursing_home_info (zip_code);
    `);

    // --- MDS Quality Measures ---
    console.log('Creating medicosts.nursing_home_quality …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.nursing_home_quality CASCADE;
      CREATE TABLE medicosts.nursing_home_quality (
        id                    SERIAL PRIMARY KEY,
        provider_ccn          VARCHAR(10) NOT NULL,
        state                 VARCHAR(2),
        measure_code          VARCHAR(30) NOT NULL,
        measure_description   TEXT,
        resident_type         TEXT,
        q1_score              NUMERIC(8,2),
        q2_score              NUMERIC(8,2),
        q3_score              NUMERIC(8,2),
        q4_score              NUMERIC(8,2),
        four_quarter_avg      NUMERIC(8,2)
      );
    `);

    console.log('Inserting nursing home quality from stage …');
    const r2 = await client.query(`
      INSERT INTO medicosts.nursing_home_quality
        (provider_ccn, state, measure_code, measure_description, resident_type,
         q1_score, q2_score, q3_score, q4_score, four_quarter_avg)
      SELECT
        cms_certification_number_ccn,
        state,
        measure_code,
        measure_description,
        resident_type,
        CASE WHEN q1_measure_score ~ '^\-?[0-9]+\.?[0-9]*$' THEN q1_measure_score::NUMERIC(8,2) ELSE NULL END,
        CASE WHEN q2_measure_score ~ '^\-?[0-9]+\.?[0-9]*$' THEN q2_measure_score::NUMERIC(8,2) ELSE NULL END,
        CASE WHEN q3_measure_score ~ '^\-?[0-9]+\.?[0-9]*$' THEN q3_measure_score::NUMERIC(8,2) ELSE NULL END,
        CASE WHEN q4_measure_score ~ '^\-?[0-9]+\.?[0-9]*$' THEN q4_measure_score::NUMERIC(8,2) ELSE NULL END,
        CASE WHEN four_quarter_average_score ~ '^\-?[0-9]+\.?[0-9]*$' THEN four_quarter_average_score::NUMERIC(8,2) ELSE NULL END
      FROM stage.nursing_homes_including_rehab_services__mds_quality_measures
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  Inserted ${r2.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE INDEX idx_nhq_ccn     ON medicosts.nursing_home_quality (provider_ccn);
      CREATE INDEX idx_nhq_measure ON medicosts.nursing_home_quality (measure_code);
      CREATE INDEX idx_nhq_state   ON medicosts.nursing_home_quality (state);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
