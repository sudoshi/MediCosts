/**
 * financials.js — Hospital HCRIS Cost Report API routes
 *
 * GET /api/financials/hospital/:ccn        — cost report for a specific hospital
 * GET /api/financials/summary              — national financial summary stats
 * GET /api/financials/top                  — top hospitals by charges / beds / uncompensated care
 * GET /api/financials/uncompensated        — top uncompensated care providers
 */

import express from 'express';
import pg from 'pg';

const router = express.Router();
const pool = new pg.Pool();

// ── GET /hospital/:ccn ─────────────────────────────────────────────

router.get('/hospital/:ccn', async (req, res) => {
  const { ccn } = req.params;
  if (!/^[0-9]{6}$/.test(ccn)) return res.status(400).json({ error: 'Invalid CCN' });

  const rows = await pool.query(`
    SELECT
      provider_ccn, report_year, fy_begin, fy_end,
      total_patient_charges, inpatient_charges,
      licensed_beds, total_inpatient_days,
      has_charity_program, charity_care_charges, charity_care_cost,
      uncompensated_care_charges, uncompensated_care_cost,
      -- Derived metrics
      CASE WHEN total_inpatient_days > 0 AND licensed_beds > 0
        THEN ROUND((total_inpatient_days::NUMERIC / (licensed_beds * 365)) * 100, 1)
        ELSE NULL END AS occupancy_pct,
      CASE WHEN total_patient_charges > 0 AND uncompensated_care_charges IS NOT NULL
        THEN ROUND((uncompensated_care_charges::NUMERIC / total_patient_charges) * 100, 2)
        ELSE NULL END AS uncomp_pct_charges
    FROM medicosts.hospital_financials
    WHERE provider_ccn = $1
    ORDER BY report_year DESC
  `, [ccn]);

  if (!rows.rows.length) {
    return res.status(404).json({ error: 'No financial data found', ccn });
  }

  res.json({ ccn, financials: rows.rows });
});

// ── GET /summary ───────────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : 2023;

  const [totals, byBedSize, uncompTop] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS hospitals,
        AVG(total_patient_charges)::BIGINT AS avg_charges,
        SUM(total_patient_charges)::BIGINT AS total_charges,
        AVG(licensed_beds)::INT AS avg_beds,
        SUM(uncompensated_care_cost)::BIGINT AS total_uncomp_cost,
        AVG(uncompensated_care_cost)::BIGINT AS avg_uncomp_cost,
        COUNT(*) FILTER (WHERE has_charity_program) AS charity_hospitals,
        AVG(CASE WHEN total_inpatient_days > 0 AND licensed_beds > 0
          THEN (total_inpatient_days::NUMERIC / (licensed_beds * 365)) * 100
          ELSE NULL END)::NUMERIC(5,1) AS avg_occupancy_pct
      FROM medicosts.hospital_financials
      WHERE report_year = $1
    `, [year]),
    pool.query(`
      SELECT
        CASE
          WHEN licensed_beds < 25   THEN 'Critical Access (<25 beds)'
          WHEN licensed_beds < 100  THEN 'Small (25-99 beds)'
          WHEN licensed_beds < 300  THEN 'Medium (100-299 beds)'
          WHEN licensed_beds < 500  THEN 'Large (300-499 beds)'
          ELSE 'Major (500+ beds)'
        END AS size_category,
        COUNT(*) AS hospitals,
        AVG(total_patient_charges)::BIGINT AS avg_charges,
        AVG(licensed_beds)::INT AS avg_beds,
        AVG(uncompensated_care_cost)::BIGINT AS avg_uncomp_cost
      FROM medicosts.hospital_financials
      WHERE report_year = $1 AND licensed_beds IS NOT NULL
      GROUP BY 1
      ORDER BY avg_beds
    `, [year]),
    pool.query(`
      SELECT provider_ccn, uncompensated_care_cost, total_patient_charges, licensed_beds
      FROM medicosts.hospital_financials
      WHERE report_year = $1 AND uncompensated_care_cost > 0
      ORDER BY uncompensated_care_cost DESC
      LIMIT 10
    `, [year]),
  ]);

  res.json({
    year,
    totals: totals.rows[0],
    by_bed_size: byBedSize.rows,
    top_uncomp: uncompTop.rows,
  });
});

// ── GET /top ───────────────────────────────────────────────────────

router.get('/top', async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : 2023;
  const by = ['charges', 'beds', 'uncompensated', 'occupancy'].includes(req.query.by)
    ? req.query.by : 'charges';
  const limit = Math.min(50, Number(req.query.limit) || 25);

  let orderCol;
  if (by === 'charges')      orderCol = 'total_patient_charges DESC NULLS LAST';
  else if (by === 'beds')    orderCol = 'licensed_beds DESC NULLS LAST';
  else if (by === 'uncompensated') orderCol = 'uncompensated_care_cost DESC NULLS LAST';
  else orderCol = `(total_inpatient_days::NUMERIC / NULLIF(licensed_beds * 365, 0)) DESC NULLS LAST`;

  const rows = await pool.query(`
    SELECT
      hf.provider_ccn,
      hf.report_year, hf.fy_begin, hf.fy_end,
      hf.total_patient_charges, hf.inpatient_charges,
      hf.licensed_beds, hf.total_inpatient_days,
      hf.uncompensated_care_cost, hf.charity_care_cost,
      hf.has_charity_program,
      ROUND((hf.total_inpatient_days::NUMERIC / NULLIF(hf.licensed_beds * 365, 0)) * 100, 1) AS occupancy_pct
    FROM medicosts.hospital_financials hf
    WHERE report_year = $1
    ORDER BY ${orderCol}
    LIMIT $2
  `, [year, limit]);

  res.json({ year, by, results: rows.rows });
});

// ── GET /uncompensated ─────────────────────────────────────────────

router.get('/uncompensated', async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : 2023;
  const state = req.query.state || null;
  const limit = Math.min(100, Number(req.query.limit) || 50);

  const params = [year];
  let stateClause = '';
  if (state) {
    params.push(state.toUpperCase());
    stateClause = `AND h.state = $${params.length}`;
  }

  // Join to hospital quality table to get hospital name and state
  const rows = await pool.query(`
    SELECT
      hf.provider_ccn,
      h.facility_name,
      h.state,
      h.city,
      h.hospital_type,
      hf.licensed_beds,
      hf.total_patient_charges,
      hf.uncompensated_care_cost,
      hf.charity_care_cost,
      hf.charity_care_charges,
      hf.has_charity_program,
      CASE WHEN hf.total_patient_charges > 0 AND hf.uncompensated_care_charges IS NOT NULL
        THEN ROUND((hf.uncompensated_care_charges::NUMERIC / hf.total_patient_charges) * 100, 2)
        ELSE NULL END AS uncomp_pct
    FROM medicosts.hospital_financials hf
    LEFT JOIN medicosts.mv_hospital_quality h ON h.facility_id = hf.provider_ccn
    WHERE hf.report_year = $1
      AND hf.uncompensated_care_cost > 0
      ${stateClause}
    ORDER BY hf.uncompensated_care_cost DESC
    LIMIT $${params.length + 1}
  `, [...params, limit]);

  res.json({ year, state: state || 'all', results: rows.rows });
});

export default router;
