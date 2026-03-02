#!/usr/bin/env node
/**
 * promote-open-payments.js
 * Promotes CMS Open Payments (Sunshine Act) data → medicosts.open_payments
 * Merges PY2023 + PY2024 general payments tables from stage schema.
 *
 * Source: CMS Open Payments Program (42 CFR Part 403)
 * Stage tables:
 *   stage.cms_open_payments__open_payments_general_py2023
 *   stage.cms_open_payments__open_payments_general_py2024
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const pool = new pg.Pool();

const SAFE_NUM = (col) =>
  `CASE WHEN ${col} ~ '^\\-?[0-9]+\\.?[0-9]*$' THEN ${col}::NUMERIC ELSE NULL END`;

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating medicosts.open_payments …');
    await client.query(`
      DROP TABLE IF EXISTS medicosts.open_payments CASCADE;

      CREATE TABLE medicosts.open_payments (
        id                    BIGSERIAL PRIMARY KEY,
        payment_year          SMALLINT NOT NULL,
        record_id             TEXT,

        -- Recipient (physician or hospital)
        recipient_type        VARCHAR(60),     -- 'Covered Recipient Physician', etc.
        physician_npi         VARCHAR(10),
        physician_first_name  TEXT,
        physician_last_name   TEXT,
        physician_specialty   TEXT,
        hospital_ccn          VARCHAR(10),
        hospital_name         TEXT,

        -- Recipient address
        recipient_city        TEXT,
        recipient_state       CHAR(2),
        recipient_zip         VARCHAR(10),

        -- Payer
        payer_name            TEXT,
        payer_state           CHAR(2),

        -- Payment
        payment_amount        NUMERIC(14,2),
        payment_date          DATE,
        num_payments          SMALLINT,
        payment_form          TEXT,           -- food, cash, stock, etc.
        payment_nature        TEXT,           -- consulting fee, gift, etc.

        -- Associated product (first product only)
        product_type          TEXT,           -- Drug/Device/Biological/Supply
        product_name          TEXT,
        product_ndc           TEXT,
        product_category      TEXT,

        -- Flags
        physician_ownership   BOOLEAN,
        charity               BOOLEAN,
        dispute_status        TEXT
      );
    `);

    const years = [
      { year: 2023, table: 'stage.cms_open_payments__open_payments_general_py2023' },
      { year: 2024, table: 'stage.cms_open_payments__open_payments_general_py2024' },
    ];

    for (const { year, table } of years) {
      console.log(`Inserting PY${year} from ${table} …`);

      // Check table exists
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = split_part($1, '.', 1)
          AND table_name   = split_part($1, '.', 2)
      `, [table]);

      if (exists.rowCount === 0) {
        console.log(`  ⚠ Table ${table} not found — skipping`);
        continue;
      }

      const result = await client.query(`
        INSERT INTO medicosts.open_payments (
          payment_year, record_id,
          recipient_type, physician_npi, physician_first_name, physician_last_name,
          physician_specialty, hospital_ccn, hospital_name,
          recipient_city, recipient_state, recipient_zip,
          payer_name, payer_state,
          payment_amount, payment_date, num_payments, payment_form, payment_nature,
          product_type, product_name, product_ndc, product_category,
          physician_ownership, charity, dispute_status
        )
        SELECT
          ${year},
          record_id,
          covered_recipient_type,
          NULLIF(TRIM(covered_recipient_npi), ''),
          NULLIF(TRIM(covered_recipient_first_name), ''),
          NULLIF(TRIM(covered_recipient_last_name), ''),
          NULLIF(TRIM(covered_recipient_specialty_1), ''),
          NULLIF(TRIM(teaching_hospital_ccn), ''),
          NULLIF(TRIM(teaching_hospital_name), ''),
          NULLIF(TRIM(recipient_city), ''),
          NULLIF(TRIM(recipient_state), ''),
          LEFT(NULLIF(TRIM(recipient_zip_code), ''), 10),
          NULLIF(TRIM(applicable_manufacturer_or_applicable_gpo_making_payment_name), ''),
          NULLIF(TRIM(applicable_manufacturer_or_applicable_gpo_making_payment_state), ''),
          ${SAFE_NUM('total_amount_of_payment_usdollars')},
          CASE
            WHEN date_of_payment ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN TO_DATE(date_of_payment, 'MM/DD/YYYY')
            WHEN date_of_payment ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              THEN date_of_payment::DATE
            ELSE NULL
          END,
          CASE WHEN number_of_payments_included_in_total_amount ~ '^[0-9]+$'
            THEN number_of_payments_included_in_total_amount::SMALLINT ELSE NULL END,
          NULLIF(TRIM(form_of_payment_or_transfer_of_value), ''),
          NULLIF(TRIM(nature_of_payment_or_transfer_of_value), ''),
          NULLIF(TRIM(indicate_drug_or_biological_or_device_or_medical_supply_1), ''),
          NULLIF(TRIM(name_of_drug_or_biological_or_device_or_medical_supply_1), ''),
          NULLIF(TRIM(associated_drug_or_biological_ndc_1), ''),
          NULLIF(TRIM(product_category_or_therapeutic_area_1), ''),
          LOWER(physician_ownership_indicator) = 'yes',
          LOWER(charity_indicator) = 'yes',
          NULLIF(TRIM(dispute_status_for_publication), '')
        FROM ${table}
        WHERE total_amount_of_payment_usdollars IS NOT NULL
          AND ${SAFE_NUM('total_amount_of_payment_usdollars')} IS NOT NULL
          AND ${SAFE_NUM('total_amount_of_payment_usdollars')} > 0
      `);
      console.log(`  Inserted ${result.rowCount.toLocaleString()} rows`);
    }

    console.log('Building indexes …');
    await client.query(`
      CREATE INDEX idx_op_npi        ON medicosts.open_payments (physician_npi);
      CREATE INDEX idx_op_ccn        ON medicosts.open_payments (hospital_ccn);
      CREATE INDEX idx_op_year       ON medicosts.open_payments (payment_year);
      CREATE INDEX idx_op_state      ON medicosts.open_payments (recipient_state);
      CREATE INDEX idx_op_payer      ON medicosts.open_payments (payer_name);
      CREATE INDEX idx_op_nature     ON medicosts.open_payments (payment_nature);
      CREATE INDEX idx_op_amount     ON medicosts.open_payments (payment_amount DESC);
    `);

    // Summary materialized view for top payers / natures
    console.log('Creating summary materialized view …');
    await client.query(`
      DROP MATERIALIZED VIEW IF EXISTS medicosts.mv_open_payments_summary;

      CREATE MATERIALIZED VIEW medicosts.mv_open_payments_summary AS
      SELECT
        payment_year,
        payment_nature,
        recipient_state,
        payer_name,
        COUNT(*)                             AS num_payments,
        SUM(payment_amount)                  AS total_amount,
        AVG(payment_amount)                  AS avg_amount,
        COUNT(DISTINCT physician_npi)        AS unique_physicians,
        COUNT(DISTINCT hospital_ccn)         AS unique_hospitals
      FROM medicosts.open_payments
      GROUP BY payment_year, payment_nature, recipient_state, payer_name
      WITH DATA;

      CREATE INDEX idx_mvops_year   ON medicosts.mv_open_payments_summary (payment_year);
      CREATE INDEX idx_mvops_nature ON medicosts.mv_open_payments_summary (payment_nature);
      CREATE INDEX idx_mvops_state  ON medicosts.mv_open_payments_summary (recipient_state);
      CREATE INDEX idx_mvops_payer  ON medicosts.mv_open_payments_summary (payer_name);
    `);

    console.log('Done.');

    // Print summary stats
    const stats = await client.query(`
      SELECT payment_year, COUNT(*) as rows, SUM(payment_amount) as total
      FROM medicosts.open_payments
      GROUP BY payment_year ORDER BY payment_year
    `);
    for (const row of stats.rows) {
      const total = parseFloat(row.total).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      console.log(`  PY${row.payment_year}: ${Number(row.rows).toLocaleString()} payments, ${total} total`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
