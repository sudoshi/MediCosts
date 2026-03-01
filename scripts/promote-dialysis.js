#!/usr/bin/env node
/**
 * promote-dialysis.js
 * Promotes stage dialysis facility data → medicosts.dialysis_facilities
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
    console.log('Creating medicosts.dialysis_facilities …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.dialysis_facilities CASCADE;
      CREATE TABLE medicosts.dialysis_facilities (
        id                       SERIAL PRIMARY KEY,
        provider_ccn             VARCHAR(10) NOT NULL,
        facility_name            TEXT NOT NULL,
        city                     TEXT,
        state                    VARCHAR(2) NOT NULL,
        zip_code                 VARCHAR(5),
        county                   TEXT,
        profit_status            TEXT,
        chain_owned              TEXT,
        chain_organization       TEXT,
        num_stations             INTEGER,
        five_star                SMALLINT,
        -- Mortality
        mortality_rate           NUMERIC(8,4),
        mortality_rate_upper     NUMERIC(8,4),
        mortality_rate_lower     NUMERIC(8,4),
        survival_category        TEXT,
        -- Hospitalization
        hospitalization_rate          NUMERIC(8,4),
        hospitalization_rate_upper    NUMERIC(8,4),
        hospitalization_rate_lower    NUMERIC(8,4),
        hospitalization_category      TEXT,
        -- Readmission
        readmission_rate              NUMERIC(8,4),
        readmission_rate_upper        NUMERIC(8,4),
        readmission_rate_lower        NUMERIC(8,4),
        readmission_category          TEXT,
        -- Transfusion
        transfusion_rate              NUMERIC(8,4),
        transfusion_rate_upper        NUMERIC(8,4),
        transfusion_rate_lower        NUMERIC(8,4),
        transfusion_category          TEXT,
        -- ED visits
        ed_visit_ratio                NUMERIC(8,4),
        ed_visit_ratio_upper          NUMERIC(8,4),
        ed_visit_ratio_lower          NUMERIC(8,4),
        ed_visit_category             TEXT
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.dialysis_facilities
        (provider_ccn, facility_name, city, state, zip_code, county,
         profit_status, chain_owned, chain_organization, num_stations, five_star,
         mortality_rate, mortality_rate_upper, mortality_rate_lower, survival_category,
         hospitalization_rate, hospitalization_rate_upper, hospitalization_rate_lower, hospitalization_category,
         readmission_rate, readmission_rate_upper, readmission_rate_lower, readmission_category,
         transfusion_rate, transfusion_rate_upper, transfusion_rate_lower, transfusion_category,
         ed_visit_ratio, ed_visit_ratio_upper, ed_visit_ratio_lower, ed_visit_category)
      SELECT
        cms_certification_number_ccn,
        facility_name,
        city_town,
        state,
        LEFT(zip_code, 5),
        county_parish,
        profit_or_non_profit,
        chain_owned,
        chain_organization,
        CASE WHEN of_dialysis_stations ~ '^[0-9]+$' THEN of_dialysis_stations::INTEGER ELSE NULL END,
        CASE WHEN five_star ~ '^[0-9]+$' THEN five_star::SMALLINT ELSE NULL END,
        CASE WHEN mortality_rate_facility ~ '^\-?[0-9]+\.?[0-9]*$' THEN mortality_rate_facility::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN mortality_rate_upper_confidence_limit_97_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN mortality_rate_upper_confidence_limit_97_5::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN mortality_rate_lower_confidence_limit_2_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN mortality_rate_lower_confidence_limit_2_5::NUMERIC(8,4) ELSE NULL END,
        patient_survival_category_text,
        CASE WHEN hospitalization_rate_facility ~ '^\-?[0-9]+\.?[0-9]*$' THEN hospitalization_rate_facility::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN hospitalization_rate_upper_confidence_limit_97_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN hospitalization_rate_upper_confidence_limit_97_5::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN hospitalization_rate_lower_confidence_limit_2_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN hospitalization_rate_lower_confidence_limit_2_5::NUMERIC(8,4) ELSE NULL END,
        patient_hospitalization_category_text,
        CASE WHEN readmission_rate_facility ~ '^\-?[0-9]+\.?[0-9]*$' THEN readmission_rate_facility::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN readmission_rate_upper_confidence_limit_97_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN readmission_rate_upper_confidence_limit_97_5::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN readmission_rate_lower_confidence_limit_2_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN readmission_rate_lower_confidence_limit_2_5::NUMERIC(8,4) ELSE NULL END,
        patient_hospital_readmission_category,
        CASE WHEN transfusion_rate_facility ~ '^\-?[0-9]+\.?[0-9]*$' THEN transfusion_rate_facility::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN transfusion_rate_upper_confidence_limit_97_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN transfusion_rate_upper_confidence_limit_97_5::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN transfusion_rate_lower_confidence_limit_2_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN transfusion_rate_lower_confidence_limit_2_5::NUMERIC(8,4) ELSE NULL END,
        patient_transfusion_category_text,
        CASE WHEN standardized_ed_visits_ratio_facility ~ '^\-?[0-9]+\.?[0-9]*$' THEN standardized_ed_visits_ratio_facility::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN sedr_upper_confidence_limit_97_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN sedr_upper_confidence_limit_97_5::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN sedr_lower_confidence_limit_2_5 ~ '^\-?[0-9]+\.?[0-9]*$' THEN sedr_lower_confidence_limit_2_5::NUMERIC(8,4) ELSE NULL END,
        sedr_category_text
      FROM stage.dialysis_facilities__dialysis_facility_listing_by_facility
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE UNIQUE INDEX idx_df_ccn   ON medicosts.dialysis_facilities (provider_ccn);
      CREATE INDEX idx_df_state        ON medicosts.dialysis_facilities (state);
      CREATE INDEX idx_df_star         ON medicosts.dialysis_facilities (five_star);
      CREATE INDEX idx_df_zip          ON medicosts.dialysis_facilities (zip_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
