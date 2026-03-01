#!/usr/bin/env node
/**
 * load-physician.js
 * Loads Medicare Physician & Other Practitioners CSV into PostgreSQL.
 * This is the largest dataset (~9M rows) — expect 10-15 minutes.
 *
 * Usage: node scripts/load-physician.js [path-to-csv]
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
  path.resolve(__dirname, '../data/MUP_PHY_RY25_DY23_PrvSvc.csv');

const BATCH_SIZE = 500;
const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.medicare_physician CASCADE;
CREATE TABLE medicosts.medicare_physician (
  id                         SERIAL PRIMARY KEY,
  npi                        VARCHAR(10)    NOT NULL,
  provider_last_name         VARCHAR(100),
  provider_first_name        VARCHAR(100),
  provider_credentials       VARCHAR(50),
  provider_entity_type       VARCHAR(2),
  provider_city              VARCHAR(100),
  provider_state             VARCHAR(2)     NOT NULL,
  provider_zip5              VARCHAR(5)     NOT NULL,
  provider_country           VARCHAR(2),
  provider_type              VARCHAR(100),
  hcpcs_cd                   VARCHAR(10)    NOT NULL,
  hcpcs_desc                 TEXT,
  hcpcs_drug_indicator       VARCHAR(1),
  place_of_service           VARCHAR(1),
  total_beneficiaries        INTEGER,
  total_services             NUMERIC(14,1),
  avg_submitted_charge       NUMERIC(14,2),
  avg_medicare_allowed       NUMERIC(14,2),
  avg_medicare_payment       NUMERIC(14,2),
  avg_medicare_standardized  NUMERIC(14,2)
);

CREATE INDEX idx_mp_npi    ON medicosts.medicare_physician (npi);
CREATE INDEX idx_mp_zip    ON medicosts.medicare_physician (provider_zip5);
CREATE INDEX idx_mp_hcpcs  ON medicosts.medicare_physician (hcpcs_cd);
CREATE INDEX idx_mp_state  ON medicosts.medicare_physician (provider_state);
`;

const PHYSICIAN_MV = `
DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_physician_zip_summary CASCADE;
CREATE MATERIALIZED VIEW medicosts.mv_physician_zip_summary AS
SELECT
  mp.provider_zip5                    AS zip5,
  mp.provider_state                   AS state_abbr,
  mp.hcpcs_cd,
  MAX(mp.hcpcs_desc)                  AS hcpcs_desc,
  COUNT(DISTINCT mp.npi)::int         AS num_physicians,
  SUM(mp.total_services)::NUMERIC(14,0)  AS total_services,
  SUM(mp.total_services * mp.avg_submitted_charge) / NULLIF(SUM(mp.total_services), 0)
    AS weighted_avg_charge,
  SUM(mp.total_services * mp.avg_medicare_payment) / NULLIF(SUM(mp.total_services), 0)
    AS weighted_avg_medicare
FROM medicosts.medicare_physician mp
WHERE mp.provider_zip5 IN (
  SELECT DISTINCT zip5 FROM medicosts.medicare_inpatient
)
GROUP BY mp.provider_zip5, mp.provider_state, mp.hcpcs_cd;

CREATE INDEX idx_mv_phys_zip   ON medicosts.mv_physician_zip_summary (zip5);
CREATE INDEX idx_mv_phys_hcpcs ON medicosts.mv_physician_zip_summary (hcpcs_cd);
CREATE INDEX idx_mv_phys_state ON medicosts.mv_physician_zip_summary (state_abbr);
`;

const NUM_COLS = 20;

function parseNum(v) {
  if (!v || v === '' || v === 'N/A') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseInt2(v) {
  if (!v || v === '' || v === 'N/A') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

async function loadCSV(client) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(CSV_PATH, { encoding: 'latin1' }).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    let batch = [];
    let total = 0;
    const startTime = Date.now();

    const flush = async (rows) => {
      if (rows.length === 0) return;
      const placeholders = rows
        .map((_, i) => `(${Array.from({ length: NUM_COLS }, (__, j) => `$${i * NUM_COLS + j + 1}`).join(',')})`)
        .join(',');

      const values = rows.flatMap((r) => [
        r.Rndrng_NPI,
        r.Rndrng_Prvdr_Last_Org_Name,
        r.Rndrng_Prvdr_First_Name,
        r.Rndrng_Prvdr_Crdntls,
        r.Rndrng_Prvdr_Ent_Cd,
        r.Rndrng_Prvdr_City,
        r.Rndrng_Prvdr_State_Abrvtn,
        r.Rndrng_Prvdr_Zip5,
        r.Rndrng_Prvdr_Cntry,
        r.Rndrng_Prvdr_Type,
        r.HCPCS_Cd,
        r.HCPCS_Desc,
        r.HCPCS_Drug_Ind,
        r.Place_Of_Srvc,
        parseInt2(r.Tot_Benes),
        parseNum(r.Tot_Srvcs),
        parseNum(r.Avg_Sbmtd_Chrg),
        parseNum(r.Avg_Mdcr_Alowd_Amt),
        parseNum(r.Avg_Mdcr_Pymt_Amt),
        parseNum(r.Avg_Mdcr_Stdzd_Amt),
      ]);

      await client.query(
        `INSERT INTO medicosts.medicare_physician
           (npi, provider_last_name, provider_first_name, provider_credentials,
            provider_entity_type, provider_city, provider_state, provider_zip5,
            provider_country, provider_type,
            hcpcs_cd, hcpcs_desc, hcpcs_drug_indicator, place_of_service,
            total_beneficiaries, total_services,
            avg_submitted_charge, avg_medicare_allowed, avg_medicare_payment,
            avg_medicare_standardized)
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
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (total / elapsed).toFixed(0);
        process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows… (${rate} rows/sec, ${elapsed}s elapsed)`);
        await flush(chunk);
        parser.resume();
      }
    });

    parser.on('end', async () => {
      total += batch.length;
      await flush(batch);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows — done. (${elapsed}s)\n`);
      resolve(total);
    });

    parser.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`Loading Medicare physician data from ${CSV_PATH} …`);
  console.log('⚠  This is a large dataset (~9M rows). Expect 10-15 minutes.');
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    console.log('Streaming CSV …');
    await loadCSV(client);

    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.medicare_physician');
    console.log(`✓ medicare_physician has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    console.log('Creating materialized view (ZIP-level summary) …');
    await client.query(PHYSICIAN_MV);

    const mvCount = await client.query('SELECT COUNT(*) AS n FROM medicosts.mv_physician_zip_summary');
    console.log(`✓ mv_physician_zip_summary has ${parseInt(mvCount.rows[0].n).toLocaleString()} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
