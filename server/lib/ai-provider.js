/**
 * Active AI provider resolver with 1-minute cache.
 * Returns normalized config used by abby.js stream handler.
 */

import pool from '../db.js';
import { decrypt } from './crypto.js';

let _cache = null;
let _cacheAt = 0;
const TTL = 60_000; // 1 minute

export function invalidateCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Returns the active provider config:
 * {
 *   provider: 'anthropic' | 'openai' | 'google' | 'ollama',
 *   label: string,
 *   apiKey: string | null,
 *   modelTool: string,
 *   modelSynth: string,
 *   baseURL?: string,  // only for google / ollama
 * }
 */
export async function getActiveProvider() {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL) return _cache;

  const r = await pool.query(
    `SELECT provider, label, api_key_enc, model_tool, model_synth
     FROM ai_providers
     WHERE is_active = true
     LIMIT 1`
  );

  if (!r.rows.length) {
    // Fallback: read from env
    return {
      provider: 'anthropic',
      label: 'Anthropic Claude (env fallback)',
      apiKey: process.env.ANTHROPIC_API_KEY || null,
      modelTool: process.env.ABBY_MODEL_TOOL || 'claude-haiku-4-5-20251001',
      modelSynth: process.env.ABBY_MODEL_SYNTH || 'claude-haiku-4-5-20251001',
    };
  }

  const row = r.rows[0];
  let apiKey = null;

  if (row.api_key_enc) {
    try {
      apiKey = decrypt(row.api_key_enc);
    } catch (e) {
      console.error('[ai-provider] decrypt error:', e.message);
    }
  }

  const config = {
    provider: row.provider,
    label: row.label,
    apiKey,
    modelTool: row.model_tool || 'claude-haiku-4-5-20251001',
    modelSynth: row.model_synth || 'claude-haiku-4-5-20251001',
  };

  // Provider-specific base URLs for OpenAI-compatible endpoints
  if (row.provider === 'google') {
    config.baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  } else if (row.provider === 'ollama') {
    config.baseURL = 'http://localhost:11434/v1';
    config.apiKey = 'ollama'; // openai sdk requires non-empty key
  }

  _cache = config;
  _cacheAt = now;
  return config;
}
