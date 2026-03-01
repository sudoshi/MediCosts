#!/usr/bin/env node
/**
 * promote-vbp.js
 * Promotes 5 VBP domain tables from stage → medicosts.hospital_vbp
 * Stores domain scores in a unified long-format table.
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
    // Helper for safe numeric casting (CMS uses "Not Available", "Not Applicable", etc.)
    await client.query(`
      CREATE OR REPLACE FUNCTION pg_temp.safe_num(text) RETURNS NUMERIC AS $$
        SELECT CASE WHEN $1 ~ '^\\-?[0-9]+\\.?[0-9]*$' THEN $1::NUMERIC ELSE NULL END
      $$ LANGUAGE SQL IMMUTABLE;
    `);

    // Create a wide-format table with one row per hospital
    console.log('Creating medicosts.hospital_vbp …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.hospital_vbp CASCADE;
      CREATE TABLE medicosts.hospital_vbp (
        id                          SERIAL PRIMARY KEY,
        facility_id                 VARCHAR(10) NOT NULL,
        facility_name               TEXT NOT NULL,
        state                       VARCHAR(2) NOT NULL,
        zip_code                    VARCHAR(5),
        -- Total Performance
        clinical_outcomes_score_unw NUMERIC(8,4),
        clinical_outcomes_score_w   NUMERIC(8,4),
        person_engagement_score_unw NUMERIC(8,4),
        person_engagement_score_w   NUMERIC(8,4),
        safety_score_unw            NUMERIC(8,4),
        safety_score_w              NUMERIC(8,4),
        efficiency_score_unw        NUMERIC(8,4),
        efficiency_score_w          NUMERIC(8,4),
        total_performance_score     NUMERIC(8,4),
        -- Efficiency: MSPB-1
        mspb_1_baseline_rate        NUMERIC(8,4),
        mspb_1_performance_rate     NUMERIC(8,4),
        mspb_1_achievement_pts      NUMERIC(8,4),
        mspb_1_improvement_pts      NUMERIC(8,4),
        mspb_1_measure_score        NUMERIC(8,4),
        -- Person: HCAHPS
        hcahps_base_score           NUMERIC(8,4),
        hcahps_consistency_score    NUMERIC(8,4)
      );
    `);

    // Insert from total performance table (has all domain scores)
    console.log('Loading total performance scores …');
    const totalTable = 'hospitals__hospital_value_based_purchasing_hvbp_total_p_34e5944';
    const r1 = await client.query(`
      INSERT INTO medicosts.hospital_vbp
        (facility_id, facility_name, state, zip_code,
         clinical_outcomes_score_unw, clinical_outcomes_score_w,
         person_engagement_score_unw, person_engagement_score_w,
         safety_score_unw, safety_score_w,
         efficiency_score_unw, efficiency_score_w,
         total_performance_score)
      SELECT
        facility_id,
        facility_name,
        state,
        zip_code,
        pg_temp.safe_num(unweighted_normalized_clinical_outcomes_domain_score),
        pg_temp.safe_num(weighted_normalized_clinical_outcomes_domain_score),
        pg_temp.safe_num(unweighted_person_and_community_engagement_domain_score),
        pg_temp.safe_num(weighted_person_and_community_engagement_domain_score),
        pg_temp.safe_num(unweighted_normalized_safety_domain_score),
        pg_temp.safe_num(weighted_safety_domain_score),
        pg_temp.safe_num(unweighted_normalized_efficiency_and_cost_reduction_dom_fb116a6),
        pg_temp.safe_num(weighted_efficiency_and_cost_reduction_domain_score),
        pg_temp.safe_num(total_performance_score)
      FROM stage.${totalTable}
      WHERE facility_id IS NOT NULL
    `);
    console.log(`  Total performance: ${r1.rowCount.toLocaleString()} rows`);

    // Update with efficiency MSPB-1 scores
    console.log('Updating with efficiency (MSPB-1) scores …');
    const effTable = 'hospitals__hospital_value_based_purchasing_hvbp_efficie_6b246cf';
    await client.query(`
      UPDATE medicosts.hospital_vbp v
      SET
        mspb_1_baseline_rate    = pg_temp.safe_num(e.mspb_1_baseline_rate),
        mspb_1_performance_rate = pg_temp.safe_num(e.mspb_1_performance_rate),
        mspb_1_achievement_pts  = pg_temp.safe_num(e.mspb_1_achievement_points),
        mspb_1_improvement_pts  = pg_temp.safe_num(e.mspb_1_improvement_points),
        mspb_1_measure_score    = pg_temp.safe_num(e.mspb_1_measure_score)
      FROM stage.${effTable} e
      WHERE v.facility_id = e.facility_id
    `);

    // Update with person/HCAHPS scores
    console.log('Updating with HCAHPS scores …');
    const personTable = 'hospitals__hospital_value_based_purchasing_hvbp_person__9b88524';
    await client.query(`
      UPDATE medicosts.hospital_vbp v
      SET
        hcahps_base_score        = pg_temp.safe_num(p.hcahps_base_score),
        hcahps_consistency_score = pg_temp.safe_num(p.hcahps_consistency_score)
      FROM stage.${personTable} p
      WHERE v.facility_id = p.facility_id
    `);

    console.log('Creating indexes …');
    await client.query(`
      CREATE UNIQUE INDEX idx_vbp_facility ON medicosts.hospital_vbp (facility_id);
      CREATE INDEX idx_vbp_state ON medicosts.hospital_vbp (state);
      CREATE INDEX idx_vbp_tps ON medicosts.hospital_vbp (total_performance_score);
    `);

    const cnt = await client.query('SELECT COUNT(*) AS n FROM medicosts.hospital_vbp');
    console.log(`Done. ${parseInt(cnt.rows[0].n).toLocaleString()} hospitals with VBP scores.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
