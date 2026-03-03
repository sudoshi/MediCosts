#!/usr/bin/env node
/**
 * promote-hcris.js
 * Promotes CMS Hospital Cost Report (HCRIS Form 2552-10) data → medicosts.hospital_financials
 *
 * Source: CMS HCRIS Hospital Form 2552-10 (hosp10_2023 & hosp10_2024)
 * Merges both years, taking the LATEST report per provider.
 *
 * HCRIS Stage tables (sparse format):
 *   stage.cms_cost_reports__hosp10_202X_rpt   — Report metadata (CCN, fiscal year)
 *   stage.cms_cost_reports__hosp10_202X_nmrc  — Numeric values (wksht_cd + line + col → value)
 *   stage.cms_cost_reports__hosp10_202X_alpha — Text values (wksht_cd + line + col → text)
 *
 * Column naming note: The first row values in the original CSV became column names.
 * RPT: _748262=rpt_rec_num, _144042=provider_ccn, _10_01_2022=fy_begin, _12_31_2022=fy_end
 * NMRC: _748262=rpt_rec_num, a000000=wksht_cd, _00100=line_num, _00200=col_num, _150393=value
 *
 * HCRIS Worksheet → Metric Mappings (Form 2552-10):
 * G200000 / Line 01000 / Col 00100 → total_patient_charges (gross, before adjustments)
 * G200000 / Line 00100 / Col 00100 → inpatient_charges
 * S300001 / Line 00100 / Col 00200 → licensed_beds
 * S300001 / Line 00100 / Col 00300 → total_inpatient_days
 * S100001 / Line 00100 / Col 00100 → has_charity_program (>0 = yes)
 * S100001 / Line 00200 / Col 00100 → charity_care_charges
 * S100001 / Line 00700 / Col 00100 → uncompensated_care_charges
 * S100001 / Line 03100 / Col 00100 → uncompensated_care_cost
 * S100001 / Line 02900 / Col 00100 → charity_care_cost
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const pool = new pg.Pool();

// Column names differ per year (named after the first data row's values in the source CSV)
const YEAR_CONFIG = {
  2023: {
    rpt_rec_num: '_748262',
    ccn:         '_144042',
    fy_begin:    '_10_01_2022',
    fy_end:      '_12_31_2022',
    nmrc_rpt:    '_748262',
    nmrc_val:    '_150393',
  },
  2024: {
    rpt_rec_num: '_770748',
    ccn:         '_170075',
    fy_begin:    '_10_01_2023',
    fy_end:      '_12_31_2023',
    nmrc_rpt:    '_770748',
    nmrc_val:    '_96572',
  },
};
const YEARS = [2023, 2024];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating medicosts.hospital_financials …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.hospital_financials CASCADE;
      CREATE TABLE medicosts.hospital_financials (
        id                        SERIAL PRIMARY KEY,
        provider_ccn              VARCHAR(10) NOT NULL,
        report_year               SMALLINT NOT NULL,     -- year of HCRIS dataset (2023/2024)
        fy_begin                  DATE,
        fy_end                    DATE,

        -- Charges (Worksheet G-2)
        total_patient_charges     NUMERIC(16,0),   -- gross total patient service charges
        inpatient_charges         NUMERIC(16,0),   -- inpatient only charges

        -- Utilization (Worksheet S-3 Part I)
        licensed_beds             SMALLINT,
        total_inpatient_days      INTEGER,

        -- Uncompensated Care (Worksheet S-10)
        has_charity_program       BOOLEAN,
        charity_care_charges      NUMERIC(14,0),   -- uncompensated charity care at charges
        charity_care_cost         NUMERIC(14,0),   -- cost of charity care
        uncompensated_care_charges NUMERIC(14,0),  -- total uncompensated care at charges
        uncompensated_care_cost   NUMERIC(14,0)    -- total uncompensated care cost
      );
    `);

    for (const year of YEARS) {
      const rpt   = `stage.cms_cost_reports__hosp10_${year}_rpt`;
      const nmrc  = `stage.cms_cost_reports__hosp10_${year}_nmrc`;

      // Check tables exist
      const check = await client.query(`
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'stage'
          AND table_name IN (
            'cms_cost_reports__hosp10_${year}_rpt',
            'cms_cost_reports__hosp10_${year}_nmrc'
          )
      `);
      if (Number(check.rows[0].count) < 2) {
        console.log(`  ⚠ HCRIS ${year} tables not found — skipping`);
        continue;
      }

      console.log(`Inserting ${year} cost reports …`);

      const c = YEAR_CONFIG[year];

      // Build a PIVOT query extracting specific worksheet/line/col combos per report
      // Use FILTER clause to pivot in a single pass over the NMRC table
      const result = await client.query(`
        INSERT INTO medicosts.hospital_financials (
          provider_ccn, report_year, fy_begin, fy_end,
          total_patient_charges, inpatient_charges,
          licensed_beds, total_inpatient_days,
          has_charity_program, charity_care_charges, charity_care_cost,
          uncompensated_care_charges, uncompensated_care_cost
        )
        WITH
        -- De-duplicate reports: take the last-processed report per provider
        latest_rpts AS (
          SELECT DISTINCT ON (${c.ccn})
            ${c.rpt_rec_num}   AS rpt_rec_num,
            ${c.ccn}           AS ccn,
            -- Parse dates in MM/DD/YYYY format
            CASE WHEN ${c.fy_begin} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN TO_DATE(${c.fy_begin}, 'MM/DD/YYYY') ELSE NULL END AS fy_begin,
            CASE WHEN ${c.fy_end} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN TO_DATE(${c.fy_end}, 'MM/DD/YYYY') ELSE NULL END AS fy_end
          FROM ${rpt}
          WHERE ${c.ccn} IS NOT NULL AND ${c.ccn} != ''
          ORDER BY ${c.ccn},
            CASE WHEN ${c.fy_end} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN TO_DATE(${c.fy_end}, 'MM/DD/YYYY') END DESC NULLS LAST
        ),
        -- Pivot numeric values from the sparse NMRC table
        pivoted AS (
          SELECT
            n.${c.nmrc_rpt} AS rpt_rec_num,
            -- G200000: Total patient charges (line 1000, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'G200000' AND n._00100 = '01000' AND n._00200 = '00100'
            ) AS total_charges,
            -- G200000: Inpatient charges (line 100, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'G200000' AND n._00100 = '00100' AND n._00200 = '00100'
            ) AS inpatient_charges,
            -- S300001: Licensed beds (line 100, col 2)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S300001' AND n._00100 = '00100' AND n._00200 = '00200'
            ) AS licensed_beds,
            -- S300001: Total inpatient days (line 100, col 3)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S300001' AND n._00100 = '00100' AND n._00200 = '00300'
            ) AS inpatient_days,
            -- S100001: Has charity program (line 100, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S100001' AND n._00100 = '00100' AND n._00200 = '00100'
            ) AS charity_flag,
            -- S100001: Charity care charges (line 200, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S100001' AND n._00100 = '00200' AND n._00200 = '00100'
            ) AS charity_charges,
            -- S100001: Cost of charity care (line 2900, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S100001' AND n._00100 = '02900' AND n._00200 = '00100'
            ) AS charity_cost,
            -- S100001: Total uncompensated care charges (line 700, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S100001' AND n._00100 = '00700' AND n._00200 = '00100'
            ) AS uncomp_charges,
            -- S100001: Total uncompensated care cost (line 3100, col 1)
            SUM(n.${c.nmrc_val}::NUMERIC) FILTER (
              WHERE n.a000000 = 'S100001' AND n._00100 = '03100' AND n._00200 = '00100'
            ) AS uncomp_cost
          FROM ${nmrc} n
          WHERE n.a000000 IN ('G200000', 'S300001', 'S100001')
          GROUP BY n.${c.nmrc_rpt}
        )
        SELECT
          r.ccn,
          ${year},
          r.fy_begin,
          r.fy_end,
          NULLIF(p.total_charges, 0)::NUMERIC(16,0),
          NULLIF(p.inpatient_charges, 0)::NUMERIC(16,0),
          CASE WHEN p.licensed_beds BETWEEN 1 AND 5000
            THEN p.licensed_beds::SMALLINT ELSE NULL END,
          CASE WHEN p.inpatient_days BETWEEN 1 AND 5000000
            THEN p.inpatient_days::INTEGER ELSE NULL END,
          COALESCE(p.charity_flag, 0) > 0,
          NULLIF(p.charity_charges, 0)::NUMERIC(14,0),
          NULLIF(p.charity_cost, 0)::NUMERIC(14,0),
          NULLIF(p.uncomp_charges, 0)::NUMERIC(14,0),
          NULLIF(p.uncomp_cost, 0)::NUMERIC(14,0)
        FROM latest_rpts r
        JOIN pivoted p ON p.rpt_rec_num = r.rpt_rec_num
        WHERE r.ccn IS NOT NULL
          AND (p.total_charges IS NOT NULL OR p.licensed_beds IS NOT NULL)
      `);
      console.log(`  Inserted ${result.rowCount.toLocaleString()} rows for ${year}`);
    }

    console.log('Building indexes …');
    await client.query(`
      CREATE UNIQUE INDEX idx_hf_ccn_year ON medicosts.hospital_financials (provider_ccn, report_year);
      CREATE INDEX idx_hf_ccn       ON medicosts.hospital_financials (provider_ccn);
      CREATE INDEX idx_hf_year      ON medicosts.hospital_financials (report_year);
      CREATE INDEX idx_hf_charges   ON medicosts.hospital_financials (total_patient_charges DESC NULLS LAST);
      CREATE INDEX idx_hf_beds      ON medicosts.hospital_financials (licensed_beds DESC NULLS LAST);
      CREATE INDEX idx_hf_uncomp    ON medicosts.hospital_financials (uncompensated_care_cost DESC NULLS LAST);
    `);

    // Sample validation output
    const stats = await client.query(`
      SELECT
        report_year,
        COUNT(*) AS hospitals,
        SUM(CASE WHEN total_patient_charges IS NOT NULL THEN 1 END) AS with_charges,
        SUM(CASE WHEN licensed_beds IS NOT NULL THEN 1 END) AS with_beds,
        SUM(CASE WHEN uncompensated_care_cost IS NOT NULL THEN 1 END) AS with_uncomp,
        AVG(total_patient_charges)::BIGINT AS avg_charges,
        AVG(licensed_beds)::INT AS avg_beds
      FROM medicosts.hospital_financials
      GROUP BY report_year ORDER BY report_year
    `);

    console.log('\nSummary:');
    for (const r of stats.rows) {
      console.log(
        `  ${r.report_year}: ${r.hospitals} hospitals | charges=${r.with_charges} (avg $${Number(r.avg_charges).toLocaleString()}) | beds=${r.with_beds} (avg ${r.avg_beds}) | uncomp=${r.with_uncomp}`
      );
    }

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
