import express from 'express';
import pool from '../db.js';

const router = express.Router();
const SCHEMA = 'clearnetwork';

/* GET /api/blog — List blog posts (public) */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { rows } = await pool.query(`
      SELECT id, published_at, title, slug, summary, tags, stats,
             COALESCE(is_pinned, false) AS is_pinned
      FROM ${SCHEMA}.blog_posts
      ORDER BY is_pinned DESC, published_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /api/blog/:slug — Single blog post (public) */
router.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT *, COALESCE(is_pinned, false) AS is_pinned
      FROM ${SCHEMA}.blog_posts WHERE slug = $1
    `, [req.params.slug]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
