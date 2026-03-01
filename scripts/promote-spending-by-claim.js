#!/usr/bin/env node
/**
 * promote-spending-by-claim.js
 * Promotes stage.hospitals__medicare_hospital_spending_by_claim → medicosts.hospital_spending_by_claim
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
    console.log('Creating medicosts.hospital_spending_by_claim …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.hospital_spending_by_claim CASCADE;
      CREATE TABLE medicosts.hospital_spending_by_claim (
        id                        SERIAL PRIMARY KEY,
        facility_id               VARCHAR(10) NOT NULL,
        facility_name             TEXT NOT NULL,
        state                     VARCHAR(2) NOT NULL,
        period                    TEXT NOT NULL,
        claim_type                TEXT NOT NULL,
        avg_spndg_per_ep_hospital NUMERIC(12,2),
        avg_spndg_per_ep_state    NUMERIC(12,2),
        avg_spndg_per_ep_national NUMERIC(12,2),
        pct_spndg_hospital        NUMERIC(8,4),
        pct_spndg_state           NUMERIC(8,4),
        pct_spndg_national        NUMERIC(8,4)
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.hospital_spending_by_claim
        (facility_id, facility_name, state, period, claim_type,
         avg_spndg_per_ep_hospital, avg_spndg_per_ep_state, avg_spndg_per_ep_national,
         pct_spndg_hospital, pct_spndg_state, pct_spndg_national)
      SELECT
        facility_id,
        facility_name,
        state,
        period,
        claim_type,
        NULLIF(avg_spndg_per_ep_hospital, '')::NUMERIC(12,2),
        NULLIF(avg_spndg_per_ep_state, '')::NUMERIC(12,2),
        NULLIF(avg_spndg_per_ep_national, '')::NUMERIC(12,2),
        NULLIF(REPLACE(percent_of_spndg_hospital, '%', ''), '')::NUMERIC(8,4),
        NULLIF(REPLACE(percent_of_spndg_state, '%', ''), '')::NUMERIC(8,4),
        NULLIF(REPLACE(percent_of_spndg_national, '%', ''), '')::NUMERIC(8,4)
      FROM stage.hospitals__medicare_hospital_spending_by_claim
      WHERE facility_id IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    console.log('Creating indexes …');
    await client.query(`
      CREATE INDEX idx_sbc_facility ON medicosts.hospital_spending_by_claim (facility_id);
      CREATE INDEX idx_sbc_state    ON medicosts.hospital_spending_by_claim (state);
      CREATE INDEX idx_sbc_claim    ON medicosts.hospital_spending_by_claim (facility_id, claim_type, period);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
