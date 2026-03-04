import { Router } from 'express';
import pool from '../db.js';
import { cache } from '../lib/cache.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/drgs/top50                                                */
/*  Returns the 50 most expensive DRGs                                 */
/* ------------------------------------------------------------------ */
router.get('/drgs/top50', async (_req, res, next) => {
  try {
    const rows = await cache('drgs:top50', 3600, () => pool.query(`
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
    `).then(r => r.rows));
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/drgs/search?q=knee&limit=20                               */
/*  Search all DRGs by keyword                                         */
/* ------------------------------------------------------------------ */
router.get('/drgs/search', async (req, res, next) => {
  try {
    const { q = '', limit = 20 } = req.query;
    if (q.length < 2) return res.json([]);
    const { rows } = await pool.query(`
      SELECT drg_cd, drg_desc,
        COUNT(DISTINCT provider_ccn)::int AS num_providers,
        SUM(total_discharges)::int AS total_discharges,
        AVG(avg_total_payments)::numeric(14,0) AS avg_payment
      FROM medicosts.medicare_inpatient
      WHERE drg_desc ILIKE $1
      GROUP BY drg_cd, drg_desc
      ORDER BY SUM(total_discharges) DESC
      LIMIT $2
    `, [`%${q}%`, Math.min(Number(limit) || 20, 50)]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/drgs/:code/summary                                        */
/*  National stats for a single DRG                                    */
/* ------------------------------------------------------------------ */
/* GET /api/drgs/:code/hospitals?ccns=111111,222222,333333 */
router.get('/drgs/:code/hospitals', async (req, res, next) => {
  try {
    const code = req.params.code;
    const ccns = (req.query.ccns || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
    if (!ccns.length) return res.json([]);
    const placeholders = ccns.map((_, i) => `$${i + 2}`).join(',');
    const { rows } = await pool.query(
      `SELECT provider_ccn, MAX(provider_name) AS facility_name,
              SUM(total_discharges)::int AS total_discharges,
              AVG(avg_covered_charges)::numeric(14,0) AS avg_charges,
              AVG(avg_total_payments)::numeric(14,0) AS avg_payment,
              AVG(avg_medicare_payments)::numeric(14,0) AS avg_medicare_payment
       FROM medicosts.medicare_inpatient
       WHERE drg_cd = $1 AND provider_ccn IN (${placeholders})
       GROUP BY provider_ccn`,
      [code, ...ccns]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/drgs/:code/summary', async (req, res, next) => {
  try {
    const code = req.params.code;
    const { rows } = await pool.query(`
      SELECT drg_cd, MAX(drg_desc) AS drg_desc,
        COUNT(DISTINCT provider_ccn)::int AS num_providers,
        SUM(total_discharges)::int AS total_discharges,
        MIN(avg_total_payments)::numeric(14,0) AS min_payment,
        MAX(avg_total_payments)::numeric(14,0) AS max_payment,
        AVG(avg_total_payments)::numeric(14,0) AS avg_payment,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_total_payments)::numeric(14,0) AS median_payment,
        MIN(avg_covered_charges)::numeric(14,0) AS min_charges,
        MAX(avg_covered_charges)::numeric(14,0) AS max_charges,
        AVG(avg_covered_charges)::numeric(14,0) AS avg_charges
      FROM medicosts.medicare_inpatient
      WHERE drg_cd = $1
      GROUP BY drg_cd
    `, [code]);
    if (rows.length === 0) return res.status(404).json({ error: 'DRG not found' });

    const { rows: byState } = await pool.query(`
      SELECT state_abbr,
        AVG(avg_total_payments)::numeric(14,0) AS avg_payment,
        SUM(total_discharges)::int AS total_discharges,
        COUNT(DISTINCT provider_ccn)::int AS num_providers
      FROM medicosts.medicare_inpatient
      WHERE drg_cd = $1
      GROUP BY state_abbr ORDER BY avg_payment DESC
    `, [code]);

    res.json({ ...rows[0], by_state: byState });
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
    const rows = await cache('quality:summary', 3600, () => pool.query(`
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
    `).then(r => r.rows));

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
        hcpcs_cd                             AS hcpcs_code,
        hcpcs_desc                           AS hcpcs_description,
        num_physicians                       AS num_providers,
        total_services::int,
        weighted_avg_charge::numeric(14,0)   AS avg_charge,
        weighted_avg_medicare::numeric(14,0) AS avg_payment
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
        hcpcs_cd                                      AS hcpcs_code,
        MAX(hcpcs_desc)                               AS hcpcs_description,
        SUM(num_physicians)::int                      AS total_providers,
        SUM(total_services)::int                      AS total_services,
        SUM(total_services * weighted_avg_charge) / NULLIF(SUM(total_services), 0)
          AS avg_charge,
        SUM(total_services * weighted_avg_medicare) / NULLIF(SUM(total_services), 0)
          AS avg_payment
      FROM medicosts.mv_physician_zip_summary
      GROUP BY hcpcs_cd
      ORDER BY SUM(total_services * weighted_avg_charge) / NULLIF(SUM(total_services), 0) DESC
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
/*  POST /api/admin/refresh-views                                       */
/*  Refresh all materialized views concurrently                         */
/* ------------------------------------------------------------------ */
router.post('/admin/refresh-views', async (_req, res, next) => {
  try {
    const views = [
      'mv_top50_drg', 'mv_zip_summary', 'mv_zip_enriched',
      'mv_hospital_cost_quality', 'mv_hcahps_summary', 'mv_physician_zip_summary',
      'mv_hospital_quality_composite', 'mv_state_quality_summary',
    ];
    for (const v of views) {
      await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY medicosts.${v}`);
    }
    res.json({ message: `Refreshed ${views.length} materialized views` });
  } catch (err) { next(err); }
});

/* ================================================================== */
/*  Spending & Value Endpoints                                         */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  GET /api/spending/episode/:ccn                                     */
/*  Spending breakdown by claim type + period for a hospital           */
/* ------------------------------------------------------------------ */
router.get('/spending/episode/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT facility_id, facility_name, state, period, claim_type,
        avg_spndg_per_ep_hospital, avg_spndg_per_ep_state, avg_spndg_per_ep_national,
        pct_spndg_hospital, pct_spndg_state, pct_spndg_national
      FROM medicosts.hospital_spending_by_claim
      WHERE facility_id = $1
      ORDER BY period, claim_type
    `, [req.params.ccn]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/spending/per-beneficiary?state=XX                         */
/* ------------------------------------------------------------------ */
router.get('/spending/per-beneficiary', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT facility_id, facility_name, state, zip_code, county, mspb_score
      FROM medicosts.spending_per_beneficiary
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY mspb_score NULLS LAST`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/vbp/hospital/:ccn                                         */
/*  VBP scores across all 5 domains                                    */
/* ------------------------------------------------------------------ */
router.get('/vbp/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM medicosts.hospital_vbp WHERE facility_id = $1
    `, [req.params.ccn]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/vbp/rankings?state=XX                                     */
/*  VBP performance rankings                                           */
/* ------------------------------------------------------------------ */
router.get('/vbp/rankings', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT facility_id, facility_name, state, zip_code,
        total_performance_score,
        clinical_outcomes_score_w, safety_score_w,
        efficiency_score_w, person_engagement_score_w,
        hcahps_base_score, mspb_1_performance_rate
      FROM medicosts.hospital_vbp
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY total_performance_score DESC NULLS LAST`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/unplanned-visits/hospital/:ccn                            */
/* ------------------------------------------------------------------ */
router.get('/unplanned-visits/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT facility_id, facility_name, state,
        measure_id, measure_name, compared_to_national,
        denominator, score, lower_estimate, higher_estimate,
        num_patients, num_patients_returned
      FROM medicosts.unplanned_hospital_visits
      WHERE facility_id = $1
      ORDER BY measure_id
    `, [req.params.ccn]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/value-composite?state=XX                                  */
/*  Hospital value composite (quality + cost + VBP + MSPB)             */
/* ------------------------------------------------------------------ */
router.get('/value-composite', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `SELECT * FROM medicosts.mv_hospital_value_composite`;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY vbp_total_score DESC NULLS LAST`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ================================================================== */
/*  Clinician Endpoints                                                */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  GET /api/clinicians/search?q=&specialty=&state=&limit=             */
/* ------------------------------------------------------------------ */
router.get('/clinicians/search', async (req, res, next) => {
  try {
    const { q, specialty, state, limit } = req.query;
    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(last_name ILIKE $${params.length} OR first_name ILIKE $${params.length})`);
    }
    if (specialty) {
      params.push(specialty);
      conditions.push(`primary_specialty ILIKE $${params.length}`);
    }
    if (state) {
      params.push(state);
      conditions.push(`state = $${params.length}`);
    }

    let query = `
      SELECT npi, last_name, first_name, credential, gender,
        primary_specialty, city, state, zip_code, telehealth,
        facility_name
      FROM medicosts.clinician_directory
    `;
    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY last_name, first_name`;
    params.push(parseInt(limit) || 50);
    query += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clinicians/:npi                                           */
/* ------------------------------------------------------------------ */
router.get('/clinicians/:npi', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM medicosts.clinician_directory WHERE npi = $1
    `, [req.params.npi]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows.length === 1 ? rows[0] : rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/estimate?drg=&state=&zip=&radius=50&sort=payment&...      */
/*  Procedure cost estimator — hospitals for a DRG with distance       */
/* ------------------------------------------------------------------ */
router.get('/estimate', async (req, res, next) => {
  try {
    const { drg, state, zip, radius = 50, sort = 'payment', order = 'asc', limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;
    if (drg) { conditions.push(`mi.drg_cd = $${idx++}`); params.push(drg); }
    if (state) { conditions.push(`hi.state = $${idx++}`); params.push(state); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let distSelect = 'NULL::numeric AS distance_miles';
    let distJoin = '';
    let distFilter = '';

    if (zip && zip.length === 5) {
      distSelect = `(3958.8 * 2 * asin(sqrt(
        power(sin(radians(hzc.lat - uzc.lat) / 2), 2) +
        cos(radians(uzc.lat)) * cos(radians(hzc.lat)) *
        power(sin(radians(hzc.lon - uzc.lon) / 2), 2)
      )))::numeric(8,1) AS distance_miles`;
      distJoin = `JOIN medicosts.zip_centroids hzc ON hi.zip_code = hzc.zip5
        JOIN medicosts.zip_centroids uzc ON uzc.zip5 = $${idx++}`;
      params.push(zip);
      distFilter = `HAVING (3958.8 * 2 * asin(sqrt(
        power(sin(radians(hzc.lat - uzc.lat) / 2), 2) +
        cos(radians(uzc.lat)) * cos(radians(hzc.lat)) *
        power(sin(radians(hzc.lon - uzc.lon) / 2), 2)
      ))) <= $${idx++}`;
      params.push(Number(radius));
    }

    const SORTS = { payment: 'avg_total_payments', distance: 'distance_miles', star: 'star_rating', markup: 'markup_ratio' };
    const sortCol = SORTS[sort] || 'avg_total_payments';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';

    const { rows } = await pool.query(`
      WITH base AS (
        SELECT
          hi.facility_id, hi.facility_name, hi.city, hi.state, hi.zip_code,
          hi.hospital_type, hi.hospital_overall_rating AS star_rating, hi.phone_number,
          hs.overall_star AS hcahps_overall_star,
          AVG(mi.avg_total_payments)::numeric(14,0) AS avg_total_payments,
          AVG(mi.avg_covered_charges)::numeric(14,0) AS avg_covered_charges,
          AVG(mi.avg_medicare_payments)::numeric(14,0) AS avg_medicare_payments,
          SUM(mi.total_discharges)::int AS total_discharges,
          (AVG(mi.avg_covered_charges) / NULLIF(AVG(mi.avg_total_payments), 0))::numeric(6,2) AS markup_ratio,
          ${distSelect}
        FROM medicosts.medicare_inpatient mi
        JOIN medicosts.hospital_info hi ON mi.provider_ccn = hi.facility_id
        LEFT JOIN medicosts.mv_hcahps_summary hs ON hi.facility_id = hs.facility_id
        ${distJoin}
        ${where}
        GROUP BY hi.facility_id, hi.facility_name, hi.city, hi.state, hi.zip_code,
          hi.hospital_type, hi.hospital_overall_rating, hi.phone_number,
          hs.overall_star${zip ? ', hzc.lat, hzc.lon, uzc.lat, uzc.lon' : ''}
        ${distFilter}
      )
      SELECT * FROM base
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${idx}
    `, [...params, Math.min(Number(limit) || 50, 200)]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/hospitals/nearby?zip=&radius=50&sort=star_rating&limit=25 */
/*  Hospitals near a ZIP with quality composite                        */
/* ------------------------------------------------------------------ */
router.get('/hospitals/nearby', async (req, res, next) => {
  try {
    const { zip, radius = 50, sort = 'star_rating', limit = 25 } = req.query;
    if (!zip || zip.length !== 5) return res.status(400).json({ error: 'zip required (5 digits)' });

    const ALLOWED = ['star_rating', 'distance_miles', 'weighted_avg_payment'];
    const sortCol = ALLOWED.includes(sort) ? sort : 'star_rating';

    const { rows } = await pool.query(`
      WITH base AS (
        SELECT
          q.facility_id, q.facility_name, q.city, q.state, q.zip_code,
          q.star_rating, q.psi_90_score, q.avg_excess_readm_ratio,
          q.avg_mortality_rate, q.weighted_avg_payment, q.total_discharges,
          hi.hospital_type,
          (3958.8 * 2 * asin(sqrt(
            power(sin(radians(hzc.lat - uzc.lat) / 2), 2) +
            cos(radians(uzc.lat)) * cos(radians(hzc.lat)) *
            power(sin(radians(hzc.lon - uzc.lon) / 2), 2)
          )))::numeric(8,1) AS distance_miles
        FROM medicosts.mv_hospital_quality_composite q
        JOIN medicosts.hospital_info hi ON q.facility_id = hi.facility_id
        JOIN medicosts.zip_centroids hzc ON hi.zip_code = hzc.zip5
        JOIN medicosts.zip_centroids uzc ON uzc.zip5 = $1
      )
      SELECT * FROM base
      WHERE distance_miles <= $2
      ORDER BY ${sortCol} DESC NULLS LAST
      LIMIT $3
    `, [zip, Number(radius), Math.min(Number(limit) || 25, 100)]);
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
