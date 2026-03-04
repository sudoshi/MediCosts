# AI Provider Admin System

A self-contained, reusable system for managing multiple AI backends (Anthropic, OpenAI, Google Gemini, Ollama) in any Node/Express + PostgreSQL application. API keys are encrypted in the database, the active provider is switchable at runtime via an admin UI, and local models (Ollama) work automatically without any key.

Originally built for **MediCosts** (March 2026). Drop it into any project in under an hour.

---

## Feature Summary

| Feature | Detail |
|---------|--------|
| Providers | Anthropic Claude, OpenAI GPT, Google Gemini, Ollama (local) |
| Key storage | AES-256-GCM encrypted in PostgreSQL — key derived from existing `JWT_SECRET` |
| Runtime switching | Change active provider with one API call; takes effect within 60 seconds |
| Tool-less fallback | Detects models that don't support function calling; pre-fetches relevant data and injects into system prompt |
| Admin UI | React component with per-provider cards, key management, model config |
| Zero extra env vars | Encryption key derived from `JWT_SECRET` you already have |
| Ollama auto-discovery | Lists available local models from `http://localhost:11434/api/tags` |

---

## Architecture

```
Admin UI (/ai-providers)
  → GET  /api/ai-providers              — list all (keys masked)
  → PUT  /api/ai-providers/:id/key      — encrypt + store key
  → PUT  /api/ai-providers/:id/activate — set active, invalidate cache
  → PUT  /api/ai-providers/:id/models   — update model names
  → GET  /api/ai-providers/ollama/models — proxy to local Ollama

Your LLM route (e.g. /api/chat/stream)
  → getActiveProvider()   — reads DB, decrypts key, 1-min cache
  → if anthropic          → Anthropic SDK (@anthropic-ai/sdk)
  → if openai/google/ollama → OpenAI SDK (openai) with correct baseURL
```

---

## Stack Requirements

- **Backend:** Node.js (ESM), Express, PostgreSQL (`pg` pool)
- **NPM packages:** `@anthropic-ai/sdk`, `openai`, `jsonwebtoken`, `crypto` (built-in)
- **Frontend:** React (any version), CSS Modules (or adapt to your CSS approach)
- **Auth:** JWT-based admin check (adapt `requireAdmin` middleware to your own)

```bash
npm install @anthropic-ai/sdk openai   # server/
```

---

## Part 1 — Database Migration

Add to your migration runner on startup:

```sql
CREATE TABLE IF NOT EXISTS ai_providers (
  id          SERIAL PRIMARY KEY,
  provider    TEXT NOT NULL UNIQUE,   -- 'anthropic' | 'openai' | 'google' | 'ollama'
  label       TEXT NOT NULL,
  api_key_enc TEXT,                   -- AES-256-GCM encrypted; NULL for Ollama
  model_tool  TEXT NOT NULL DEFAULT '',  -- fast model (tool calls / first pass)
  model_synth TEXT NOT NULL DEFAULT '',  -- synthesis model (final answer)
  is_active   BOOLEAN NOT NULL DEFAULT false,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default providers (safe to re-run)
INSERT INTO ai_providers (provider, label, model_tool, model_synth, is_active, is_enabled)
VALUES
  ('anthropic', 'Anthropic Claude', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', true,  true),
  ('openai',    'OpenAI GPT',       'gpt-4o-mini',               'gpt-4o',            false, false),
  ('google',    'Google Gemini',    'gemini-1.5-flash',          'gemini-1.5-pro',    false, false),
  ('ollama',    'Ollama (Local)',    'llama3.2',                  'llama3.2',          false, true)
ON CONFLICT (provider) DO NOTHING;
```

**Auto-seed existing env key at startup** (add to your migration function):

```js
// server/lib/db-migrate.js (or wherever you run migrations)
if (process.env.ANTHROPIC_API_KEY) {
  const { encrypt } = await import('./crypto.js');
  const enc = encrypt(process.env.ANTHROPIC_API_KEY);
  await pool.query(`
    UPDATE ai_providers SET api_key_enc = $1, updated_at = now()
    WHERE provider = 'anthropic' AND api_key_enc IS NULL
  `, [enc]);
}
```

---

## Part 2 — Encryption Utility

**`server/lib/crypto.js`**

```js
/**
 * AES-256-GCM encrypt/decrypt for API key storage.
 * Encryption key is derived from JWT_SECRET — no extra env var needed.
 */
import crypto from 'crypto';

let _key = null;

function getKey() {
  if (_key) return _key;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set — cannot encrypt');
  // Change the salt string to something unique per application
  _key = crypto.scryptSync(secret, 'your-app-name-ai', 32);
  return _key;
}

/** @returns {string} "<iv_hex>:<tag_hex>:<ciphertext_hex>" */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** @returns {string} plaintext */
export function decrypt(ciphertext) {
  const key = getKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const iv  = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
}
```

