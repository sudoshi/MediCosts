/**
 * community-health.js — CDC PLACES community health data API
 *
 * GET /api/community-health/:zip    — health profile for a ZIP
 * GET /api/community-health/compare — compare multiple ZIPs
 */

import express from 'express';
import pg from 'pg';
import { cache } from '../lib/cache.js';

const router = express.Router();
const pool = new pg.Pool();

// GET /api/community-health/:zip
router.get('/:zip', async (req, res) => {
  const zip = (req.params.zip || '').replace(/\D/g, '').slice(0, 5).padStart(5, '0');
  if (zip.length !== 5) return res.status(400).json({ error: 'Invalid ZIP' });

  const rows = await pool.query(`
    SELECT *
    FROM medicosts.cdc_community_health
    WHERE zip5 = $1
  `, [zip]);

  if (!rows.rows.length) {
    return res.status(404).json({ error: 'No data for this ZIP', zip });
  }

  res.json(rows.rows[0]);
});

// GET /api/community-health/compare?zips=10001,90210,60601
router.get('/compare', async (req, res) => {
  const zips = (req.query.zips || '')
    .split(',')
    .map(z => z.trim().replace(/\D/g, '').padStart(5, '0'))
    .filter(z => z.length === 5)
    .slice(0, 10);

  if (!zips.length) return res.status(400).json({ error: 'Provide ?zips= comma-separated list' });

  const rows = await pool.query(`
    SELECT * FROM medicosts.cdc_community_health
    WHERE zip5 = ANY($1::varchar[])
    ORDER BY zip5
  `, [zips]);

  res.json({ zips, results: rows.rows });
});

export default router;
