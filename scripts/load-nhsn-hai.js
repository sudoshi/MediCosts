#!/usr/bin/env node
/**
 * load-nhsn-hai.js — Loads Healthcare-Associated Infections (NHSN HAI) data.
 * Source: CMS Hospital Compare — HAI measures (SIR values).
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'nhsn_hai',
  csvFilename: 'healthcare_associated_infections.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.nhsn_hai CASCADE;
    CREATE TABLE medicosts.nhsn_hai (
      id                   SERIAL PRIMARY KEY,
      facility_id          VARCHAR(10)  NOT NULL,
      facility_name        TEXT,
      state                VARCHAR(2),
      zip_code             VARCHAR(5),
      measure_id           VARCHAR(50)  NOT NULL,
      measure_name         TEXT,
      compared_to_national VARCHAR(80),
      score                NUMERIC(10,4),
      footnote             TEXT,
      start_date           DATE,
      end_date             DATE
    );
    CREATE INDEX idx_hai_facility ON medicosts.nhsn_hai (facility_id);
    CREATE INDEX idx_hai_measure  ON medicosts.nhsn_hai (measure_id);
    CREATE INDEX idx_hai_state    ON medicosts.nhsn_hai (state);
  `,
  columns: [
    'facility_id', 'facility_name', 'state', 'zip_code',
    'measure_id', 'measure_name', 'compared_to_national',
    'score', 'footnote', 'start_date', 'end_date',
  ],
  mapRow: (r) => [
    r['Facility ID'] || r['facility_id'] || r['Provider ID'],
    r['Facility Name'] || r['facility_name'] || r['Hospital Name'],
    r['State'] || r['state'],
    (r['ZIP Code'] || r['zip_code'] || '').slice(0, 5),
    r['Measure ID'] || r['measure_id'],
    r['Measure Name'] || r['measure_name'],
    r['Compared to National'] || r['compared_to_national'] || null,
    parseScore(r['Score'] || r['score']),
    r['Footnote'] || r['footnote'] || null,
    parseDate(r['Start Date'] || r['start_date'] || r['Measure Start Date']),
    parseDate(r['End Date'] || r['end_date'] || r['Measure End Date']),
  ],
});

function parseScore(v) {
  if (!v || v === 'Not Available' || v === '--') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseDate(v) {
  if (!v || v === 'Not Available') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

run().catch((err) => { console.error(err); process.exit(1); });
