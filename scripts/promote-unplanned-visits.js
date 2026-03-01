#!/usr/bin/env node
/**
 * promote-unplanned-visits.js
 * Promotes stage.hospitals__unplanned_hospital_visits_hospital → medicosts.unplanned_hospital_visits
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
    console.log('Creating medicosts.unplanned_hospital_visits …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.unplanned_hospital_visits CASCADE;
      CREATE TABLE medicosts.unplanned_hospital_visits (
        id                     SERIAL PRIMARY KEY,
        facility_id            VARCHAR(10) NOT NULL,
        facility_name          TEXT NOT NULL,
        state                  VARCHAR(2) NOT NULL,
        zip_code               VARCHAR(5),
        measure_id             VARCHAR(30) NOT NULL,
        measure_name           TEXT,
        compared_to_national   TEXT,
        denominator            INTEGER,
        score                  NUMERIC(10,2),
        lower_estimate         NUMERIC(10,2),
        higher_estimate        NUMERIC(10,2),
        num_patients           INTEGER,
        num_patients_returned  INTEGER
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.unplanned_hospital_visits
        (facility_id, facility_name, state, zip_code, measure_id, measure_name,
         compared_to_national, denominator, score, lower_estimate, higher_estimate,
         num_patients, num_patients_returned)
      SELECT
        facility_id,
        facility_name,
        state,
        zip_code,
        measure_id,
        measure_name,
        compared_to_national,
        CASE WHEN denominator ~ '^\-?[0-9]+\.?[0-9]*$' THEN denominator::INTEGER ELSE NULL END,
        CASE WHEN score ~ '^\-?[0-9]+\.?[0-9]*$' THEN score::NUMERIC(10,2) ELSE NULL END,
        CASE WHEN lower_estimate ~ '^\-?[0-9]+\.?[0-9]*$' THEN lower_estimate::NUMERIC(10,2) ELSE NULL END,
        CASE WHEN higher_estimate ~ '^\-?[0-9]+\.?[0-9]*$' THEN higher_estimate::NUMERIC(10,2) ELSE NULL END,
        CASE WHEN number_of_patients ~ '^\-?[0-9]+\.?[0-9]*$' THEN number_of_patients::INTEGER ELSE NULL END,
        CASE WHEN number_of_patients_returned ~ '^\-?[0-9]+\.?[0-9]*$' THEN number_of_patients_returned::INTEGER ELSE NULL END
      FROM stage.hospitals__unplanned_hospital_visits_hospital
      WHERE facility_id IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    console.log('Creating indexes …');
    await client.query(`
      CREATE INDEX idx_uhv_facility ON medicosts.unplanned_hospital_visits (facility_id);
      CREATE INDEX idx_uhv_measure  ON medicosts.unplanned_hospital_visits (measure_id);
      CREATE INDEX idx_uhv_state    ON medicosts.unplanned_hospital_visits (state);
      CREATE INDEX idx_uhv_fac_meas ON medicosts.unplanned_hospital_visits (facility_id, measure_id);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
