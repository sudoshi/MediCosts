#!/usr/bin/env node
/**
 * load-data.js
 * Streams the CMS Medicare Inpatient CSV into PostgreSQL and creates
 * materialized views for the dashboard queries.
 *
 * Usage:
 *   cp ../.env.example ../.env   # fill in PGPASSWORD
 *   node load-data.js [path-to-csv]
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const CSV_PATH =
  process.argv[2] ||
  path.resolve(__dirname, '../medicare-dashboard/MUP_INP_RY25_DY23_PrvSvc.csv');

const BATCH_SIZE = 500;

const pool = new pg.Pool();        // reads PG* env vars

/* ------------------------------------------------------------------ */
/*  DDL                                                                */
/* ------------------------------------------------------------------ */
const DDL = `
-- Create schema and main table
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.medicare_inpatient CASCADE;
CREATE TABLE medicosts.medicare_inpatient (
  id                  SERIAL PRIMARY KEY,
  provider_ccn        VARCHAR(10)    NOT NULL,
  provider_name       TEXT           NOT NULL,
  provider_city       VARCHAR(100),
  provider_street     TEXT,
  state_fips          VARCHAR(2),
  zip5                VARCHAR(5)     NOT NULL,
  state_abbr          VARCHAR(2)     NOT NULL,
  ruca_code           VARCHAR(10),
  ruca_desc           TEXT,
  drg_cd              VARCHAR(5)     NOT NULL,
  drg_desc            TEXT           NOT NULL,
  total_discharges    INTEGER        NOT NULL,
  avg_covered_charges NUMERIC(14,2)  NOT NULL,
  avg_total_payments  NUMERIC(14,2)  NOT NULL,
  avg_medicare_payments NUMERIC(14,2) NOT NULL
);

-- Indexes for dashboard queries
CREATE INDEX idx_mi_drg      ON medicosts.medicare_inpatient (drg_cd);
CREATE INDEX idx_mi_zip      ON medicosts.medicare_inpatient (zip5);
CREATE INDEX idx_mi_state    ON medicosts.medicare_inpatient (state_abbr);
CREATE INDEX idx_mi_drg_zip  ON medicosts.medicare_inpatient (drg_cd, zip5);
`;

const MATERIALIZED_VIEWS = `
-- Top 50 most expensive DRGs by discharge-weighted average total payment
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_top50_drg CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_top50_drg AS
SELECT
  drg_cd,
  drg_desc,
  SUM(avg_total_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_payment,
  SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_charges,
  SUM(avg_medicare_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_medicare,
  SUM(total_discharges)   AS total_discharges,
  COUNT(DISTINCT provider_ccn) AS num_providers
FROM medicosts.medicare_inpatient
GROUP BY drg_cd, drg_desc
ORDER BY weighted_avg_payment DESC
LIMIT 50;

CREATE UNIQUE INDEX idx_mv_top50_drg ON medicosts.mv_top50_drg (drg_cd);

-- ZIP-level summary for top 50 DRGs only
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_zip_summary CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_zip_summary AS
SELECT
  mi.zip5,
  mi.state_abbr,
  mi.provider_city,
  mi.drg_cd,
  AVG(mi.avg_total_payments)    AS avg_total_payment,
  AVG(mi.avg_covered_charges)   AS avg_covered_charge,
  AVG(mi.avg_medicare_payments) AS avg_medicare_payment,
  SUM(mi.total_discharges)      AS total_discharges,
  COUNT(DISTINCT mi.provider_ccn) AS num_providers
FROM medicosts.medicare_inpatient mi
JOIN medicosts.mv_top50_drg t ON mi.drg_cd = t.drg_cd
GROUP BY mi.zip5, mi.state_abbr, mi.provider_city, mi.drg_cd;

CREATE INDEX idx_mv_zip_drg   ON medicosts.mv_zip_summary (drg_cd);
CREATE INDEX idx_mv_zip_zip   ON medicosts.mv_zip_summary (zip5);
CREATE INDEX idx_mv_zip_state ON medicosts.mv_zip_summary (state_abbr);
`;

/* ------------------------------------------------------------------ */
/*  CSV streaming + batch insert                                       */
/* ------------------------------------------------------------------ */
async function loadCSV(client) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(CSV_PATH, { encoding: 'latin1' }).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    let batch = [];
    let total = 0;

    const flush = async (rows) => {
      if (rows.length === 0) return;
      const placeholders = rows
        .map(
          (_, i) =>
            `($${i * 15 + 1},$${i * 15 + 2},$${i * 15 + 3},$${i * 15 + 4},$${i * 15 + 5},$${i * 15 + 6},$${i * 15 + 7},$${i * 15 + 8},$${i * 15 + 9},$${i * 15 + 10},$${i * 15 + 11},$${i * 15 + 12},$${i * 15 + 13},$${i * 15 + 14},$${i * 15 + 15})`
        )
        .join(',');

      const values = rows.flatMap((r) => [
        r.Rndrng_Prvdr_CCN,
        r.Rndrng_Prvdr_Org_Name,
        r.Rndrng_Prvdr_City,
        r.Rndrng_Prvdr_St,
        r.Rndrng_Prvdr_State_FIPS,
        r.Rndrng_Prvdr_Zip5,
        r.Rndrng_Prvdr_State_Abrvtn,
        r.Rndrng_Prvdr_RUCA,
        r.Rndrng_Prvdr_RUCA_Desc,
        r.DRG_Cd,
        r.DRG_Desc,
        parseInt(r.Tot_Dschrgs, 10),
        parseFloat(r.Avg_Submtd_Cvrd_Chrg),
        parseFloat(r.Avg_Tot_Pymt_Amt),
        parseFloat(r.Avg_Mdcr_Pymt_Amt),
      ]);

      await client.query(
        `INSERT INTO medicosts.medicare_inpatient
           (provider_ccn, provider_name, provider_city, provider_street,
            state_fips, zip5, state_abbr, ruca_code, ruca_desc,
            drg_cd, drg_desc, total_discharges,
            avg_covered_charges, avg_total_payments, avg_medicare_payments)
         VALUES ${placeholders}`,
        values
      );
    };

    parser.on('data', async (row) => {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        parser.pause();
        const chunk = batch;
        batch = [];
        total += chunk.length;
        process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows…`);
        await flush(chunk);
        parser.resume();
      }
    });

    parser.on('end', async () => {
      total += batch.length;
      await flush(batch);
      process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows — done.\n`);
      resolve(total);
    });

    parser.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`Connecting to ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE} …`);
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    console.log(`Streaming CSV from ${CSV_PATH} …`);
    await loadCSV(client);

    console.log('Creating materialized views …');
    await client.query(MATERIALIZED_VIEWS);

    // Quick sanity check
    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.medicare_inpatient');
    console.log(`✓ Table has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    const top = await client.query('SELECT drg_cd, drg_desc, weighted_avg_payment::int FROM medicosts.mv_top50_drg LIMIT 3');
    console.log('✓ Top 3 DRGs:');
    top.rows.forEach((r) =>
      console.log(`    ${r.drg_cd} — $${r.weighted_avg_payment.toLocaleString()} — ${r.drg_desc.slice(0, 60)}`)
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
