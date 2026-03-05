/**
 * payments.js — Open Payments (Sunshine Act) API routes
 *
 * GET /api/payments/physician/:npi        — payments to a specific physician
 * GET /api/payments/hospital/:ccn         — payments involving a teaching hospital
 * GET /api/payments/top                   — top recipients / payers leaderboard
 * GET /api/payments/summary               — aggregated stats by nature/year
 * GET /api/payments/search                — keyword search by name / payer
 */

import express from 'express';
import pg from 'pg';
import { cache, invalidate } from '../lib/cache.js';

const router = express.Router();
const pool = new pg.Pool(); // uses PG* env vars

// ── Helper ─────────────────────────────────────────────────────────────────

function numericParam(val, fallback) {
  const n = Number(val);
  return isFinite(n) && n > 0 ? n : fallback;
}

// ── GET /physician/:npi ────────────────────────────────────────────────────

router.get('/physician/:npi', async (req, res) => {
  const { npi } = req.params;
  if (!/^[0-9]{10}$/.test(npi)) return res.status(400).json({ error: 'Invalid NPI' });

  const year = req.query.year ? Number(req.query.year) : null;
  const page = Math.max(1, numericParam(req.query.page, 1));
  const limit = Math.min(200, numericParam(req.query.limit, 50));
  const offset = (page - 1) * limit;

  const conditions = ['physician_npi = $1'];
  const params = [npi];
  if (year) { conditions.push(`payment_year = $${params.length + 1}`); params.push(year); }

  const where = conditions.join(' AND ');

  const [rows, totRow, byNatureRows, byYearRows] = await Promise.all([
    pool.query(
      `SELECT id, payment_year, recipient_type,
              physician_first_name, physician_last_name, physician_specialty,
              recipient_city, recipient_state,
              payer_name, payer_state,
              payment_amount, payment_date, num_payments, payment_form, payment_nature,
              product_type, product_name, product_category,
              physician_ownership, charity, dispute_status
       FROM medicosts.open_payments
       WHERE ${where}
       ORDER BY payment_date DESC NULLS LAST, payment_amount DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total, SUM(payment_amount) AS total_amount,
              COUNT(DISTINCT payer_name) AS unique_payers,
              MIN(payment_year) AS first_year, MAX(payment_year) AS last_year
       FROM medicosts.open_payments WHERE ${where}`,
      params
    ),
    pool.query(
      `SELECT payment_nature, SUM(payment_amount) AS amount, COUNT(*) AS count
       FROM medicosts.open_payments WHERE ${where}
       GROUP BY payment_nature ORDER BY amount DESC LIMIT 10`,
      params
    ).then(r => r.rows),
    pool.query(
      `SELECT payment_year, SUM(payment_amount) AS total_amount, COUNT(*) AS num_payments
       FROM medicosts.open_payments WHERE ${where}
       GROUP BY payment_year ORDER BY payment_year`,
      params
    ).then(r => r.rows),
  ]);

  const summary = totRow.rows[0];

  res.json({
    npi,
    summary: {
      total_payments: Number(summary.total),
      total_amount: parseFloat(summary.total_amount || 0),
      unique_payers: Number(summary.unique_payers),
      years: summary.first_year
        ? { first: summary.first_year, last: summary.last_year }
        : null,
    },
    by_year: byYearRows,
    payments: rows.rows,
    pagination: { page, limit, offset },
  });
});

// ── GET /hospital/:ccn ─────────────────────────────────────────────────────

