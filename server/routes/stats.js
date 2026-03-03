/**
 * GET /api/stats  — public endpoint, no auth required
 *
 * Returns live database statistics for the landing page, topbar, and
 * login/register pages. Results are cached in-memory for 24 hours so the
 * query only hits the DB once per day (crawlers enrich data overnight, so
 * the morning's first request after cache expiry gets fresh numbers).
 *
 * The heavy COUNT queries run asynchronously on server startup so the
 * first HTTP response is never blocked.
 */

import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cache = null;       // { data, computedAt }
let computing = false;  // prevent duplicate in-flight queries

async function computeStats() {
  if (computing) return;
  computing = true;

  try {
    // Fast estimated row counts from pg_catalog (milliseconds, no table scan).
    // These are kept up-to-date by autovacuum/ANALYZE.
    const { rows: est } = await pool.query(`
      SELECT relname AS table_name,
             reltuples::bigint AS est_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'medicosts'
        AND c.relkind = 'r'
    `);

    const tbl = {};
    for (const r of est) tbl[r.table_name] = Number(r.est_rows);

    // Total records: sum all major tables (exclude metadata/lookup tables)
    const MAJOR = [
      'open_payments', 'medicare_physician', 'clinician_directory',
      'medicare_inpatient_historical', 'part_d_prescribers', 'hospice_providers',
      'hcahps_survey', 'nursing_home_quality', 'nhsn_hai', 'timely_effective_care',
      'complications_deaths', 'hospital_readmissions', 'hrsa_shortage_areas',
      'medicare_inpatient', 'medicare_outpatient', 'medical_equipment_suppliers',
      'part_d_drug_spending', 'hospital_financials', 'hospital_vbp',
      'dialysis_facilities', 'home_health_agencies',
    ];
    const totalRecords = MAJOR.reduce((s, t) => s + (tbl[t] || 0), 0);

    // Exact dollar sum for open_payments — run in background, cheap with index.
    // We use SUM which does a full seq scan; acceptable since it's cached 24h.
    const { rows: dollarRow } = await pool.query(
      `SELECT COALESCE(SUM(payment_amount), 0)::bigint AS total FROM medicosts.open_payments`
    );

    const data = {
      total_records:          totalRecords,
      open_payments:          tbl['open_payments']          || 0,
      open_payments_dollars:  Number(dollarRow[0].total),
      clinicians:             tbl['clinician_directory']    || 0,
      hospitals:              tbl['hospital_info']          || 0,
      physician_services:     tbl['medicare_physician']     || 0,
      part_d_prescribers:     tbl['part_d_prescribers']    || 0,
      nursing_homes:          tbl['nursing_home_quality']   || 0,
      shortage_areas:         tbl['hrsa_shortage_areas']    || 0,
      computed_at:            new Date().toISOString(),
    };

    cache = { data, computedAt: Date.now() };
    console.log(`[stats] cache refreshed — ${totalRecords.toLocaleString()} total records, $${(data.open_payments_dollars / 1e9).toFixed(1)}B payments`);
  } catch (err) {
    console.error('[stats] compute error:', err.message);
  } finally {
    computing = false;
  }
}

// Compute on startup (non-blocking)
computeStats();

// Refresh daily at midnight
setInterval(() => {
  computeStats();
}, CACHE_TTL_MS);

router.get('/', async (_req, res) => {
  // If cache is stale (shouldn't happen with setInterval, but just in case)
  if (!cache || Date.now() - cache.computedAt > CACHE_TTL_MS) {
    computeStats(); // kick off refresh async — don't wait
  }

  if (!cache) {
    // Still computing on first boot — return a placeholder
    return res.json({
      total_records:         47000000,
      open_payments:         30000000,
      open_payments_dollars: 6600000000,
      clinicians:            2700000,
      hospitals:             5400,
      physician_services:    9600000,
      part_d_prescribers:    1380000,
      nursing_homes:         250000,
      shortage_areas:        88000,
      computed_at:           null,
    });
  }

  res.json(cache.data);
});

export default router;
