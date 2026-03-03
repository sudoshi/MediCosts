/**
 * drugs.js — CMS Part D drug spending & prescriber endpoints
 *
 * GET /api/drugs/top?limit=&sort=    Top drugs by 2023 spending
 * GET /api/drugs/search?q=           Drug name search (brand or generic)
 * GET /api/drugs/:name               Single drug detail (5-year trend)
 * GET /api/drugs/prescriber/:npi     Part D prescribing summary for a clinician
 * GET /api/drugs/summary             Overall Part D stats
 */

import { Router } from 'express';
import db from '../db.js';
import { cache } from '../lib/cache.js';

const router = Router();

const ALLOWED_SORTS = {
  spending: 'tot_spending_2023',
  claims: 'tot_claims_2023',
  benes: 'tot_benes_2023',
  cost_per_claim: 'avg_cost_per_claim_2023',
  cost_per_bene: 'avg_cost_per_bene_2023',
  cagr: 'cagr_19_23',
};

/* ── GET /summary ── */
router.get('/summary', async (req, res, next) => {
  try {
    const data = await cache('drugs:summary', 3600, async () => {
      const r = await db.query(`
        SELECT
          COUNT(DISTINCT gnrc_name)                       AS unique_drugs,
          COUNT(*)                                        AS total_rows,
          SUM(tot_spending_2023)                          AS total_spending_2023,
          SUM(tot_claims_2023)                            AS total_claims_2023,
          SUM(tot_benes_2023)                             AS total_benes_2023,
          AVG(NULLIF(cagr_19_23, 0))                      AS avg_cagr_19_23,
          COUNT(*) FILTER (WHERE outlier_flag = 'X')      AS outlier_drugs
        FROM medicosts.part_d_drug_spending
      `);
      return r.rows[0];
    });
    res.json(data);
  } catch (err) { next(err); }
});

/* ── GET /top?limit=&sort= ── */
router.get('/top', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const sortKey = ALLOWED_SORTS[req.query.sort] ?? 'tot_spending_2023';
    const cacheKey = `drugs:top:${sortKey}:${limit}`;

    const data = await cache(cacheKey, 3600, async () => {
      const r = await db.query(`
        SELECT
          brnd_name,
          gnrc_name,
          mftr_name,
          tot_spending_2023,
          tot_claims_2023,
          tot_benes_2023,
          avg_cost_per_claim_2023,
          avg_cost_per_bene_2023,
          avg_cost_per_unit_2023,
          pct_change_22_23,
          cagr_19_23,
          outlier_flag,
          tot_spending_2022,
          tot_spending_2021,
          tot_spending_2020,
          tot_spending_2019
        FROM medicosts.part_d_drug_spending
        WHERE tot_spending_2023 IS NOT NULL
        ORDER BY ${sortKey} DESC NULLS LAST
        LIMIT $1
      `, [limit]);
      return r.rows;
    });
    res.json({ sort: req.query.sort || 'spending', drugs: data });
  } catch (err) { next(err); }
});

/* ── GET /search?q= ── */
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ drugs: [] });

    const r = await db.query(`
      SELECT DISTINCT ON (gnrc_name)
        brnd_name,
        gnrc_name,
        mftr_name,
        tot_spending_2023,
        tot_claims_2023,
        avg_cost_per_claim_2023,
        cagr_19_23
      FROM medicosts.part_d_drug_spending
      WHERE LOWER(gnrc_name) LIKE $1 OR LOWER(brnd_name) LIKE $1
      ORDER BY gnrc_name, tot_spending_2023 DESC NULLS LAST
      LIMIT 20
    `, [`${q.toLowerCase()}%`]);

    res.json({ drugs: r.rows });
  } catch (err) { next(err); }
});

/* ── GET /:name — drug detail with 5-year trend ── */
router.get('/detail/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    const r = await db.query(`
      SELECT *
      FROM medicosts.part_d_drug_spending
      WHERE LOWER(gnrc_name) = LOWER($1)
        OR LOWER(brnd_name) = LOWER($1)
      ORDER BY tot_spending_2023 DESC NULLS LAST
      LIMIT 10
    `, [name]);

    if (!r.rows.length) return res.status(404).json({ error: 'Drug not found' });

    const drug = r.rows[0];
    const trend = [2019, 2020, 2021, 2022, 2023].map(yr => ({
      year: yr,
      spending: drug[`tot_spending_${yr}`],
      claims: drug[`tot_claims_${yr}`],
      cost_per_unit: drug[`avg_cost_per_unit_${yr}`],
    })).filter(d => d.spending != null);

    res.json({ drug, trend, all_manufacturers: r.rows });
  } catch (err) { next(err); }
});

/* ── GET /prescriber/:npi ── */
router.get('/prescriber/:npi', async (req, res, next) => {
  try {
    const { npi } = req.params;
    if (!/^\d{10}$/.test(npi)) return res.status(400).json({ error: 'Valid NPI required' });

    const r = await db.query(`
      SELECT *
      FROM medicosts.part_d_prescribers
      WHERE npi = $1
    `, [npi]);

    if (!r.rows.length) return res.status(404).json({ error: 'No Part D data for this prescriber' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

/* ── GET /top-prescribers?state=&specialty=&limit= ── */
router.get('/top-prescribers', async (req, res, next) => {
  try {
    const { state, specialty } = req.query;
    const limit = Math.min(100, parseInt(req.query.limit) || 25);
    const cacheKey = `drugs:top-prescribers:${state || 'all'}:${specialty || 'all'}:${limit}`;

    const data = await cache(cacheKey, 1800, async () => {
      const conditions = ['p.tot_drug_cost IS NOT NULL'];
      const params = [];
      if (state) { params.push(state); conditions.push(`p.state = $${params.length}`); }
      if (specialty) { params.push(`%${specialty}%`); conditions.push(`LOWER(p.specialty) LIKE LOWER($${params.length})`); }
      params.push(limit);

      const r = await db.query(`
        SELECT
          p.npi,
          p.last_org_name,
          p.first_name,
          p.credentials,
          p.specialty,
          p.city,
          p.state,
          p.tot_claims,
          p.tot_drug_cost,
          p.tot_benes,
          p.brand_claims,
          p.generic_claims,
          p.opioid_claims,
          p.opioid_prescriber_rate,
          p.antibiotic_claims,
          p.avg_patient_age,
          ROUND(p.brand_claims::NUMERIC / NULLIF(p.tot_claims, 0) * 100, 1) AS brand_rate_pct
        FROM medicosts.part_d_prescribers p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.tot_drug_cost DESC NULLS LAST
        LIMIT $${params.length}
      `, params);
      return r.rows;
    });
    res.json({ prescribers: data });
  } catch (err) { next(err); }
});

export default router;
