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
import { getCurrentModel } from './wllama.js';

// Same MiniCPM5 ChatML template as the 2.3.7 runner. The <think></think> tags
// must be literal - they were once mangled into the bare words 'thinking' /
// 'response', which made the model emit stray closing </think> tags and drift
// out of command syntax.
// Inkling 2: its own message tokens; thinking is skipped by opening the answer message in the prompt (with
// reasoning_effort 0 it still thinks 100-540 tokens; brains.md, "Inkling 2 Mini")
const INKLING_ROLE = { system: 'system', user: 'user', assistant: 'model' };
function inklingPrompt(messages) {
  let p = '', effort = false;
  for (const m of messages) {
    p += `<|message_${INKLING_ROLE[m.role] || 'user'}|><|content_text|>${m.content}<|end_message|>`;
    if (m.role === 'system' && !effort) { p += '<|message_system|><|content_text|>Thinking effort level: 0<|end_message|>'; effort = true; }
  }
  return p + '<|message_model|><|content_text|>';
}
// where the part of a prompt shared between turns ends: before the last user message
function primeEnd(prompt, template) {
  const i = prompt.lastIndexOf(template === 'inkling' ? '<|message_user|>' : '<|im_start|>user');
  return i > 0 ? i : -1;
}
// stop strings: the end of the answer; for Inkling also 1-2% of answers that run on into reasoning ("The user wants me to...")
function stopsFor(template) {
  if (template === 'inkling') return ['<|end_message|>', '<|content_model_end_sampling|>', '<|message_', 'The user'];
  if (/^(chatml|raon|qwen-nothink)$/.test(template)) return ['<|im_end|>', '<|im_start|>'];
  return [MINICPM_END];
}
const cutAt = (text, stops) => stops.reduce((t, s) => { const i = t.indexOf(s); return i >= 0 ? t.slice(0, i) : t; }, text);

function buildPrompt(messages, think, template) {
  if (template === 'inkling') return inklingPrompt(messages);
  // Qwen 3.5 style (SenseNova-Loop-9B): ChatML with an empty think block unless thinking
  if (template === 'qwen-nothink') return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n' + (think ? '<think>\n' : '<think>\n\n</think>\n\n');
  // Qwen: plain ChatML (its template adds nothing else when a system message is there)
  // Raon-1 nano: ChatML, and its template's empty think block unless thinking
  if (template === 'raon') return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n' + (think ? '<think>\n' : '<think></think>\n\n');
  if (template === 'chatml') return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
  let p = '<s>';
  for (const msg of messages) {
    p += `<|im_start|>${msg.role}\n${msg.content}ٌ\n`;
  }
  p += '<|im_start|>assistant\n';
  p += think ? '<think>\n' : '<think>\n\n</think>\n\n';
  return p;
}

const MINICPM_END = 'ٌ';

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

          // rawPrompt: a whole prompt written by the caller in the model's own format (the world
          // builder's agent mode: Inkling's tool declarations and calls), with its own stops
          const prompt = config.rawPrompt || buildPrompt(messages, enableThinking, wllamaInstance.tablefolkTemplate);
          const stops = config.stops || stopsFor(wllamaInstance.tablefolkTemplate);
          const t0 = performance.now();
          // hybrid models: read the shared prefix on its own when it changed, so a cache checkpoint sits at its end
          if (wllamaInstance.tablefolkPrime && new URLSearchParams(globalThis.location?.search || '').get('wprime') !== '0') {
            const end = primeEnd(prompt, wllamaInstance.tablefolkTemplate);
            const prefix = end > 0 ? prompt.slice(0, end) : null;
            if (prefix && prefix !== wllamaInstance.tablefolkPrimed) {
              try {
                await wllamaInstance.createCompletion({ prompt: prefix, max_tokens: 1, temperature: 0, cache_prompt: true });
                wllamaInstance.tablefolkPrimed = prefix;
              } catch (e) { console.warn('[tablefolk-wllama3] priming failed:', e?.message); }
            }
          }
          console.log('[tablefolk-wllama3] SENDING TO MODEL at', new Date().toISOString(),
            'prompt chars:', prompt.length, 'maxTokens:', maxTokens, 'sampling:', { temperature, top_p: config.top_p, top_k: config.top_k, repeat: config.repetition_penalty },
            'grammar:', grammar ? 'yes' : 'no', 'renderPaused:', !!globalThis.TABLEFOLK_PAUSE_RENDER);
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
              cache_prompt: true,
              // llama.cpp stops at these itself: cancelling a stream from here (the abort below) crashed the
              // wllama 4 build a few turns later (table index out of bounds; brains.md, "Inkling 2 Mini in the game")
              ...(wllamaInstance.tablefolkServerStops ? { stop: stops } : {}),
              abortSignal: aborter.signal,
              max_tokens: maxTokens,
              temperature,
              // a new seed each turn: the default repeats a reply word for word when a question comes again
              seed: Math.floor(Math.random() * 2147483647),
              top_p: config.top_p ?? 0.95,
              top_k: config.top_k ?? 40,
              // llama.cpp server names: wllama 3 hands these to its wasm as they are.
              // It ignores "penalty_repeat", so until 2026-11-08 no repetition penalty
              // applied at all (checked: "Say lilac ten times" at 1.8 still said it ten
              // times under that name, and talked about lilacs under this one). Over
              // the recent conversation, not the last 64 tokens: a word from the
              // Oracle's last reply ("lilac") came back every turn.
              repeat_penalty: config.repetition_penalty ?? 1.1,
              repeat_last_n: config.penalty_last_n ?? 256,
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
                    'renderPaused:', !!globalThis.TABLEFOLK_PAUSE_RENDER);
                }
                full += piece;
                if (shouldAbort?.() || (!wllamaInstance.tablefolkServerStops && stops.some(st => full.includes(st)))) { aborter.abort(); return; }
                if (stops.some(st => full.includes(st))) return;   // the server stops by itself (stop above)
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

          const text = cutAt(full, stops).trim();
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
    top_p: opts.topP, top_k: opts.topK, repetition_penalty: opts.repetitionPenalty,
    onToken: opts.onToken ?? null,
    extra_body: { enable_thinking: opts.enableThinking ?? false },
    responseFormat: opts.responseFormat ?? null,
    shouldAbort: opts.shouldAbort ?? null,
    ...(opts.rawPrompt ? { rawPrompt: opts.rawPrompt } : {}),
    ...(opts.stops ? { stops: opts.stops } : {}),
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
