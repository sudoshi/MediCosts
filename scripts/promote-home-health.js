#!/usr/bin/env node
/**
 * promote-home-health.js
 * Promotes stage home health agencies → medicosts.home_health_agencies
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
    console.log('Creating medicosts.home_health_agencies …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.home_health_agencies CASCADE;
      CREATE TABLE medicosts.home_health_agencies (
        id                        SERIAL PRIMARY KEY,
        provider_ccn              VARCHAR(10) NOT NULL,
        provider_name             TEXT NOT NULL,
        state                     VARCHAR(2) NOT NULL,
        city                      TEXT,
        zip_code                  VARCHAR(5),
        ownership_type            TEXT,
        quality_star_rating       NUMERIC(3,1),
        -- Outcome rates (risk-standardized)
        dtc_rate                  NUMERIC(8,4),
        dtc_rate_lower            NUMERIC(8,4),
        dtc_rate_upper            NUMERIC(8,4),
        dtc_category              TEXT,
        ppr_rate                  NUMERIC(8,4),
        ppr_rate_lower            NUMERIC(8,4),
        ppr_rate_upper            NUMERIC(8,4),
        ppr_category              TEXT,
        pph_rate                  NUMERIC(8,4),
        pph_rate_lower            NUMERIC(8,4),
        pph_rate_upper            NUMERIC(8,4),
        pph_category              TEXT,
        -- Cost
        medicare_spend_per_episode NUMERIC(12,2)
      );
    `);

    console.log('Inserting from stage …');
    const result = await client.query(`
      INSERT INTO medicosts.home_health_agencies
        (provider_ccn, provider_name, state, city, zip_code, ownership_type,
         quality_star_rating,
         dtc_rate, dtc_rate_lower, dtc_rate_upper, dtc_category,
         ppr_rate, ppr_rate_lower, ppr_rate_upper, ppr_category,
         pph_rate, pph_rate_lower, pph_rate_upper, pph_category,
         medicare_spend_per_episode)
      SELECT
        cms_certification_number_ccn,
        provider_name,
        state,
        city_town,
        LEFT(zip_code, 5),
        type_of_ownership,
        CASE WHEN quality_of_patient_care_star_rating ~ '^[0-9]+\.?[0-9]*$' THEN quality_of_patient_care_star_rating::NUMERIC(3,1) ELSE NULL END,
        CASE WHEN dtc_risk_standardized_rate ~ '^\-?[0-9]+\.?[0-9]*$' THEN dtc_risk_standardized_rate::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN dtc_risk_standardized_rate_lower_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN dtc_risk_standardized_rate_lower_limit::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN dtc_risk_standardized_rate_upper_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN dtc_risk_standardized_rate_upper_limit::NUMERIC(8,4) ELSE NULL END,
        dtc_performance_categorization,
        CASE WHEN ppr_risk_standardized_rate ~ '^\-?[0-9]+\.?[0-9]*$' THEN ppr_risk_standardized_rate::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN ppr_risk_standardized_rate_lower_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN ppr_risk_standardized_rate_lower_limit::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN ppr_risk_standardized_rate_upper_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN ppr_risk_standardized_rate_upper_limit::NUMERIC(8,4) ELSE NULL END,
        ppr_performance_categorization,
        CASE WHEN pph_risk_standardized_rate ~ '^\-?[0-9]+\.?[0-9]*$' THEN pph_risk_standardized_rate::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN pph_risk_standardized_rate_lower_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN pph_risk_standardized_rate_lower_limit::NUMERIC(8,4) ELSE NULL END,
        CASE WHEN pph_risk_standardized_rate_upper_limit ~ '^\-?[0-9]+\.?[0-9]*$' THEN pph_risk_standardized_rate_upper_limit::NUMERIC(8,4) ELSE NULL END,
        pph_performance_categorization,
        CASE WHEN REPLACE(REPLACE(how_much_medicare_spends_on_an_episode_of_care_at_this__56e66fb, '$', ''), ',', '') ~ '^\-?[0-9]+\.?[0-9]*$' THEN REPLACE(REPLACE(how_much_medicare_spends_on_an_episode_of_care_at_this__56e66fb, '$', ''), ',', '')::NUMERIC(12,2) ELSE NULL END
      FROM stage.home_health_services__home_health_care_agencies
      WHERE cms_certification_number_ccn IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE UNIQUE INDEX idx_hha_ccn   ON medicosts.home_health_agencies (provider_ccn);
      CREATE INDEX idx_hha_state        ON medicosts.home_health_agencies (state);
      CREATE INDEX idx_hha_star         ON medicosts.home_health_agencies (quality_star_rating);
      CREATE INDEX idx_hha_zip          ON medicosts.home_health_agencies (zip_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
