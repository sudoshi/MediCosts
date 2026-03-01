#!/usr/bin/env node
/**
 * load-payment-value.js — Loads Payment and Value of Care — Hospital data.
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'payment_value_care',
  csvFilename: 'payment_value_of_care.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.payment_value_care CASCADE;
    CREATE TABLE medicosts.payment_value_care (
      id                   SERIAL PRIMARY KEY,
      facility_id          VARCHAR(10) NOT NULL,
      facility_name        TEXT,
      state                VARCHAR(2),
      measure_id           VARCHAR(50) NOT NULL,
      measure_name         TEXT,
      payment_category     VARCHAR(100),
      denominator          INTEGER,
      payment              NUMERIC(14,2),
      lower_estimate       NUMERIC(14,2),
      higher_estimate      NUMERIC(14,2),
      value_of_care        VARCHAR(100),
      footnote             TEXT,
      start_date           DATE,
      end_date             DATE
    );
    CREATE INDEX idx_pvc_facility ON medicosts.payment_value_care (facility_id);
    CREATE INDEX idx_pvc_measure  ON medicosts.payment_value_care (measure_id);
  `,
  columns: [
    'facility_id', 'facility_name', 'state',
    'measure_id', 'measure_name', 'payment_category',
    'denominator', 'payment', 'lower_estimate', 'higher_estimate',
    'value_of_care', 'footnote', 'start_date', 'end_date',
  ],
  mapRow: (r) => [
    r['Facility ID'] || r['facility_id'] || r['Provider ID'],
    r['Facility Name'] || r['facility_name'] || r['Hospital Name'],
    r['State'] || r['state'],
    r['Payment Measure ID'] || r['Measure ID'],
    r['Payment Measure Name'] || r['Measure Name'],
    r['Payment Category'] || r['payment_category'] || null,
    num(r['Denominator'] || r['denominator']),
    num(r['Payment'] || r['payment']),
    num(r['Lower Estimate'] || r['lower_estimate']),
    num(r['Higher Estimate'] || r['higher_estimate']),
    r['Value of Care Display ID'] || r['value_of_care'] || r['Value of Care Category'] || null,
    r['Payment Footnote'] || r['Footnote'] || null,
    parseDate(r['Start Date'] || r['start_date'] || r['Payment Measure Start Date']),
    parseDate(r['End Date'] || r['end_date'] || r['Payment Measure End Date']),
  ],
});

function num(v) {
  if (!v || v === 'Not Available' || v === '--' || v === 'N/A') return null;
  const cleaned = String(v).replace(/[$,]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
function parseDate(v) {
  if (!v || v === 'Not Available') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

run().catch((err) => { console.error(err); process.exit(1); });
