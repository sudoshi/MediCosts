#!/usr/bin/env node
/**
 * promote-spending-per-beneficiary.js
 * Promotes stage.hospitals__medicare_spending_per_beneficiary_hospital → medicosts.spending_per_beneficiary
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
    console.log('Creating medicosts.spending_per_beneficiary …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.spending_per_beneficiary CASCADE;
      CREATE TABLE medicosts.spending_per_beneficiary (
        id              SERIAL PRIMARY KEY,
        facility_id     VARCHAR(10) NOT NULL,
        facility_name   TEXT NOT NULL,
        state           VARCHAR(2) NOT NULL,
        zip_code        VARCHAR(5),
        county          TEXT,
        mspb_score      NUMERIC(6,4)
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.spending_per_beneficiary
        (facility_id, facility_name, state, zip_code, county, mspb_score)
      SELECT
        facility_id,
        facility_name,
        state,
        zip_code,
        county_parish,
        CASE WHEN score ~ '^\-?[0-9]+\.?[0-9]*$' THEN score::NUMERIC(6,4) ELSE NULL END
      FROM stage.hospitals__medicare_spending_per_beneficiary_hospital
      WHERE facility_id IS NOT NULL AND measure_id = 'MSPB-1'
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    console.log('Creating indexes …');
    await client.query(`
      CREATE UNIQUE INDEX idx_spb_facility ON medicosts.spending_per_beneficiary (facility_id);
      CREATE INDEX idx_spb_state ON medicosts.spending_per_beneficiary (state);
      CREATE INDEX idx_spb_score ON medicosts.spending_per_beneficiary (mspb_score);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
