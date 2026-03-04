/**
 * OpenAI-compatible orchestration loop for Abby.
 * Handles OpenAI, Google Gemini (OpenAI-compatible endpoint), and Ollama.
 * Uses the same tool definitions as the Anthropic path but converted to function-call format.
 */

import OpenAI from 'openai';
import { buildAnthropicTools, executeTool } from './abby-tools.js';
import { prefetchPageData } from './abby-prefetch.js';

// Convert Anthropic tool format to OpenAI function format
function toOpenAITools(anthropicTools) {
  return anthropicTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

const OPENAI_TOOLS = toOpenAITools(buildAnthropicTools());

/**
 * Stream a response using an OpenAI-compatible provider.
 *
 * @param {object} opts
 * @param {object} opts.res - Express response (SSE already opened)
 * @param {function} opts.send - SSE send helper (event, data) => void
 * @param {Array}  opts.chatMessages - [{role, content}] in OpenAI format
 * @param {string} opts.systemPrompt - Combined system prompt
 * @param {object} opts.providerConfig - From getActiveProvider()
 * @param {number} opts.MAX_TOOL_ROUNDS
 */
export async function streamOpenAI({ res, send, chatMessages, systemPrompt, providerConfig, MAX_TOOL_ROUNDS, pageContext }) {
  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
  });

  // Prepend system message
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatMessages,
  ];

  // Probe whether this model supports tools on the first round.
  // If it rejects with "does not support tools", fall back to prefetch mode.
  let toolsSupported = true;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    send('status', { text: round === 0 ? 'Thinking...' : 'Analyzing new data...' });

    const requestParams = {
      model: providerConfig.modelTool,
      max_tokens: 4096,
      messages,
    };
    if (toolsSupported) {
      requestParams.tools = OPENAI_TOOLS;
      requestParams.tool_choice = 'auto';
    }

    let response;
    try {
      response = await client.chat.completions.create(requestParams);
    } catch (err) {
      // Model doesn't support function calling — inject live data and retry without tools
      if (toolsSupported && err?.message?.includes('does not support tools')) {
        toolsSupported = false;
        send('status', { text: 'Loading page data...' });

        // Pre-fetch relevant page data and inject into system prompt
        const liveData = await prefetchPageData(pageContext);
        if (liveData) {
          messages[0] = { role: 'system', content: systemPrompt + liveData };
        }

        send('status', { text: 'Thinking...' });
        response = await client.chat.completions.create({
          model: providerConfig.modelTool,
          max_tokens: 4096,
          messages,
        });
      } else {
        throw err;
      }
    }

    const choice = response.choices[0];
    const msg = choice.message;

    if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      // Add assistant message with tool_calls
      messages.push(msg);

      const toolResults = [];
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}

        send('tool', { name: fnName, label: fnName.replace(/_/g, ' ') });
        send('status', { text: `Looking up: ${fnName.replace(/_/g, ' ')}...` });

        const result = await executeTool(fnName, args);
        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result.data),
        });
      }

      messages.push(...toolResults);
      send('status', { text: 'Analyzing results...' });
      continue;
    }

    // End turn — emit text
    const text = msg.content || '';
    const words = text.match(/\S+|\s+/g) || [];
    for (const chunk of words) {
      send('token', { content: chunk });
    }
    return;
  }

  // Exceeded rounds — final answer request
  messages.push({ role: 'user', content: 'Please provide your final answer now based on the data you have collected.' });
  const finalResp = await client.chat.completions.create({
    model: providerConfig.modelSynth,
    max_tokens: 4096,
    messages,
  });
  const finalText = finalResp.choices[0]?.message?.content || '';
  const words = finalText.match(/\S+|\s+/g) || [];
  for (const chunk of words) send('token', { content: chunk });
}
