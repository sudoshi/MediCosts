import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/quality/composite                                         */
/*  All hospitals from the quality composite view                      */
/* ------------------------------------------------------------------ */
router.get('/composite', async (req, res, next) => {
  try {
    const { state, min_stars, sort = 'star_rating', order = 'desc', limit = 200 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (state) { conditions.push(`state = $${idx++}`); params.push(state); }
    if (min_stars) { conditions.push(`star_rating >= $${idx++}`); params.push(Number(min_stars)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['star_rating', 'psi_90_score', 'avg_excess_readm_ratio', 'avg_mortality_rate', 'weighted_avg_payment', 'facility_name'];
    const col = allowedSorts.includes(sort) ? sort : 'star_rating';
    const dir = order === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(
      `SELECT * FROM medicosts.mv_hospital_quality_composite
       ${where} ORDER BY ${col} ${dir} NULLS LAST LIMIT $${idx}`,
      [...params, Math.min(Number(limit) || 200, 500)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/composite/:ccn                                    */
/*  Single hospital full quality profile                               */
/* ------------------------------------------------------------------ */
router.get('/composite/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.mv_hospital_quality_composite WHERE facility_id = $1`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Hospital not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hai/national-summary                              */
/*  Aggregate HAI SIR values nationally                                */
/* ------------------------------------------------------------------ */
router.get('/hai/national-summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT measure_id, measure_name,
        COUNT(*)::int AS hospitals,
        AVG(score)::numeric(10,4) AS avg_sir,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score)::numeric(10,4) AS median_sir,
        COUNT(*) FILTER (WHERE compared_to_national ILIKE '%worse%')::int AS worse_count,
        COUNT(*) FILTER (WHERE compared_to_national ILIKE '%better%')::int AS better_count
      FROM medicosts.nhsn_hai
      WHERE score IS NOT NULL
      GROUP BY measure_id, measure_name
      ORDER BY measure_id
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hai/hospital/:ccn                                 */
/* ------------------------------------------------------------------ */
router.get('/hai/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT measure_id, measure_name, compared_to_national, score, start_date, end_date
       FROM medicosts.nhsn_hai WHERE facility_id = $1 ORDER BY measure_id`,
      [req.params.ccn]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hai/compare?facilities=ccn1,ccn2,ccn3             */
/* ------------------------------------------------------------------ */
router.get('/hai/compare', async (req, res, next) => {
  try {
    const ids = (req.query.facilities || '').split(',').filter(Boolean).slice(0, 5);
    if (ids.length === 0) return res.json([]);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT facility_id, facility_name, measure_id, score, compared_to_national
       FROM medicosts.nhsn_hai WHERE facility_id IN (${placeholders})
       ORDER BY facility_id, measure_id`,
      ids
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/readmissions/summary                              */
/*  Readmissions table uses measure_name + excess_readmission_ratio    */
/* ------------------------------------------------------------------ */
router.get('/readmissions/summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT measure_name,
        COUNT(*)::int AS hospitals,
        AVG(excess_readmission_ratio)::numeric(6,4) AS avg_ratio,
        COUNT(*) FILTER (WHERE excess_readmission_ratio > 1)::int AS penalized_count,
        COUNT(*) FILTER (WHERE excess_readmission_ratio <= 1)::int AS not_penalized_count,
        AVG(predicted_readm_rate)::numeric(6,3) AS avg_predicted_rate,
        AVG(expected_readm_rate)::numeric(6,3) AS avg_expected_rate
      FROM medicosts.hospital_readmissions
      WHERE excess_readmission_ratio IS NOT NULL
      GROUP BY measure_name
      ORDER BY avg_ratio DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/readmissions/hospital/:ccn                        */
/* ------------------------------------------------------------------ */
router.get('/readmissions/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT measure_name, num_discharges, excess_readmission_ratio,
              predicted_readm_rate, expected_readm_rate, num_readmissions
       FROM medicosts.hospital_readmissions WHERE facility_id = $1 ORDER BY measure_name`,
      [req.params.ccn]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/readmissions/penalties?limit=50&state=XX          */
/* ------------------------------------------------------------------ */
router.get('/readmissions/penalties', async (req, res, next) => {
  try {
    const { state, limit = 50 } = req.query;
    const conditions = ['excess_readmission_ratio > 1'];
    const params = [];
    let idx = 1;
    if (state) { conditions.push(`state = $${idx++}`); params.push(state); }

    const { rows } = await pool.query(
      `SELECT facility_id, facility_name, state, measure_name, excess_readmission_ratio,
              predicted_readm_rate, expected_readm_rate
       FROM medicosts.hospital_readmissions
       WHERE ${conditions.join(' AND ')}
       ORDER BY excess_readmission_ratio DESC LIMIT $${idx}`,
      [...params, Math.min(Number(limit) || 50, 200)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/psi/summary                                       */
/*  PSI table is wide-format: one row per hospital                     */
/* ------------------------------------------------------------------ */
router.get('/psi/summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS hospitals,
        AVG(psi_90_value)::numeric(8,4) AS avg_psi_90,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psi_90_value) AS median_psi_90,
        AVG(total_hac_score)::numeric(8,4) AS avg_hac_score,
        AVG(clabsi_sir)::numeric(8,4) AS avg_clabsi_sir,
        AVG(cauti_sir)::numeric(8,4) AS avg_cauti_sir,
        AVG(ssi_sir)::numeric(8,4) AS avg_ssi_sir,
        AVG(cdi_sir)::numeric(8,4) AS avg_cdi_sir,
        AVG(mrsa_sir)::numeric(8,4) AS avg_mrsa_sir,
        COUNT(*) FILTER (WHERE payment_reduction = 'Yes')::int AS penalized_count,
        COUNT(*) FILTER (WHERE payment_reduction = 'No')::int AS not_penalized_count
      FROM medicosts.patient_safety_indicators
      WHERE psi_90_value IS NOT NULL
    `);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/psi/hospital/:ccn                                 */
/* ------------------------------------------------------------------ */
router.get('/psi/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT facility_id, facility_name, state, fiscal_year,
              psi_90_value, psi_90_z_score,
              clabsi_sir, clabsi_z_score,
              cauti_sir, cauti_z_score,
              ssi_sir, ssi_z_score,
              cdi_sir, cdi_z_score,
              mrsa_sir, mrsa_z_score,
              total_hac_score, payment_reduction
       FROM medicosts.patient_safety_indicators WHERE facility_id = $1`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Hospital not found in PSI data' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/timely-care/hospital/:ccn                         */
/* ------------------------------------------------------------------ */
router.get('/timely-care/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT condition, measure_id, measure_name, score, sample
       FROM medicosts.timely_effective_care WHERE facility_id = $1
       ORDER BY condition, measure_id`,
      [req.params.ccn]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/timely-care/ed-comparison?state=XX                */
/* ------------------------------------------------------------------ */
router.get('/timely-care/ed-comparison', async (req, res, next) => {
  try {
    const { state } = req.query;
    const conditions = ["measure_id IN ('ED_1b','ED_2b','OP_18b')", "score ~ '^[0-9]'"];
    const params = [];
    let idx = 1;
    if (state) { conditions.push(`state = $${idx++}`); params.push(state); }

    const { rows } = await pool.query(
      `SELECT facility_id, facility_name, state, measure_id, score::numeric AS score
       FROM medicosts.timely_effective_care
       WHERE ${conditions.join(' AND ')}
       ORDER BY score::numeric DESC LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/mortality/hospital/:ccn                           */
/* ------------------------------------------------------------------ */
router.get('/mortality/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT measure_id, measure_name, compared_to_national, score,
              denominator, lower_estimate, higher_estimate
       FROM medicosts.complications_deaths WHERE facility_id = $1 ORDER BY measure_id`,
      [req.params.ccn]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/mortality/summary                                 */
/* ------------------------------------------------------------------ */
router.get('/mortality/summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT measure_id, measure_name,
        COUNT(*)::int AS hospitals,
        AVG(score)::numeric(6,3) AS avg_rate,
        COUNT(*) FILTER (WHERE compared_to_national ILIKE '%worse%')::int AS worse_count,
        COUNT(*) FILTER (WHERE compared_to_national ILIKE '%better%')::int AS better_count
      FROM medicosts.complications_deaths
      WHERE score IS NOT NULL AND measure_id LIKE 'MORT_%'
      GROUP BY measure_id, measure_name
      ORDER BY avg_rate DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/state-summary                                     */
/* ------------------------------------------------------------------ */
router.get('/state-summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.mv_state_quality_summary ORDER BY state`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/search?q=hospital_name&limit=20                   */
/*  Hospital autocomplete for Hospital Explorer                        */
/* ------------------------------------------------------------------ */
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT facility_id, facility_name, city, state, hospital_overall_rating AS star_rating
       FROM medicosts.hospital_info
       WHERE facility_name ILIKE $1
       ORDER BY facility_name LIMIT $2`,
      [`%${q}%`, Math.min(Number(limit) || 20, 50)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hospitals?page=1&per_page=50&sort=&state=         */
/*  Paginated hospital list with quality fields                        */
/* ------------------------------------------------------------------ */
router.get('/hospitals', async (req, res, next) => {
  try {
    const { page = 1, per_page = 50, sort = 'facility_name', order = 'asc', state } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(per_page);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (state) { conditions.push(`state = $${idx++}`); params.push(state); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['facility_name', 'star_rating', 'state', 'weighted_avg_payment', 'psi_90_score', 'avg_excess_readm_ratio'];
    const col = allowedSorts.includes(sort) ? sort : 'facility_name';
    const dir = order === 'desc' ? 'DESC' : 'ASC';

    const countQ = pool.query(`SELECT COUNT(*)::int AS total FROM medicosts.mv_hospital_quality_composite ${where}`, params);
    const dataQ = pool.query(
      `SELECT * FROM medicosts.mv_hospital_quality_composite ${where}
       ORDER BY ${col} ${dir} NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Math.min(Number(per_page) || 50, 100), offset]
    );

    const [countRes, dataRes] = await Promise.all([countQ, dataQ]);
    res.json({ total: countRes.rows[0].total, page: Number(page), per_page: Number(per_page), data: dataRes.rows });
  } catch (err) { next(err); }
});

export default router;