> **Important:** Change `'your-app-name-ai'` to a unique string per application. If two apps share a database, different salts prevent cross-app key decryption.

---

## Part 3 — Provider Resolver

**`server/lib/ai-provider.js`**

```js
/**
 * Resolves the active AI provider from DB with a 1-minute in-process cache.
 * Returns a normalized config object consumed by your LLM route.
 */
import pool from '../db.js';   // your pg pool
import { decrypt } from './crypto.js';

let _cache = null;
let _cacheAt = 0;
const TTL = 60_000; // 1 minute

export function invalidateCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * @returns {Promise<{
 *   provider: 'anthropic'|'openai'|'google'|'ollama',
 *   label: string,
 *   apiKey: string|null,
 *   modelTool: string,
 *   modelSynth: string,
 *   baseURL?: string,
 * }>}
 */
export async function getActiveProvider() {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL) return _cache;

  const r = await pool.query(
    `SELECT provider, label, api_key_enc, model_tool, model_synth
     FROM ai_providers WHERE is_active = true LIMIT 1`
  );

  if (!r.rows.length) {
    // Fallback: env var (safe for first deploy before DB is populated)
    return {
      provider: 'anthropic',
      label: 'Anthropic (env fallback)',
      apiKey: process.env.ANTHROPIC_API_KEY || null,
      modelTool: 'claude-haiku-4-5-20251001',
      modelSynth: 'claude-haiku-4-5-20251001',
    };
  }

  const row = r.rows[0];
  let apiKey = null;
  if (row.api_key_enc) {
    try { apiKey = decrypt(row.api_key_enc); }
    catch (e) { console.error('[ai-provider] decrypt error:', e.message); }
  }

  const config = {
    provider: row.provider,
    label: row.label,
    apiKey,
    modelTool: row.model_tool,
    modelSynth: row.model_synth,
  };

  // OpenAI-compatible base URLs
  if (row.provider === 'google') {
    config.baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  } else if (row.provider === 'ollama') {
    config.baseURL = 'http://localhost:11434/v1';
    config.apiKey = 'ollama'; // openai SDK requires a non-empty string
  }

  _cache = config;
  _cacheAt = now;
  return config;
}
```

---

## Part 4 — Admin CRUD API

**`server/routes/ai-providers.js`**

```js
import { Router } from 'express';
import pool from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { invalidateCache } from '../lib/ai-provider.js';

const router = Router();
const VALID = ['anthropic', 'openai', 'google', 'ollama'];

// GET /api/ai-providers — list all (keys masked)
router.get('/', async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT provider, label, api_key_enc, model_tool, model_synth,
              is_active, is_enabled, updated_at
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
        } catch { keyMasked = '(encrypted)'; }
      }
      return {
        provider: row.provider, label: row.label, keyMasked,
        hasKey: !!row.api_key_enc,
        modelTool: row.model_tool, modelSynth: row.model_synth,
        isActive: row.is_active, isEnabled: row.is_enabled,
        updatedAt: row.updated_at,
      };
    });
    res.json({ providers: rows });
  } catch (err) { next(err); }
});

// GET /api/ai-providers/ollama/models — proxy to local Ollama
router.get('/ollama/models', async (_req, res) => {
  try {
    const resp = await fetch('http://localhost:11434/api/tags');
    if (!resp.ok) return res.status(502).json({ error: 'Ollama not reachable' });
    const data = await resp.json();
    res.json({ models: (data.models || []).map(m => m.name) });
  } catch (err) {
    res.status(502).json({ error: 'Ollama not reachable: ' + err.message });
  }
});

// PUT /api/ai-providers/:provider/key — save encrypted API key
router.put('/:provider/key', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;
    if (!VALID.includes(provider)) return res.status(400).json({ error: 'Unknown provider' });
    if (!apiKey?.trim()) return res.status(400).json({ error: 'apiKey required' });

    await pool.query(
      `UPDATE ai_providers SET api_key_enc = $1, is_enabled = true, updated_at = now()
       WHERE provider = $2`,
      [encrypt(apiKey.trim()), provider]
    );
    invalidateCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/ai-providers/:provider/activate — set as active provider
router.put('/:provider/activate', async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!VALID.includes(provider)) return res.status(400).json({ error: 'Unknown provider' });

    const check = await pool.query(
      `SELECT is_enabled FROM ai_providers WHERE provider = $1`, [provider]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Provider not found' });
    if (!check.rows[0].is_enabled && provider !== 'ollama') {
      return res.status(400).json({ error: 'Save an API key first' });
    }

    await pool.query(`UPDATE ai_providers SET is_active = false`);
    await pool.query(
      `UPDATE ai_providers SET is_active = true, updated_at = now() WHERE provider = $1`,
      [provider]
    );
    invalidateCache();
    res.json({ ok: true, active: provider });
  } catch (err) { next(err); }
});

// PUT /api/ai-providers/:provider/models — update model names
router.put('/:provider/models', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { modelTool, modelSynth } = req.body;
    if (!VALID.includes(provider)) return res.status(400).json({ error: 'Unknown provider' });

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
```

