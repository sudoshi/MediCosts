#!/usr/bin/env node
/**
 * download-enrichment.js
 * Downloads all public enrichment data sources into data/ subdirectories.
 *
 * Covers: CDC PLACES, AHRQ SDOH, HRSA HPSAs, FEMA disasters & risk,
 * CMS cost reports, Provider of Services, Open Payments, Part D,
 * MA penetration, RUCA codes, County Health Rankings, Census SAHIE,
 * NADAC drug pricing, NPPES NPI registry, and ZIP-county crosswalk.
 *
 * Usage:
 *   node scripts/download-enrichment.js                 # download all
 *   node scripts/download-enrichment.js --skip-existing  # skip files that exist
 *   node scripts/download-enrichment.js --skip-large     # skip files >500MB
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const SKIP_EXISTING = process.argv.includes('--skip-existing');
const SKIP_LARGE = process.argv.includes('--skip-large');

// ── Source Registry ──────────────────────────────────────────────────
//
// Each source has: name, dir (under data/), files[], method
// Methods: 'download' (HTTP GET), 'socrata' (paginated CSV), 'fema_api',
//          'census_api', 'zip_download' (download + extract)

const SOURCES = [
  // ── CDC PLACES ───────────────────────────────────────────────────
  {
    name: 'CDC PLACES — ZCTA (ZIP) Level Health Measures',
    dir: 'cdc-places',
    method: 'socrata',
    filename: 'places_zcta.csv',
    baseUrl: 'https://data.cdc.gov/resource/qnzd-25i4',
    note: '36 health measures × ~33K ZCTAs = ~1.2M rows',
  },
  {
    name: 'CDC PLACES — County Level Health Measures',
    dir: 'cdc-places',
    method: 'socrata',
    filename: 'places_county.csv',
    baseUrl: 'https://data.cdc.gov/resource/swc5-untb',
    note: '36 measures × ~3,200 counties',
  },

  // ── HRSA Health Professional Shortage Areas ──────────────────────
  {
    name: 'HRSA Primary Care HPSAs',
    dir: 'hrsa-hpsa',
    method: 'download',
    filename: 'hpsa_primary_care.csv',
    url: 'https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_PC.csv',
  },
  {
    name: 'HRSA Mental Health HPSAs',
    dir: 'hrsa-hpsa',
    method: 'download',
    filename: 'hpsa_mental_health.csv',
    url: 'https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_MH.csv',
  },
  {
    name: 'HRSA Dental Health HPSAs',
    dir: 'hrsa-hpsa',
    method: 'download',
    filename: 'hpsa_dental_health.csv',
    url: 'https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_DH.csv',
  },
  {
    name: 'HRSA Medically Underserved Areas/Populations',
    dir: 'hrsa-hpsa',
    method: 'download',
    filename: 'mua_mup.csv',
    url: 'https://data.hrsa.gov/DataDownload/DD_Files/MUA_DET.csv',
  },

  // ── USDA RUCA Codes (ZIP-level rural/urban) ─────────────────────
  {
    name: 'USDA RUCA Codes — ZIP Level (2020)',
    dir: 'ruca',
    method: 'download',
    filename: 'ruca_zip_2020.csv',
    url: 'https://www.ers.usda.gov/media/5444/2020-rural-urban-commuting-area-codes-zip-codes.csv',
  },

  // ── Census ZCTA-to-County Crosswalk ─────────────────────────────
  {
    name: 'Census ZCTA-to-County Relationship File (2020)',
    dir: 'census-crosswalk',
    method: 'download',
    filename: 'zcta_county_rel_2020.txt',
    url: 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt',
    note: 'Pipe-delimited. Maps every ZCTA to its county(ies).',
  },

  // ── County Health Rankings ──────────────────────────────────────
  {
    name: 'County Health Rankings 2025 — Analytic Data (CSV)',
    dir: 'county-health-rankings',
    method: 'download',
    filename: 'chr_analytic_data_2025.csv',
    url: 'https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2025_v3.csv',
  },
  {
    name: 'County Health Rankings 2025 — Trends (CSV)',
    dir: 'county-health-rankings',
    method: 'download',
    filename: 'chr_trends_2025.csv',
    url: 'https://www.countyhealthrankings.org/sites/default/files/media/document/chr_trends_csv_2025.csv',
  },

  // ── CMS Provider of Services ────────────────────────────────────
  {
    name: 'CMS Provider of Services — Hospital & Non-Hospital (Q4 2025)',
    dir: 'cms-provider-of-services',
    method: 'download',
    filename: 'pos_hospital_q4_2025.csv',
    url: 'https://data.cms.gov/sites/default/files/2026-01/c500f848-83b3-4f29-a677-562243a2f23b/Hospital_and_other.DATA.Q4_2025.csv',
  },

  // ── CMS Hospital Cost Reports (HCRIS) ───────────────────────────
  {
    name: 'CMS Hospital Cost Reports FY2024',
    dir: 'cms-cost-reports',
    method: 'zip_download',
    filename: 'HOSP10FY2024.ZIP',
    url: 'https://downloads.cms.gov/FILES/HCRIS/HOSP10FY2024.ZIP',
    note: '~130MB ZIP → 3 CSVs: RPT, NMRC, ALPHA',
  },
  {
    name: 'CMS Hospital Cost Reports FY2023',
    dir: 'cms-cost-reports',
    method: 'zip_download',
    filename: 'HOSP10FY2023.ZIP',
    url: 'https://downloads.cms.gov/FILES/HCRIS/HOSP10FY2023.ZIP',
    note: '~136MB ZIP → 3 CSVs',
  },

  // ── CMS Medicare Advantage Penetration ──────────────────────────
  {
    name: 'CMS Medicare Advantage State/County Penetration (Aug 2025)',
    dir: 'cms-ma-penetration',
    method: 'zip_download',
    filename: 'ma_penetration_aug_2025.zip',
    url: 'https://www.cms.gov/files/zip/ma-state/county-penetration-august-2025.zip',
  },

  // ── NADAC Drug Pricing ──────────────────────────────────────────
  {
    name: 'NADAC — National Average Drug Acquisition Cost (2025)',
    dir: 'nadac',
    method: 'dkan_api',
    filename: 'nadac_2025.csv',
    datasetId: 'f38d0706-1239-442c-a3cc-40ef1b686ac0',
    apiBase: 'https://data.medicaid.gov/api/1/datastore/query',
    note: '~1.6M NDC records with weekly pricing',
  },

  // ── CMS Part D Spending by Drug ─────────────────────────────────
  {
    name: 'CMS Medicare Part D Spending by Drug (DY2023)',
    dir: 'cms-part-d',
    method: 'download',
    filename: 'part_d_spending_by_drug_dy2023.csv',
    url: 'https://data.cms.gov/sites/default/files/2025-05-29/56d95a8b-138c-4b60-84a5-613fbab7197f/DSD_PTD_RY25_P04_V10_DY23_BGM.csv',
  },

  // ── CMS Part D Prescribers by Provider ──────────────────────────
  {
    name: 'CMS Part D Prescribers by Provider (DY2023)',
    dir: 'cms-part-d',
    method: 'download',
    filename: 'part_d_prescribers_dy2023.csv',
    url: 'https://data.cms.gov/sites/default/files/2025-04/750769a3-bb0f-4f05-81dc-7dcb6e105cb0/MUP_DPR_RY25_P04_V10_DY23_NPI.csv',
    large: true,
    note: '~1GB, ~1.1M prescribers',
  },

  // ── CMS Open Payments (Sunshine Act) ────────────────────────────
  {
    name: 'CMS Open Payments — General Payments PY2024',
    dir: 'cms-open-payments',
    method: 'download',
    filename: 'open_payments_general_py2024.csv',
    url: 'https://download.cms.gov/openpayments/PGYR2024_P01232026_01102026/OP_DTL_GNRL_PGYR2024_P01232026_01102026.csv',
    large: true,
    note: '~5-8GB, ~16M records — pharma payments to physicians/hospitals',
  },
  {
    name: 'CMS Open Payments — General Payments PY2023',
    dir: 'cms-open-payments',
    method: 'download',
    filename: 'open_payments_general_py2023.csv',
    url: 'https://download.cms.gov/openpayments/PGYR2023_P01232026_01102026/OP_DTL_GNRL_PGYR2023_P01232026_01102026.csv',
    large: true,
    note: '~5-8GB — prior year for trend analysis',
  },

  // ── FEMA Disaster Declarations ──────────────────────────────────
  {
    name: 'FEMA Disaster Declarations (all history)',
    dir: 'fema',
    method: 'fema_api',
    filename: 'disaster_declarations.csv',
    apiUrl: 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries',
    note: '~65K+ declarations since 1953',
  },

  // ── FEMA National Risk Index ────────────────────────────────────
  {
    name: 'FEMA National Risk Index — Counties',
    dir: 'fema',
    method: 'zip_download',
    filename: 'NRI_Table_Counties.zip',
    url: 'https://www.fema.gov/about/reports-and-data/openfema/nri/v120/NRI_Table_Counties.zip',
    note: '~25MB, risk scores for all US counties',
  },

  // ── Census SAHIE (Insurance Estimates) ──────────────────────────
  {
    name: 'Census SAHIE — County Health Insurance Estimates (2022)',
    dir: 'census-sahie',
    method: 'census_api',
    filename: 'sahie_county_2022.csv',
    apiUrl: 'https://api.census.gov/data/timeseries/healthins/sahie',
    params: {
      get: 'NIC_PT,NUI_PT,PCTUI_PT,PCTIC_PT,NAME,STABREV,GEOID',
      for: 'county:*',
      time: '2022',
    },
  },

  // ── NPPES NPI Registry ──────────────────────────────────────────
  {
    name: 'NPPES NPI Registry (Full Monthly — Feb 2026)',
    dir: 'nppes',
    method: 'zip_download',
    filename: 'NPPES_Data_Dissemination_February_2026.zip',
    url: 'https://download.cms.gov/nppes/NPPES_Data_Dissemination_February_2026.zip',
    large: true,
    pipeDelimited: true,
    note: '~1GB compressed, ~8-9GB uncompressed, PIPE-delimited',
  },

  // ── AHRQ SDOH (may need manual download due to WAF) ─────────────
  {
    name: 'AHRQ Social Determinants of Health — ZIP (2020)',
    dir: 'ahrq-sdoh',
    method: 'download',
    filename: 'sdoh_2020_zipcode.xlsx',
    url: 'https://www.ahrq.gov/sites/default/files/wysiwyg/sdoh/SDOH_2020_ZIPCODE_1_0.xlsx',
    note: 'May fail due to CloudFront WAF — download manually if needed',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Accept': '*/*' },
      ...options,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        res.resume();
        return httpGet(redirectUrl, options).then(resolve, reject);
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Connection timeout')); });
  });
}

