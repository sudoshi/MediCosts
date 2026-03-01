#!/usr/bin/env node
/**
 * load-psi.js — Loads Hospital-Acquired Condition (HAC) Reduction Program scorecard.
 * Wide-format CSV: one row per hospital with PSI-90, HAI SIRs, HAC score, payment reduction.
 */
import { createLoader } from './lib/cms-loader.js';

const run = createLoader({
  name: 'patient_safety_indicators',
  csvFilename: 'patient_safety_indicators.csv',
  ddl: `
    CREATE SCHEMA IF NOT EXISTS medicosts;
    DROP TABLE IF EXISTS medicosts.patient_safety_indicators CASCADE;
    CREATE TABLE medicosts.patient_safety_indicators (
      id                   SERIAL PRIMARY KEY,
      facility_id          VARCHAR(10) NOT NULL,
      facility_name        TEXT,
      state                VARCHAR(2),
      fiscal_year          VARCHAR(10),
      psi_90_value         NUMERIC(10,6),
      psi_90_z_score       NUMERIC(10,6),
      clabsi_sir           NUMERIC(10,6),
      clabsi_z_score       NUMERIC(10,6),
      cauti_sir            NUMERIC(10,6),
      cauti_z_score        NUMERIC(10,6),
      ssi_sir              NUMERIC(10,6),
      ssi_z_score          NUMERIC(10,6),
      cdi_sir              NUMERIC(10,6),
      cdi_z_score          NUMERIC(10,6),
      mrsa_sir             NUMERIC(10,6),
      mrsa_z_score         NUMERIC(10,6),
      total_hac_score      NUMERIC(10,4),
      payment_reduction    VARCHAR(50)
    );
    CREATE UNIQUE INDEX idx_psi_facility ON medicosts.patient_safety_indicators (facility_id);
    CREATE INDEX idx_psi_state ON medicosts.patient_safety_indicators (state);
  `,
  columns: [
    'facility_id', 'facility_name', 'state', 'fiscal_year',
    'psi_90_value', 'psi_90_z_score',
    'clabsi_sir', 'clabsi_z_score',
    'cauti_sir', 'cauti_z_score',
    'ssi_sir', 'ssi_z_score',
    'cdi_sir', 'cdi_z_score',
    'mrsa_sir', 'mrsa_z_score',
    'total_hac_score', 'payment_reduction',
  ],
  mapRow: (r) => [
    r['Facility ID'],
    r['Facility Name'],
    r['State'],
    r['Fiscal Year'] || null,
    num(r['PSI 90 Composite Value']),
    num(r['PSI 90 W Z Score']),
    num(r['CLABSI SIR']),
    num(r['CLABSI W Z Score']),
    num(r['CAUTI SIR']),
    num(r['CAUTI W Z Score']),
    num(r['SSI SIR']),
    num(r['SSI W Z Score']),
    num(r['CDI SIR']),
    num(r['CDI W Z Score']),
    num(r['MRSA SIR']),
    num(r['MRSA W Z Score']),
    num(r['Total HAC Score']),
    r['Payment Reduction'] || null,
  ],
});

function num(v) {
  if (!v || v === 'Not Available' || v === '--' || v === 'N/A') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

run().catch((err) => { console.error(err); process.exit(1); });
