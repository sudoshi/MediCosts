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
        CASE WHEN weighted_avg_charges > 0
          THEN (weighted_avg_payment / weighted_avg_charges)::numeric(6,4)
          ELSE NULL END AS weighted_avg_reimbursement,
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
        COUNT(DISTINCT zip5)::int            AS num_zips,
        (SUM(avg_total_payment * total_discharges) / NULLIF(SUM(avg_covered_charge * total_discharges), 0))::numeric(6,4)
          AS weighted_avg_reimbursement
      FROM medicosts.mv_zip_summary
      ${where}
    `, params);

    const quality = await pool.query(`
      SELECT
        AVG(star_rating)::numeric(3,1)  AS avg_star_rating,
        COUNT(*)::int                   AS rated_hospitals
      FROM medicosts.mv_hospital_cost_quality
    `);

    res.json({ ...rows[0], ...quality.rows[0] });
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
  reimbursement: 'avg_total_payment / NULLIF(avg_covered_charge, 0)',
};

router.get('/zips/top50', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const metricName = req.query.metric || 'payment';
    const col = METRIC_COL[metricName] || 'avg_total_payment';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];
    const sortDir = metricName === 'reimbursement' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(`
      SELECT
        zip5,
        state_abbr,
        provider_city,
        AVG(avg_total_payment)::numeric(14,0)    AS avg_total_payment,
        AVG(avg_covered_charge)::numeric(14,0)   AS avg_covered_charge,
        AVG(avg_medicare_payment)::numeric(14,0) AS avg_medicare_payment,
        (AVG(avg_total_payment) / NULLIF(AVG(avg_covered_charge), 0))::numeric(6,4) AS avg_reimbursement_rate,
        SUM(total_discharges)::int               AS total_discharges,
        SUM(num_providers)::int                  AS num_providers
      FROM medicosts.mv_zip_summary
      ${where}
      GROUP BY zip5, state_abbr, provider_city
      ORDER BY AVG(${col}) ${sortDir}
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
    const metricName = req.query.metric || 'payment';
    const cast = metricName === 'reimbursement' ? '::numeric(6,4)' : '::numeric(14,0)';
    const { rows } = await pool.query(`
      SELECT
        zip5,
        AVG(${col})${cast} AS price
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
        m.provider_ccn,
        m.provider_city,
        m.drg_cd,
        m.drg_desc,
        m.total_discharges,
        m.avg_covered_charges::numeric(14,2)  AS avg_covered_charges,
        m.avg_total_payments::numeric(14,2)   AS avg_total_payments,
        m.avg_medicare_payments::numeric(14,2) AS avg_medicare_payments,
        hi.hospital_overall_rating             AS star_rating,
        hi.hospital_type,
        hs.overall_star                        AS hcahps_overall_star
      FROM medicosts.medicare_inpatient m
      LEFT JOIN medicosts.hospital_info hi ON m.provider_ccn = hi.facility_id
      LEFT JOIN medicosts.mv_hcahps_summary hs ON m.provider_ccn = hs.facility_id
      ${where}
      ORDER BY m.avg_total_payments DESC
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/cost-vs-stars?drg=ALL|code                        */
/*  Hospital cost vs star rating scatter data                          */
/* ------------------------------------------------------------------ */
router.get('/quality/cost-vs-stars', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const where = drg === 'ALL' ? '' : 'WHERE mi.drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];

    const { rows } = await pool.query(`
      SELECT
        hi.facility_id,
        hi.facility_name,
        hi.city,
        hi.state,
        hi.zip_code,
        hi.hospital_type,
        hi.hospital_ownership,
        hi.hospital_overall_rating                    AS star_rating,
        AVG(mi.avg_total_payments)::numeric(14,0)     AS avg_payment,
        AVG(mi.avg_covered_charges)::numeric(14,0)    AS avg_charges,
        AVG(mi.avg_medicare_payments)::numeric(14,0)  AS avg_medicare,
        SUM(mi.total_discharges)::int                 AS total_discharges,
        COUNT(DISTINCT mi.drg_cd)::int                AS num_drgs
      FROM medicosts.hospital_info hi
      JOIN medicosts.medicare_inpatient mi
        ON hi.facility_id = mi.provider_ccn
      ${where}
      ${drg === 'ALL' ? 'WHERE' : 'AND'} hi.hospital_overall_rating IS NOT NULL
      GROUP BY hi.facility_id, hi.facility_name, hi.city, hi.state,
               hi.zip_code, hi.hospital_type, hi.hospital_ownership,
               hi.hospital_overall_rating
      ORDER BY avg_payment DESC
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hospital/:ccn                                     */
/*  Single hospital quality profile (info + HCAHPS)                    */
/* ------------------------------------------------------------------ */
router.get('/quality/hospital/:ccn', async (req, res, next) => {
  try {
    const ccn = req.params.ccn;

    const info = await pool.query(`
      SELECT facility_id, facility_name, address, city, state, zip_code,
             county_name, phone_number, hospital_type, hospital_ownership,
             emergency_services, hospital_overall_rating
      FROM medicosts.hospital_info
      WHERE facility_id = $1
    `, [ccn]);

    const hcahps = await pool.query(`
      SELECT *
      FROM medicosts.mv_hcahps_summary
      WHERE facility_id = $1
    `, [ccn]);

    res.json({
      hospital: info.rows[0] || null,
      hcahps: hcahps.rows[0] || null,
    });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/summary                                           */
/*  Star rating distribution + avg cost per star                       */
/* ------------------------------------------------------------------ */
router.get('/quality/summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        star_rating,
        COUNT(*)::int                               AS num_hospitals,
        AVG(weighted_avg_payment)::numeric(14,0)    AS avg_payment,
        AVG(weighted_avg_charges)::numeric(14,0)    AS avg_charges,
        AVG(weighted_avg_medicare)::numeric(14,0)   AS avg_medicare,
        SUM(total_discharges)::int                  AS total_discharges
      FROM medicosts.mv_hospital_cost_quality
      GROUP BY star_rating
      ORDER BY star_rating
    `);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/outpatient/top-hcpcs?limit=25                             */
/*  Top outpatient HCPCS by cost (national)                            */
/* ------------------------------------------------------------------ */
router.get('/outpatient/top-hcpcs', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    const { rows } = await pool.query(`
      SELECT
        apc_cd,
        MAX(apc_desc)                                AS apc_desc,
        COUNT(DISTINCT provider_ccn)::int            AS num_providers,
        SUM(capc_services)::int                      AS total_services,
        AVG(avg_submitted_charges)::numeric(14,0)    AS avg_charges,
        AVG(avg_medicare_payment)::numeric(14,0)     AS avg_medicare
      FROM medicosts.medicare_outpatient
      GROUP BY apc_cd
      ORDER BY AVG(avg_submitted_charges) DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/outpatient/provider/:ccn                                  */
/*  Outpatient services for a specific hospital                        */
/* ------------------------------------------------------------------ */
router.get('/outpatient/provider/:ccn', async (req, res, next) => {
  try {
    const ccn = req.params.ccn;

    const { rows } = await pool.query(`
      SELECT
        apc_cd,
        apc_desc,
        capc_services                                AS total_services,
        avg_submitted_charges::numeric(14,2)         AS avg_charges,
        avg_allowed_amount::numeric(14,2)            AS avg_allowed,
        avg_medicare_payment::numeric(14,2)          AS avg_medicare
      FROM medicosts.medicare_outpatient
      WHERE provider_ccn = $1
      ORDER BY avg_submitted_charges DESC NULLS LAST
    `, [ccn]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/physician/zip-summary?zip=<zip5>                          */
/*  Top physician HCPCS for a ZIP                                      */
/* ------------------------------------------------------------------ */
router.get('/physician/zip-summary', async (req, res, next) => {
  try {
    const zip = req.query.zip;
    if (!zip) return res.status(400).json({ error: 'zip query parameter is required' });

    const { rows } = await pool.query(`
      SELECT
        hcpcs_cd,
        hcpcs_desc,
        num_physicians,
        total_services::int,
        weighted_avg_charge::numeric(14,0)   AS avg_charge,
        weighted_avg_medicare::numeric(14,0) AS avg_medicare
      FROM medicosts.mv_physician_zip_summary
      WHERE zip5 = $1
      ORDER BY weighted_avg_charge DESC
      LIMIT 50
    `, [zip]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/physician/top-hcpcs?limit=25                              */
/*  Top physician HCPCS nationally                                     */
/* ------------------------------------------------------------------ */
router.get('/physician/top-hcpcs', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    const { rows } = await pool.query(`
      SELECT
        hcpcs_cd,
        MAX(hcpcs_desc)                               AS hcpcs_desc,
        SUM(num_physicians)::int                      AS num_physicians,
        SUM(total_services)::int                      AS total_services,
        SUM(total_services * weighted_avg_charge) / NULLIF(SUM(total_services), 0)
          AS weighted_avg_charge,
        SUM(total_services * weighted_avg_medicare) / NULLIF(SUM(total_services), 0)
          AS weighted_avg_medicare
      FROM medicosts.mv_physician_zip_summary
      GROUP BY hcpcs_cd
      ORDER BY weighted_avg_charge DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/demographics/zip/:zip                                     */
/*  Demographics for a single ZIP                                      */
/* ------------------------------------------------------------------ */
router.get('/demographics/zip/:zip', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT zcta, zcta_name, median_household_income, total_population
      FROM medicosts.census_zcta
      WHERE zcta = $1
    `, [req.params.zip]);

    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/zips/enriched?drg=ALL|code&metric=...                     */
/*  Top 50 ZIPs with demographics (income, population)                 */
/* ------------------------------------------------------------------ */
router.get('/zips/enriched', async (req, res, next) => {
  try {
    const drg = req.query.drg || 'ALL';
    const metricName = req.query.metric || 'payment';
    const col = METRIC_COL[metricName] || 'avg_total_payment';
    const where = drg === 'ALL' ? '' : 'WHERE drg_cd = $1';
    const params = drg === 'ALL' ? [] : [drg];
    const sortDir = metricName === 'reimbursement' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(`
      SELECT
        z.zip5,
        z.state_abbr,
        z.provider_city,
        AVG(z.avg_total_payment)::numeric(14,0)    AS avg_total_payment,
        AVG(z.avg_covered_charge)::numeric(14,0)   AS avg_covered_charge,
        AVG(z.avg_medicare_payment)::numeric(14,0) AS avg_medicare_payment,
        (AVG(z.avg_total_payment) / NULLIF(AVG(z.avg_covered_charge), 0))::numeric(6,4) AS avg_reimbursement_rate,
        SUM(z.total_discharges)::int               AS total_discharges,
        SUM(z.num_providers)::int                  AS num_providers,
        c.median_household_income,
        c.total_population
      FROM medicosts.mv_zip_summary z
      LEFT JOIN medicosts.census_zcta c ON z.zip5 = c.zcta
      ${where}
      GROUP BY z.zip5, z.state_abbr, z.provider_city, c.median_household_income, c.total_population
      ORDER BY AVG(${col}) ${sortDir}
      LIMIT 50
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
