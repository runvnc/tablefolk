// LiteRT-LM generation runner - wraps LiteRT-LM Engine/Conversation
// to provide a WebLLM-compatible chat.completions.create() interface.
// Uses correct LiteRT-LM JS API: Engine.create(), engine.createConversation(),
// conversation.sendMessage() / conversation.sendMessageStreaming().
// Reuses conversations to leverage preface prefill caching.
import { getCurrentModel } from './model-loader-litert.js';

function stripThinkBlocks(text) {
  return text
    .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
    .replace(/<\|think\|>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\|think\|>[\s\S]*$/i, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?\|think\|>/gi, '')
    .trimStart();
}

// Conversation cache: keyed by system prompt hash, reuses prefill
const conversationCache = new Map();

function hashSystemPrompt(text) {
  // Simple hash for system prompt to use as cache key
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

// Build a fake engine object with chat.completions.create() that internally
// calls LiteRT-LM engine.createConversation() + conversation.sendMessage().
export function createLiteRTEngine(litertEngine) {
  async function getOrCreateConversation(systemContent) {
    const key = hashSystemPrompt(systemContent || '');
    let conv = conversationCache.get(key);
    if (!conv) {
      const conversationConfig = {};
      if (systemContent) {
        conversationConfig.preface = {
          messages: [{ role: 'system', content: systemContent }],
        };
      }
      conv = await litertEngine.createConversation(conversationConfig);
      conversationCache.set(key, conv);
    }
    return conv;
  }

  async function generateText(messages, opts = {}) {
    const maxNewTokens = opts.max_tokens ?? 100;
    const temperature = opts.temperature ?? 0.7;
    const onToken = opts.onToken ?? null;

    // Extract system message for preface
    const systemMessages = messages.filter(m => m.role === 'system');
    let systemContent = systemMessages.map(m => m.content).join('\n\n');
    // Add <|think|> token to enable thinking mode for Gemma 4 E2B/E4B
    if (opts.extra_body?.enable_thinking) {
      systemContent = '<|think|>' + (systemContent || '');
    }

    // Extract non-system messages (user/assistant history + current user message)
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Get or create cached conversation (reuses prefill for same system prompt)
    const conversation = await getOrCreateConversation(systemContent);

    // Only send the LAST user message - the conversation maintains history
    // The agent-brain.js passes full history, but we only need the latest turn
    const lastMessage = chatMessages[chatMessages.length - 1];
    const promptText = lastMessage?.content || '';

    let fullText = '';

    if (onToken) {
      // Use streaming API
      const stream = conversation.sendMessageStreaming(promptText);
      for await (const chunk of stream) {
        const text = chunk?.content?.[0]?.text || chunk?.content?.[0]?.content || '';
        if (text) {
          fullText += text;
          console.log('[litert-stream] chunk:', JSON.stringify(text), 'fullText so far:', JSON.stringify(fullText.slice(0,200)));
          onToken(fullText, true);
        }
      }
      console.log('[litert-stream] final fullText:', JSON.stringify(fullText));
    } else {
      // Non-streaming
      const response = await conversation.sendMessage(promptText);
      fullText = response?.content?.[0]?.text || response?.content?.[0]?.content || '';
    }

    let text = stripThinkBlocks(fullText);
    return text;
  }

  // Fake engine object matching WebLLM's interface
  const engine = {
    chat: {
      completions: {
        create: async (config) => {
          const text = await generateText(config.messages, config);
          return {
            choices: [{ message: { content: text } }],
          };
        },
      },
    },
    unload: () => {
      // Clear conversation cache
      conversationCache.clear();
      try { litertEngine.delete(); } catch {}
    },
  };

  return engine;
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
