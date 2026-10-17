// Transformers.js v4 generation runner - wraps Gemma4ForConditionalGeneration
// to provide a WebLLM-compatible chat.completions.create() interface.
// This allows agent-brain.js and gpt-runner.js to work with both engines.
import * as transformers from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
import { getCurrentModel } from './model-loader-tjs.js';

function stripThinkBlocks(text) {
  return text
    .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
    .replace(/<\|think\|>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\|think\|>[\s\S]*$/i, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?\|think\|>/gi, '')
    .trimStart();
}

// Build a fake engine object with chat.completions.create() that internally
// calls Transformers.js model.generate().
export function createTJSEngine(model, processor) {
  const tokenizer = processor.tokenizer;

  async function generateText(messages, opts = {}) {
    const maxNewTokens = opts.max_tokens ?? 100;
    const temperature = opts.temperature ?? 0.7;
    const doSample = temperature > 0;
    const enableThinking = opts.extra_body?.enable_thinking ?? false;

    // Convert messages to Gemma chat format
    // Transformers.js apply_chat_template expects content as array of parts
    const chatMessages = messages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: [{ type: 'text', text: m.content }] };
      }
      return m; // already structured
    });

    // Apply chat template
    const prompt = processor.apply_chat_template(chatMessages, {
      enable_thinking: enableThinking,
      add_generation_prompt: true,
    });

    // Prepare inputs (text-only for now; image/audio support can be added later)
    const inputs = await processor(prompt, null, null, {
      add_special_tokens: false,
    });

    // Generate
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: doSample,
      temperature: temperature,
      top_p: 0.95,
    });

    // Decode output (skip the input prompt tokens)
    const inputLen = inputs.input_ids.dims.at(-1);
    const decoded = processor.batch_decode(
      outputs.slice(null, [inputLen, null]),
      { skip_special_tokens: true },
    );

    let text = decoded[0] || '';
    if (!enableThinking) {
      text = stripThinkBlocks(text);
    }
    return text;
  }

  // Stream version - yields chunks
  async function* generateTextStream(messages, opts = {}) {
    const maxNewTokens = opts.max_tokens ?? 100;
    const temperature = opts.temperature ?? 0.7;
    const doSample = temperature > 0;
    const enableThinking = opts.extra_body?.enable_thinking ?? false;

    const chatMessages = messages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: [{ type: 'text', text: m.content }] };
      }
      return m;
    });

    const prompt = processor.apply_chat_template(chatMessages, {
      enable_thinking: enableThinking,
      add_generation_prompt: true,
    });

    const inputs = await processor(prompt, null, null, {
      add_special_tokens: false,
    });

    const inputLen = inputs.input_ids.dims.at(-1);
    let fullText = '';

    // Use TextStreamer for streaming output
    const streamer = new transformers.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => {
        fullText += text;
      },
    });

    await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: doSample,
      temperature: temperature,
      top_p: 0.95,
      streamer: streamer,
    });

    // Yield the full text as a single chunk (Transformers.js streaming is callback-based,
    // not async iterator-based, so we yield once after generation completes)
    let text = fullText;
    if (!enableThinking) {
      text = stripThinkBlocks(text);
    }
    yield { choices: [{ delta: { content: text } }] };
  }

  // Fake engine object matching WebLLM's interface
  const engine = {
    chat: {
      completions: {
        create: async (config) => {
          if (config.stream) {
            return generateTextStream(config.messages, config);
          }
          const text = await generateText(config.messages, config);
          return {
            choices: [{ message: { content: text } }],
          };
        },
      },
    },
    unload: () => {
      try { model.dispose?.(); } catch {}
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

  // If messages array provided, use it directly
  if (opts.messages && Array.isArray(opts.messages) && opts.messages.length > 0) {
    const genConfig = {
      messages: opts.messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.95,
    };
    if (!enableThinking) genConfig.extra_body = { enable_thinking: false };

    debugLog?.('TJS request config', { model: getCurrentModel(), max_tokens: maxTokens, temperature, message_count: opts.messages.length });

    if (dryRun) { debugLog?.('TJS dry run: generation skipped'); return ''; }

    const startedAt = performance.now();
    const result = await engine.chat.completions.create(genConfig);
    debugLog?.('TJS finished', { ms: Math.round(performance.now() - startedAt) });
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
  };
  if (!enableThinking) genConfig.extra_body = { enable_thinking: false };

  debugLog?.('TJS request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: prompt,
  });

  if (dryRun) {
    debugLog?.('TJS dry run: generation skipped');
    return '';
  }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('TJS finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
