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

export default router;
