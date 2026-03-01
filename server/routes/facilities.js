import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/facilities/irf?state=XX&limit=N                          */
/* ------------------------------------------------------------------ */
router.get('/irf', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, provider_name, city, state, zip_code, county,
        ownership_type, phone
      FROM medicosts.irf_info
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY provider_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/facilities/irf/:ccn                                      */
/* ------------------------------------------------------------------ */
router.get('/irf/:ccn', async (req, res, next) => {
  try {
    const info = await pool.query(
      `SELECT * FROM medicosts.irf_info WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    const measures = await pool.query(
      `SELECT measure_code, score, footnote, start_date, end_date
       FROM medicosts.irf_measures WHERE provider_ccn = $1
       ORDER BY measure_code`,
      [req.params.ccn]
    );
    if (info.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...info.rows[0], measures: measures.rows });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/facilities/ltch?state=XX&limit=N                         */
/* ------------------------------------------------------------------ */
router.get('/ltch', async (req, res, next) => {
  try {
    const { state, limit } = req.query;
    let query = `
      SELECT provider_ccn, provider_name, city, state, zip_code, county, phone
      FROM medicosts.ltch_info
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` WHERE state = $1`;
    }
    query += ` ORDER BY provider_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/facilities/ltch/:ccn                                     */
/* ------------------------------------------------------------------ */
router.get('/ltch/:ccn', async (req, res, next) => {
  try {
    const info = await pool.query(
      `SELECT * FROM medicosts.ltch_info WHERE provider_ccn = $1`,
      [req.params.ccn]
    );
    const measures = await pool.query(
      `SELECT measure_code, score, footnote, start_date, end_date
       FROM medicosts.ltch_measures WHERE provider_ccn = $1
       ORDER BY measure_code`,
      [req.params.ccn]
    );
    if (info.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...info.rows[0], measures: measures.rows });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/facilities/suppliers?state=XX&q=&limit=N                 */
/* ------------------------------------------------------------------ */
router.get('/suppliers', async (req, res, next) => {
  try {
    const { state, q, limit } = req.query;
    let query = `
      SELECT provider_id, business_name, practice_name, city, state, zip_code,
        phone, specialties, supplies, accepts_assignment
      FROM medicosts.medical_equipment_suppliers
    `;
    const params = [];
    const conditions = [];
    if (state) {
      params.push(state);
      conditions.push(`state = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(business_name ILIKE $${params.length} OR practice_name ILIKE $${params.length} OR supplies ILIKE $${params.length})`);
    }
    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY business_name`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    } else {
      query += ` LIMIT 200`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
