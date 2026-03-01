#!/usr/bin/env node
/**
 * promote-hospice.js
 * Promotes stage hospice provider data → medicosts.hospice_providers
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
    console.log('Creating medicosts.hospice_providers …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.hospice_providers CASCADE;
      CREATE TABLE medicosts.hospice_providers (
        id              SERIAL PRIMARY KEY,
        provider_ccn    VARCHAR(10) NOT NULL,
        facility_name   TEXT NOT NULL,
        city            TEXT,
        state           VARCHAR(2) NOT NULL,
        zip_code        VARCHAR(5),
        county          TEXT,
        measure_code    VARCHAR(50) NOT NULL,
        measure_name    TEXT,
        score           NUMERIC(14,4)
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.hospice_providers
        (provider_ccn, facility_name, city, state, zip_code, county,
         measure_code, measure_name, score)
      SELECT
        cms_certification_number_ccn,
        facility_name,
        city_town,
        state,
        LEFT(zip_code, 5),
        county_parish,
        measure_code,
        measure_name,
        CASE WHEN REPLACE(score, ',', '') ~ '^\-?[0-9]+\.?[0-9]*$' THEN REPLACE(score, ',', '')::NUMERIC(14,4) ELSE NULL END
      FROM stage.hospice_care__hospice_provider_data
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE INDEX idx_hp_ccn     ON medicosts.hospice_providers (provider_ccn);
      CREATE INDEX idx_hp_state   ON medicosts.hospice_providers (state);
      CREATE INDEX idx_hp_measure ON medicosts.hospice_providers (measure_code);
      CREATE INDEX idx_hp_zip     ON medicosts.hospice_providers (zip_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
