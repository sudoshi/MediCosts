import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/drgs/top50                                                */
/*  Returns the 50 most expensive DRGs                                 */
/* ------------------------------------------------------------------ */
router.get('/drgs/top50', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        drg_cd,
        drg_desc,
        weighted_avg_payment::numeric(14,0)  AS weighted_avg_payment,
        weighted_avg_charges::numeric(14,0)  AS weighted_avg_charges,
        weighted_avg_medicare::numeric(14,0) AS weighted_avg_medicare,
        total_discharges::int,
        num_providers::int
      FROM medicosts.mv_top50_drg
      ORDER BY weighted_avg_payment DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/stats?drg=ALL|code                                        */
/*  Summary KPI cards                                                  */
/* ------------------------------------------------------------------ */
router.get('/stats', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    const { rows } = await pool.query(`
      SELECT
        SUM(avg_total_payment * total_discharges) / NULLIF(SUM(total_discharges),0)
          AS weighted_avg_payment,
        SUM(total_discharges)::int           AS total_discharges,
        SUM(num_providers)::int              AS num_providers,
        COUNT(DISTINCT zip5)::int            AS num_zips
      FROM medicosts.mv_zip_summary
      ${where}
    `, params);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/zips/top50?drg=ALL|code&metric=payment|charges|medicare    */
/*  Top 50 ZIP codes by chosen metric                                  */
/* ------------------------------------------------------------------ */
const METRIC_COL = {
  payment:  'avg_total_payment',
  charges:  'avg_covered_charge',
  medicare: 'avg_medicare_payment',
};

router.get('/zips/top50', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const col = METRIC_COL[req.query.metric] || 'avg_total_payment';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    const { rows } = await pool.query(`
      SELECT
        zip5,
        state_abbr,
        provider_city,
        AVG(avg_total_payment)::numeric(14,0)    AS avg_total_payment,
        AVG(avg_covered_charge)::numeric(14,0)   AS avg_covered_charge,
        AVG(avg_medicare_payment)::numeric(14,0) AS avg_medicare_payment,
        SUM(total_discharges)::int               AS total_discharges,
        SUM(num_providers)::int                  AS num_providers
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY zip5, state_abbr, provider_city
      ORDER BY AVG(${col}) DESC
      LIMIT 50
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/states/summary?drg=ALL|code&metric=...                    */
/*  State-level aggregation for choropleth map                         */
/* ------------------------------------------------------------------ */
router.get('/states/summary', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    const { rows } = await pool.query(`
      SELECT
        state_abbr,
        AVG(avg_total_payment)::numeric(14,0)    AS avg_total_payment,
        AVG(avg_covered_charge)::numeric(14,0)   AS avg_covered_charge,
        AVG(avg_medicare_payment)::numeric(14,0) AS avg_medicare_payment,
        SUM(total_discharges)::int               AS total_discharges,
        SUM(num_providers)::int                  AS num_providers
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY state_abbr
      ORDER BY state_abbr
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/zips/scatter?drg=ALL|code                                 */
/*  Charges vs payments by ZIP for scatter plot                        */
/* ------------------------------------------------------------------ */
router.get('/zips/scatter', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    const { rows } = await pool.query(`
      SELECT
        zip5,
        state_abbr,
        provider_city,
        AVG(avg_covered_charge)::numeric(14,0)   AS avg_charges,
        AVG(avg_total_payment)::numeric(14,0)    AS avg_payment,
        SUM(total_discharges)::int               AS total_discharges
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY zip5, state_abbr, provider_city
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/zips/histogram?drg=ALL|code&metric=...                    */
/*  Price distribution buckets for histogram                           */
/* ------------------------------------------------------------------ */
router.get('/zips/histogram', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const col = METRIC_COL[req.query.metric] || 'avg_total_payment';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    // Return per-zip averages so the client can build the histogram
    const { rows } = await pool.query(`
      SELECT
        zip5,
        AVG(${col})::numeric(14,0) AS price
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY zip5
      ORDER BY price
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/states/:state/zips?drg=ALL|code                          */
/*  All ZIP-level averages for a given state (for zip choropleth)     */
/* ------------------------------------------------------------------ */
router.get('/states/:state/zips', async (req, res, next) => {
  try {
    const state = req.params.state.toUpperCase();
    const drg   = req.query.drg || 'ALL';
    const where = drg === 'ALL'
      ? 'WHERE state_abbr = $1'
      : 'WHERE state_abbr = $1 AND drg_cd = $2';
    const params = drg === 'ALL' ? [state] : [state, drg];

    const { rows } = await pool.query(`
      SELECT
        zip5,
        state_abbr,
        MAX(provider_city)                       AS provider_city,
        AVG(avg_total_payment)::numeric(14,0)    AS avg_total_payment,
        AVG(avg_covered_charge)::numeric(14,0)   AS avg_covered_charge,
        AVG(avg_medicare_payment)::numeric(14,0) AS avg_medicare_payment,
        SUM(total_discharges)::int               AS total_discharges,
        SUM(num_providers)::int                  AS num_providers
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY zip5, state_abbr
      ORDER BY zip5
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/providers?zip=<zip5>&drg=ALL|code                         */
/*  Provider-level detail for a ZIP (drilldown from table / scatter)   */
/* ------------------------------------------------------------------ */
router.get('/providers', async (req, res, next) => {
  try {
    const zip = req.query.zip;
    if (!zip) return res.status(400).json({ error: 'zip query parameter is required' });

    const drg = req.query.drg || 'ALL';
    const where = drg === 'ALL'
      ? 'WHERE m.zip5 = $1 AND m.drg_cd IN (SELECT drg_cd FROM medicosts.mv_top50_drg)'
      : 'WHERE m.zip5 = $1 AND m.drg_cd = $2';
    const params = drg === 'ALL' ? [zip] : [zip, drg];

    const { rows } = await pool.query(`
      SELECT
        m.provider_name,
        m.provider_city,
        m.drg_cd,
        m.drg_desc,
        m.total_discharges,
        m.avg_covered_charges::numeric(14,2)  AS avg_covered_charges,
        m.avg_total_payments::numeric(14,2)   AS avg_total_payments,
        m.avg_medicare_payments::numeric(14,2) AS avg_medicare_payments
      FROM medicosts.medicare_inpatient m
      ${where}
      ORDER BY m.avg_total_payments DESC
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  Error handler                                                      */
/* ------------------------------------------------------------------ */
router.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

export default router;
