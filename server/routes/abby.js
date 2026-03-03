/**
 * Abby Analytics — Express Router (Claude API backend)
 *
 * POST /api/abby/chat         — Synchronous chat (for testing)
 * POST /api/abby/chat/stream  — SSE streaming chat (primary)
 * GET  /api/abby/health       — API connectivity check
 * GET  /api/abby/suggestions  — Starter prompt suggestions
 *
 * Uses Anthropic Claude API with native tool_use blocks.
 * - claude-haiku-4-5-20251001 for tool orchestration rounds (fast + cheap)
 * - claude-sonnet-4-6 for final synthesis when explicitly needed
 */

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { buildSystemPrompt } from '../lib/abby-prompt.js';
import { buildAnthropicTools, executeTool } from '../lib/abby-tools.js';

const router = Router();

const MAX_TOOL_ROUNDS = 5;

// Model selection: haiku for tool-heavy orchestration, sonnet available for synthesis
const MODEL_TOOL  = process.env.ABBY_MODEL_TOOL  || 'claude-haiku-4-5-20251001';
const MODEL_SYNTH = process.env.ABBY_MODEL_SYNTH || 'claude-haiku-4-5-20251001';

let anthropic;
function getClient() {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

const TOOLS = buildAnthropicTools();
const SYSTEM = buildSystemPrompt();

/* ── Message format helpers ───────────────────────────────────────── */

/**
 * Convert frontend message format [{role, content}] to Anthropic format.
 * Anthropic requires alternating user/assistant roles.
 */
function toAnthropicMessages(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : m.content,
  }));
}

/* ── Orchestration loop (non-streaming) ───────────────────────────── */

async function orchestrate(userMessages) {
  const client = getClient();
  const messages = toAnthropicMessages(userMessages);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL_TOOL,
      max_tokens: 4096,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    // Check stop reason
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      // Add assistant turn (with tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool
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

      // Add user turn with tool results
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // stop_reason = 'max_tokens' or other — extract whatever text exists
    break;
  }

  // Exceeded rounds — ask for final answer without tools
  messages.push({ role: 'user', content: 'Please provide your final answer now based on the data you have collected.' });
  const finalResp = await client.messages.create({
    model: MODEL_SYNTH,
    max_tokens: 4096,
    system: SYSTEM,
    messages,
  });
  return finalResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

/* ── Routes ──────────────────────────────────────────────────────── */

/**
 * POST /api/abby/chat — Synchronous (for testing)
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    const content = await orchestrate(messages);
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
    const { messages = [] } = req.body;
    if (!messages.length) {
      send('error', { message: 'messages required' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const client = getClient();
    const chatMessages = toAnthropicMessages(messages);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      send('status', { text: round === 0 ? 'Thinking...' : 'Analyzing new data...' });

      // Use streaming for the final text response, non-streaming for tool rounds
      const response = await client.messages.create({
        model: MODEL_TOOL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages: chatMessages,
      });

      if (response.stop_reason === 'end_turn') {
        // Stream the text response token by token
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');

        // Emit tokens in word-sized chunks for smooth rendering
        const words = text.match(/\S+|\s+/g) || [];
        for (const chunk of words) {
          send('token', { content: chunk });
        }
        break;
      }

      if (response.stop_reason === 'tool_use') {
        // Add assistant turn
        chatMessages.push({ role: 'assistant', content: response.content });

        // Emit any text content before tools
        const textBefore = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('').trim();
        if (textBefore) send('status', { text: textBefore });

        // Execute tool calls
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

      // Unexpected stop reason — emit whatever text we have
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (text) {
        const words = text.match(/\S+|\s+/g) || [];
        for (const chunk of words) send('token', { content: chunk });
      }
      break;
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
 * GET /api/abby/health — Check Anthropic API connectivity
 */
router.get('/health', async (_req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({
        status: 'degraded',
        model: MODEL_TOOL,
        error: 'ANTHROPIC_API_KEY not set',
      });
    }

    // Lightweight ping: send a minimal message
    const client = getClient();
    await client.messages.create({
      model: MODEL_TOOL,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    });

    res.json({ status: 'ok', model: MODEL_TOOL });
  } catch (err) {
    res.json({ status: 'error', model: MODEL_TOOL, error: err.message });
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