function streamToFile(res, dest, label) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let received = 0;
    const total = parseInt(res.headers['content-length'], 10) || 0;

    res.on('data', (chunk) => {
      received += chunk.length;
      if (total) {
        const pct = ((received / total) * 100).toFixed(1);
        process.stdout.write(
          `\r    ${label}: ${(received / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB (${pct}%)`
        );
      } else {
        process.stdout.write(`\r    ${label}: ${(received / 1e6).toFixed(1)} MB`);
      }
    });

    res.pipe(file);
    file.on('finish', () => {
      process.stdout.write('\n');
      file.close(() => resolve(received));
    });
    file.on('error', (err) => { file.close(); reject(err); });
    res.on('error', (err) => { file.close(); reject(err); });
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpGet(url).then((res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).catch(reject);
  });
}

function fetchJSON(url) {
  return fetchText(url).then(JSON.parse);
}

// ── Download Methods ─────────────────────────────────────────────────

async function downloadDirect(source) {
  const dest = path.join(DATA_DIR, source.dir, source.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`    SKIP (exists): ${dest}`);
    return 'skipped';
  }

  const res = await httpGet(source.url);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode}`);
  }

  await streamToFile(res, dest, source.filename);
  const size = fs.statSync(dest).size;
  console.log(`    Saved: ${(size / 1e6).toFixed(1)} MB → ${path.relative(DATA_DIR, dest)}`);
  return 'ok';
}

async function downloadZip(source) {
  const dir = path.join(DATA_DIR, source.dir);
  const zipPath = path.join(dir, source.filename);
  fs.mkdirSync(dir, { recursive: true });

  // Check if already extracted
  if (SKIP_EXISTING && fs.existsSync(zipPath)) {
    console.log(`    SKIP (exists): ${zipPath}`);
    return 'skipped';
  }

  const res = await httpGet(source.url);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode}`);
  }

  await streamToFile(res, zipPath, source.filename);

  // Extract
  try {
    console.log(`    Extracting ${source.filename}...`);
    execSync(`unzip -o -d "${dir}" "${zipPath}"`, { stdio: 'pipe' });
    const files = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
    const csvCount = (files.match(/\.(csv|CSV|txt|TXT)/g) || []).length;
    console.log(`    Extracted ${csvCount} data files`);
  } catch (err) {
    console.error(`    Warning: extraction failed — ${err.message}`);
  }
  return 'ok';
}

