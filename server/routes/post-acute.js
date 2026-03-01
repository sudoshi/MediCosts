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
/*  GET /api/post-acute/landscape?state=XX                             */
/*  State-level post-acute care overview                               */
/* ------------------------------------------------------------------ */
router.get('/landscape', async (req, res, next) => {
  try {
    const { state } = req.query;
    let query = `SELECT * FROM medicosts.mv_post_acute_landscape`;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY state`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
