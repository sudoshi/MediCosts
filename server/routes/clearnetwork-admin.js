import express from 'express';
import pool from '../db.js';

const router = express.Router();
const SCHEMA = 'clearnetwork';

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/status                                       */
/*  Overall ClearNetwork system status                                 */
/* ------------------------------------------------------------------ */
router.get('/status', async (_req, res, next) => {
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT count(*) FROM ${SCHEMA}.insurers)::int AS insurers,
        (SELECT count(*) FROM ${SCHEMA}.networks)::int AS networks,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'plans')::int AS plans,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'canonical_providers')::int AS providers,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'network_providers')::int AS network_links,
        (SELECT count(*) FROM ${SCHEMA}.crawl_jobs)::int AS total_crawls,
        (SELECT count(*) FROM ${SCHEMA}.crawl_jobs WHERE status = 'running')::int AS active_crawls,
        (SELECT count(*) FROM ${SCHEMA}.crawl_failures)::int AS total_failures,
        (SELECT count(*) FROM ${SCHEMA}.alert_subscriptions WHERE active = true)::int AS active_alerts
    `);
    res.json(counts.rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/insurers                                     */
/*  List all insurers with crawl status                                */
/* ------------------------------------------------------------------ */
router.get('/insurers', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        i.id, i.legal_name, i.trade_names, i.naic_code,
        i.states_licensed, i.plan_types, i.mrf_index_url,
        i.last_crawled,
        coalesce(nc.network_count, 0)::int AS network_count,
        coalesce(nc.plan_count, 0)::int AS plan_count,
        coalesce(nc.provider_count, 0)::int AS provider_count,
        cj.status AS last_crawl_status,
        cj.files_processed AS last_crawl_files,
        cj.providers_found AS last_crawl_providers,
        cj.errors AS last_crawl_errors,
        cj.started_at AS last_crawl_started,
        cj.completed_at AS last_crawl_completed
      FROM ${SCHEMA}.insurers i
      LEFT JOIN LATERAL (
        SELECT * FROM ${SCHEMA}.crawl_jobs cj
        WHERE cj.insurer_id = i.id
        ORDER BY cj.started_at DESC
        LIMIT 1
      ) cj ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS network_count,
          coalesce(sum(n.provider_count), 0) AS provider_count,
          (SELECT count(*) FROM ${SCHEMA}.plans p WHERE p.insurer_id = i.id) AS plan_count
        FROM ${SCHEMA}.networks n WHERE n.insurer_id = i.id
      ) nc ON true
      ORDER BY i.legal_name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/crawl-jobs                                   */
/*  List recent crawl jobs with details                                */
/* ------------------------------------------------------------------ */
router.get('/crawl-jobs', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(`
      SELECT
        cj.id, cj.insurer_id, cj.status,
        cj.started_at, cj.completed_at,
        cj.files_processed, cj.providers_found, cj.errors,
        cj.error_log,
        i.legal_name AS insurer_name,
        EXTRACT(EPOCH FROM (coalesce(cj.completed_at, NOW()) - cj.started_at))::int AS duration_seconds
      FROM ${SCHEMA}.crawl_jobs cj
      JOIN ${SCHEMA}.insurers i ON i.id = cj.insurer_id
      ORDER BY cj.started_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/crawl-jobs/:id                               */
