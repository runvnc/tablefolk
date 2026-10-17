// wllama (llama.cpp -> WASM) generation runner for MiniCPM5-1B.
// Wraps the wllama instance into a WebLLM-compatible chat.completions.create()
// interface. Uses the MiniCPM5 ChatML-style template from openbmb.
import { getCurrentModel } from './model-loader-wllama.js';

// MiniCPM5 chat template (ChatML-style, from openbmb/MiniCPM5-1B chat_template.jinja)
function buildPrompt(messages, think) {
  // BOS is required: this GGUF has add_bos_token=false, and without an explicit
  // <s> the model immediately emits the end-of-turn token (empty replies).
  // Uses the MiniCPM5 ChatML template with the ٌ separator (from the
  // working minicpm5 demo engine-wllama.js).
  let p = "<s>";
  for (const msg of messages) {
    p += `<|im_start|>${msg.role}\n${msg.content}ٌ\n`;
  }
  p += "<|im_start|>assistant\n";
  // These MUST be the literal <think></think> tags from MiniCPM5's chat
  // template. They had been mangled into the bare words ' thinking' / ' response'
  // (angle brackets stripped), so the model never saw a real think block - it
  // responded by emitting stray closing </think> tags mid-answer and drifting
  // out of command syntax entirely.
  p += think ? "<think>\n" : "<think>\n\n</think>\n\n";
  return p;
}

// Build a fake engine object with chat.completions.create() that internally
// calls wllama.createCompletion().
export function createWllamaEngine(wllamaInstance) {
  const engine = {
    chat: {
      completions: {
        create: async (config) => {
          const messages = config.messages || [];
          const maxTokens = config.max_tokens ?? 100;
          const temperature = config.temperature ?? 0.7;
          const enableThinking = config.extra_body?.enable_thinking ?? false;
          const onToken = config.onToken ?? null;
          const shouldAbort = config.shouldAbort ?? null;
          // agent-brain.js builds a GBNF command grammar and passes it as
          // responseFormat, but it was being dropped on the floor here - so the
          // model was free-running and emitting 'Say: "Ready"' instead of
          // say("Ready"), which the parser then logged as an unknown command.
          // wllama's sampler takes GBNF directly as sampling.grammar.
          const grammar = config.responseFormat?.type === 'grammar'
            ? config.responseFormat.grammar
            : null;

          const prompt = buildPrompt(messages, enableThinking);
          const t0 = performance.now();
          console.log('[tablefolk-wllama] SENDING TO MODEL at', new Date().toISOString(), 'prompt chars:', prompt.length, 'maxTokens:', maxTokens, 'renderPaused:', !!window.TABLEFOLK_PAUSE_RENDER);
          console.log('[tablefolk-wllama] PROMPT PREVIEW:', prompt.slice(0, 1500));
          let promptTokenCount = null;
          try {
            const toks = await wllamaInstance.tokenize?.(prompt);
            if (Array.isArray(toks)) promptTokenCount = toks.length;
          } catch (tokErr) {
            console.log('[tablefolk-wllama] tokenize() for prompt length unavailable:', tokErr?.message);
          }
          if (promptTokenCount != null) console.log('[tablefolk-wllama] prompt token count:', promptTokenCount);
          const aborter = new AbortController();
          let full = "";
          let firstTokenAt = null;
          let genTokenCount = 0;
          const cachedBefore = wllamaInstance.nCachedTokens ?? 0;
          console.log('[tablefolk-wllama] KV cache holds', cachedBefore, 'tokens from the previous turn; only the diverging suffix will be prefilled');
          const poll = setInterval(() => { if (shouldAbort?.()) aborter.abort(); }, 150);
          try {
            full = await wllamaInstance.createCompletion(prompt, {
              nPredict: maxTokens,
              abortSignal: aborter.signal,
              // Reuse the KV cache across turns. Without this wllama calls
              // kvClear() and re-prefills the entire ~900-token prompt every
              // turn (~112s measured). Our prompt is [stable system][stable
              // history][changing perception], so the common prefix is large
              // and only the tail needs computing.
              useCache: true,
              sampling: {
                temp: temperature, top_p: 0.95, top_k: 40, penalty_repeat: 1.1,
                ...(grammar ? { grammar } : {}),
              },
              onNewToken: (token, piece, currentText, { abortSignal }) => {
                genTokenCount++;
                if (firstTokenAt === null) {
                  firstTokenAt = performance.now();
                  const prefillMs = firstTokenAt - t0;
                  const prefillRate = promptTokenCount != null ? (promptTokenCount / (prefillMs / 1000)).toFixed(1) + ' tok/s' : 'unknown (no token count)';
                  console.log("[tablefolk-wllama] PREFILL DONE / first token at", new Date().toISOString(), "elapsed ms:", Math.round(prefillMs), "prefill rate:", prefillRate, "renderPaused:", !!window.TABLEFOLK_PAUSE_RENDER);
                }
                full = currentText;
                if (full.includes("ٌ") || shouldAbort?.()) { abortSignal(); return; }
                onToken?.(full, true);
              },
            });
          } finally {
            clearInterval(poll);
          }
          const text = full.split("ٌ")[0].trim();
          const totalMs = performance.now() - t0;
          const genMs = firstTokenAt !== null ? performance.now() - firstTokenAt : null;
          console.log('[tablefolk-wllama] RAW OUTPUT at', new Date().toISOString(), 'elapsed ms:', Math.round(totalMs), 'chars:', text.length,
            'genTokens:', genTokenCount, 'genRate:', (genMs && genTokenCount > 0) ? (genTokenCount / (genMs / 1000)).toFixed(1) + ' tok/s' : 'n/a',
            'renderPaused:', !!window.TABLEFOLK_PAUSE_RENDER);
          console.log('[tablefolk-wllama] OUTPUT:', text);
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
    unload: () => {
      try { wllamaInstance.exit(); } catch {}
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
      responseFormat: opts.responseFormat ?? null,
      shouldAbort: opts.shouldAbort ?? null,
    };

    debugLog?.('wllama request config', { model: getCurrentModel(), max_tokens: maxTokens, temperature, message_count: opts.messages.length, streaming: !!onToken });
    console.log('[tablefolk-wllama] generate() messages path, count:', opts.messages.length);

    if (dryRun) { debugLog?.('wllama dry run: generation skipped'); return ''; }

    const startedAt = performance.now();
    const result = await engine.chat.completions.create(genConfig);
    debugLog?.('wllama finished', { ms: Math.round(performance.now() - startedAt) });
    const text = result.choices[0]?.message?.content || '';
    console.log('[tablefolk-wllama] generate() result:', text);
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
    extra_body: { enable_thinking: enableThinking },
    responseFormat: opts.responseFormat ?? null,
    shouldAbort: opts.shouldAbort ?? null,
  };

  debugLog?.('wllama request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: prompt,
    streaming: !!onToken,
  });

  if (dryRun) {
    debugLog?.('wllama dry run: generation skipped');
    return '';
  }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('wllama finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
