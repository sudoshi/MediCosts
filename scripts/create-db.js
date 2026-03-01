#!/usr/bin/env node
/**
 * create-db.js
 * Creates the medicosts database and schema.
 * Run once before load-data.js if the database doesn't exist.
 *
 * Usage: node create-db.js
 * Uses PG* env vars; connects to 'postgres' to create medicosts DB.
 */

import 'dotenv/config';
import pg from 'pg';

const dbName = process.env.PGDATABASE || 'medicosts';

async function main() {
  // Connect to default postgres DB to create medicosts
  const adminPool = new pg.Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: 'postgres',
  });

  const client = await adminPool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✓ Database "${dbName}" created.`);
    } else {
      console.log(`✓ Database "${dbName}" already exists.`);
    }
  } finally {
    client.release();
    await adminPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
