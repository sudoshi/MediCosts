/**
 * Load ZIP centroids from client/src/data/zipCentroids.json into PostgreSQL.
 * Creates medicosts.zip_centroids table for haversine distance queries.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool();

const DDL = `
  CREATE TABLE IF NOT EXISTS medicosts.zip_centroids (
    zip5  VARCHAR(5) PRIMARY KEY,
    lat   NUMERIC(10,6) NOT NULL,
    lon   NUMERIC(10,6) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_zc_lat_lon ON medicosts.zip_centroids (lat, lon);
`;

async function run() {
  const client = await pool.connect();
  try {
    await client.query(DDL);

    const raw = readFileSync(
      path.resolve(__dirname, '../client/src/data/zipCentroids.json'),
      'utf8'
    );
    const centroids = JSON.parse(raw);
    const entries = Object.entries(centroids);
    console.log(`Loading ${entries.length} ZIP centroids...`);

    const BATCH = 500;
    let loaded = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const values = batch.map((_, j) => {
        const base = j * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      }).join(', ');
      const params = batch.flatMap(([zip, [lat, lng]]) => [zip, lat, lng]);
      await client.query(
        `INSERT INTO medicosts.zip_centroids (zip5, lat, lon) VALUES ${values}
         ON CONFLICT (zip5) DO NOTHING`,
        params
      );
      loaded = Math.min(i + BATCH, entries.length);
      process.stdout.write(`\r  ${loaded}/${entries.length}`);
    }
    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
