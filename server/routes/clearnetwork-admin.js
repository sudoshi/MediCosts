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
        content_type, response_time_ms, ssl_valid, supports_gzip,
        file_size_bytes, last_probed_at, data_freshness_days,
        transparency_score, digital_debt_score, score_breakdown,
        last_scored_at, cms_source,
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

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/scorecard                                    */
/*  Transparency + digital debt scorecard (from mrf_research)          */
/* ------------------------------------------------------------------ */
router.get('/scorecard', async (req, res, next) => {
  try {
    const state = req.query.state;
    const sort = req.query.sort === 'debt' ? 'digital_debt_score' : 'transparency_score';
    const dir = req.query.sort === 'debt' ? 'DESC' : 'DESC';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    let where = 'WHERE transparency_score IS NOT NULL';
    const params = [limit];
    if (state) {
      where += ` AND state = $2`;
      params.push(state.toUpperCase());
    }

    const { rows } = await pool.query(`
      SELECT
        insurer_name, state, trade_names, index_type,
        transparency_score, digital_debt_score,
        score_breakdown, accessibility, mrf_url,
        http_status, content_type, response_time_ms,
        ssl_valid, supports_gzip, file_size_bytes,
        data_freshness_days, last_probed_at,
        crawl_tested, crawl_result, cms_source
      FROM ${SCHEMA}.mrf_research
      ${where}
      ORDER BY ${sort} ${dir} NULLS LAST
      LIMIT $1
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/debt-hall-of-shame                           */
/*  Top digital debt offenders                                         */
/* ------------------------------------------------------------------ */
router.get('/debt-hall-of-shame', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const { rows } = await pool.query(`
      SELECT * FROM ${SCHEMA}.v_digital_debt_hall_of_shame
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/transparency-leaders                         */
/*  Top transparency leaders                                           */
/* ------------------------------------------------------------------ */
router.get('/transparency-leaders', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const { rows } = await pool.query(`
      SELECT * FROM ${SCHEMA}.v_transparency_leaders
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/state-coverage                               */
/*  Per-state insurer coverage summary                                 */
/* ------------------------------------------------------------------ */
router.get('/state-coverage', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM ${SCHEMA}.v_state_coverage
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/crawl-stats                                  */
/*  Daily crawl stats time series (for dashboard charts)               */
/* ------------------------------------------------------------------ */
router.get('/crawl-stats', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    let rows = [];
    try {
      const result = await pool.query(`
        SELECT
          recorded_at,
          total_insurers_discovered,
          total_insurers_automatable,
          total_insurers_browser_required,
          total_insurers_dead,
          total_unique_insurers,
          states_with_coverage,
          total_networks,
          total_providers,
          crawl_insurers_attempted,
          crawl_insurers_succeeded,
          crawl_insurers_failed,
          crawl_files_downloaded,
          crawl_providers_linked,
          crawl_errors,
          crawl_elapsed_seconds
        FROM ${SCHEMA}.crawl_stats
        WHERE recorded_at > NOW() - ($1 || ' days')::interval
        ORDER BY recorded_at DESC
      `, [days.toString()]);
      rows = result.rows;
    } catch (_e) { /* table may not exist yet */ }
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/latest-stats                                 */
/*  Most recent crawl stats snapshot (for KPI cards)                   */
/* ------------------------------------------------------------------ */
router.get('/latest-stats', async (_req, res, next) => {
  try {
    // crawl_stats table is lazily created by state_runner — handle if missing
    let latest = { rows: [] };
    try {
      latest = await pool.query(`
        SELECT * FROM ${SCHEMA}.crawl_stats
        ORDER BY recorded_at DESC LIMIT 1
      `);
    } catch (_e) { /* table may not exist yet */ }

    const coverage = await pool.query(`
      SELECT
        count(*)::int AS total_entries,
        count(DISTINCT insurer_name)::int AS unique_insurers,
        count(DISTINCT state)::int AS states,
        count(*) FILTER (WHERE accessibility = 'automatable')::int AS automatable,
        count(*) FILTER (WHERE accessibility = 'browser_required')::int AS browser_required,
        count(*) FILTER (WHERE accessibility = 'dead')::int AS dead,
        count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success')::int AS crawl_success,
        round(avg(transparency_score) FILTER (WHERE transparency_score IS NOT NULL))::int AS avg_transparency,
        round(avg(digital_debt_score) FILTER (WHERE digital_debt_score IS NOT NULL))::int AS avg_debt
      FROM ${SCHEMA}.mrf_research
    `);

    res.json({
      latest_crawl: latest.rows[0] || null,
      coverage: coverage.rows[0],
    });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/blog                                         */
/*  List blog posts (public — no auth required)                        */
/* ------------------------------------------------------------------ */
router.get('/blog', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { rows } = await pool.query(`
      SELECT id, published_at, title, slug, summary, tags, stats
      FROM ${SCHEMA}.blog_posts
      ORDER BY published_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/clearnetwork/blog/:slug                                   */
/*  Single blog post by slug (public)                                  */
/* ------------------------------------------------------------------ */
router.get('/blog/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM ${SCHEMA}.blog_posts WHERE slug = $1
    `, [req.params.slug]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
