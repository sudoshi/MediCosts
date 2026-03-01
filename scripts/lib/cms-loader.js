/**
 * cms-loader.js — Reusable CMS CSV loader following the established pattern.
 * Each load script provides DDL, column mapping, and metadata.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import pg from 'pg';

export function createLoader({ name, csvFilename, ddl, columns, mapRow }) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const CSV_PATH = process.argv[2] || path.resolve(__dirname, '../../data', csvFilename);
  const BATCH_SIZE = 500;
  const NUM_COLS = columns.length;

  async function loadCSV(client) {
    return new Promise((resolve, reject) => {
      const parser = fs.createReadStream(CSV_PATH, { encoding: 'utf-8' }).pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true })
      );

      let batch = [];
      let total = 0;
      let headerLogged = false;

      const flush = async (rows) => {
        if (rows.length === 0) return;
        const placeholders = rows
          .map((_, i) =>
            `(${Array.from({ length: NUM_COLS }, (__, j) => `$${i * NUM_COLS + j + 1}`).join(',')})`
          )
          .join(',');

        const values = rows.flatMap(mapRow);

        await client.query(
          `INSERT INTO medicosts.${name} (${columns.join(', ')}) VALUES ${placeholders}`,
          values
        );
      };

      parser.on('data', async (row) => {
        if (!headerLogged) {
          console.log('  CSV columns:', Object.keys(row).slice(0, 8).join(', '), '...');
          headerLogged = true;
        }
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

  return async function main() {
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`CSV not found at ${CSV_PATH}`);
      console.error(`Run: node scripts/download-datasets.js`);
      process.exit(1);
    }

    console.log(`Loading ${name} from ${CSV_PATH} …`);
    const pool = new pg.Pool();
    const client = await pool.connect();

    try {
      console.log('Creating table …');
      await client.query(ddl);

      console.log('Streaming CSV …');
      await loadCSV(client);

      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM medicosts.${name}`);
      console.log(`✓ ${name} has ${parseInt(rows[0].n).toLocaleString()} rows.`);
    } finally {
      client.release();
      await pool.end();
    }
  };
}
