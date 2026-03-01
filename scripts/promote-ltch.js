#!/usr/bin/env node
/**
 * promote-ltch.js
 * Promotes stage long-term care hospital data → medicosts.ltch_info + ltch_measures
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
    /* ── ltch_info (general information — ~319 rows) ── */
    console.log('Creating medicosts.ltch_info …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.ltch_info CASCADE;
      CREATE TABLE medicosts.ltch_info (
        id               SERIAL PRIMARY KEY,
        provider_ccn     VARCHAR(10) NOT NULL,
        provider_name    TEXT NOT NULL,
        address          TEXT,
        city             TEXT,
        state            VARCHAR(2) NOT NULL,
        zip_code         VARCHAR(5),
        county           TEXT,
        phone            TEXT
      );
    `);

    let result = await client.query(`
      INSERT INTO medicosts.ltch_info
        (provider_ccn, provider_name, address, city, state, zip_code, county, phone)
      SELECT
        cms_certification_number_ccn,
        provider_name,
        address_line_1,
        city_town,
        state,
        LEFT(zip_code, 5),
        county_parish,
        telephone_number
      FROM stage.long_term_care_hospitals__long_term_care_hospital_gener_bf8c938
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  ltch_info: ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE UNIQUE INDEX idx_ltch_info_ccn   ON medicosts.ltch_info (provider_ccn);
      CREATE INDEX idx_ltch_info_state        ON medicosts.ltch_info (state);
      CREATE INDEX idx_ltch_info_zip          ON medicosts.ltch_info (zip_code);
    `);

    /* ── ltch_measures (provider-level quality measures — ~24K rows) ── */
    console.log('Creating medicosts.ltch_measures …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.ltch_measures CASCADE;
      CREATE TABLE medicosts.ltch_measures (
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
      INSERT INTO medicosts.ltch_measures
        (provider_ccn, measure_code, score, footnote, start_date, end_date)
      SELECT
        cms_certification_number_ccn,
        measure_code,
        CASE WHEN REPLACE(score, ',', '') ~ '^\-?[0-9]+\.?[0-9]*$' THEN REPLACE(score, ',', '')::NUMERIC(14,4) ELSE NULL END,
        footnote,
        start_date,
        end_date
      FROM stage.long_term_care_hospitals__long_term_care_hospital_provider_data
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  ltch_measures: ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE INDEX idx_ltch_meas_ccn     ON medicosts.ltch_measures (provider_ccn);
      CREATE INDEX idx_ltch_meas_code    ON medicosts.ltch_measures (measure_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