**Register in your Express app** (after `requireAuth`/`requireAdmin` middleware):

```js
import aiProvidersRouter from './routes/ai-providers.js';
// All routes require admin — apply your own middleware before registering
app.use('/api/ai-providers', requireAdmin, aiProvidersRouter);
```

---

## Part 5 — Using the Provider in Your LLM Route

### Anthropic path

```js
import Anthropic from '@anthropic-ai/sdk';
import { getActiveProvider } from '../lib/ai-provider.js';

const providerConfig = await getActiveProvider();

if (providerConfig.provider === 'anthropic') {
  const client = new Anthropic({ apiKey: providerConfig.apiKey });
  const response = await client.messages.create({
    model: providerConfig.modelTool,
    max_tokens: 4096,
    system: systemPrompt,
    messages: chatMessages,
    // tools: [...],  // optional
  });
  // handle response ...
}
```

### OpenAI-compatible path (OpenAI, Google Gemini, Ollama)

```js
import OpenAI from 'openai';

if (providerConfig.provider !== 'anthropic') {
  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,   // set for google + ollama; undefined for openai
  });

  const response = await client.chat.completions.create({
    model: providerConfig.modelTool,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      ...chatMessages,
    ],
    // tools: openAIFormatTools,   // omit if model doesn't support
  });

  const text = response.choices[0]?.message?.content || '';
  // handle text ...
}
```

### Provider → SDK mapping

| `provider` | SDK | `apiKey` source | `baseURL` |
|------------|-----|-----------------|-----------|
| `anthropic` | `@anthropic-ai/sdk` | DB (encrypted) | — |
| `openai` | `openai` | DB (encrypted) | — (default) |
| `google` | `openai` | DB (encrypted) | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `ollama` | `openai` | `'ollama'` (literal) | `http://localhost:11434/v1` |

---

## Part 6 — Handling Tool-Less Models (Ollama/Local)

Many local models don't support function calling. Detect the error and fall back gracefully:

```js
let toolsSupported = true;

try {
  response = await client.chat.completions.create({
    ...params,
    tools: myTools,
    tool_choice: 'auto',
  });
} catch (err) {
  if (toolsSupported && err?.message?.includes('does not support tools')) {
    toolsSupported = false;

    // Option A: simple retry without tools
    response = await client.chat.completions.create({ ...params });

    // Option B: inject pre-fetched data into system prompt before retry
    // const liveData = await fetchRelevantData(pageContext);
    // params.messages[0].content += liveData;
    // response = await client.chat.completions.create({ ...params });
  } else {
    throw err;
  }
}
```

### Pre-fetch pattern (Option B in detail)

When your app has page/context-specific data, define a map of context → queries:

```js
// lib/ai-prefetch.js
import { yourDbQuery } from './db-queries.js';

const CONTEXT_PREFETCH = {
  'Dashboard': [
    { fn: yourDbQuery, args: { type: 'summary' } },
    { fn: yourDbQuery, args: { type: 'top_items', limit: 20 } },
  ],
  'Reports': [
    { fn: yourDbQuery, args: { type: 'recent_reports', limit: 10 } },
  ],
  // ... one entry per page/context
};

export async function prefetchContextData(context) {
  const tasks = CONTEXT_PREFETCH[context];
  if (!tasks?.length) return '';

  const sections = [];
  await Promise.all(tasks.map(async ({ fn, args }) => {
    try {
      const data = await fn(args);
      sections.push(`### ${args.type}\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 4000)}\n\`\`\``);
    } catch {}
  }));

  return sections.length
    ? `\n\n## Live Data\n${sections.join('\n\n')}`
    : '';
}
```

---

## Part 7 — Frontend Admin UI (React)

A minimal, self-contained version. Expand styling to match your design system.

```jsx
// views/AIProvidersView.jsx
import { useState, useEffect, useCallback } from 'react';

const API = '/api';   // adjust to your API base URL

