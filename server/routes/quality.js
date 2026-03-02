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
/*  GET /api/quality/hcahps/summary                                    */
/*  State-level HCAHPS patient experience averages                     */
/* ------------------------------------------------------------------ */
router.get('/hcahps/summary', async (req, res, next) => {
  try {
    const { state } = req.query;
    let query = `
      SELECT h.facility_id, i.state,
        h.overall_star, h.nurse_comm_star, h.doctor_comm_star,
        h.cleanliness_star, h.quietness_star, h.recommend_star, h.num_surveys
      FROM medicosts.mv_hcahps_summary h
      JOIN medicosts.hospital_info i ON h.facility_id = i.facility_id
      WHERE h.overall_star IS NOT NULL
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` AND i.state = $1`;
    }

    const { rows } = await pool.query(`
      SELECT state,
        COUNT(*)::int AS hospitals,
        AVG(overall_star)::numeric(3,1) AS avg_overall_star,
        AVG(nurse_comm_star)::numeric(3,1) AS avg_nurse_star,
        AVG(doctor_comm_star)::numeric(3,1) AS avg_doctor_star,
        AVG(cleanliness_star)::numeric(3,1) AS avg_cleanliness_star,
        AVG(quietness_star)::numeric(3,1) AS avg_quietness_star,
        AVG(recommend_star)::numeric(3,1) AS avg_recommend_star,
        SUM(num_surveys)::int AS total_surveys
      FROM (${query}) sub
      GROUP BY state
      ORDER BY state
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hcahps/hospital/:ccn                              */
/*  Single-hospital HCAHPS patient experience scores                   */
/* ------------------------------------------------------------------ */
router.get('/hcahps/hospital/:ccn', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.mv_hcahps_summary WHERE facility_id = $1`,
      [req.params.ccn]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No HCAHPS data for this hospital' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/hcahps/by-hospital?state=XX                       */
/*  Per-hospital HCAHPS stars for Hospital Explorer                    */
/* ------------------------------------------------------------------ */
router.get('/hcahps/by-hospital', async (req, res, next) => {
  try {
    const { state } = req.query;
    let query = `
      SELECT h.facility_id, h.overall_star, h.recommend_star, h.num_surveys
      FROM medicosts.mv_hcahps_summary h
      JOIN medicosts.hospital_info i ON h.facility_id = i.facility_id
      WHERE h.overall_star IS NOT NULL
    `;
    const params = [];
    if (state) {
      params.push(state);
      query += ` AND i.state = $1`;
    }
    const { rows } = await pool.query(query, params);
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

/* ------------------------------------------------------------------ */
/*  GET /api/quality/accountability/markups?state=XX&limit=100         */
/*  Hospitals with highest charge-to-payment markup ratios             */
/* ------------------------------------------------------------------ */
router.get('/accountability/markups', async (req, res, next) => {
  try {
    const { state, limit = 100 } = req.query;
    const conditions = ['avg_covered_charges > 0', 'avg_total_payments > 0'];
    const params = [];
    let idx = 1;
    if (state) { conditions.push(`m.state_abbr = $${idx++}`); params.push(state); }

    const { rows } = await pool.query(`
      SELECT m.provider_ccn AS facility_id,
        m.provider_name AS facility_name,
        m.state_abbr AS state,
        m.provider_city AS city,
        COUNT(*)::int AS drg_count,
        (SUM(m.avg_covered_charges * m.total_discharges) / NULLIF(SUM(m.avg_total_payments * m.total_discharges), 0))::numeric(8,2) AS markup_ratio,
        (SUM(m.avg_total_payments * m.total_discharges) / NULLIF(SUM(m.total_discharges), 0))::numeric(14,2) AS weighted_avg_payment,
        (SUM(m.avg_covered_charges * m.total_discharges) / NULLIF(SUM(m.total_discharges), 0))::numeric(14,2) AS weighted_avg_charges,
        SUM(m.total_discharges)::int AS total_discharges
      FROM medicosts.medicare_inpatient m
      WHERE ${conditions.join(' AND ')}
      GROUP BY m.provider_ccn, m.provider_name, m.state_abbr, m.provider_city
      HAVING SUM(m.total_discharges) >= 100
      ORDER BY markup_ratio DESC
      LIMIT $${idx}
    `, [...params, Math.min(Number(limit) || 100, 200)]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/accountability/state-rankings                     */
/*  States ranked by composite accountability metrics                  */
/* ------------------------------------------------------------------ */
router.get('/accountability/state-rankings', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH markup AS (
        SELECT state_abbr AS state,
          (SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(avg_total_payments * total_discharges), 0))::numeric(6,2) AS avg_markup
        FROM medicosts.medicare_inpatient
        WHERE avg_covered_charges > 0 AND avg_total_payments > 0
        GROUP BY state_abbr
      ),
      penalties AS (
        SELECT state,
          COUNT(DISTINCT facility_id)::int AS penalized_hospitals,
          AVG(excess_readmission_ratio)::numeric(6,4) AS avg_excess_ratio
        FROM medicosts.hospital_readmissions
        WHERE excess_readmission_ratio > 1
        GROUP BY state
      ),
      hac AS (
        SELECT state,
          AVG(total_hac_score)::numeric(8,3) AS avg_hac_score,
          COUNT(*) FILTER (WHERE payment_reduction = 'Yes')::int AS hac_penalized
        FROM medicosts.patient_safety_indicators
        WHERE total_hac_score IS NOT NULL
        GROUP BY state
      ),
      hcahps AS (
        SELECT i.state,
          AVG(h.overall_star)::numeric(3,1) AS avg_patient_star
        FROM medicosts.mv_hcahps_summary h
        JOIN medicosts.hospital_info i ON h.facility_id = i.facility_id
        WHERE h.overall_star IS NOT NULL
        GROUP BY i.state
      )
      SELECT m.state,
        m.avg_markup,
        COALESCE(p.penalized_hospitals, 0) AS penalized_hospitals,
        p.avg_excess_ratio,
        hc.avg_hac_score, hc.hac_penalized,
        hp.avg_patient_star
      FROM markup m
      LEFT JOIN penalties p ON m.state = p.state
      LEFT JOIN hac hc ON m.state = hc.state
      LEFT JOIN hcahps hp ON m.state = hp.state
      WHERE length(m.state) = 2
      ORDER BY m.avg_markup DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/accountability/summary                            */
/*  National accountability headline stats                             */
/* ------------------------------------------------------------------ */
router.get('/accountability/summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT facility_id)::int FROM medicosts.hospital_readmissions WHERE excess_readmission_ratio > 1) AS hospitals_penalized,
        (SELECT COUNT(*) FILTER (WHERE payment_reduction = 'Yes')::int FROM medicosts.patient_safety_indicators) AS hac_penalized,
        (SELECT (SUM(avg_covered_charges * total_discharges) / NULLIF(SUM(avg_total_payments * total_discharges), 0))::numeric(6,2) FROM medicosts.medicare_inpatient WHERE avg_covered_charges > 0 AND avg_total_payments > 0) AS national_markup,
        (SELECT AVG(overall_star)::numeric(3,1) FROM medicosts.mv_hcahps_summary WHERE overall_star IS NOT NULL) AS avg_patient_star
    `);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/quality/psi/list?state=&sort=total_hac_score&order=desc   */
/*  Hospital-level HAC/PSI list for Accountability drilldown           */
/* ------------------------------------------------------------------ */
router.get('/psi/list', async (req, res, next) => {
  try {
    const { state, sort = 'total_hac_score', order = 'desc', limit = 100 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (state) { conditions.push(`p.state = $${idx++}`); params.push(state); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const ALLOWED = ['total_hac_score', 'psi_90_value', 'clabsi_sir', 'cauti_sir', 'facility_name'];
    const sortCol = ALLOWED.includes(sort) ? sort : 'total_hac_score';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(`
      SELECT
        p.facility_id, p.facility_name, p.state,
        p.total_hac_score, p.psi_90_value,
        p.payment_reduction,
        p.clabsi_sir, p.cauti_sir, p.ssi_sir, p.cdi_sir, p.mrsa_sir,
        hi.hospital_overall_rating AS star_rating
      FROM medicosts.patient_safety_indicators p
      LEFT JOIN medicosts.hospital_info hi ON p.facility_id = hi.facility_id
      ${where}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${idx}
    `, [...params, Math.min(Number(limit) || 100, 500)]);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
