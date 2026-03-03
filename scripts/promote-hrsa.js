/**
 * promote-hrsa.js
 * Promote HRSA Health Professional Shortage Area (HPSA) and
 * Medically Underserved Area/Population (MUA/MUP) data from stage → medicosts schema.
 *
 * Source tables:
 *   stage.hrsa_hpsa__hpsa_primary_care   (~74k rows)
 *   stage.hrsa_hpsa__hpsa_dental_health  (~42k rows)
 *   stage.hrsa_hpsa__hpsa_mental_health  (~37k rows)
 *   stage.hrsa_hpsa__mua_mup             (~19k rows)
 *
 * Target: medicosts.hrsa_shortage_areas
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
    console.log('Creating medicosts.hrsa_shortage_areas...');

    await client.query(`
      DROP TABLE IF EXISTS medicosts.hrsa_shortage_areas;
      CREATE TABLE medicosts.hrsa_shortage_areas (
        id            BIGSERIAL PRIMARY KEY,
        hpsa_id       TEXT,
        shortage_type TEXT NOT NULL,           -- 'Primary Care' | 'Dental Health' | 'Mental Health' | 'Medically Underserved'
        designation_type TEXT,
        state         CHAR(2),
        county        TEXT,
        zip5          VARCHAR(5),
        hpsa_name     TEXT,
        hpsa_score    SMALLINT,                -- 0–25 (higher = more severe)
        hpsa_status   TEXT,                   -- 'Designated' | 'Withdrawn' | 'Proposed Withdrawal'
        population_served BIGINT,
        ftes_needed   NUMERIC(8,2),
        degree_of_shortage TEXT,
        is_rural      BOOLEAN,
        designation_date DATE
      );
    `);

    // Union all 3 HPSA tables
    for (const [type, table] of [
      ['Primary Care',  'hrsa_hpsa__hpsa_primary_care'],
      ['Dental Health', 'hrsa_hpsa__hpsa_dental_health'],
      ['Mental Health', 'hrsa_hpsa__hpsa_mental_health'],
    ]) {
      console.log(`  Inserting ${type}...`);
      const { rowCount } = await client.query(`
        INSERT INTO medicosts.hrsa_shortage_areas
          (hpsa_id, shortage_type, designation_type, state, county, zip5,
           hpsa_name, hpsa_score, hpsa_status, population_served, ftes_needed,
           degree_of_shortage, is_rural, designation_date)
        SELECT
          NULLIF(TRIM(hpsa_id), '')                              AS hpsa_id,
          $1::TEXT                                               AS shortage_type,
          NULLIF(TRIM(designation_type), '')                     AS designation_type,
          UPPER(NULLIF(TRIM(primary_state_abbreviation), ''))    AS state,
          NULLIF(TRIM(common_county_name), '')                   AS county,
          CASE WHEN common_postal_code ~ '^[0-9]{5}$'
               THEN common_postal_code ELSE NULL END             AS zip5,
          NULLIF(TRIM(hpsa_name), '')                            AS hpsa_name,
          NULLIF(TRIM(hpsa_score), '')::SMALLINT                 AS hpsa_score,
          NULLIF(TRIM(hpsa_status), '')                          AS hpsa_status,
          NULLIF(TRIM(hpsa_designation_population), '')::NUMERIC::BIGINT AS population_served,
          NULLIF(TRIM(hpsa_fte), '')::NUMERIC(8,2)               AS ftes_needed,
          NULLIF(TRIM(hpsa_degree_of_shortage), '')              AS degree_of_shortage,
          CASE WHEN LOWER(rural_status) LIKE '%rural%' THEN TRUE ELSE FALSE END AS is_rural,
          NULLIF(TRIM(hpsa_designation_date), '')::DATE          AS designation_date
        FROM stage.${table}
        WHERE hpsa_status != 'Withdrawn'
          AND NULLIF(TRIM(hpsa_score), '') IS NOT NULL
      `, [type]);
      console.log(`    → ${rowCount} rows`);
    }

    // MUA/MUP — different schema
    console.log('  Inserting MUA/MUP...');
    const muaCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='stage' AND table_name='hrsa_hpsa__mua_mup'
      ORDER BY ordinal_position LIMIT 5;`);
    console.log('    MUA cols sample:', muaCols.rows.map(r => r.column_name).join(', '));

    // Sample to understand columns
    const sample = await client.query(`SELECT * FROM stage.hrsa_hpsa__mua_mup LIMIT 1`);
    if (sample.rows.length > 0) {
      const cols = Object.keys(sample.rows[0]);
      console.log('    MUA actual cols:', cols.slice(0, 10).join(', '));
    }

    // MUA has different column names — use what's available
    const muaColNames = muaCols.rows.map(r => r.column_name);
    const stateCol = muaColNames.find(c => c.includes('state_abbreviation') || c === 'state') || 'state';

    const { rowCount: muaCount } = await client.query(`
      INSERT INTO medicosts.hrsa_shortage_areas
        (shortage_type, state, county, zip5, hpsa_name, hpsa_score, hpsa_status, population_served)
      SELECT
        'Medically Underserved'                                          AS shortage_type,
        UPPER(NULLIF(TRIM(${muaColNames.includes('state_abbreviation') ? 'state_abbreviation' :
          muaColNames.find(c => c.includes('state')) || 'null::text'}), ''))     AS state,
        ${muaColNames.includes('county_name') ? "NULLIF(TRIM(county_name), '')" : "NULL::text"} AS county,
        ${muaColNames.includes('common_postal_code') ? "CASE WHEN common_postal_code ~ '^[0-9]{5}$' THEN common_postal_code ELSE NULL END" : "NULL::text"} AS zip5,
        ${muaColNames.includes('mua_mup_name') ? "NULLIF(TRIM(mua_mup_name), '')" : "NULL::text"} AS hpsa_name,
        ${muaColNames.includes('imeo_score') ? "NULLIF(TRIM(imeo_score), '')::SMALLINT" : "NULL::smallint"} AS hpsa_score,
        ${muaColNames.includes('designation_status') ? "NULLIF(TRIM(designation_status), '')" : "'Designated'::text"} AS hpsa_status,
        ${muaColNames.includes('hpsa_designation_population') ? "NULLIF(TRIM(hpsa_designation_population), '')::BIGINT" : "NULL::bigint"} AS population_served
      FROM stage.hrsa_hpsa__mua_mup
      WHERE TRUE
    `);
    console.log(`    → ${muaCount} rows`);

    // Indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX ON medicosts.hrsa_shortage_areas(zip5);
      CREATE INDEX ON medicosts.hrsa_shortage_areas(state, shortage_type);
      CREATE INDEX ON medicosts.hrsa_shortage_areas(hpsa_status);
      CREATE INDEX ON medicosts.hrsa_shortage_areas(hpsa_score DESC);
    `);

    const { rows: counts } = await client.query(`
      SELECT shortage_type, COUNT(*) as n, AVG(hpsa_score)::NUMERIC(4,1) as avg_score
      FROM medicosts.hrsa_shortage_areas
      GROUP BY shortage_type ORDER BY n DESC;
    `);
    console.log('\nResult:');
    counts.forEach(r => console.log(`  ${r.shortage_type}: ${r.n} areas, avg score ${r.avg_score}`));

    console.log('\n✓ Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
