#!/usr/bin/env node
/**
 * load-stage.js
 * Loads all CSV files from data/ into a PostgreSQL `stage` schema as raw TEXT tables.
 * Uses COPY FROM STDIN via pg-copy-streams for fast bulk loading.
 *
 * Usage:
 *   node scripts/load-stage.js
 */

import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parse as parseSync } from 'csv-parse/sync';
import pg from 'pg';
import copyFrom from 'pg-copy-streams';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATA_DIR = path.resolve(__dirname, '../data');

const pool = new pg.Pool();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Recursively find all .csv files under a directory, sorted */
function findCsvFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCsvFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      results.push(full);
    }
  }
  return results.sort();
}

const PG_IDENT_MAX = 63;

/** Sanitize a string for use as a SQL identifier */
function sanitize(name) {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')  // non-alphanumeric → _
    .replace(/_+/g, '_')          // collapse multiple _
    .replace(/^_|_$/g, '');       // strip leading/trailing _
  if (/^\d/.test(s)) s = '_' + s; // prefix if starts with digit
  return s;
}

/** Truncate an identifier to 63 chars. If it exceeds the limit,
 *  keep the first 55 chars + '_' + 7-char hash of the full name. */
function truncateIdent(name) {
  if (name.length <= PG_IDENT_MAX) return name;
  const hash = createHash('md5').update(name).digest('hex').slice(0, 7);
  return name.slice(0, 55) + '_' + hash;
}

/** Deduplicate column names by appending _2, _3, etc. */
function deduplicateColumns(cols) {
  const seen = new Map();
  return cols.map((col) => {
    const count = (seen.get(col) || 0) + 1;
    seen.set(col, count);
    return count > 1 ? `${col}_${count}` : col;
  });
}

/** Read the first line of a file and parse as CSV header */
function readHeader(filePath) {
  // Read enough bytes to capture the header line (most headers < 8KB)
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(64 * 1024);
  const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const chunk = buf.toString('utf8', 0, bytesRead);
  const firstLine = chunk.split(/\r?\n/)[0];

  // Parse the header line as CSV to handle quoted fields
  const parsed = parseSync(firstLine, { relax_column_count: true });
  if (!parsed.length || !parsed[0].length) {
    throw new Error('Empty or unparseable header');
  }
  return parsed[0];
}

/** Build table name from file path: {theme}__{filename_stem}, truncated to 63 chars */
function buildTableName(filePath) {
  const rel = path.relative(DATA_DIR, filePath);
  const parts = rel.split(path.sep);
  const theme = parts.length > 1 ? sanitize(parts[0]) : 'root';
  const stem = sanitize(path.basename(filePath, '.csv'));
  return truncateIdent(`${theme}__${stem}`);
}

/* ------------------------------------------------------------------ */
/*  Load one CSV file                                                  */
/* ------------------------------------------------------------------ */
async function loadFile(client, filePath, index, total) {
  const tableName = buildTableName(filePath);

  // Read and sanitize headers (truncate to 63 chars, then deduplicate)
  const rawHeaders = readHeader(filePath);
  const sanitizedCols = deduplicateColumns(rawHeaders.map((h) => truncateIdent(sanitize(h))));

  if (sanitizedCols.length === 0) {
    throw new Error('No columns detected');
  }

  // CREATE TABLE with all TEXT columns
  const colDefs = sanitizedCols.map((c) => `"${c}" TEXT`).join(', ');
  await client.query(`CREATE TABLE stage."${tableName}" (${colDefs})`);

  // COPY FROM STDIN
  const colList = sanitizedCols.map((c) => `"${c}"`).join(', ');
  const copyQuery = `COPY stage."${tableName}" (${colList}) FROM STDIN WITH (FORMAT csv, HEADER true, QUOTE '"')`;
  const copyStream = client.query(copyFrom.from(copyQuery));
  const fileStream = fs.createReadStream(filePath);

  await pipeline(fileStream, copyStream);

  const rowCount = copyStream.rowCount;
  const label = `[${index}/${total}]`;
  console.log(`  ${label} ${tableName} — ${rowCount.toLocaleString()} rows`);
  return rowCount;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  const csvFiles = findCsvFiles(DATA_DIR);
  console.log(`Found ${csvFiles.length} CSV files in ${DATA_DIR}\n`);

  if (csvFiles.length === 0) {
    console.log('Nothing to load.');
    return;
  }

  console.log(`Connecting to ${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE} …`);
  const client = await pool.connect();
  const start = Date.now();
  let loaded = 0;
  let failed = 0;
  let totalRows = 0;
  const failures = [];

  try {
    // Recreate stage schema
    await client.query('DROP SCHEMA IF EXISTS stage CASCADE');
    await client.query('CREATE SCHEMA stage');
    console.log('Created schema: stage\n');

    // Load each file sequentially
    for (let i = 0; i < csvFiles.length; i++) {
      try {
        const rows = await loadFile(client, csvFiles[i], i + 1, csvFiles.length);
        totalRows += rows;
        loaded++;
      } catch (err) {
        failed++;
        const rel = path.relative(DATA_DIR, csvFiles[i]);
        failures.push(rel);
        console.error(`  [${i + 1}/${csvFiles.length}] FAILED ${rel}: ${err.message}`);
      }
    }

    // Summary
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n— Summary —');
    console.log(`  Tables loaded: ${loaded}`);
    if (failed > 0) {
      console.log(`  Tables failed: ${failed}`);
      failures.forEach((f) => console.log(`    - ${f}`));
    }
    console.log(`  Total rows:    ${totalRows.toLocaleString()}`);
    console.log(`  Elapsed:       ${elapsed}s`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