router.get('/hospital/:ccn', async (req, res) => {
  const { ccn } = req.params;
  if (!/^[0-9]{6}$/.test(ccn)) return res.status(400).json({ error: 'Invalid CCN' });

  const year = req.query.year ? Number(req.query.year) : null;
  const page = Math.max(1, numericParam(req.query.page, 1));
  const limit = Math.min(200, numericParam(req.query.limit, 50));
  const offset = (page - 1) * limit;

  const conditions = ['hospital_ccn = $1'];
  const params = [ccn];
  if (year) { conditions.push(`payment_year = $${params.length + 1}`); params.push(year); }

  const where = conditions.join(' AND ');

  const [rows, totRow, byNature] = await Promise.all([
    pool.query(
      `SELECT id, payment_year, hospital_name,
              physician_first_name, physician_last_name, physician_specialty,
              payer_name, payment_amount, payment_date, payment_nature, payment_form,
              product_type, product_name, dispute_status
       FROM medicosts.open_payments
       WHERE ${where}
       ORDER BY payment_date DESC NULLS LAST, payment_amount DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total, SUM(payment_amount) AS total_amount,
              COUNT(DISTINCT payer_name) AS unique_payers
       FROM medicosts.open_payments WHERE ${where}`,
      params
    ),
    pool.query(
      `SELECT payment_nature, SUM(payment_amount) AS amount, COUNT(*) AS count
       FROM medicosts.open_payments WHERE ${where}
       GROUP BY payment_nature ORDER BY amount DESC LIMIT 10`,
      params
    ),
  ]);

  const summary = totRow.rows[0];
  res.json({
    ccn,
    summary: {
      total_payments: Number(summary.total),
      total_amount: parseFloat(summary.total_amount || 0),
      unique_payers: Number(summary.unique_payers),
    },
    by_nature: byNature.rows,
    payments: rows.rows,
    pagination: { page, limit, offset },
  });
});

// ── GET /top ───────────────────────────────────────────────────────────────

router.get('/top', async (req, res) => {
  const yearRaw = req.query.year ? Number(req.query.year) : null;
  const year = yearRaw && Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : null;
  const limit = Math.min(50, numericParam(req.query.limit, 25));
  const by = ['physician', 'payer', 'nature', 'hospital'].includes(req.query.by)
    ? req.query.by : 'physician';

  // Use parameterized queries — year and limit via $N placeholders
  const params = [];
  const yearCondition = year ? (params.push(year), `AND payment_year = $${params.length}`) : '';
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;

  let query;
  if (by === 'physician') {
    query = `
      SELECT physician_npi AS id,
             MAX(physician_first_name) || ' ' || MAX(physician_last_name) AS name,
             MAX(physician_specialty) AS specialty,
             MAX(recipient_state) AS state,
             SUM(payment_amount) AS total_amount,
             COUNT(*) AS num_payments,
             COUNT(DISTINCT payer_name) AS unique_payers,
             COUNT(DISTINCT payment_year) AS years_active
      FROM medicosts.open_payments
      WHERE physician_npi IS NOT NULL ${yearCondition}
      GROUP BY physician_npi
      ORDER BY total_amount DESC
      LIMIT ${limitPlaceholder}
    `;
  } else if (by === 'payer') {
    query = `
      SELECT payer_name AS name,
             payer_state AS state,
             SUM(payment_amount) AS total_amount,
             COUNT(*) AS num_payments,
             COUNT(DISTINCT physician_npi) AS unique_physicians,
             COUNT(DISTINCT hospital_ccn) AS unique_hospitals
      FROM medicosts.open_payments
      WHERE payer_name IS NOT NULL ${yearCondition}
      GROUP BY payer_name, payer_state
      ORDER BY total_amount DESC
      LIMIT ${limitPlaceholder}
    `;
  } else if (by === 'hospital') {
    query = `
      SELECT hospital_ccn AS id,
             MAX(hospital_name) AS name,
             SUM(payment_amount) AS total_amount,
             COUNT(*) AS num_payments,
             COUNT(DISTINCT payer_name) AS unique_payers
      FROM medicosts.open_payments
      WHERE hospital_ccn IS NOT NULL ${yearCondition}
      GROUP BY hospital_ccn
      ORDER BY total_amount DESC
      LIMIT ${limitPlaceholder}
    `;
  } else {
    // by nature
    query = `
      SELECT payment_nature AS name,
             SUM(payment_amount) AS total_amount,
             COUNT(*) AS num_payments,
             AVG(payment_amount) AS avg_amount,
             COUNT(DISTINCT physician_npi) AS unique_physicians
      FROM medicosts.open_payments
      WHERE payment_nature IS NOT NULL ${yearCondition}
      GROUP BY payment_nature
      ORDER BY total_amount DESC
      LIMIT ${limitPlaceholder}
    `;
  }

  const cacheKey = `payments:top:${by}:${year || 'all'}:${limit}`;
  const rows = await cache(cacheKey, 600, () => pool.query(query, params).then(r => r.rows));
  res.json({ by, year: year || 'all', results: rows });
});

