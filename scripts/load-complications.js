#!/usr/bin/env node
/**
 * load-complications.js — Loads Complications and Deaths — Hospital data.
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'complications_deaths',
  csvFilename: 'complications_deaths.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.complications_deaths CASCADE;
    CREATE TABLE medicosts.complications_deaths (
      id                   SERIAL PRIMARY KEY,
      facility_id          VARCHAR(10) NOT NULL,
      facility_name        TEXT,
      state                VARCHAR(2),
      measure_id           VARCHAR(50) NOT NULL,
      measure_name         TEXT,
      compared_to_national VARCHAR(80),
      denominator          INTEGER,
      score                NUMERIC(10,4),
      lower_estimate       NUMERIC(10,4),
      higher_estimate      NUMERIC(10,4),
      footnote             TEXT,
      start_date           DATE,
      end_date             DATE
    );
    CREATE INDEX idx_cd_facility ON medicosts.complications_deaths (facility_id);
    CREATE INDEX idx_cd_measure  ON medicosts.complications_deaths (measure_id);
  `,
  columns: [
    'facility_id', 'facility_name', 'state',
    'measure_id', 'measure_name', 'compared_to_national',
    'denominator', 'score', 'lower_estimate', 'higher_estimate',
    'footnote', 'start_date', 'end_date',
  ],
  mapRow: (r) => [
    r['Facility ID'] || r['facility_id'] || r['Provider ID'],
    r['Facility Name'] || r['facility_name'] || r['Hospital Name'],
    r['State'] || r['state'],
    r['Measure ID'] || r['measure_id'],
    r['Measure Name'] || r['measure_name'],
    r['Compared to National'] || r['compared_to_national'] || null,
    num(r['Denominator'] || r['denominator']),
    num(r['Score'] || r['score']),
    num(r['Lower Estimate'] || r['lower_estimate']),
    num(r['Higher Estimate'] || r['higher_estimate']),
    r['Footnote'] || r['footnote'] || null,
    parseDate(r['Start Date'] || r['start_date'] || r['Measure Start Date']),
    parseDate(r['End Date'] || r['end_date'] || r['Measure End Date']),
  ],
});

function num(v) {
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
