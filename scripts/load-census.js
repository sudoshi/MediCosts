#!/usr/bin/env node
/**
 * load-census.js
 * Loads Census ACS 5-Year ZCTA demographics (pre-fetched JSON) into PostgreSQL.
 *
 * Usage: node scripts/load-census.js [path-to-json]
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const JSON_PATH =
  process.argv[2] ||
  path.resolve(__dirname, '../data/census_zcta.json');

const BATCH_SIZE = 500;
const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

DROP TABLE IF EXISTS medicosts.census_zcta CASCADE;
CREATE TABLE medicosts.census_zcta (
  id                       SERIAL PRIMARY KEY,
  zcta                     VARCHAR(5)    NOT NULL,
  zcta_name                TEXT,
  median_household_income  INTEGER,
  total_population         INTEGER
);

CREATE UNIQUE INDEX idx_cz_zcta ON medicosts.census_zcta (zcta);
`;

const NUM_COLS = 4;

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`JSON not found at ${JSON_PATH}`);
    process.exit(1);
  }

  console.log(`Loading Census ZCTA data from ${JSON_PATH} …`);
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  console.log(`  ${data.length.toLocaleString()} ZCTAs to load`);

  const client = await pool.connect();

  try {
    console.log('Creating table …');
    await client.query(DDL);

    let total = 0;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const placeholders = batch
        .map((_, idx) => `(${Array.from({ length: NUM_COLS }, (__, j) => `$${idx * NUM_COLS + j + 1}`).join(',')})`)
        .join(',');

      const values = batch.flatMap((r) => [
        r.zcta,
        r.name,
        r.median_household_income,
        r.total_population,
      ]);

      await client.query(
        `INSERT INTO medicosts.census_zcta
           (zcta, zcta_name, median_household_income, total_population)
         VALUES ${placeholders}`,
        values
      );

      total += batch.length;
      process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows…`);
    }
    process.stdout.write(`\r  Inserted ${total.toLocaleString()} rows — done.\n`);

    const { rows } = await client.query('SELECT COUNT(*) AS n FROM medicosts.census_zcta');
    console.log(`✓ census_zcta has ${parseInt(rows[0].n).toLocaleString()} rows.`);

    const sample = await client.query(
      "SELECT zcta, median_household_income, total_population FROM medicosts.census_zcta WHERE zcta IN ('90210','10001','60601') ORDER BY zcta"
    );
    console.log('✓ Sample ZCTAs:');
    sample.rows.forEach((r) =>
      console.log(`    ${r.zcta}: income $${r.median_household_income?.toLocaleString() || 'N/A'}, pop ${r.total_population?.toLocaleString() || 'N/A'}`)
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