async function downloadSocrata(source) {
  const dest = path.join(DATA_DIR, source.dir, source.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`    SKIP (exists): ${dest}`);
    return 'skipped';
  }

  const LIMIT = 50000;
  let offset = 0;
  let totalRows = 0;
  let headerWritten = false;
  const ws = fs.createWriteStream(dest);

  console.log(`    Fetching from Socrata API (${LIMIT} rows/page)...`);

  while (true) {
    const url = `${source.baseUrl}.csv?$limit=${LIMIT}&$offset=${offset}`;
    process.stdout.write(`\r    Rows fetched: ${totalRows.toLocaleString()}...`);

    const text = await fetchText(url);
    const lines = text.split('\n').filter((l) => l.trim());

    if (lines.length <= 1) break; // Only header or empty

    if (!headerWritten) {
      ws.write(lines[0] + '\n');
      headerWritten = true;
    }

    // Write data lines (skip header on all pages)
    const dataLines = lines.slice(1);
    for (const line of dataLines) {
      ws.write(line + '\n');
    }

    totalRows += dataLines.length;
    if (dataLines.length < LIMIT) break; // Last page

    offset += LIMIT;
  }

  ws.end();
  await new Promise((resolve) => ws.on('finish', resolve));

  process.stdout.write(`\r    Total: ${totalRows.toLocaleString()} rows\n`);
  const size = fs.statSync(dest).size;
  console.log(`    Saved: ${(size / 1e6).toFixed(1)} MB → ${path.relative(DATA_DIR, dest)}`);
  return 'ok';
}

