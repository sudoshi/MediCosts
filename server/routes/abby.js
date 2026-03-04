/**
 * Abby Analytics — Express Router (multi-provider AI backend)
 *
 * POST /api/abby/chat         — Synchronous chat (for testing)
 * POST /api/abby/chat/stream  — SSE streaming chat (primary)
 * GET  /api/abby/health       — API connectivity check
 * GET  /api/abby/suggestions  — Starter prompt suggestions
 *
 * Supports Anthropic, OpenAI, Google Gemini (OpenAI-compatible), and Ollama.
 * Active provider is read from DB via getActiveProvider() with 1-min cache.
 */

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { buildSystemPrompt } from '../lib/abby-prompt.js';
import { buildAnthropicTools, executeTool } from '../lib/abby-tools.js';
import { getActiveProvider } from '../lib/ai-provider.js';
import { streamOpenAI } from '../lib/abby-openai.js';
import { PAGE_DESCRIPTIONS } from '../lib/abby-context.js';

const router = Router();

const MAX_TOOL_ROUNDS = 5;

function getAnthropicClient(apiKey) {
  if (!apiKey) throw new Error('No API key configured for Anthropic');
  return new Anthropic({ apiKey });
}

const TOOLS = buildAnthropicTools();
const SYSTEM = buildSystemPrompt();

/* ── Message format helpers ───────────────────────────────────────── */

function toAnthropicMessages(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : m.content,
  }));
}

function buildSystemPrompt_withContext(pageContext) {
  const pageDesc = pageContext ? PAGE_DESCRIPTIONS[pageContext] : null;
  if (!pageDesc) return SYSTEM;
  return `${SYSTEM}\n\n## Current Page Context\nThe user is on the **${pageContext}** page.\n${pageDesc}\nTailor answers to this context. When asked "what am I looking at" or "explain this page", describe it using the above.`;
}

/* ── Orchestration loop (non-streaming, Anthropic) ────────────────── */

async function orchestrate(userMessages, systemPrompt, providerConfig) {
  const client = getAnthropicClient(providerConfig.apiKey);
  const messages = toAnthropicMessages(userMessages);
  const { modelTool: MODEL_TOOL, modelSynth: MODEL_SYNTH } = providerConfig;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL_TOOL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await executeTool(block.name, block.input || {});
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result.data),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  messages.push({ role: 'user', content: 'Please provide your final answer now based on the data you have collected.' });
  const finalResp = await client.messages.create({
    model: MODEL_SYNTH,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });
  return finalResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

/* ── Routes ──────────────────────────────────────────────────────── */

/**
 * POST /api/abby/chat — Synchronous (for testing, Anthropic only)
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages = [], pageContext } = req.body;
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    const providerConfig = await getActiveProvider();
    const systemPrompt = buildSystemPrompt_withContext(pageContext);
    const content = await orchestrate(messages, systemPrompt, providerConfig);
    res.json({ role: 'assistant', content });
  } catch (err) {
    console.error('[Abby] chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/abby/chat/stream — SSE streaming
 * Body: { messages: [{ role, content }] }
 *
 * SSE event types:
 *   status  — tool activity progress text  { text }
 *   tool    — tool being called            { name, label }
 *   token   — content token                { content }
 *   error   — error message               { message }
 *   [DONE]  — stream complete
 */
