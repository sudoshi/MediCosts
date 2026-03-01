#!/usr/bin/env node
/**
 * load-hospital-quality.js
 * Loads Hospital General Info + Star Ratings CSV into PostgreSQL.
 *
 * Usage: node scripts/load-hospital-quality.js [path-to-csv]
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
  path.resolve(__dirname, '../data/hospital_general_info.csv');

const BATCH_SIZE = 500;
const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.hospital_info CASCADE;
CREATE TABLE medicosts.hospital_info (
  id                       SERIAL PRIMARY KEY,
  facility_id              VARCHAR(10)   NOT NULL,
  facility_name            TEXT          NOT NULL,
  address                  TEXT,
  city                     VARCHAR(100),
  state                    VARCHAR(2)    NOT NULL,
  zip_code                 VARCHAR(5)    NOT NULL,
  county_name              VARCHAR(100),
  phone_number             VARCHAR(20),
  hospital_type            VARCHAR(100),
  hospital_ownership       VARCHAR(100),
  emergency_services       BOOLEAN,
  hospital_overall_rating  SMALLINT
);

CREATE UNIQUE INDEX idx_hi_facility ON medicosts.hospital_info (facility_id);
CREATE INDEX idx_hi_state   ON medicosts.hospital_info (state);
CREATE INDEX idx_hi_zip     ON medicosts.hospital_info (zip_code);
CREATE INDEX idx_hi_rating  ON medicosts.hospital_info (hospital_overall_rating);
`;

const NUM_COLS = 12;

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
        r['Facility Name'],
        r['Address'],
        r['City/Town'],
        r['State'],
        (r['ZIP Code'] || '').slice(0, 5),
        r['County/Parish'],
        r['Telephone Number'],
        r['Hospital Type'],
        r['Hospital Ownership'],
        r['Emergency Services'] === 'Yes',
        r['Hospital overall rating'] && r['Hospital overall rating'] !== 'Not Available'
          ? parseInt(r['Hospital overall rating'], 10)
          : null,
      ]);

      await client.query(
        `INSERT INTO medicosts.hospital_info
           (facility_id, facility_name, address, city, state, zip_code,
            county_name, phone_number, hospital_type, hospital_ownership,
            emergency_services, hospital_overall_rating)
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

  console.log(`Loading hospital quality data from ${CSV_PATH} …`);
  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    console.log('Streaming CSV …');
    await loadCSV(client);

    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.hospital_info');
    console.log(`✓ hospital_info has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    const rated = await client.query(
      'SELECT hospital_overall_rating AS stars, COUNT(*)::int AS n FROM medicosts.hospital_info WHERE hospital_overall_rating IS NOT NULL GROUP BY 1 ORDER BY 1'
    );
    console.log('✓ Star rating distribution:');
    rated.rows.forEach((r) => console.log(`    ${r.stars} stars: ${r.n} hospitals`));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
