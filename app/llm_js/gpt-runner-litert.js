// LiteRT-LM generation runner - wraps the litert-worker.js client to provide
// a WebLLM-compatible chat.completions.create() interface, matching
// gpt-runner.js's generate() signature.
// Conversation/KV-cache state now lives inside the worker (see
// litert-worker.js); this file just proxies requests to it.
import { getCurrentModel, litertClient } from './model-loader-litert.js?v=20261030b';

export function clearLiteRTConversations(agentId = null) {
  litertClient.clearConversations(agentId).catch(err => console.warn('[tablefolk-litert] clearConversations failed', err));
}

// Build a fake engine object with chat.completions.create() that internally
// posts to the worker and awaits its response (with optional streaming).
export function createLiteRTEngine(client) {
  return {
    chat: {
      completions: {
        create: async (config) => {
          const onToken = config.onToken ? (fullText) => config.onToken(fullText, true) : null;
          const text = await client.generate(config.messages, config, onToken);
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
    unload: () => client.unload(),
  };
}

// Main generate function - matches gpt-runner.js generate() signature
export async function generate(engine, prompt, opts = {}) {
  const maxTokens = opts.maxTokens ?? 100;
  const temperature = opts.temperature ?? 0.7;
  const enableThinking = opts.enableThinking ?? false;
  const debugLog = opts.debugLog ?? null;
  const dryRun = opts.dryRun ?? false;
  const onToken = opts.onToken ?? null;

  // If messages array provided, use it directly
  if (opts.messages && Array.isArray(opts.messages) && opts.messages.length > 0) {
    const genConfig = {
      messages: opts.messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.95,
      onToken: onToken,
      extra_body: { enable_thinking: enableThinking },
      agentId: opts.agentId || 'default',
    };

    debugLog?.('LiteRT request config', { model: getCurrentModel(), max_tokens: maxTokens, temperature, message_count: opts.messages.length, streaming: !!onToken });

    if (dryRun) { debugLog?.('LiteRT dry run: generation skipped'); return ''; }

    const startedAt = performance.now();
    const result = await engine.chat.completions.create(genConfig);
    debugLog?.('LiteRT finished', { ms: Math.round(performance.now() - startedAt) });
    const text = result.choices[0]?.message?.content || '';
    return text;
  }

  // Build messages from prompt + system message
  const messages = [];
  const sysParts = [];
  if (opts.systemMessage?.trim()) sysParts.push(opts.systemMessage.trim());
  if (!enableThinking) sysParts.push('Do not use thinking tags. Provide your answer directly.');
  if (opts.constraintInstruction?.trim()) sysParts.push(opts.constraintInstruction.trim());
  if (sysParts.length) messages.push({ role: 'system', content: sysParts.join('\n\n') });
  messages.push({ role: 'user', content: prompt });

  const genConfig = {
    messages,
    max_tokens: maxTokens,
    temperature,
    top_p: 0.95,
    onToken: onToken,
    agentId: opts.agentId || 'default',
  };

  debugLog?.('LiteRT request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: prompt,
    streaming: !!onToken,
  });

  if (dryRun) {
    debugLog?.('LiteRT dry run: generation skipped');
    return '';
  }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('LiteRT finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
