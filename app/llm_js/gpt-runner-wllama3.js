// Generation runner for wllama 3.6.0 (WebGPU-capable llama.cpp build).
//
// The 3.x completion API differs from 2.3.7 in three ways that matter here:
//   1. createCompletion takes ONE options object with `prompt` inside, instead
//      of createCompletion(prompt, options).
//   2. Sampling params (temperature, top_p, grammar, ...) are flattened onto
//      that object rather than nested under `sampling`.
//   3. Streaming is { stream: true, onData } and the response carries llama.cpp's
//      own `timings`, which is a far more trustworthy prefill measurement than
//      timing the first token from JS.
import { getCurrentModel } from './model-loader-wllama3.js';

// Same MiniCPM5 ChatML template as the 2.3.7 runner. The <think></think> tags
// must be literal - they were once mangled into the bare words 'thinking' /
// 'response', which made the model emit stray closing </think> tags and drift
// out of command syntax.
function buildPrompt(messages, think) {
  let p = '<s>';
  for (const msg of messages) {
    p += `<|im_start|>${msg.role}\n${msg.content}ٌ\n`;
  }
  p += '<|im_start|>assistant\n';
  p += think ? '<think>\n' : '<think>\n\n</think>\n\n';
  return p;
}

export function createWllama3Engine(wllamaInstance) {
  return {
    chat: {
      completions: {
        create: async (config) => {
          const messages = config.messages || [];
          const maxTokens = config.max_tokens ?? 100;
          const temperature = config.temperature ?? 0.7;
          const enableThinking = config.extra_body?.enable_thinking ?? false;
          const onToken = config.onToken ?? null;
          const shouldAbort = config.shouldAbort ?? null;
          const grammar = config.responseFormat?.type === 'grammar'
            ? config.responseFormat.grammar
            : null;

          const prompt = buildPrompt(messages, enableThinking);
          const t0 = performance.now();
          console.log('[tablefolk-wllama3] SENDING TO MODEL at', new Date().toISOString(),
            'prompt chars:', prompt.length, 'maxTokens:', maxTokens,
            'grammar:', grammar ? 'yes' : 'no', 'renderPaused:', !!window.TABLEFOLK_PAUSE_RENDER);
          console.log('[tablefolk-wllama3] PROMPT PREVIEW:', prompt.slice(0, 1500));

          const aborter = new AbortController();
          const poll = setInterval(() => { if (shouldAbort?.()) aborter.abort(); }, 150);

          let full = '';
          let firstTokenAt = null;
          let genTokenCount = 0;
          let timings = null;

          try {
            await wllamaInstance.createCompletion({
              prompt,
              stream: true,
              abortSignal: aborter.signal,
              max_tokens: maxTokens,
              temperature,
              top_p: 0.95,
              top_k: 40,
              penalty_repeat: 1.1,
              timings_per_token: true,
              // GBNF from grammar.js. In 3.x this is a top-level sampling
              // param, not nested under `sampling` like 2.3.7.
              ...(grammar ? { grammar } : {}),
              onData: (chunk) => {
                const piece = chunk?.choices?.[0]?.text ?? '';
                if (chunk?.timings) timings = chunk.timings;
                if (!piece) return;
                genTokenCount++;
                if (firstTokenAt === null) {
                  firstTokenAt = performance.now();
                  console.log('[tablefolk-wllama3] PREFILL DONE / first token at',
                    new Date().toISOString(), 'elapsed ms:', Math.round(firstTokenAt - t0),
                    'renderPaused:', !!window.TABLEFOLK_PAUSE_RENDER);
                }
                full += piece;
                if (full.includes('ٌ') || shouldAbort?.()) { aborter.abort(); return; }
                onToken?.(full, true);
              },
            });
          } catch (err) {
            // An abort we triggered ourselves (stop token / shouldAbort) is a
            // normal end-of-generation, not a failure.
            if (!aborter.signal.aborted) throw err;
          } finally {
            clearInterval(poll);
          }

          const text = full.split('ٌ')[0].trim();
          const totalMs = performance.now() - t0;
          const genMs = firstTokenAt !== null ? performance.now() - firstTokenAt : null;

          // llama.cpp's own numbers when available - authoritative, and the
          // right thing to compare against the CPU engine's ~10-12 tok/s.
          if (timings) {
            console.log('[tablefolk-wllama3] llama.cpp timings:',
              'prompt_n=', timings.prompt_n, 'prompt_ms=', Math.round(timings.prompt_ms ?? 0),
              'PREFILL=', timings.prompt_per_second?.toFixed?.(1), 'tok/s',
              '| predicted_n=', timings.predicted_n,
              'DECODE=', timings.predicted_per_second?.toFixed?.(1), 'tok/s');
          }
          console.log('[tablefolk-wllama3] RAW OUTPUT at', new Date().toISOString(),
            'elapsed ms:', Math.round(totalMs), 'chars:', text.length,
            'genTokens:', genTokenCount,
            'genRate:', (genMs && genTokenCount > 0) ? (genTokenCount / (genMs / 1000)).toFixed(1) + ' tok/s' : 'n/a');
          console.log('[tablefolk-wllama3] OUTPUT:', text);

          return { choices: [{ message: { content: text } }] };
        },
      },
    },
    unload: () => { try { wllamaInstance.exit(); } catch {} },
  };
}

// Matches the generate() signature used by agent-brain.js.
export async function generate(engine, prompt, opts = {}) {
  const genConfig = {
    messages: opts.messages && opts.messages.length
      ? opts.messages
      : [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens ?? 100,
    temperature: opts.temperature ?? 0.7,
    onToken: opts.onToken ?? null,
    extra_body: { enable_thinking: opts.enableThinking ?? false },
    responseFormat: opts.responseFormat ?? null,
    shouldAbort: opts.shouldAbort ?? null,
  };

  opts.debugLog?.('wllama3 request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    message_count: genConfig.messages.length,
  });
  if (opts.dryRun) { opts.debugLog?.('wllama3 dry run: generation skipped'); return ''; }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  opts.debugLog?.('wllama3 finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
