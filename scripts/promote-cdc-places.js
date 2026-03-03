/**
 * promote-cdc-places.js
 * Pivot CDC PLACES ZIP-level health measures from long → wide format.
 * Source: stage.cdc_places__places_zcta (~1.17M rows, 40 measures × 32k ZIPs)
 * Target: medicosts.cdc_community_health (one row per ZIP, measures as columns)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new pg.Pool();

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating medicosts.cdc_community_health...');

    await client.query(`
      DROP TABLE IF EXISTS medicosts.cdc_community_health;
      CREATE TABLE medicosts.cdc_community_health (
        zip5               VARCHAR(5) PRIMARY KEY,
        data_year          SMALLINT,
        total_population   INTEGER,
        -- Health Outcomes
        diabetes_pct       NUMERIC(6,2),
        obesity_pct        NUMERIC(6,2),
        heart_disease_pct  NUMERIC(6,2),
        stroke_pct         NUMERIC(6,2),
        copd_pct           NUMERIC(6,2),
        asthma_pct         NUMERIC(6,2),
        cancer_pct         NUMERIC(6,2),
        high_bp_pct        NUMERIC(6,2),
        high_cholesterol_pct NUMERIC(6,2),
        arthritis_pct      NUMERIC(6,2),
        depression_pct     NUMERIC(6,2),
        -- Risk Behaviors
        smoking_pct        NUMERIC(6,2),
        binge_drinking_pct NUMERIC(6,2),
        physical_inactivity_pct NUMERIC(6,2),
        -- Mental/Physical Status
        mental_distress_pct NUMERIC(6,2),
        physical_distress_pct NUMERIC(6,2),
        poor_health_pct    NUMERIC(6,2),
        -- Prevention / Access
        uninsured_pct      NUMERIC(6,2),
        annual_checkup_pct NUMERIC(6,2),
        dental_visit_pct   NUMERIC(6,2),
        cholesterol_screen_pct NUMERIC(6,2),
        -- Disability
        disability_any_pct NUMERIC(6,2),
        disability_mobility_pct NUMERIC(6,2),
        -- Social Determinants
        food_insecurity_pct NUMERIC(6,2),
        housing_insecurity_pct NUMERIC(6,2),
        transportation_barrier_pct NUMERIC(6,2)
      );
    `);

    console.log('Pivoting long → wide (this may take ~30s)...');
    const { rowCount } = await client.query(`
      INSERT INTO medicosts.cdc_community_health
      SELECT
        LPAD(locationname, 5, '0')                                AS zip5,
        MAX(year::SMALLINT)                                        AS data_year,
        MAX(totalpopulation::INTEGER)                              AS total_population,
        -- Health Outcomes
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='DIABETES')  AS diabetes_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='OBESITY')   AS obesity_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CHD')       AS heart_disease_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='STROKE')    AS stroke_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='COPD')      AS copd_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CASTHMA')   AS asthma_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CANCER')    AS cancer_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='BPHIGH')    AS high_bp_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='HIGHCHOL')  AS high_cholesterol_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='ARTHRITIS') AS arthritis_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='DEPRESSION') AS depression_pct,
        -- Risk Behaviors
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CSMOKING')  AS smoking_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='BINGE')     AS binge_drinking_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='LPA')       AS physical_inactivity_pct,
        -- Mental/Physical Status
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='MHLTH')     AS mental_distress_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='PHLTH')     AS physical_distress_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='GHLTH')     AS poor_health_pct,
        -- Prevention / Access
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='ACCESS2')   AS uninsured_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CHECKUP')   AS annual_checkup_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='DENTAL')    AS dental_visit_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='CHOLSCREEN') AS cholesterol_screen_pct,
        -- Disability
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='DISABILITY') AS disability_any_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='MOBILITY')   AS disability_mobility_pct,
        -- Social Determinants
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='FOODINSECU') AS food_insecurity_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='HOUSINSECU') AS housing_insecurity_pct,
        MAX(data_value::NUMERIC) FILTER (WHERE measureid='LACKTRPT')   AS transportation_barrier_pct
      FROM stage.cdc_places__places_zcta
      WHERE locationname IS NOT NULL
        AND datavaluetypeid = 'CrdPrv'   -- crude prevalence (age-adjusted also available)
      GROUP BY locationname
      ON CONFLICT (zip5) DO NOTHING
    `);

    console.log(`  → ${rowCount.toLocaleString()} ZIPs promoted`);

    console.log('Creating index...');
    await client.query(`CREATE INDEX ON medicosts.cdc_community_health(zip5);`);

    const { rows: stats } = await client.query(`
      SELECT COUNT(*) as zips,
             ROUND(AVG(diabetes_pct),1) as avg_diabetes,
             ROUND(AVG(obesity_pct),1) as avg_obesity,
             ROUND(AVG(uninsured_pct),1) as avg_uninsured
      FROM medicosts.cdc_community_health;
    `);
    console.log(`\nStats: ${stats[0].zips} ZIPs | Avg diabetes ${stats[0].avg_diabetes}% | Avg obesity ${stats[0].avg_obesity}% | Avg uninsured ${stats[0].avg_uninsured}%`);

    console.log('\n✓ Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
