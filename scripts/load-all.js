#!/usr/bin/env node
/**
 * load-all.js
 * Master orchestrator — downloads all datasets and loads them into PostgreSQL.
 * Runs each step sequentially in the correct dependency order.
 *
 * Usage: node scripts/load-all.js [--skip-download] [--skip-inpatient]
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const skipDownload = args.includes('--skip-download');
const skipInpatient = args.includes('--skip-inpatient');

const steps = [
  ...(!skipDownload ? [{ name: 'Download datasets', script: 'download-datasets.js' }] : []),
  ...(!skipInpatient ? [{ name: 'Load inpatient data', script: 'load-data.js' }] : []),
  { name: 'Load hospital quality', script: 'load-hospital-quality.js' },
  { name: 'Load HCAHPS survey', script: 'load-hcahps.js' },
  { name: 'Load outpatient data', script: 'load-outpatient.js' },
  { name: 'Load physician data', script: 'load-physician.js' },
  { name: 'Load Census demographics', script: 'load-census.js' },
  /* Phase 2: Quality Command Center datasets */
  { name: 'Load NHSN HAI data',            script: 'load-nhsn-hai.js' },
  { name: 'Load hospital readmissions',     script: 'load-readmissions.js' },
  { name: 'Load patient safety indicators', script: 'load-psi.js' },
  { name: 'Load timely & effective care',   script: 'load-timely-care.js' },
  { name: 'Load complications & deaths',    script: 'load-complications.js' },
  { name: 'Load payment & value of care',   script: 'load-payment-value.js' },
  /* Cross-dataset views (must be last) */
  { name: 'Create cross-dataset views', script: 'create-cross-views.js' },
];

const startTime = Date.now();

for (const step of steps) {
  const stepStart = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${step.name}`);
  console.log('='.repeat(60));

  try {
    execFileSync('node', [path.join(__dirname, step.script)], {
      stdio: 'inherit',
      env: process.env,
    });
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`✓ ${step.name} completed (${elapsed}s)`);
  } catch (err) {
    console.error(`\n✗ ${step.name} failed!`);
    process.exit(1);
  }
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n${'='.repeat(60)}`);
console.log(`✓ All datasets loaded successfully (${totalElapsed}s total)`);
console.log('='.repeat(60));
