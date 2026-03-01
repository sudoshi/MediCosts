#!/usr/bin/env node
/**
 * load-inpatient-historical.js
 * Loads 11 years (2013-2023) of CMS Medicare Inpatient CSV data into
 * medicosts.medicare_inpatient_historical and creates trend materialized views.
 *
 * Usage:
 *   node scripts/load-inpatient-historical.js
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_DIR = path.resolve(
  __dirname,
  '../inpatient-qi/Medicare Inpatient Hospitals - by Provider and Service'
);
const BATCH_SIZE = 500;
const pool = new pg.Pool();

/* ------------------------------------------------------------------ */
/*  DDL                                                                */
/* ------------------------------------------------------------------ */
const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.medicare_inpatient_historical CASCADE;
CREATE TABLE medicosts.medicare_inpatient_historical (
  id                    SERIAL PRIMARY KEY,
  data_year             SMALLINT       NOT NULL,
  provider_ccn          VARCHAR(10)    NOT NULL,
  provider_name         TEXT           NOT NULL,
  provider_city         VARCHAR(100),
  provider_street       TEXT,
  state_fips            VARCHAR(2),
  zip5                  VARCHAR(5)     NOT NULL,
  state_abbr            VARCHAR(2)     NOT NULL,
  ruca_code             VARCHAR(10),
  ruca_desc             TEXT,
  drg_cd                VARCHAR(5)     NOT NULL,
  drg_desc              TEXT           NOT NULL,
  total_discharges      INTEGER        NOT NULL,
  avg_covered_charges   NUMERIC(14,2)  NOT NULL,
  avg_total_payments    NUMERIC(14,2)  NOT NULL,
  avg_medicare_payments NUMERIC(14,2)  NOT NULL
);
`;

const INDEXES = `
CREATE INDEX idx_mih_year        ON medicosts.medicare_inpatient_historical (data_year);
CREATE INDEX idx_mih_drg_year    ON medicosts.medicare_inpatient_historical (drg_cd, data_year);
CREATE INDEX idx_mih_ccn_year    ON medicosts.medicare_inpatient_historical (provider_ccn, data_year);
CREATE INDEX idx_mih_state_year  ON medicosts.medicare_inpatient_historical (state_abbr, data_year);
CREATE INDEX idx_mih_zip_year    ON medicosts.medicare_inpatient_historical (zip5, data_year);
`;

const MATERIALIZED_VIEWS = `
-- National DRG cost trends (yearly)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_drg_yearly_trend CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_drg_yearly_trend AS
SELECT
  data_year,
  drg_cd,
  MAX(drg_desc) AS drg_desc,
  SUM(avg_total_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_payment,
  SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_charges,
  SUM(avg_medicare_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_medicare,
  SUM(total_discharges) AS total_discharges,
  COUNT(DISTINCT provider_ccn) AS num_providers
FROM medicosts.medicare_inpatient_historical
GROUP BY data_year, drg_cd;

CREATE UNIQUE INDEX idx_mv_drg_trend ON medicosts.mv_drg_yearly_trend (data_year, drg_cd);

-- State-level DRG cost trends (yearly)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_state_yearly_trend CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_state_yearly_trend AS
SELECT
  data_year,
  state_abbr,
  drg_cd,
  SUM(avg_total_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_payment,
  SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_charges,
  SUM(total_discharges) AS total_discharges,
  COUNT(DISTINCT provider_ccn) AS num_providers
FROM medicosts.medicare_inpatient_historical
GROUP BY data_year, state_abbr, drg_cd;

CREATE UNIQUE INDEX idx_mv_state_trend ON medicosts.mv_state_yearly_trend (data_year, state_abbr, drg_cd);

-- Hospital-level yearly trends (all DRGs aggregated)
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_provider_yearly_trend CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_provider_yearly_trend AS
SELECT
  data_year,
  provider_ccn,
  MAX(provider_name) AS provider_name,
  MAX(state_abbr) AS state_abbr,
  SUM(avg_total_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_payment,
  SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_charges,
  SUM(avg_medicare_payments * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_medicare,
  SUM(total_discharges) AS total_discharges,
  COUNT(DISTINCT drg_cd) AS num_drgs
FROM medicosts.medicare_inpatient_historical
GROUP BY data_year, provider_ccn;

CREATE UNIQUE INDEX idx_mv_provider_trend ON medicosts.mv_provider_yearly_trend (data_year, provider_ccn);
`;

/* ------------------------------------------------------------------ */
/*  Discover CSV files by year directory                               */
/* ------------------------------------------------------------------ */
function discoverCSVFiles() {
  const years = fs.readdirSync(BASE_DIR)
    .filter(d => /^\d{4}$/.test(d))
    .sort();

  return years.map(year => {
    const dir = path.join(BASE_DIR, year);
    const csvFile = fs.readdirSync(dir).find(f => f.endsWith('.CSV') || f.endsWith('.csv'));
    if (!csvFile) throw new Error(`No CSV found in ${dir}`);
    return { year: parseInt(year, 10), path: path.join(dir, csvFile), filename: csvFile };
  });
}

/* ------------------------------------------------------------------ */
/*  Stream one CSV into the table                                      */
/* ------------------------------------------------------------------ */
function loadCSV(client, csvPath, dataYear) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(csvPath, { encoding: 'latin1' }).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    let batch = [];
    let total = 0;

    const flush = async (rows) => {
      if (rows.length === 0) return;
      const COLS = 16;
      const placeholders = rows
        .map((_, i) =>
          `(${Array.from({ length: COLS }, (__, c) => `$${i * COLS + c + 1}`).join(',')})`
        )
        .join(',');

      const values = rows.flatMap(r => [
        dataYear,
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
        `INSERT INTO medicosts.medicare_inpatient_historical
           (data_year, provider_ccn, provider_name, provider_city, provider_street,
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
        process.stdout.write(`\r    ${dataYear}: ${total.toLocaleString()} rows…`);
        await flush(chunk);
        parser.resume();
      }
    });

    parser.on('end', async () => {
      total += batch.length;
      await flush(batch);
      process.stdout.write(`\r    ${dataYear}: ${total.toLocaleString()} rows — done.\n`);
      resolve(total);
    });

    parser.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  if (!fs.existsSync(BASE_DIR)) {
    console.error(`Directory not found: ${BASE_DIR}`);
    process.exit(1);
  }

  const csvFiles = discoverCSVFiles();
  console.log(`Found ${csvFiles.length} year(s): ${csvFiles.map(f => f.year).join(', ')}`);

  console.log(`Connecting to ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE} …`);
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    let grandTotal = 0;
    for (const { year, path: csvPath, filename } of csvFiles) {
      console.log(`  Loading ${filename} …`);
      const count = await loadCSV(client, csvPath, year);
      grandTotal += count;
    }

    console.log(`\nCreating indexes …`);
    await client.query(INDEXES);

    console.log('Creating materialized views …');
    await client.query(MATERIALIZED_VIEWS);

    // Sanity checks
    const { rows } = await client.query(
      'SELECT COUNT(*) AS n FROM medicosts.medicare_inpatient_historical'
    );
    console.log(`\n  Total rows: ${parseInt(rows[0].n).toLocaleString()}`);

    const yearCounts = await client.query(
      `SELECT data_year, COUNT(*) AS n
       FROM medicosts.medicare_inpatient_historical
       GROUP BY data_year ORDER BY data_year`
    );
    console.log('  Per-year breakdown:');
    yearCounts.rows.forEach(r =>
      console.log(`    ${r.data_year}: ${parseInt(r.n).toLocaleString()}`)
    );

    const trend = await client.query(
      `SELECT data_year, weighted_avg_payment::int AS avg_pay, total_discharges
       FROM medicosts.mv_drg_yearly_trend
       WHERE drg_cd = '470'
       ORDER BY data_year`
    );
    if (trend.rows.length > 0) {
      console.log('\n  DRG 470 (Major Joint Replacement) trend:');
      trend.rows.forEach(r =>
        console.log(`    ${r.data_year}: $${r.avg_pay.toLocaleString()} (${parseInt(r.total_discharges).toLocaleString()} discharges)`)
      );
    }

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
