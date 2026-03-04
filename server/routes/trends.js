import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/trends/drg?drg=XXX                                        */
/*  Yearly cost trend for a specific DRG (2013-2023)                   */
/* ------------------------------------------------------------------ */
router.get('/drg', async (req, res, next) => {
  try {
    const { drg } = req.query;
    if (!drg) return res.status(400).json({ error: 'drg parameter required' });

    const { rows } = await pool.query(`
      SELECT
        data_year,
        drg_cd,
        drg_desc,
        weighted_avg_payment::numeric(14,2),
        weighted_avg_charges::numeric(14,2),
        weighted_avg_medicare::numeric(14,2),
        total_discharges::int,
        num_providers::int
      FROM medicosts.mv_drg_yearly_trend
      WHERE drg_cd = $1
      ORDER BY data_year
    `, [drg]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/provider?ccn=XXXXXX                                */
/*  Hospital-level yearly cost trend                                   */
/* ------------------------------------------------------------------ */
router.get('/provider', async (req, res, next) => {
  try {
    const { ccn } = req.query;
    if (!ccn) return res.status(400).json({ error: 'ccn parameter required' });

    const { rows } = await pool.query(`
      SELECT
        data_year,
        provider_ccn,
        provider_name,
        state_abbr,
        weighted_avg_payment::numeric(14,2),
        weighted_avg_charges::numeric(14,2),
        weighted_avg_medicare::numeric(14,2),
        total_discharges::int,
        num_drgs::int
      FROM medicosts.mv_provider_yearly_trend
      WHERE provider_ccn = $1
      ORDER BY data_year
    `, [ccn]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/provider-drg?ccn=XXXXXX&drg=XXX                    */
/*  Hospital + DRG specific yearly trend (from raw table)              */
/* ------------------------------------------------------------------ */
router.get('/provider-drg', async (req, res, next) => {
  try {
    const { ccn, drg } = req.query;
    if (!ccn || !drg) return res.status(400).json({ error: 'ccn and drg parameters required' });

    const { rows } = await pool.query(`
      SELECT
        data_year,
        provider_ccn,
        MAX(provider_name) AS provider_name,
        MAX(state_abbr) AS state_abbr,
        drg_cd,
        MAX(drg_desc) AS drg_desc,
        avg_total_payments::numeric(14,2) AS weighted_avg_payment,
        avg_covered_charges::numeric(14,2) AS weighted_avg_charges,
        avg_medicare_payments::numeric(14,2) AS weighted_avg_medicare,
        total_discharges::int
      FROM medicosts.medicare_inpatient_historical
      WHERE provider_ccn = $1 AND drg_cd = $2
      GROUP BY data_year, provider_ccn, drg_cd, avg_total_payments, avg_covered_charges, avg_medicare_payments, total_discharges
      ORDER BY data_year
    `, [ccn, drg]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/state?state=XX&drg=XXX                             */
/*  State-level yearly trend for a DRG                                 */
/* ------------------------------------------------------------------ */
router.get('/state', async (req, res, next) => {
  try {
    const { state, drg } = req.query;
    if (!state || !drg) return res.status(400).json({ error: 'state and drg parameters required' });

    const { rows } = await pool.query(`
      SELECT
        data_year,
        state_abbr,
        drg_cd,
        weighted_avg_payment::numeric(14,2),
        weighted_avg_charges::numeric(14,2),
        weighted_avg_medicare::numeric(14,2),
        total_discharges::int,
        num_providers::int
      FROM medicosts.mv_state_yearly_trend
      WHERE state_abbr = $1 AND drg_cd = $2
      ORDER BY data_year
    `, [state, drg]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/state-summary?state=XX                             */
/*  State-level all-DRG aggregate trend                                */
/* ------------------------------------------------------------------ */
router.get('/state-summary', async (req, res, next) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'state parameter required' });

    const { rows } = await pool.query(`
      SELECT
        data_year,
        SUM(weighted_avg_payment * total_discharges) / NULLIF(SUM(total_discharges), 0)
          AS weighted_avg_payment,
        SUM(weighted_avg_charges * total_discharges) / NULLIF(SUM(total_discharges), 0)
          AS weighted_avg_charges,
        SUM(weighted_avg_medicare * total_discharges) / NULLIF(SUM(total_discharges), 0)
          AS weighted_avg_medicare,
        SUM(total_discharges)::bigint AS total_discharges,
        COUNT(DISTINCT drg_cd)::int AS num_drgs
      FROM medicosts.mv_state_yearly_trend
      WHERE state_abbr = $1
      GROUP BY data_year
      ORDER BY data_year
    `, [state]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/national                                           */
/*  Top-line national cost summary per year (all DRGs)                 */
/* ------------------------------------------------------------------ */
router.get('/national', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        data_year,
        SUM(weighted_avg_payment * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_payment,
        SUM(weighted_avg_charges * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_charges,
        SUM(weighted_avg_medicare * total_discharges) / NULLIF(SUM(total_discharges), 0) AS weighted_avg_medicare,
        SUM(total_discharges)::bigint AS total_discharges,
        COUNT(DISTINCT drg_cd)::int AS num_drgs,
        SUM(num_providers)::int AS total_provider_drg_pairs
      FROM medicosts.mv_drg_yearly_trend
      GROUP BY data_year
      ORDER BY data_year
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/trends/top-movers?metric=payment&limit=10&direction=desc  */
/*  DRGs with highest/lowest CAGR over available years                 */
/* ------------------------------------------------------------------ */
router.get('/top-movers', async (req, res, next) => {
  try {
    const metric = req.query.metric === 'charges' ? 'weighted_avg_charges' : 'weighted_avg_payment';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const asc = req.query.direction === 'asc';

    const { rows } = await pool.query(`
      WITH first_last AS (
        SELECT
          drg_cd,
          MAX(drg_desc) AS drg_desc,
          MIN(data_year) AS first_year,
          MAX(data_year) AS last_year,
          (array_agg(${metric} ORDER BY data_year ASC))[1] AS first_val,
          (array_agg(${metric} ORDER BY data_year DESC))[1] AS last_val,
          SUM(total_discharges) AS total_discharges
        FROM medicosts.mv_drg_yearly_trend
        GROUP BY drg_cd
        HAVING COUNT(DISTINCT data_year) >= 5
          AND (array_agg(${metric} ORDER BY data_year ASC))[1] > 100
      )
      SELECT
        drg_cd, drg_desc,
        first_val::numeric(14,2), last_val::numeric(14,2),
        total_discharges,
        first_year, last_year,
        ((last_val / first_val) ^ (1.0 / NULLIF(last_year - first_year, 0)) - 1) * 100 AS cagr_pct,
        ((last_val - first_val) / NULLIF(first_val, 0)) * 100 AS total_change_pct
      FROM first_last
      ORDER BY cagr_pct ${asc ? 'ASC' : 'DESC'} NULLS LAST
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