router.post('/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { messages = [], pageContext } = req.body;
    if (!messages.length) {
      send('error', { message: 'messages required' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const systemPrompt = buildSystemPrompt_withContext(pageContext);
    const providerConfig = await getActiveProvider();
    const chatMessages = toAnthropicMessages(messages);

    if (providerConfig.provider === 'anthropic') {
      // ── Anthropic native SDK path ───────────────────────────────────
      const client = getAnthropicClient(providerConfig.apiKey);
      const { modelTool: MODEL_TOOL } = providerConfig;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        send('status', { text: round === 0 ? 'Thinking...' : 'Analyzing new data...' });

        const response = await client.messages.create({
          model: MODEL_TOOL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages: chatMessages,
        });

        if (response.stop_reason === 'end_turn') {
          const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const words = text.match(/\S+|\s+/g) || [];
          for (const chunk of words) send('token', { content: chunk });
          break;
        }

        if (response.stop_reason === 'tool_use') {
          chatMessages.push({ role: 'assistant', content: response.content });
          const textBefore = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
          if (textBefore) send('status', { text: textBefore });

          const toolResults = [];
          for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            const label = block.name.replace(/_/g, ' ');
            send('tool', { name: block.name, label });
            send('status', { text: `Looking up: ${label}...` });
            const result = await executeTool(block.name, block.input || {});
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result.data),
            });
          }
          chatMessages.push({ role: 'user', content: toolResults });
          send('status', { text: 'Analyzing results...' });
          continue;
        }

        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        if (text) {
          const words = text.match(/\S+|\s+/g) || [];
          for (const chunk of words) send('token', { content: chunk });
        }
        break;
      }
    } else {
      // ── OpenAI-compatible path (openai / google / ollama) ──────────
      await streamOpenAI({ res, send, chatMessages, systemPrompt, providerConfig, MAX_TOOL_ROUNDS, pageContext });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[Abby] stream error:', err.message);
    send('error', { message: err.message });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

/**
 * GET /api/abby/health — Check active AI provider connectivity
 */
router.get('/health', async (_req, res) => {
  try {
    const providerConfig = await getActiveProvider();

    if (!providerConfig.apiKey && providerConfig.provider !== 'ollama') {
      return res.json({
        status: 'degraded',
        provider: providerConfig.provider,
        model: providerConfig.modelTool,
        error: 'No API key configured',
      });
    }

    if (providerConfig.provider === 'anthropic') {
      const client = getAnthropicClient(providerConfig.apiKey);
      await client.messages.create({
        model: providerConfig.modelTool,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      });
    }
    // For other providers, just report config (skip live ping)

    res.json({ status: 'ok', provider: providerConfig.provider, model: providerConfig.modelTool });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/abby/suggestions — Starter prompts
 */
router.get('/suggestions', (_req, res) => {
  res.json([
    'What are the top 5 hospitals in California by star rating?',
    'Compare infection rates at Mayo Clinic vs Cleveland Clinic',
    'Which states have the highest average Medicare payments?',
    'What is the safest hospital in Texas for heart surgery?',
    'Show me hospitals penalized for excess readmissions in New York',
    'What are the most expensive DRGs nationally?',
    'Which pharmaceutical companies made the most payments to physicians last year?',
    'Find dialysis centers in Florida with the best mortality rates',
  ]);
});

/* ═══════════════════════════════════════════════════════════════════════
 * CONVERSATION MEMORY (Phase 4.3) — DB-persisted sessions per user
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/abby/sessions — Create a new conversation session
 */
router.post('/sessions', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Auth required' });

    const { title } = req.body || {};
    const r = await db.query(`
      INSERT INTO abby_sessions (user_id, title)
      VALUES ($1, $2)
      RETURNING session_id, title, created_at, last_active, message_count
    `, [userId, title || 'New Conversation']);

    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

/**
 * GET /api/abby/sessions — List user's recent sessions
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Auth required' });

    const r = await db.query(`
      SELECT session_id, title, created_at, last_active, message_count
      FROM abby_sessions
      WHERE user_id = $1
      ORDER BY last_active DESC
      LIMIT 20
    `, [userId]);

    res.json({ sessions: r.rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/abby/sessions/:id/messages — Load messages for a session
 */
router.get('/sessions/:id/messages', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verify session belongs to user
    const sess = await db.query(
      'SELECT session_id FROM abby_sessions WHERE session_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ error: 'Session not found' });

    const r = await db.query(`
      SELECT id, role, content, tool_calls, created_at
      FROM abby_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json({ session_id: id, messages: r.rows });
  } catch (err) { next(err); }
});

/**
 * POST /api/abby/sessions/:id/messages — Save message pair to session
 * Body: { messages: [{ role, content }] }
 */
router.post('/sessions/:id/messages', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Verify ownership
    const sess = await db.query(
      'SELECT session_id, message_count, title FROM abby_sessions WHERE session_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ error: 'Session not found' });

    // Insert messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) continue;
      await db.query(`
        INSERT INTO abby_messages (session_id, role, content, tool_calls)
        VALUES ($1, $2, $3, $4)
      `, [id, msg.role, typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content), msg.tool_calls ?? null]);
    }

    // Auto-title from first user message if session still untitled
    const session = sess.rows[0];
    const userMsg = messages.find(m => m.role === 'user');
    const autoTitle = session.title === 'New Conversation' && userMsg
      ? String(userMsg.content).slice(0, 60) + (String(userMsg.content).length > 60 ? '…' : '')
      : null;

    await db.query(`
      UPDATE abby_sessions
      SET last_active = now(),
          message_count = message_count + $2
          ${autoTitle ? `, title = $3` : ''}
      WHERE session_id = $1
    `, autoTitle ? [id, messages.length, autoTitle] : [id, messages.length]);

    res.json({ saved: messages.length });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/abby/sessions/:id — Delete a session
 */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const r = await db.query(
      'DELETE FROM abby_sessions WHERE session_id = $1 AND user_id = $2 RETURNING session_id',
      [id, userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