// ── GET /summary ───────────────────────────────────────────────────────────

// Query payments summary from materialized views (instant) with fallback to raw table.
// MVs are populated via: REFRESH MATERIALIZED VIEW medicosts.mv_payments_summary (etc.)
async function fetchPaymentsSummary() {
  try {
    const [totals, byYear, byNature, byState] = await Promise.all([
      pool.query(`SELECT * FROM medicosts.mv_payments_summary`),
      pool.query(`SELECT * FROM medicosts.mv_payments_by_year ORDER BY payment_year`),
      pool.query(`SELECT * FROM medicosts.mv_payments_by_nature ORDER BY total_amount DESC LIMIT 15`),
      pool.query(`SELECT * FROM medicosts.mv_payments_by_state ORDER BY total_amount DESC`),
    ]);
    if (!totals.rows.length) return null; // MV empty
    return {
      totals: totals.rows[0],
      by_year: byYear.rows,
      by_nature: byNature.rows,
      by_state: byState.rows,
    };
  } catch (err) {
    if (err.code === '55000') return null; // MV not yet populated (WITH NO DATA)
    throw err;
  }
}

// Pre-warm the summary cache on server startup (called from index.js)
export async function warmPaymentsSummary() {
  return cache('payments:summary', 86400, fetchPaymentsSummary);
}

router.get('/summary', async (req, res) => {
  // Don't cache a null result — MV may still be populating
  const data = await cache('payments:summary', 86400, fetchPaymentsSummary);
  if (!data) {
    invalidate('payments:summary'); // clear null so next request retries
    return res.json({ loading: true, message: 'Summary is being computed, check back in a few minutes.' });
  }
  res.json(data);
});

// ── GET /search ────────────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

  const limit = Math.min(50, numericParam(req.query.limit, 20));
  const tsQuery = q.split(/\s+/).join(' & ');

  // Search physicians by name
  const physicians = await pool.query(`
    SELECT physician_npi AS npi,
           MAX(physician_first_name) || ' ' || MAX(physician_last_name) AS name,
           MAX(physician_specialty) AS specialty,
           MAX(recipient_state) AS state,
           SUM(payment_amount) AS total_amount,
           COUNT(*) AS num_payments
    FROM medicosts.open_payments
    WHERE physician_npi IS NOT NULL
      AND (
        LOWER(physician_first_name || ' ' || physician_last_name) LIKE '%' || LOWER($1) || '%'
        OR LOWER(physician_last_name) LIKE '%' || LOWER($1) || '%'
      )
    GROUP BY physician_npi
    ORDER BY total_amount DESC
    LIMIT $2
  `, [q, limit]);

  // Search payers by name
  const payers = await pool.query(`
    SELECT payer_name AS name,
           payer_state AS state,
           SUM(payment_amount) AS total_amount,
           COUNT(*) AS num_payments,
           COUNT(DISTINCT physician_npi) AS unique_physicians
    FROM medicosts.open_payments
    WHERE LOWER(payer_name) LIKE '%' || LOWER($1) || '%'
    GROUP BY payer_name, payer_state
    ORDER BY total_amount DESC
    LIMIT $2
  `, [q, limit]);

  res.json({ query: q, physicians: physicians.rows, payers: payers.rows });
});

export default router;