/*  Single crawl job detail with failures                              */
/* ------------------------------------------------------------------ */
router.get('/crawl-jobs/:id', async (req, res, next) => {
  try {
    const job = await pool.query(`
      SELECT
        cj.*, i.legal_name AS insurer_name
      FROM ${SCHEMA}.crawl_jobs cj
      JOIN ${SCHEMA}.insurers i ON i.id = cj.insurer_id
      WHERE cj.id = $1
    `, [req.params.id]);

    if (!job.rows.length) return res.status(404).json({ error: 'Job not found' });

    const failures = await pool.query(`
      SELECT id, url, error_message, retry_count, last_attempt
      FROM ${SCHEMA}.crawl_failures
      WHERE crawl_job_id = $1
      ORDER BY last_attempt DESC
    `, [req.params.id]);

    res.json({ ...job.rows[0], failures: failures.rows });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/networks                                     */
/*  List networks with provider counts                                 */
/* ------------------------------------------------------------------ */
router.get('/networks', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        n.id, n.network_name, n.insurer_id, n.provider_count,
        n.mrf_source_url, n.last_updated,
        i.legal_name AS insurer_name,
        (SELECT count(*) FROM ${SCHEMA}.plans p WHERE p.network_id = n.id)::int AS plan_count
      FROM ${SCHEMA}.networks n
      JOIN ${SCHEMA}.insurers i ON i.id = n.insurer_id
      ORDER BY n.provider_count DESC NULLS LAST
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/failures                                     */
/*  Recent crawl failures for monitoring                               */
/* ------------------------------------------------------------------ */
router.get('/failures', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(`
      SELECT
        cf.id, cf.url, cf.error_message, cf.retry_count, cf.last_attempt,
        cj.insurer_id, i.legal_name AS insurer_name
      FROM ${SCHEMA}.crawl_failures cf
      JOIN ${SCHEMA}.crawl_jobs cj ON cj.id = cf.crawl_job_id
      JOIN ${SCHEMA}.insurers i ON i.id = cj.insurer_id
      ORDER BY cf.last_attempt DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/provider-stats                               */
/*  Provider coverage statistics                                       */
/* ------------------------------------------------------------------ */
router.get('/provider-stats', async (_req, res, next) => {
  try {
    // Use pg_class/pg_stats estimates for large tables (9M+ rows) — exact counts take 7+ seconds
    const { rows } = await pool.query(`
      SELECT
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'canonical_providers')::int AS total_providers,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'network_providers')::int AS in_any_network,
        (SELECT abs(n_distinct)::int FROM pg_stats WHERE tablename = 'canonical_providers' AND attname = 'specialty_primary')::int AS unique_specialties,
        (SELECT abs(n_distinct)::int FROM pg_stats WHERE tablename = 'canonical_providers' AND attname = 'address_state')::int AS states_covered
    `);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/mrf-research                                 */
/*  MRF research knowledge base entries                                */
/* ------------------------------------------------------------------ */
router.get('/mrf-research', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id, state, insurer_name, trade_names, market_share_rank,
        mrf_url, mrf_url_verified, index_type, date_pattern,
        http_status, accessibility, notes,
        added_to_registry, crawl_tested, crawl_result,
        researched_at
      FROM ${SCHEMA}.mrf_research
      ORDER BY state, market_share_rank NULLS LAST, insurer_name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/nightly-summary                              */
/*  Last 14 nightly crawl runs grouped by date                         */
/* ------------------------------------------------------------------ */
router.get('/nightly-summary', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        date_trunc('day', cj.started_at) AS crawl_date,
        count(*)::int AS insurers_crawled,
        sum(cj.files_processed)::int AS total_files,
        sum(cj.providers_found)::int AS total_providers,
        sum(cj.errors)::int AS total_errors,
        count(*) FILTER (WHERE cj.status = 'completed')::int AS succeeded,
        count(*) FILTER (WHERE cj.status = 'failed')::int AS failed,
        count(*) FILTER (WHERE cj.status = 'running')::int AS still_running,
        json_agg(json_build_object(
          'insurer', i.legal_name,
          'status', cj.status,
          'files', cj.files_processed,
          'providers', cj.providers_found,
          'errors', cj.errors,
          'duration', EXTRACT(EPOCH FROM (coalesce(cj.completed_at, NOW()) - cj.started_at))::int
        ) ORDER BY cj.started_at) AS jobs
      FROM ${SCHEMA}.crawl_jobs cj
      JOIN ${SCHEMA}.insurers i ON i.id = cj.insurer_id
      GROUP BY crawl_date
      ORDER BY crawl_date DESC
      LIMIT 14
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
