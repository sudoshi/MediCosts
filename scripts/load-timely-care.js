#!/usr/bin/env node
/**
 * load-timely-care.js — Loads Timely and Effective Care — Hospital data.
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'timely_effective_care',
  csvFilename: 'timely_effective_care.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.timely_effective_care CASCADE;
    CREATE TABLE medicosts.timely_effective_care (
      id                   SERIAL PRIMARY KEY,
      facility_id          VARCHAR(10) NOT NULL,
      facility_name        TEXT,
      state                VARCHAR(2),
      condition            VARCHAR(100),
      measure_id           VARCHAR(50) NOT NULL,
      measure_name         TEXT,
      score                VARCHAR(20),
      sample               INTEGER,
      footnote             TEXT,
      start_date           DATE,
      end_date             DATE
    );
    CREATE INDEX idx_tec_facility  ON medicosts.timely_effective_care (facility_id);
    CREATE INDEX idx_tec_measure   ON medicosts.timely_effective_care (measure_id);
    CREATE INDEX idx_tec_condition ON medicosts.timely_effective_care (condition);
  `,
  columns: [
    'facility_id', 'facility_name', 'state',
    'condition', 'measure_id', 'measure_name',
    'score', 'sample', 'footnote', 'start_date', 'end_date',
  ],
  mapRow: (r) => [
    r['Facility ID'] || r['facility_id'] || r['Provider ID'],
    r['Facility Name'] || r['facility_name'] || r['Hospital Name'],
    r['State'] || r['state'],
    r['Condition'] || r['condition'] || null,
    r['Measure ID'] || r['measure_id'],
    r['Measure Name'] || r['measure_name'],
    scoreStr(r['Score'] || r['score']),
    num(r['Sample'] || r['sample']),
    r['Footnote'] || r['footnote'] || null,
    parseDate(r['Start Date'] || r['start_date'] || r['Measure Start Date']),
    parseDate(r['End Date'] || r['end_date'] || r['Measure End Date']),
  ],
});

function scoreStr(v) {
  if (!v || v === 'Not Available') return null;
  return v.slice(0, 20);
}
function num(v) {
  if (!v || v === 'Not Available' || v === '--') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function parseDate(v) {
  if (!v || v === 'Not Available') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

run().catch((err) => { console.error(err); process.exit(1); });
