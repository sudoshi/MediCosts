/**
 * Admin CRUD API for AI provider configuration.
 * All routes require requireAdmin middleware (applied in index.js).
 *
 * GET    /api/ai-providers                     — list all (keys masked)
 * PUT    /api/ai-providers/:provider/key        — save encrypted key
 * PUT    /api/ai-providers/:provider/activate   — set as active
 * PUT    /api/ai-providers/:provider/models     — update model names
 * GET    /api/ai-providers/ollama/models        — proxy to local Ollama tags
 */

import { Router } from 'express';
import pool from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { invalidateCache } from '../lib/ai-provider.js';

const router = Router();

const VALID_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama'];

/* ── GET /api/ai-providers ─────────────────────────────────────────── */
router.get('/', async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT provider, label, api_key_enc, model_tool, model_synth, is_active, is_enabled, updated_at
       FROM ai_providers ORDER BY id`
    );

    const rows = r.rows.map(row => {
      let keyMasked = null;
      if (row.api_key_enc) {
        try {
          const plain = decrypt(row.api_key_enc);
          keyMasked = plain.length > 8
            ? plain.slice(0, 4) + '••••' + plain.slice(-4)
            : '••••••••';
        } catch {
          keyMasked = '(encrypted)';
        }
      }
      return {
        provider: row.provider,
        label: row.label,
        keyMasked,
        hasKey: !!row.api_key_enc,
        modelTool: row.model_tool,
        modelSynth: row.model_synth,
        isActive: row.is_active,
        isEnabled: row.is_enabled,
        updatedAt: row.updated_at,
      };
    });

    res.json({ providers: rows });
  } catch (err) { next(err); }
});

/* ── GET /api/ai-providers/ollama/models ───────────────────────────── */
router.get('/ollama/models', async (_req, res, next) => {
  try {
    const resp = await fetch('http://localhost:11434/api/tags');
    if (!resp.ok) return res.status(502).json({ error: 'Ollama not reachable' });
    const data = await resp.json();
    const models = (data.models || []).map(m => m.name);
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: 'Ollama not reachable: ' + err.message });
  }
});

/* ── PUT /api/ai-providers/:provider/key ───────────────────────────── */
router.put('/:provider/key', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'apiKey required' });
    }

    const enc = encrypt(apiKey.trim());
    await pool.query(
      `UPDATE ai_providers
       SET api_key_enc = $1, is_enabled = true, updated_at = now()
       WHERE provider = $2`,
      [enc, provider]
    );

    invalidateCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /api/ai-providers/:provider/activate ──────────────────────── */
router.put('/:provider/activate', async (req, res, next) => {
  try {
    const { provider } = req.params;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    // Verify provider is enabled (has key or is ollama)
    const check = await pool.query(
      `SELECT is_enabled, api_key_enc FROM ai_providers WHERE provider = $1`,
      [provider]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Provider not found' });

    const row = check.rows[0];
    if (!row.is_enabled && provider !== 'ollama') {
      return res.status(400).json({ error: 'Provider is not enabled — save an API key first' });
    }

    // Deactivate all, then activate selected
    await pool.query(`UPDATE ai_providers SET is_active = false`);
    await pool.query(
      `UPDATE ai_providers SET is_active = true, updated_at = now() WHERE provider = $1`,
      [provider]
    );

    invalidateCache();
    res.json({ ok: true, active: provider });
  } catch (err) { next(err); }
});

/* ── PUT /api/ai-providers/:provider/models ────────────────────────── */
router.put('/:provider/models', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { modelTool, modelSynth } = req.body;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    await pool.query(
      `UPDATE ai_providers
       SET model_tool = COALESCE($1, model_tool),
           model_synth = COALESCE($2, model_synth),
           updated_at = now()
       WHERE provider = $3`,
      [modelTool || null, modelSynth || null, provider]
    );

    invalidateCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
