#!/usr/bin/env node
/**
 * load-readmissions.js — Loads Hospital Readmissions Reduction Program (HRRP) data.
 * Actual CMS columns: Facility Name, Facility ID, State, Measure Name,
 *   Number of Discharges, Footnote, Excess Readmission Ratio,
 *   Predicted Readmission Rate, Expected Readmission Rate,
 *   Number of Readmissions, Start Date, End Date
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'hospital_readmissions',
  csvFilename: 'hospital_readmissions.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.hospital_readmissions CASCADE;
    CREATE TABLE medicosts.hospital_readmissions (
      id                       SERIAL PRIMARY KEY,
      facility_id              VARCHAR(10) NOT NULL,
      facility_name            TEXT,
      state                    VARCHAR(2),
      measure_name             VARCHAR(100) NOT NULL,
      num_discharges           INTEGER,
      excess_readmission_ratio NUMERIC(8,4),
      predicted_readm_rate     NUMERIC(8,4),
      expected_readm_rate      NUMERIC(8,4),
      num_readmissions         INTEGER,
      footnote                 TEXT,
      start_date               DATE,
      end_date                 DATE
    );
    CREATE INDEX idx_readm_facility ON medicosts.hospital_readmissions (facility_id);
    CREATE INDEX idx_readm_measure  ON medicosts.hospital_readmissions (measure_name);
    CREATE INDEX idx_readm_state    ON medicosts.hospital_readmissions (state);
  `,
  columns: [
    'facility_id', 'facility_name', 'state', 'measure_name',
    'num_discharges', 'excess_readmission_ratio',
    'predicted_readm_rate', 'expected_readm_rate', 'num_readmissions',
    'footnote', 'start_date', 'end_date',
  ],
  mapRow: (r) => [
    r['Facility ID'],
    r['Facility Name'],
    r['State'],
    r['Measure Name'],
    num(r['Number of Discharges']),
    num(r['Excess Readmission Ratio']),
    num(r['Predicted Readmission Rate']),
    num(r['Expected Readmission Rate']),
    numInt(r['Number of Readmissions']),
    r['Footnote'] || null,
    parseDate(r['Start Date']),
    parseDate(r['End Date']),
  ],
});

function num(v) {
  if (!v || v === 'Not Available' || v === 'N/A' || v === 'Too Few to Report') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function numInt(v) {
  if (!v || v === 'Not Available' || v === 'N/A' || v === 'Too Few to Report') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function parseDate(v) {
  if (!v || v === 'Not Available') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

run().catch((err) => { console.error(err); process.exit(1); });