async function downloadFemaApi(source) {
  const dest = path.join(DATA_DIR, source.dir, source.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`    SKIP (exists): ${dest}`);
    return 'skipped';
  }

  const TOP = 1000;
  let skip = 0;
  let allRecords = [];
  const entityName = 'DisasterDeclarationsSummaries';

  console.log('    Fetching from FEMA OpenFEMA API...');

  while (true) {
    process.stdout.write(`\r    Records fetched: ${allRecords.length.toLocaleString()}...`);
    const url = `${source.apiUrl}?$top=${TOP}&$skip=${skip}&$orderby=id`;
    const data = await fetchJSON(url);
    const records = data[entityName] || [];
    if (records.length === 0) break;
    allRecords.push(...records);
    if (records.length < TOP) break;
    skip += TOP;
  }

  process.stdout.write(`\r    Total: ${allRecords.length.toLocaleString()} records\n`);

  // Convert to CSV
  if (allRecords.length === 0) throw new Error('No records returned');
  const headers = Object.keys(allRecords[0]);
  const ws = fs.createWriteStream(dest);
  ws.write(headers.map((h) => `"${h}"`).join(',') + '\n');
  for (const rec of allRecords) {
    const row = headers.map((h) => {
      const val = rec[h];
      if (val == null) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    ws.write(row.join(',') + '\n');
  }
  ws.end();
  await new Promise((resolve) => ws.on('finish', resolve));

  const size = fs.statSync(dest).size;
  console.log(`    Saved: ${(size / 1e6).toFixed(1)} MB → ${path.relative(DATA_DIR, dest)}`);
  return 'ok';
}

async function downloadCensusApi(source) {
  const dest = path.join(DATA_DIR, source.dir, source.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`    SKIP (exists): ${dest}`);
    return 'skipped';
  }

  const params = new URLSearchParams(source.params).toString();
  const url = `${source.apiUrl}?${params}`;

  console.log('    Fetching from Census API...');
  const data = await fetchJSON(url);

  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Empty or invalid Census API response');
  }

  // Census returns array-of-arrays: first row = headers, rest = data
  const headers = data[0];
  const ws = fs.createWriteStream(dest);
  ws.write(headers.map((h) => `"${h}"`).join(',') + '\n');
  for (let i = 1; i < data.length; i++) {
    const row = data[i].map((val) => {
      if (val == null) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    ws.write(row.join(',') + '\n');
  }
  ws.end();
  await new Promise((resolve) => ws.on('finish', resolve));

  console.log(`    Total: ${(data.length - 1).toLocaleString()} rows`);
  const size = fs.statSync(dest).size;
  console.log(`    Saved: ${(size / 1e6).toFixed(1)} MB → ${path.relative(DATA_DIR, dest)}`);
  return 'ok';
}

async function downloadDkanApi(source) {
  const dest = path.join(DATA_DIR, source.dir, source.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`    SKIP (exists): ${dest}`);
    return 'skipped';
  }

  const LIMIT = 8000; // DKAN max is 8000
  let offset = 0;
  let totalRows = 0;
  let headerWritten = false;
  const ws = fs.createWriteStream(dest);

  console.log(`    Fetching from DKAN API (${LIMIT} rows/page)...`);

  while (true) {
    process.stdout.write(`\r    Rows fetched: ${totalRows.toLocaleString()}...`);
    const url = `${source.apiBase}/${source.datasetId}/0?limit=${LIMIT}&offset=${offset}&format=csv`;
    const text = await fetchText(url);
    const lines = text.split('\n').filter((l) => l.trim());

    if (lines.length <= 1) break;

    if (!headerWritten) {
      ws.write(lines[0] + '\n');
      headerWritten = true;
    }

    const dataLines = lines.slice(1);
    for (const line of dataLines) {
      ws.write(line + '\n');
    }

    totalRows += dataLines.length;
    if (dataLines.length < LIMIT) break;
    offset += LIMIT;
  }

  ws.end();
  await new Promise((resolve) => ws.on('finish', resolve));

  process.stdout.write(`\r    Total: ${totalRows.toLocaleString()} rows\n`);
  const size = fs.statSync(dest).size;
  console.log(`    Saved: ${(size / 1e6).toFixed(1)} MB → ${path.relative(DATA_DIR, dest)}`);
  return 'ok';
}

