#!/usr/bin/env node
/**
 * promote-suppliers.js
 * Promotes stage medical equipment supplier data → medicosts.medical_equipment_suppliers
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const pool = new pg.Pool();

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating medicosts.medical_equipment_suppliers …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.medical_equipment_suppliers CASCADE;
      CREATE TABLE medicosts.medical_equipment_suppliers (
        id                  SERIAL PRIMARY KEY,
        provider_id         VARCHAR(20) NOT NULL,
        business_name       TEXT,
        practice_name       TEXT,
        address             TEXT,
        city                TEXT,
        state               VARCHAR(2),
        zip_code            VARCHAR(10),
        phone               TEXT,
        specialties         TEXT,
        provider_types      TEXT,
        supplies            TEXT,
        latitude            NUMERIC(12,8),
        longitude           NUMERIC(12,8),
        accepts_assignment  BOOLEAN
      );
    `);

    const result = await client.query(`
      INSERT INTO medicosts.medical_equipment_suppliers
        (provider_id, business_name, practice_name, address, city, state, zip_code,
         phone, specialties, provider_types, supplies, latitude, longitude, accepts_assignment)
      SELECT
        provider_id,
        businessname,
        practicename,
        practiceaddress1,
        practicecity,
        practicestate,
        LEFT(practicezip9code, 5),
        telephonenumber,
        specialitieslist,
        providertypelist,
        supplieslist,
        CASE WHEN latitude ~ '^\-?[0-9]+\.?[0-9]*$' THEN latitude::NUMERIC(12,8) ELSE NULL END,
        CASE WHEN longitude ~ '^\-?[0-9]+\.?[0-9]*$' THEN longitude::NUMERIC(12,8) ELSE NULL END,
        CASE WHEN UPPER(acceptsassignement) = 'Y' THEN TRUE
             WHEN UPPER(acceptsassignement) = 'N' THEN FALSE
             ELSE NULL END
      FROM stage.supplier_directory__medical_equipment_suppliers
      WHERE provider_id IS NOT NULL
    `);
    console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);

    await client.query(`
      CREATE INDEX idx_mes_provider   ON medicosts.medical_equipment_suppliers (provider_id);
      CREATE INDEX idx_mes_state      ON medicosts.medical_equipment_suppliers (state);
      CREATE INDEX idx_mes_zip        ON medicosts.medical_equipment_suppliers (zip_code);
    `);

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
