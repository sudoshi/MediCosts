#!/usr/bin/env node
/**
 * create-connector-tables.js
 * Creates tables for the Data Connector architecture:
 *   - connectors: connector configurations
 *   - connector_sync_log: sync history
 *   - imported_data: JSONB storage for imported records
 *
 * Usage: node scripts/create-connector-tables.js
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool();

const DDL = `
CREATE SCHEMA IF NOT EXISTS medicosts;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Connector configurations
CREATE TABLE IF NOT EXISTS medicosts.connectors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  type         VARCHAR(50) NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}',
  status       VARCHAR(20) DEFAULT 'inactive',
  last_sync_at TIMESTAMPTZ,
  last_error   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Sync audit log
CREATE TABLE IF NOT EXISTS medicosts.connector_sync_log (
  id             SERIAL PRIMARY KEY,
  connector_id   UUID REFERENCES medicosts.connectors(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL,
  records_synced INTEGER DEFAULT 0,
  error_message  TEXT,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_log_connector ON medicosts.connector_sync_log (connector_id);

-- Imported data (JSONB records linked to hospitals)
CREATE TABLE IF NOT EXISTS medicosts.imported_data (
  id             SERIAL PRIMARY KEY,
  connector_id   UUID REFERENCES medicosts.connectors(id) ON DELETE CASCADE,
  data_type      VARCHAR(100),
  facility_id    VARCHAR(10),
  record_data    JSONB NOT NULL,
  imported_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imported_facility  ON medicosts.imported_data (facility_id);
CREATE INDEX IF NOT EXISTS idx_imported_connector ON medicosts.imported_data (connector_id);
CREATE INDEX IF NOT EXISTS idx_imported_type      ON medicosts.imported_data (data_type);
`;

async function main() {
  console.log('Creating connector tables …');
  await pool.query(DDL);

  const { rows } = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'medicosts' AND tablename IN ('connectors', 'connector_sync_log', 'imported_data')
    ORDER BY tablename
  `);
  rows.forEach((r) => console.log(`✓ medicosts.${r.tablename}`));
  console.log('Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
