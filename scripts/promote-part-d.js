#!/usr/bin/env node
/**
 * promote-part-d.js
 * Promotes CMS Part D stage tables to medicosts schema.
 *
 * Tables created:
 *   medicosts.part_d_drug_spending  — drug-level 5-year spending trends (14K rows)
 *   medicosts.part_d_prescribers    — prescriber-level summary (1.38M rows)
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const pool = new pg.Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT || 5432,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('▶ Promoting Part D drug spending...');
    await client.query(`DROP TABLE IF EXISTS medicosts.part_d_drug_spending`);
    await client.query(`
      CREATE TABLE medicosts.part_d_drug_spending AS
      SELECT
        brnd_name,
        gnrc_name,
        mftr_name,
        tot_mftr::INTEGER                                   AS tot_manufacturers,
        -- 2023 (most recent)
        NULLIF(tot_spndng_2023, '')::NUMERIC(18,2)          AS tot_spending_2023,
        NULLIF(tot_clms_2023, '')::NUMERIC(18,0)::INTEGER   AS tot_claims_2023,
        NULLIF(tot_benes_2023, '')::NUMERIC(18,0)::INTEGER  AS tot_benes_2023,
        NULLIF(avg_spnd_per_dsg_unt_wghtd_2023, '')::NUMERIC(12,4) AS avg_cost_per_unit_2023,
        NULLIF(avg_spnd_per_clm_2023, '')::NUMERIC(12,2)    AS avg_cost_per_claim_2023,
        NULLIF(avg_spnd_per_bene_2023, '')::NUMERIC(12,2)   AS avg_cost_per_bene_2023,
        -- prior years for trend
        NULLIF(tot_spndng_2022, '')::NUMERIC(18,2)          AS tot_spending_2022,
        NULLIF(tot_spndng_2021, '')::NUMERIC(18,2)          AS tot_spending_2021,
        NULLIF(tot_spndng_2020, '')::NUMERIC(18,2)          AS tot_spending_2020,
        NULLIF(tot_spndng_2019, '')::NUMERIC(18,2)          AS tot_spending_2019,
        NULLIF(tot_clms_2022, '')::NUMERIC(18,0)::INTEGER   AS tot_claims_2022,
        NULLIF(tot_clms_2021, '')::NUMERIC(18,0)::INTEGER   AS tot_claims_2021,
        NULLIF(tot_clms_2020, '')::NUMERIC(18,0)::INTEGER   AS tot_claims_2020,
        NULLIF(tot_clms_2019, '')::NUMERIC(18,0)::INTEGER   AS tot_claims_2019,
        NULLIF(avg_spnd_per_dsg_unt_wghtd_2022, '')::NUMERIC(12,4) AS avg_cost_per_unit_2022,
        NULLIF(avg_spnd_per_dsg_unt_wghtd_2021, '')::NUMERIC(12,4) AS avg_cost_per_unit_2021,
        NULLIF(avg_spnd_per_dsg_unt_wghtd_2020, '')::NUMERIC(12,4) AS avg_cost_per_unit_2020,
        NULLIF(avg_spnd_per_dsg_unt_wghtd_2019, '')::NUMERIC(12,4) AS avg_cost_per_unit_2019,
        -- change metrics
        NULLIF(chg_avg_spnd_per_dsg_unt_22_23, '')::NUMERIC(8,4)  AS pct_change_22_23,
        NULLIF(cagr_avg_spnd_per_dsg_unt_19_23, '')::NUMERIC(8,4) AS cagr_19_23,
        outlier_flag_2023 AS outlier_flag
      FROM stage.cms_part_d__part_d_spending_by_drug_dy2023
      WHERE gnrc_name IS NOT NULL AND gnrc_name != ''
    `);
    const { rows: [{ count: drugCount }] } = await client.query('SELECT COUNT(*) FROM medicosts.part_d_drug_spending');
    console.log(`  ✓ part_d_drug_spending: ${drugCount} rows`);

    // Index
    await client.query(`CREATE INDEX ON medicosts.part_d_drug_spending (LOWER(gnrc_name))`);
    await client.query(`CREATE INDEX ON medicosts.part_d_drug_spending (LOWER(brnd_name))`);
    await client.query(`CREATE INDEX ON medicosts.part_d_drug_spending (tot_spending_2023 DESC NULLS LAST)`);

    console.log('\n▶ Promoting Part D prescriber data...');
    await client.query(`DROP TABLE IF EXISTS medicosts.part_d_prescribers`);
    await client.query(`
      CREATE TABLE medicosts.part_d_prescribers AS
      SELECT
        prscrbr_npi                                        AS npi,
        prscrbr_last_org_name                              AS last_org_name,
        prscrbr_first_name                                 AS first_name,
        prscrbr_crdntls                                    AS credentials,
        prscrbr_type                                       AS specialty,
        prscrbr_city                                       AS city,
        prscrbr_state_abrvtn                               AS state,
        prscrbr_zip5                                       AS zip_code,
        NULLIF(tot_clms, '')::INTEGER                      AS tot_claims,
        NULLIF(tot_drug_cst, '')::NUMERIC(18,2)            AS tot_drug_cost,
        NULLIF(tot_benes, '')::INTEGER                     AS tot_benes,
        NULLIF(tot_30day_fills, '')::NUMERIC(12,1)         AS tot_30day_fills,
        NULLIF(brnd_tot_clms, '')::INTEGER                 AS brand_claims,
        NULLIF(brnd_tot_drug_cst, '')::NUMERIC(18,2)       AS brand_cost,
        NULLIF(gnrc_tot_clms, '')::INTEGER                 AS generic_claims,
        NULLIF(gnrc_tot_drug_cst, '')::NUMERIC(18,2)       AS generic_cost,
        NULLIF(opioid_tot_clms, '')::INTEGER               AS opioid_claims,
        NULLIF(opioid_tot_drug_cst, '')::NUMERIC(18,2)     AS opioid_cost,
        NULLIF(opioid_prscrbr_rate, '')::NUMERIC(8,2)      AS opioid_prescriber_rate,
        NULLIF(opioid_la_tot_clms, '')::INTEGER            AS opioid_la_claims,
        NULLIF(opioid_la_prscrbr_rate, '')::NUMERIC(8,2)   AS opioid_la_prescriber_rate,
        NULLIF(antbtc_tot_clms, '')::INTEGER               AS antibiotic_claims,
        NULLIF(antbtc_tot_drug_cst, '')::NUMERIC(18,2)     AS antibiotic_cost,
        NULLIF(bene_avg_age, '')::NUMERIC(5,1)             AS avg_patient_age,
        NULLIF(bene_avg_risk_scre, '')::NUMERIC(8,4)       AS avg_risk_score
      FROM stage.cms_part_d__part_d_prescribers_dy2023
      WHERE prscrbr_npi IS NOT NULL AND prscrbr_npi != ''
    `);
    const { rows: [{ count: prescriberCount }] } = await client.query('SELECT COUNT(*) FROM medicosts.part_d_prescribers');
    console.log(`  ✓ part_d_prescribers: ${prescriberCount} rows`);

    // Indexes
    await client.query(`CREATE UNIQUE INDEX ON medicosts.part_d_prescribers (npi)`);
    await client.query(`CREATE INDEX ON medicosts.part_d_prescribers (LOWER(last_org_name))`);
    await client.query(`CREATE INDEX ON medicosts.part_d_prescribers (state)`);
    await client.query(`CREATE INDEX ON medicosts.part_d_prescribers (tot_drug_cost DESC NULLS LAST)`);

    console.log('\n✅ Part D promotion complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
