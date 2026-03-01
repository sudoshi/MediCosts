#!/usr/bin/env node
/**
 * promote-irf.js
 * Promotes stage inpatient rehabilitation facility data → medicosts.irf_info + irf_measures
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
    /* ── irf_info (general information — 1,221 rows) ── */
    console.log('Creating medicosts.irf_info …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.irf_info CASCADE;
      CREATE TABLE medicosts.irf_info (
        id               SERIAL PRIMARY KEY,
        provider_ccn     VARCHAR(10) NOT NULL,
        provider_name    TEXT NOT NULL,
        address          TEXT,
        city             TEXT,
        state            VARCHAR(2) NOT NULL,
        zip_code         VARCHAR(5),
        county           TEXT,
        phone            TEXT,
        ownership_type   TEXT,
        certification_date TEXT
      );
    `);

    let result = await client.query(`
      INSERT INTO medicosts.irf_info
        (provider_ccn, provider_name, address, city, state, zip_code, county,
         phone, ownership_type, certification_date)
      SELECT
        cms_certification_number_ccn,
        provider_name,
        address_line_1,
        city_town,
        state,
        LEFT(zip_code, 5),
        county_parish,
        telephone_number,
        ownership_type,
        certification_date
      FROM stage.inpatient_rehabilitation_facilities__inpatient_rehabili_12f3726
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  irf_info: ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE UNIQUE INDEX idx_irf_info_ccn   ON medicosts.irf_info (provider_ccn);
      CREATE INDEX idx_irf_info_state        ON medicosts.irf_info (state);
      CREATE INDEX idx_irf_info_zip          ON medicosts.irf_info (zip_code);
    `);

    /* ── irf_measures (provider-level quality measures — ~79K rows) ── */
    console.log('Creating medicosts.irf_measures …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.irf_measures CASCADE;
      CREATE TABLE medicosts.irf_measures (
        id               SERIAL PRIMARY KEY,
        provider_ccn     VARCHAR(10) NOT NULL,
        measure_code     VARCHAR(100),
        score            NUMERIC(14,4),
        footnote         TEXT,
        start_date       TEXT,
        end_date         TEXT
      );
    `);

    result = await client.query(`
      INSERT INTO medicosts.irf_measures
        (provider_ccn, measure_code, score, footnote, start_date, end_date)
      SELECT
        cms_certification_number_ccn,
        measure_code,
        CASE WHEN REPLACE(score, ',', '') ~ '^\-?[0-9]+\.?[0-9]*$' THEN REPLACE(score, ',', '')::NUMERIC(14,4) ELSE NULL END,
        footnote,
        start_date,
        end_date
      FROM stage.inpatient_rehabilitation_facilities__inpatient_rehabili_00e3f3d
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  irf_measures: ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE INDEX idx_irf_meas_ccn     ON medicosts.irf_measures (provider_ccn);
      CREATE INDEX idx_irf_meas_code    ON medicosts.irf_measures (measure_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
