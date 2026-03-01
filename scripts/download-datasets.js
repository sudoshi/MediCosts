#!/usr/bin/env node
/**
 * download-datasets.js
 * Downloads all CMS Provider Data datasets + Census data into data/.
 *
 * Dynamically fetches the full CMS Provider Data catalog (~234 datasets)
 * and organizes files into theme-based subdirectories.
 *
 * Usage:
 *   node scripts/download-datasets.js                  # download all (overwrite existing)
 *   node scripts/download-datasets.js --skip-existing   # skip files that already exist
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

const CATALOG_URL =
  'https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items';

// Datasets not in the Provider Data catalog — kept as manual entries
const MANUAL_DATASETS = [
  {
    title: 'Medicare Outpatient Hospitals — by Provider and Service (DY23)',
    filename: 'MUP_OUT_RY25_DY23_PrvSvc.csv',
    theme: 'Hospitals',
    url: 'https://data.cms.gov/sites/default/files/2025-08/bceaa5e1-e58c-4109-9f05-832fc5e6bbc8/MUP_OUT_RY25_P04_V10_DY23_Prov_Svc.csv',
  },
  {
    title: 'Medicare Physician & Other Practitioners — by Provider and Service (DY23)',
    filename: 'MUP_PHY_RY25_DY23_PrvSvc.csv',
    theme: 'Hospitals',
    url: 'https://data.cms.gov/sites/default/files/2025-04/e3f823f8-db5b-4cc7-ba04-e7ae92b99757/MUP_PHY_R25_P05_V20_D23_Prov_Svc.csv',
  },
];

const CENSUS_URL =
  'https://api.census.gov/data/2022/acs/acs5?get=NAME,B19013_001E,B01003_001E&for=zip%20code%20tabulation%20area:*';

const SKIP_EXISTING = process.argv.includes('--skip-existing');

// ── Helpers ──────────────────────────────────────────────────────────

function sanitizeFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .concat('.csv');
}

function sanitizeTheme(theme) {
  return theme
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Catalog fetch ────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'MediCosts/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching catalog`));
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchCatalog() {
  console.log('Fetching CMS Provider Data catalog...');
  const items = await fetchJSON(CATALOG_URL);
  console.log(`  Raw catalog entries: ${items.length}`);

  const datasets = [];
  for (const item of items) {
    const title = item.title;
    if (!title) continue;

    // Extract CSV download URL from distribution array
    const dist = (item.distribution || []).find(
      (d) => d.mediaType === 'text/csv'
    );
    if (!dist || !dist.downloadURL) continue;

    // Theme — use first theme or 'uncategorized'
    const themes = item.theme || [];
    const theme = (typeof themes[0] === 'string' ? themes[0] : themes[0]?.data) || 'Uncategorized';

    datasets.push({
      title,
      identifier: item.identifier,
      theme,
      url: dist.downloadURL,
      filename: sanitizeFilename(title),
    });
  }

  return datasets;
}

// ── File download (streaming) ────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let received = 0;

    const request = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'MediCosts/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }

        const total = parseInt(res.headers['content-length'], 10) || 0;
        res.pipe(file);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = ((received / total) * 100).toFixed(1);
            process.stdout.write(
              `\r    ${(received / 1e6).toFixed(1)} MB / ${(total / 1e6).toFixed(1)} MB (${pct}%)`
            );
          } else {
            process.stdout.write(`\r    ${(received / 1e6).toFixed(1)} MB downloaded`);
          }
        });

        file.on('finish', () => {
          process.stdout.write('\n');
          file.close(resolve);
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

// ── Concurrent download pool ─────────────────────────────────────────

async function downloadPool(tasks, concurrency = 3) {
  let index = 0;
  let completed = 0;
  const total = tasks.length;
  const errors = [];

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      const task = tasks[i];
      const num = i + 1;

      const dir = path.dirname(task.dest);
      fs.mkdirSync(dir, { recursive: true });

      if (SKIP_EXISTING && fs.existsSync(task.dest)) {
        completed++;
        console.log(`[${num}/${total}] SKIP ${task.title} (exists)`);
        continue;
      }

      console.log(`[${num}/${total}] ${task.title}`);
      console.log(`   -> ${path.relative(DATA_DIR, task.dest)}`);

      try {
        await download(task.url, task.dest);
        const size = fs.statSync(task.dest).size;
        console.log(`   OK ${(size / 1e6).toFixed(1)} MB`);
        completed++;
      } catch (err) {
        console.error(`   FAIL ${err.message}`);
        errors.push({ title: task.title, error: err.message });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return { completed, errors };
}

// ── Census download ──────────────────────────────────────────────────

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
          const rows = data.slice(1).map((row) => ({
            zcta: row[3],
            name: row[0],
            median_household_income:
              row[1] === null || row[1] === '-666666666' ? null : parseInt(row[1], 10),
            total_population: row[2] === null ? null : parseInt(row[2], 10),
          }));
          fs.writeFileSync(dest, JSON.stringify(rows));
          console.log(`    ${rows.length.toLocaleString()} ZCTAs saved`);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 1. Fetch dynamic catalog
  const catalog = await fetchCatalog();
  console.log(`Found ${catalog.length} datasets in CMS Provider Data catalog\n`);

  // 2. Build task list: catalog + manual datasets
  const tasks = [];

  for (const ds of catalog) {
    const themeDir = sanitizeTheme(ds.theme);
    tasks.push({
      title: ds.title,
      url: ds.url,
      dest: path.join(DATA_DIR, themeDir, ds.filename),
    });
  }

  for (const ds of MANUAL_DATASETS) {
    const themeDir = sanitizeTheme(ds.theme);
    tasks.push({
      title: ds.title,
      url: ds.url,
      dest: path.join(DATA_DIR, themeDir, ds.filename),
    });
  }

  console.log(`Total datasets to download: ${tasks.length}`);
  if (SKIP_EXISTING) console.log('(--skip-existing: skipping files that already exist)\n');
  else console.log('');

  // 3. Download all with concurrency
  const { completed, errors } = await downloadPool(tasks, 3);

  // 4. Census data
  const censusDest = path.join(DATA_DIR, 'census_zcta.json');
  console.log('\nCensus ACS 5-Year ZCTA Demographics (2022)');
  console.log(`   -> ${censusDest}`);
  await downloadCensus(censusDest);

  // 5. Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Downloaded: ${completed}/${tasks.length} datasets`);
  if (errors.length > 0) {
    console.log(`\nFailed (${errors.length}):`);
    for (const e of errors) {
      console.log(`  - ${e.title}: ${e.error}`);
    }
  }

  // Total size on disk
  let totalBytes = 0;
  function sumDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) sumDir(full);
      else totalBytes += fs.statSync(full).size;
    }
  }
  sumDir(DATA_DIR);
  console.log(`\nTotal size: ${(totalBytes / 1e9).toFixed(2)} GB in data/`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
});
