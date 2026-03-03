import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/nursing-homes?state=XX                         */
/* ------------------------------------------------------------------ */
router.get('/nursing-homes', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, provider_name, city, state, zip_code,
        overall_rating, health_inspection_rating, qm_rating, staffing_rating,
        number_of_beds, avg_residents_per_day, ownership_type,
        rn_hours_per_resident, total_nurse_hours_per_res,
        number_of_fines, total_fines_dollars, total_penalties
      FROM medicosts.nursing_home_info
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY overall_rating DESC NULLS LAST, provider_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/nursing-home/:ccn                              */
/* ------------------------------------------------------------------ */
router.get('/nursing-home/:ccn', async (req, res, next) => {
  try {
    const info = await pool.query(
      `SELECT * FROM medicosts.nursing_home_info WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    const quality = await pool.query(
      `SELECT measure_code, measure_description, resident_type,
              q1_score, q2_score, q3_score, q4_score, four_quarter_avg
       FROM medicosts.nursing_home_quality WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    if (info.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...info.rows[0], quality_measures: quality.rows });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/home-health?state=XX                           */
/* ------------------------------------------------------------------ */
router.get('/home-health', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, provider_name, city, state, zip_code,
        quality_star_rating, ownership_type,
        dtc_rate, dtc_category,
        ppr_rate, ppr_category,
        pph_rate, pph_category,
        medicare_spend_per_episode
      FROM medicosts.home_health_agencies
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY quality_star_rating DESC NULLS LAST, provider_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/home-health/:ccn                               */
/* ------------------------------------------------------------------ */
router.get('/home-health/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.home_health_agencies WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/hospice?state=XX                               */
/* ------------------------------------------------------------------ */
router.get('/hospice', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, facility_name, city, state, zip_code, county,
        measure_code, measure_name, score
      FROM medicosts.hospice_providers
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY provider_ccn, measure_code`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/hospice/:ccn                                   */
/* ------------------------------------------------------------------ */
router.get('/hospice/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT provider_ccn, facility_name, city, state, zip_code, county,
              measure_code, measure_name, score
       FROM medicosts.hospice_providers WHERE provider_ccn = $1
       ORDER BY measure_code`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const { provider_ccn, facility_name, city, state, zip_code, county } = rows[0];
    const measures = rows.map(r => ({
      measure_code: r.measure_code,
      measure_name: r.measure_name,
      score: r.score,
    }));
    res.json({ provider_ccn, facility_name, city, state, zip_code, county, measures });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/dialysis?state=XX                              */
/* ------------------------------------------------------------------ */
router.get('/dialysis', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, facility_name, city, state, zip_code, county,
        five_star, profit_status, chain_organization, num_stations,
        mortality_rate, survival_category,
        hospitalization_rate, hospitalization_category,
        readmission_rate, readmission_category,
        transfusion_rate, transfusion_category,
        ed_visit_ratio, ed_visit_category
      FROM medicosts.dialysis_facilities
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY five_star DESC NULLS LAST, facility_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/dialysis/:ccn                                  */
/* ------------------------------------------------------------------ */
router.get('/dialysis/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.dialysis_facilities WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/post-acute/landscape?state=XX                             */
/*  State-level post-acute care overview                               */
/* ------------------------------------------------------------------ */
router.get('/landscape', async (req, res, next) => {
  try {
    const { state } = req.query;
    const stateFilter = state ? `WHERE state = $1` : '';
    const params = state ? [state] : [];

    const query = `
      SELECT
        state,
        COUNT(DISTINCT CASE WHEN type='nursing_home' THEN ccn END) AS nursing_homes,
        COUNT(DISTINCT CASE WHEN type='dialysis' THEN ccn END) AS dialysis_facilities,
        COUNT(DISTINCT CASE WHEN type='home_health' THEN ccn END) AS home_health_agencies,
        COUNT(DISTINCT CASE WHEN type='hospice' THEN ccn END) AS hospice_providers,
        COUNT(DISTINCT CASE WHEN type='irf' THEN ccn END) AS irf_facilities,
        COUNT(DISTINCT CASE WHEN type='ltch' THEN ccn END) AS ltch_facilities
      FROM (
        SELECT state, 'nursing_home' AS type, provider_ccn AS ccn FROM medicosts.nursing_home_info
        UNION ALL SELECT state, 'dialysis',    provider_ccn FROM medicosts.dialysis_facilities
        UNION ALL SELECT state, 'home_health', provider_ccn FROM medicosts.home_health_agencies
        UNION ALL SELECT state, 'hospice',     provider_ccn FROM medicosts.hospice_providers
        UNION ALL SELECT state, 'irf',         provider_ccn FROM medicosts.irf_info
        UNION ALL SELECT state, 'ltch',        provider_ccn FROM medicosts.ltch_info
      ) t
      ${stateFilter}
      GROUP BY state
      ORDER BY state
    `;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
