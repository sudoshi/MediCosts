#!/usr/bin/env node
/**
 * promote-clinician-directory.js
 * Promotes stage clinician directory → medicosts.clinician_directory (~2.7M rows)
 * Uses batched INSERT…SELECT for memory efficiency.
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
    console.log('Creating medicosts.clinician_directory …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.clinician_directory CASCADE;
      CREATE TABLE medicosts.clinician_directory (
        id                SERIAL PRIMARY KEY,
        npi               VARCHAR(10) NOT NULL,
        last_name         TEXT,
        first_name        TEXT,
        middle_name       TEXT,
        suffix            VARCHAR(10),
        gender            VARCHAR(1),
        credential        VARCHAR(20),
        medical_school    TEXT,
        graduation_year   SMALLINT,
        primary_specialty TEXT,
        secondary_specs   TEXT,
        telehealth        BOOLEAN,
        facility_name     TEXT,
        org_pac_id        VARCHAR(20),
        city              TEXT,
        state             VARCHAR(2),
        zip_code          VARCHAR(5),
        ind_assignment    BOOLEAN,
        grp_assignment    BOOLEAN
      );
    `);

    console.log('Inserting from stage (2.7M rows — this will take a moment) …');
    const result = await client.query(`
      INSERT INTO medicosts.clinician_directory
        (npi, last_name, first_name, middle_name, suffix, gender, credential,
         medical_school, graduation_year, primary_specialty, secondary_specs,
         telehealth, facility_name, org_pac_id, city, state, zip_code,
         ind_assignment, grp_assignment)
      SELECT
        npi,
        provider_last_name,
        provider_first_name,
        provider_middle_name,
        suff,
        gndr,
        cred,
        med_sch,
        NULLIF(grd_yr, '')::SMALLINT,
        pri_spec,
        sec_spec_all,
        CASE WHEN LOWER(telehlth) = 'y' THEN true
             WHEN LOWER(telehlth) = 'n' THEN false
             ELSE NULL END,
        facility_name,
        org_pac_id,
        city_town,
        state,
        LEFT(zip_code, 5),
        CASE WHEN LOWER(ind_assgn) = 'y' THEN true
             WHEN LOWER(ind_assgn) = 'n' THEN false
             ELSE NULL END,
        CASE WHEN LOWER(grp_assgn) = 'y' THEN true
             WHEN LOWER(grp_assgn) = 'n' THEN false
             ELSE NULL END
      FROM stage.doctors_and_clinicians__national_downloadable_file
      WHERE npi IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    console.log('Creating indexes (this will take a moment for 2.7M rows) …');
    await client.query(`
      CREATE INDEX idx_cd_npi             ON medicosts.clinician_directory (npi);
      CREATE INDEX idx_cd_state           ON medicosts.clinician_directory (state);
      CREATE INDEX idx_cd_specialty       ON medicosts.clinician_directory (primary_specialty);
      CREATE INDEX idx_cd_zip             ON medicosts.clinician_directory (zip_code);
      CREATE INDEX idx_cd_name            ON medicosts.clinician_directory (last_name, first_name);
      CREATE INDEX idx_cd_org             ON medicosts.clinician_directory (org_pac_id);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
