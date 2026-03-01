/**
 * Abby Analytics — Express Router
 *
 * POST /api/abby/chat        — Synchronous chat (for testing)
 * POST /api/abby/chat/stream  — SSE streaming chat (primary)
 * GET  /api/abby/health       — Ollama connectivity check
 * GET  /api/abby/suggestions   — Starter prompt suggestions
 */

import { Router } from 'express';
import { buildSystemPrompt } from '../lib/abby-prompt.js';
import { executeTool } from '../lib/abby-tools.js';

const router = Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'MedAIBase/MedGemma1.5:4b';
const MAX_TOOL_ROUNDS = 5;

/* ── Helpers ─────────────────────────────────────────────────── */

/**
 * Parse tool_call fenced blocks from the model's response.
 * Returns array of { name, arguments } objects.
 */
function parseToolCalls(content) {
  const calls = [];
  const regex = /```tool_call\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name) calls.push(parsed);
    } catch { /* skip malformed blocks */ }
  }
  return calls;
}

/**
 * Strip tool_call blocks from content to get the "prose" portion.
 */
function stripToolCalls(content) {
  return content.replace(/```tool_call\s*\n[\s\S]*?```/g, '').trim();
}

/**
 * Send a chat completion request to Ollama's OpenAI-compatible endpoint.
 */
async function ollamaChat(messages, { stream = false } = {}) {
  const resp = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
      stream,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Ollama ${resp.status}: ${text}`);
  }
  return resp;
}

/**
 * Run the orchestration loop: send to LLM, parse tool calls, execute, repeat.
 * Returns { messages, finalContent } after up to MAX_TOOL_ROUNDS.
 * Calls onStatus(text) for progress updates.
 */
async function orchestrate(userMessages, { onStatus } = {}) {
  const systemMsg = { role: 'system', content: buildSystemPrompt() };
  const messages = [systemMsg, ...userMessages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await ollamaChat(messages, { stream: false });
    const json = await resp.json();
    const assistantContent = json.choices?.[0]?.message?.content || '';

    const toolCalls = parseToolCalls(assistantContent);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final answer
      return { messages, finalContent: assistantContent };
    }

    // Add assistant message with tool calls
    messages.push({ role: 'assistant', content: assistantContent });

    // Execute each tool call
    const results = [];
    for (const tc of toolCalls) {
      onStatus?.(`Looking up: ${tc.name.replace(/_/g, ' ')}...`);
      const result = await executeTool(tc.name, tc.arguments || {});
      results.push({ tool: tc.name, ...result });
    }

    // Add tool results as a user message (since OpenAI format doesn't have tool role in basic mode)
    const toolResultText = results.map(r =>
      `Tool "${r.tool}" result:\n\`\`\`json\n${JSON.stringify(r.data, null, 2)}\n\`\`\``
    ).join('\n\n');

    messages.push({
      role: 'user',
      content: `Here are the tool results. Use this data to answer the user's question. Do NOT make any more tool calls unless you need additional information.\n\n${toolResultText}`,
    });

    onStatus?.('Analyzing results...');
  }

  // Exceeded max rounds — get a final answer without tools
  messages.push({
    role: 'user',
    content: 'Please provide your final answer now based on the data you have collected.',
  });
  const finalResp = await ollamaChat(messages, { stream: false });
  const finalJson = await finalResp.json();
  return { messages, finalContent: finalJson.choices?.[0]?.message?.content || 'I was unable to generate a response.' };
}

/* ── Routes ──────────────────────────────────────────────────── */

/**
 * POST /api/abby/chat — Synchronous (for testing)
 * Body: { messages: [{ role, content }] }
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    const { finalContent } = await orchestrate(messages);
    res.json({ role: 'assistant', content: finalContent });
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
 *   status  — tool activity progress text
 *   tool    — name of tool being called
 *   token   — content token (streamed final answer)
 *   error   — error message
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

    // Run orchestration (tool loop) with status callbacks
    const systemMsg = { role: 'system', content: buildSystemPrompt() };
    const chatMessages = [systemMsg, ...messages];

    let finalContent = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      send('status', { text: round === 0 ? 'Thinking...' : 'Thinking with new data...' });

      const resp = await ollamaChat(chatMessages, { stream: false });
      const json = await resp.json();
      const assistantContent = json.choices?.[0]?.message?.content || '';

      const toolCalls = parseToolCalls(assistantContent);

      if (toolCalls.length === 0) {
        finalContent = assistantContent;
        break;
      }

      // Execute tool calls with status updates
      chatMessages.push({ role: 'assistant', content: assistantContent });

      const prose = stripToolCalls(assistantContent);
      if (prose) send('status', { text: prose });

      const results = [];
      for (const tc of toolCalls) {
        const label = tc.name.replace(/_/g, ' ');
        send('tool', { name: tc.name, label });
        send('status', { text: `Looking up: ${label}...` });
        const result = await executeTool(tc.name, tc.arguments || {});
        results.push({ tool: tc.name, ...result });
      }

      const toolResultText = results.map(r =>
        `Tool "${r.tool}" result:\n\`\`\`json\n${JSON.stringify(r.data, null, 2)}\n\`\`\``
      ).join('\n\n');

      chatMessages.push({
        role: 'user',
        content: `Here are the tool results. Use this data to answer the user's question. Do NOT make any more tool calls unless you need additional information.\n\n${toolResultText}`,
      });

      send('status', { text: 'Analyzing results...' });
    }

    // If we exhausted rounds without a final answer, force one
    if (finalContent === null) {
      chatMessages.push({
        role: 'user',
        content: 'Please provide your final answer now based on the data you have collected.',
      });
      const finalResp = await ollamaChat(chatMessages, { stream: false });
      const finalJson = await finalResp.json();
      finalContent = finalJson.choices?.[0]?.message?.content || 'I was unable to generate a response.';
    }

    // Stream the final answer token by token (simulate streaming for consistent UX)
    // Split into chunks of ~20 chars for smooth rendering
    const chunkSize = 20;
    for (let i = 0; i < finalContent.length; i += chunkSize) {
      send('token', { content: finalContent.slice(i, i + chunkSize) });
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
 * GET /api/abby/health — Check Ollama connectivity
 */
router.get('/health', async (_req, res) => {
  try {
    // Check Ollama is running
    const ollamaResp = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!ollamaResp.ok) throw new Error('Ollama not responding');

    const { models = [] } = await ollamaResp.json();
    const modelBase = OLLAMA_MODEL.split(':')[0].toLowerCase();
    const modelAvailable = models.some(m => m.name?.toLowerCase().includes(modelBase));

    res.json({
      ollamaRunning: true,
      ollamaUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      modelAvailable,
      availableModels: models.map(m => m.name),
    });
  } catch (err) {
    res.json({
      ollamaRunning: false,
      ollamaUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      modelAvailable: false,
      error: err.message,
    });
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
  ]);
});

export default router;
