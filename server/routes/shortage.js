/**
 * shortage.js — HRSA Health Professional Shortage Areas (HPSA) API
 *
 * GET /api/shortage-areas?zip=&type=    — shortage designations for a ZIP
 * GET /api/shortage-areas/state/:state  — shortage summary by state
 * GET /api/shortage-areas/national      — national counts by type
 */

import express from 'express';
import pg from 'pg';
import { cache } from '../lib/cache.js';

const router = express.Router();
const pool = new pg.Pool();

// GET /api/shortage-areas?zip=&type=
router.get('/', async (req, res) => {
  const zip = (req.query.zip || '').replace(/\D/g, '').slice(0, 5);
  const type = req.query.type || null;

  if (!zip || zip.length !== 5) {
    return res.status(400).json({ error: 'Valid 5-digit zip required' });
  }

  const params = [zip.padStart(5, '0')];
  const typeClause = type
    ? `AND shortage_type = $${params.length + 1}`
    : '';
  if (type) params.push(type);

  const rows = await pool.query(`
    SELECT
      hpsa_id, shortage_type, designation_type,
      state, county, zip5, hpsa_name,
      hpsa_score, hpsa_status,
      population_served, ftes_needed,
      degree_of_shortage, is_rural, designation_date
    FROM medicosts.hrsa_shortage_areas
    WHERE zip5 = $1
      AND hpsa_status = 'Designated'
      ${typeClause}
    ORDER BY hpsa_score DESC NULLS LAST, shortage_type
  `, params);

  res.json({
    zip,
    shortage_areas: rows.rows,
    summary: {
      total: rows.rows.length,
      types: [...new Set(rows.rows.map(r => r.shortage_type))],
      max_score: rows.rows.reduce((m, r) => Math.max(m, r.hpsa_score || 0), 0),
    },
  });
});

// GET /api/shortage-areas/state/:state
router.get('/state/:state', async (req, res) => {
  const state = req.params.state.toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(state)) return res.status(400).json({ error: 'Invalid state' });

  const data = await cache(`shortage:state:${state}`, 3600, () => pool.query(`
    SELECT
      shortage_type,
      COUNT(*) AS num_areas,
      SUM(population_served) AS total_population,
      AVG(hpsa_score)::NUMERIC(4,1) AS avg_score,
      MAX(hpsa_score) AS max_score,
      SUM(ftes_needed) AS total_ftes_needed,
      COUNT(*) FILTER (WHERE is_rural) AS rural_areas
    FROM medicosts.hrsa_shortage_areas
    WHERE state = $1 AND hpsa_status = 'Designated'
    GROUP BY shortage_type ORDER BY shortage_type
  `, [state]).then(r => r.rows));

  res.json({ state, summary: data });
});

// GET /api/shortage-areas/national
router.get('/national', async (_req, res) => {
  const data = await cache('shortage:national', 3600, async () => {
    const [byType, top25] = await Promise.all([
      pool.query(`
        SELECT
          shortage_type,
          COUNT(*) AS num_areas,
          SUM(population_served) AS total_population,
          AVG(hpsa_score)::NUMERIC(4,1) AS avg_score,
          SUM(ftes_needed)::NUMERIC(10,0) AS total_ftes_needed
        FROM medicosts.hrsa_shortage_areas
        WHERE hpsa_status = 'Designated'
        GROUP BY shortage_type ORDER BY total_population DESC
      `),
      pool.query(`
        SELECT
          state,
          COUNT(*) AS num_areas,
          AVG(hpsa_score)::NUMERIC(4,1) AS avg_score
        FROM medicosts.hrsa_shortage_areas
        WHERE hpsa_status = 'Designated' AND shortage_type = 'Primary Care'
        GROUP BY state ORDER BY num_areas DESC LIMIT 25
      `),
    ]);
    return { by_type: byType.rows, states_worst_primary_care: top25.rows };
  });

  res.json(data);
});

export default router;
