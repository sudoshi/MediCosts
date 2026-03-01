#!/usr/bin/env node
/**
 * download-datasets.js
 * Downloads all CMS and Census datasets as CSV/JSON files into data/.
 * Idempotent — safe to re-run; overwrites existing files.
 * Streams large files to disk to avoid memory pressure.
 *
 * Usage: node scripts/download-datasets.js
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

const DATASETS = [
  {
    name: 'Hospital General Info + Star Ratings',
    filename: 'hospital_general_info.csv',
    url: 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0/download?format=csv',
  },
  {
    name: 'HCAHPS Patient Survey',
    filename: 'hcahps_patient_survey.csv',
    url: 'https://data.cms.gov/provider-data/api/1/datastore/query/dgck-syfz/0/download?format=csv',
  },
  {
    name: 'Medicare Outpatient Hospitals — by Provider and Service (DY23)',
    filename: 'MUP_OUT_RY25_DY23_PrvSvc.csv',
    url: 'https://data.cms.gov/sites/default/files/2025-08/bceaa5e1-e58c-4109-9f05-832fc5e6bbc8/MUP_OUT_RY25_P04_V10_DY23_Prov_Svc.csv',
  },
  {
    name: 'Medicare Physician & Other Practitioners — by Provider and Service (DY23)',
    filename: 'MUP_PHY_RY25_DY23_PrvSvc.csv',
    url: 'https://data.cms.gov/sites/default/files/2025-04/e3f823f8-db5b-4cc7-ba04-e7ae92b99757/MUP_PHY_R25_P05_V20_D23_Prov_Svc.csv',
  },
];

const CENSUS_URL =
  'https://api.census.gov/data/2022/acs/acs5?get=NAME,B19013_001E,B01003_001E&for=zip%20code%20tabulation%20area:*';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let received = 0;

    const request = (u) => {
      const mod = u.startsWith('https') ? https : https;
      mod.get(u, { headers: { 'User-Agent': 'MediCosts/1.0' } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }

        const total = parseInt(res.headers['content-length'], 10) || 0;
        res.pipe(file);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = ((received / total) * 100).toFixed(1);
            process.stdout.write(`\r    ${(received / 1e6).toFixed(1)} MB / ${(total / 1e6).toFixed(1)} MB (${pct}%)`);
          } else {
            process.stdout.write(`\r    ${(received / 1e6).toFixed(1)} MB downloaded…`);
          }
        });

        file.on('finish', () => {
          process.stdout.write('\n');
          file.close(resolve);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

async function downloadCensus(dest) {
  return new Promise((resolve, reject) => {
    https.get(CENSUS_URL, { headers: { 'User-Agent': 'MediCosts/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Census API returned HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          // data[0] is headers, rest are rows
          // Convert to simple JSON array of objects
          const rows = data.slice(1).map((row) => ({
            zcta: row[3],
            name: row[0],
            median_household_income: row[1] === null || row[1] === '-666666666' ? null : parseInt(row[1], 10),
            total_population: row[2] === null ? null : parseInt(row[2], 10),
          }));
          fs.writeFileSync(dest, JSON.stringify(rows));
          console.log(`    ${rows.length.toLocaleString()} ZCTAs saved`);
          resolve();
        } catch (err) { reject(err); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const ds of DATASETS) {
    const dest = path.join(DATA_DIR, ds.filename);
    console.log(`\n⬇  ${ds.name}`);
    console.log(`   → ${dest}`);
    await download(ds.url, dest);
    const size = fs.statSync(dest).size;
    console.log(`   ✓ ${(size / 1e6).toFixed(1)} MB`);
  }

  // Census data (JSON API)
  const censusDest = path.join(DATA_DIR, 'census_zcta.json');
  console.log('\n⬇  Census ACS 5-Year ZCTA Demographics (2022)');
  console.log(`   → ${censusDest}`);
  await downloadCensus(censusDest);
  console.log(`   ✓ Done`);

  console.log('\n✓ All datasets downloaded to data/');
}

main().catch((err) => {
  console.error('\n✗ Download failed:', err.message);
  process.exit(1);
});
