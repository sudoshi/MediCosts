#!/usr/bin/env node
/**
 * load-hcahps.js
 * Loads HCAHPS Patient Survey CSV into PostgreSQL.
 *
 * Usage: node scripts/load-hcahps.js [path-to-csv]
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
  path.resolve(__dirname, '../data/hcahps_patient_survey.csv');

const BATCH_SIZE = 500;
const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.hcahps_survey CASCADE;
CREATE TABLE medicosts.hcahps_survey (
  id                         SERIAL PRIMARY KEY,
  facility_id                VARCHAR(10)   NOT NULL,
  hcahps_measure_id          VARCHAR(30)   NOT NULL,
  hcahps_question            TEXT,
  hcahps_answer_desc         TEXT,
  hcahps_answer_pct          NUMERIC(5,1),
  num_completed_surveys      INTEGER,
  survey_response_rate       NUMERIC(5,1),
  patient_survey_star_rating SMALLINT,
  hcahps_linear_mean_value   NUMERIC(5,1)
);

CREATE INDEX idx_hcahps_facility   ON medicosts.hcahps_survey (facility_id);
CREATE INDEX idx_hcahps_measure    ON medicosts.hcahps_survey (hcahps_measure_id);
CREATE INDEX idx_hcahps_fac_measure ON medicosts.hcahps_survey (facility_id, hcahps_measure_id);
`;

const NUM_COLS = 9;

function parseNum(v) {
  if (!v || v === 'Not Available' || v === 'Not Applicable') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseInt2(v) {
  if (!v || v === 'Not Available' || v === 'Not Applicable') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

async function loadCSV(client) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(CSV_PATH, { encoding: 'utf-8' }).pipe(
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
        r['Facility ID'],
        r['HCAHPS Measure ID'],
        r['HCAHPS Question'],
        r['HCAHPS Answer Description'],
        parseNum(r['HCAHPS Answer Percent']),
        parseInt2(r['Number of Completed Surveys']),
        parseNum(r['Survey Response Rate Percent']),
        parseInt2(r['Patient Survey Star Rating']),
        parseNum(r['HCAHPS Linear Mean Value']),
      ]);

      await client.query(
        `INSERT INTO medicosts.hcahps_survey
           (facility_id, hcahps_measure_id, hcahps_question, hcahps_answer_desc,
            hcahps_answer_pct, num_completed_surveys, survey_response_rate,
            patient_survey_star_rating, hcahps_linear_mean_value)
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

  console.log(`Loading HCAHPS survey data from ${CSV_PATH} …`);
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    console.log('Streaming CSV …');
    await loadCSV(client);

    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.hcahps_survey');
    console.log(`✓ hcahps_survey has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    const measures = await client.query(
      "SELECT hcahps_measure_id, COUNT(*)::int AS n FROM medicosts.hcahps_survey GROUP BY 1 ORDER BY 1 LIMIT 10"
    );
    console.log('✓ Sample measure IDs:');
    measures.rows.forEach((r) => console.log(`    ${r.hcahps_measure_id}: ${r.n} rows`));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