const PROVIDERS = {
  anthropic: { label: 'Anthropic Claude', color: '#d97706', keyHint: 'sk-ant-...',   docsUrl: 'https://console.anthropic.com/settings/keys' },
  openai:    { label: 'OpenAI GPT',       color: '#10b981', keyHint: 'sk-...',        docsUrl: 'https://platform.openai.com/api-keys' },
  google:    { label: 'Google Gemini',    color: '#3b82f6', keyHint: 'AIza...',       docsUrl: 'https://aistudio.google.com/app/apikey' },
  ollama:    { label: 'Ollama (Local)',    color: '#8b5cf6', keyHint: null,            docsUrl: 'https://ollama.com/library' },
};

function ProviderCard({ provider, onRefresh }) {
  const meta = PROVIDERS[provider.provider] || {};
  const [apiKey, setApiKey]     = useState('');
  const [modelTool, setModelTool]   = useState(provider.modelTool);
  const [modelSynth, setModelSynth] = useState(provider.modelSynth);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [status, setStatus]     = useState('');
  const token = localStorage.getItem('authToken');
  const auth  = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (provider.provider !== 'ollama') return;
    fetch(`${API}/ai-providers/ollama/models`, { headers: auth })
      .then(r => r.json()).then(d => setOllamaModels(d.models || [])).catch(() => {});
  }, []);

  async function call(path, method = 'PUT', body) {
    const r = await fetch(`${API}/ai-providers/${provider.provider}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...auth },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed');
    return d;
  }

  async function saveKey() {
    try { await call('key', 'PUT', { apiKey }); setApiKey(''); setStatus('Key saved'); onRefresh(); }
    catch (e) { setStatus('Error: ' + e.message); }
  }
  async function activate() {
    try { await call('activate', 'PUT'); setStatus(`${meta.label} activated`); onRefresh(); }
    catch (e) { setStatus('Error: ' + e.message); }
  }
  async function saveModels() {
    try { await call('models', 'PUT', { modelTool, modelSynth }); setStatus('Models saved'); onRefresh(); }
    catch (e) { setStatus('Error: ' + e.message); }
  }

  return (
    <div style={{
      border: `1px solid ${provider.isActive ? meta.color : '#333'}`,
      borderRadius: 8, padding: 16, background: '#111',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ color: meta.color }}>{meta.label}</strong>
        {provider.isActive && <span style={{ color: meta.color, fontSize: 11, fontWeight: 700 }}>● ACTIVE</span>}
      </div>

      {provider.provider !== 'ollama' ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>API Key</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="password" placeholder={provider.keyMasked || meta.keyHint}
              value={apiKey} onChange={e => setApiKey(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, color: '#eee', fontFamily: 'monospace' }} />
            <button onClick={saveKey} disabled={!apiKey.trim()}
              style={{ padding: '6px 12px', background: meta.color, border: 'none', borderRadius: 4, color: '#000', fontWeight: 600, cursor: 'pointer' }}>
              Save
            </button>
          </div>
          {meta.docsUrl && <a href={meta.docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#60a5fa' }}>Get API key ↗</a>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          No key needed — runs locally.
          {ollamaModels.length > 0 && <span style={{ marginLeft: 8, color: '#a78bfa' }}>{ollamaModels.length} models available</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {['Tool model', 'Synth model'].map((label, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{label}</div>
            {provider.provider === 'ollama' && ollamaModels.length > 0 ? (
              <select value={i === 0 ? modelTool : modelSynth}
                onChange={e => i === 0 ? setModelTool(e.target.value) : setModelSynth(e.target.value)}
                style={{ width: '100%', padding: '5px 6px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, color: '#eee' }}>
                {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={i === 0 ? modelTool : modelSynth}
                onChange={e => i === 0 ? setModelTool(e.target.value) : setModelSynth(e.target.value)}
                style={{ width: '100%', padding: '5px 6px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, color: '#eee', fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' }} />
            )}
          </div>
        ))}
      </div>
      <button onClick={saveModels} style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid #444', borderRadius: 4, color: '#aaa', cursor: 'pointer', marginBottom: 12 }}>
        Save Models
      </button>

      {provider.isActive ? (
        <div style={{ textAlign: 'center', fontSize: 11, color: meta.color, padding: '6px', background: meta.color + '18', borderRadius: 4 }}>
          Currently serving requests
        </div>
      ) : (
        <button onClick={activate} disabled={!provider.hasKey && provider.provider !== 'ollama'}
          style={{ width: '100%', padding: 8, background: 'transparent', border: `1px solid ${meta.color}`, borderRadius: 4, color: meta.color, fontWeight: 600, cursor: 'pointer' }}>
          Set as Active
        </button>
      )}

      {status && <div style={{ marginTop: 8, fontSize: 11, color: status.startsWith('Error') ? '#f87171' : '#4ade80' }}>{status}</div>}
    </div>
  );
}

export default function AIProvidersView() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const token = localStorage.getItem('authToken');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/ai-providers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setProviders(d.providers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const active = providers.find(p => p.isActive);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>AI Provider Settings</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
        {active ? <>Active: <strong style={{ color: PROVIDERS[active.provider]?.color }}>{active.label}</strong> ({active.modelTool})</> : 'No active provider'}
      </p>

      {loading ? <div style={{ color: '#666' }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {providers.map(p => <ProviderCard key={p.provider} provider={p} onRefresh={load} />)}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 14, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, fontSize: 12, color: '#8b949e' }}>
        <strong style={{ color: '#e6edf3' }}>Security:</strong> API keys are AES-256-GCM encrypted in the database using a key derived from your JWT secret. Keys are never returned in API responses. Changes take effect within 60 seconds.
      </div>
    </div>
  );
}
```

---

## Part 8 — Wiring It All Together

### Express app registration

```js
// server/index.js
import aiProvidersRouter from './routes/ai-providers.js';

// After your auth middleware is applied to /api:
app.use('/api/ai-providers', requireAdmin, aiProvidersRouter);
```

### React router

```jsx
// App.jsx
const AIProvidersView = lazy(() => import('./views/AIProvidersView'));

// Inside your authenticated routes:
<Route path="/ai-providers" element={<AIProvidersView />} />
```

### Admin nav link (add wherever your admin menu is)

```jsx
<a href="/ai-providers">AI Providers</a>
// or with react-router:
<Link to="/ai-providers">AI Providers</Link>
```

---

## Checklist for New Projects

- [ ] `npm install @anthropic-ai/sdk openai` in server directory
- [ ] Copy `server/lib/crypto.js` — change the scrypt salt string
- [ ] Copy `server/lib/ai-provider.js` — update the `pool` import to your DB connection
- [ ] Copy `server/routes/ai-providers.js` — update `pool` import
- [ ] Add DB migration SQL (Part 1)
- [ ] Add auto-seed block to migration runner
- [ ] Register route in Express with your admin guard middleware
- [ ] Copy or adapt `AIProvidersView.jsx` for your frontend
- [ ] Add route to your router
- [ ] Add nav link to admin menu
- [ ] In your LLM route, replace hardcoded `new Anthropic(...)` with `getActiveProvider()` + branching logic (Part 5)
- [ ] If you use local models: add tool-less fallback (Part 6)

---

## Security Notes

- **Encryption key:** Derived via `scryptSync(JWT_SECRET, salt, 32)`. If you rotate `JWT_SECRET`, existing encrypted keys become undecryptable — re-enter them in the admin UI after rotation.
- **Key masking:** The GET endpoint decrypts keys only to mask them (`sk-ab••••cd`). Keys are never returned in plaintext.
- **Admin guard:** All `/api/ai-providers` routes require admin role. Never expose these routes publicly.
- **Ollama:** Runs on localhost only. Ensure port 11434 is not externally accessible.
- **Google Gemini:** Uses the OpenAI-compatible endpoint (`/v1beta/openai/`). Not all Gemini models support function calling — apply the tool-less fallback pattern.

---

## Provider Model Reference

### Anthropic Claude
| Role | Model | Notes |
|------|-------|-------|
| Tool (fast) | `claude-haiku-4-5-20251001` | Cheapest, great for tool rounds |
| Synth | `claude-sonnet-4-6` | Balanced quality/cost |
| Best | `claude-opus-4-6` | Highest quality |

### OpenAI GPT
| Role | Model | Notes |
|------|-------|-------|
| Tool (fast) | `gpt-4o-mini` | Very cheap, supports tools |
| Synth | `gpt-4o` | Full intelligence |

### Google Gemini
| Role | Model | Notes |
|------|-------|-------|
| Tool (fast) | `gemini-1.5-flash` | Fast + cheap |
| Synth | `gemini-1.5-pro` | Higher quality |
| Latest | `gemini-2.0-flash` | Check availability |

### Ollama (Local)
Any model pulled via `ollama pull <name>`. Models with function calling support:
- `llama3.1`, `llama3.2` — support tools
- `mistral-nemo` — supports tools
- `qwen2.5`, `qwen2.5-coder` — support tools
- `gemma`, `phi3`, `MedGemma` — **do not support tools** → use prefetch fallback

---

*Generated from MediCosts Phase 8 implementation — March 2026*
