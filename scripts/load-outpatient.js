#!/usr/bin/env node
/**
 * load-outpatient.js
 * Loads Medicare Outpatient Hospitals CSV into PostgreSQL.
 *
 * Usage: node scripts/load-outpatient.js [path-to-csv]
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
  path.resolve(__dirname, '../data/MUP_OUT_RY25_DY23_PrvSvc.csv');

const BATCH_SIZE = 500;
const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.medicare_outpatient CASCADE;
CREATE TABLE medicosts.medicare_outpatient (
  id                      SERIAL PRIMARY KEY,
  provider_ccn            VARCHAR(10)    NOT NULL,
  provider_name           TEXT           NOT NULL,
  provider_city           VARCHAR(100),
  provider_street         TEXT,
  state_abbr              VARCHAR(2)     NOT NULL,
  state_fips              VARCHAR(2),
  zip5                    VARCHAR(5)     NOT NULL,
  ruca_code               VARCHAR(10),
  ruca_desc               TEXT,
  apc_cd                  VARCHAR(10)    NOT NULL,
  apc_desc                TEXT           NOT NULL,
  beneficiary_count       INTEGER,
  capc_services           INTEGER,
  avg_submitted_charges   NUMERIC(14,2),
  avg_allowed_amount      NUMERIC(14,2),
  avg_medicare_payment    NUMERIC(14,2),
  outlier_services        INTEGER,
  avg_outlier_amount      NUMERIC(14,2)
);

CREATE INDEX idx_mo_apc      ON medicosts.medicare_outpatient (apc_cd);
CREATE INDEX idx_mo_zip      ON medicosts.medicare_outpatient (zip5);
CREATE INDEX idx_mo_provider ON medicosts.medicare_outpatient (provider_ccn);
CREATE INDEX idx_mo_state    ON medicosts.medicare_outpatient (state_abbr);
`;

const NUM_COLS = 18;

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

    const flush = async (rows) => {
      if (rows.length === 0) return;
      const placeholders = rows
        .map((_, i) => `(${Array.from({ length: NUM_COLS }, (__, j) => `$${i * NUM_COLS + j + 1}`).join(',')})`)
        .join(',');

      const values = rows.flatMap((r) => [
        r.Rndrng_Prvdr_CCN,
        r.Rndrng_Prvdr_Org_Name,
        r.Rndrng_Prvdr_City,
        r.Rndrng_Prvdr_St,
        r.Rndrng_Prvdr_State_Abrvtn,
        r.Rndrng_Prvdr_State_FIPS,
        r.Rndrng_Prvdr_Zip5,
        r.Rndrng_Prvdr_RUCA,
        r.Rndrng_Prvdr_RUCA_Desc,
        r.APC_Cd,
        r.APC_Desc,
        parseInt2(r.Bene_Cnt),
        parseInt2(r.CAPC_Srvcs),
        parseNum(r.Avg_Tot_Sbmtd_Chrgs),
        parseNum(r.Avg_Mdcr_Alowd_Amt),
        parseNum(r.Avg_Mdcr_Pymt_Amt),
        parseInt2(r.Outlier_Srvcs),
        parseNum(r.Avg_Mdcr_Outlier_Amt),
      ]);

      await client.query(
        `INSERT INTO medicosts.medicare_outpatient
           (provider_ccn, provider_name, provider_city, provider_street,
            state_abbr, state_fips, zip5, ruca_code, ruca_desc,
            apc_cd, apc_desc, beneficiary_count, capc_services,
            avg_submitted_charges, avg_allowed_amount, avg_medicare_payment,
            outlier_services, avg_outlier_amount)
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

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`Loading Medicare outpatient data from ${CSV_PATH} …`);
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    console.log('Streaming CSV …');
    await loadCSV(client);

    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.medicare_outpatient');
    console.log(`✓ medicare_outpatient has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    const top = await client.query(`
      SELECT apc_cd, MAX(apc_desc) AS apc_desc,
        (SUM(avg_medicare_payment * capc_services) / NULLIF(SUM(capc_services), 0))::int AS avg_pay
      FROM medicosts.medicare_outpatient
      GROUP BY apc_cd ORDER BY avg_pay DESC LIMIT 3
    `);
    console.log('✓ Top 3 APCs by avg payment:');
    top.rows.forEach((r) => console.log(`    ${r.apc_cd} — $${r.avg_pay?.toLocaleString()} — ${(r.apc_desc || '').slice(0, 60)}`));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