// ── Medicaid Expansion (static data) ─────────────────────────────────

function writeMedicaidExpansion() {
  const dest = path.join(DATA_DIR, 'medicaid-expansion', 'medicaid_expansion_status.csv');
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (SKIP_EXISTING && fs.existsSync(dest)) {
    console.log('    SKIP (exists)');
    return;
  }

  // Source: KFF, Medicaid.gov — current as of March 2026
  const data = `state_abbr,state_name,expanded,expansion_date,notes
AK,Alaska,true,2015-09-01,
AL,Alabama,false,,
AR,Arkansas,true,2014-01-01,
AZ,Arizona,true,2014-01-01,
CA,California,true,2014-01-01,
CO,Colorado,true,2014-01-01,
CT,Connecticut,true,2014-01-01,
DC,District of Columbia,true,2014-01-01,
DE,Delaware,true,2014-01-01,
FL,Florida,false,,
GA,Georgia,false,,
HI,Hawaii,true,2014-01-01,
IA,Iowa,true,2014-01-01,
ID,Idaho,true,2020-01-01,
IL,Illinois,true,2014-01-01,
IN,Indiana,true,2015-02-01,
KS,Kansas,false,,
KY,Kentucky,true,2014-01-01,
LA,Louisiana,true,2016-07-01,
MA,Massachusetts,true,2014-01-01,
MD,Maryland,true,2014-01-01,
ME,Maine,true,2019-01-10,
MI,Michigan,true,2014-04-01,
MN,Minnesota,true,2014-01-01,
MO,Missouri,true,2021-10-01,
MS,Mississippi,false,,
MT,Montana,true,2016-01-01,
NC,North Carolina,true,2023-12-01,
ND,North Dakota,true,2014-01-01,
NE,Nebraska,true,2020-10-01,
NH,New Hampshire,true,2014-08-15,
NJ,New Jersey,true,2014-01-01,
NM,New Mexico,true,2014-01-01,
NV,Nevada,true,2014-01-01,
NY,New York,true,2014-01-01,
OH,Ohio,true,2014-01-01,
OK,Oklahoma,true,2021-07-01,
OR,Oregon,true,2014-01-01,
PA,Pennsylvania,true,2015-01-01,
RI,Rhode Island,true,2014-01-01,
SC,South Carolina,false,,
SD,South Dakota,true,2023-07-01,
TN,Tennessee,false,,
TX,Texas,false,,
UT,Utah,true,2020-01-01,
VA,Virginia,true,2019-01-01,
VT,Vermont,true,2014-01-01,
WA,Washington,true,2014-01-01,
WI,Wisconsin,false,,Covers adults up to 100% FPL under waiver but did not adopt ACA expansion
WV,West Virginia,true,2014-01-01,
WY,Wyoming,false,,`;

  fs.writeFileSync(dest, data);
  console.log('    Saved: 51 rows → medicaid-expansion/medicaid_expansion_status.csv');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  MediCosts Data Enrichment — Comprehensive Download');
  console.log('  Spreading sunshine on healthcare costs.');
  console.log('='.repeat(70));
  console.log();

  if (SKIP_EXISTING) console.log('  --skip-existing: skipping files that already exist');
  if (SKIP_LARGE) console.log('  --skip-large: skipping files >500MB');
  console.log(`  Target: ${DATA_DIR}\n`);

  const start = Date.now();
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  // Process each source
  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];
    const num = `[${i + 1}/${SOURCES.length}]`;
    console.log(`${num} ${source.name}`);
    if (source.note) console.log(`    ${source.note}`);

    // Skip large files if requested
    if (SKIP_LARGE && source.large) {
      console.log('    SKIP (--skip-large)');
      skipped++;
      continue;
    }

    try {
      let result;
      switch (source.method) {
        case 'download':
          result = await downloadDirect(source);
          break;
        case 'zip_download':
          result = await downloadZip(source);
          break;
        case 'socrata':
          result = await downloadSocrata(source);
          break;
        case 'fema_api':
          result = await downloadFemaApi(source);
          break;
        case 'census_api':
          result = await downloadCensusApi(source);
          break;
        case 'dkan_api':
          result = await downloadDkanApi(source);
          break;
        default:
          throw new Error(`Unknown method: ${source.method}`);
      }
      if (result === 'skipped') skipped++;
      else completed++;
    } catch (err) {
      failed++;
      errors.push({ name: source.name, error: err.message });
      console.error(`    FAILED: ${err.message}`);
    }
    console.log();
  }

  // Medicaid expansion (static data)
  console.log(`[+] Medicaid Expansion Status (static reference)`);
  try {
    writeMedicaidExpansion();
    completed++;
  } catch (err) {
    failed++;
    errors.push({ name: 'Medicaid Expansion', error: err.message });
    console.error(`    FAILED: ${err.message}`);
  }
  console.log();

  // Summary
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('='.repeat(70));
  console.log('  Download Summary');
  console.log('='.repeat(70));
  console.log(`  Completed: ${completed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Failed:    ${failed}`);

  if (errors.length > 0) {
    console.log('\n  Failures:');
    errors.forEach((e) => console.log(`    - ${e.name}: ${e.error}`));
  }

  // Total disk usage
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

  console.log(`\n  Total data/ size: ${(totalBytes / 1e9).toFixed(2)} GB`);
  console.log(`  Elapsed: ${elapsed}s`);
  console.log();
  console.log('  Next step: run  node scripts/load-stage.js  to load into PostgreSQL');
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
