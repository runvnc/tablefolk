// Ternary Bonsai 2 9B (Prism ML, Apache-2.0; Qwen3.5-9B made ternary) in the
// browser through Transformers.js on WebGPU: flackzz's text-and-image export of
// danyalmalik's ONNX (2-bit MatMulNBits, exact ternary weights), text only here:
// about 2.7 GB (the decoder 2.2, the token embeddings 0.5); its KV cache is small
// (8 of 32 layers have full attention, 4 KV heads).
//
// The files are mirrored on R2 (bonsai-2-9b-onnx/, same bytes, revision
// f345d741); elsewhere they come from Hugging Face at that revision.
//
// Two fixes Transformers.js 4.3.1 needs for this model (the export's README):
//   - text-only positions: _get_text_only_rope_index returns max + 1 + length as
//     the rope delta where it should be max + 1 - length, so every token after
//     the prompt would sit 2 x length positions too far;
//   - cached generation sets pixel_values = null, which can start the image path.
//
//   const engine = await loadBonsai9b(status => ...);
//   const text = await generateBonsai9b(engine, '', { messages, maxTokens, temperature, onToken });
import { mirrorAllowed } from '../../models/index.js';
import { answerOf } from './bonsai2.js';

const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const HF_ID = 'flackzz/Ternary-Bonsai-2-9B-ONNX-WebGPU', REV = 'f345d741d69a11b00b5bd7984d1954b36708d756';
const MIRROR_HOST = 'https://geebr-models.mindroot.io/', MIRROR_ID = 'bonsai-2-9b-onnx';

function patch(T, model) {
  const rope = model._get_text_only_rope_index?.bind(model);
  if (rope) model._get_text_only_rope_index = (input_ids, attention_mask) => {
    const [pos, deltas] = rope(input_ids, attention_mask);
    if (!attention_mask) return [pos, deltas];
    const L = BigInt(attention_mask.dims[1]);
    return [pos, new T.Tensor('int64', BigInt64Array.from(deltas.data, d => d - 2n * L), deltas.dims)];
  };
  const prep = model.prepare_inputs_for_generation?.bind(model);
  if (prep) model.prepare_inputs_for_generation = (...a) => {
    const r = prep(...a);
    if (r && r.pixel_values == null) delete r.pixel_values;
    return r;
  };
}

export async function loadBonsai9b(onStatus = () => {}, { mirror = mirrorAllowed() } = {}) {
  if (!globalThis.navigator?.gpu) throw new Error('Bonsai 2 9B needs WebGPU');
  const T = await import(TJS);
  const { env, AutoTokenizer, AutoModelForCausalLM } = T;
  env.allowLocalModels = false;
  let id = HF_ID, revision = REV;
  if (mirror) { env.remoteHost = MIRROR_HOST; env.remotePathTemplate = '{model}/'; id = MIRROR_ID; revision = 'main'; }
  const done = new Map();
  const progress = p => {
    if (p.status === 'progress' && p.total) {
      done.set(p.file, [p.loaded, p.total]);
      let a = 0, b = 0; for (const [l, t] of done.values()) { a += l; b += t; }
      onStatus(`downloading Bonsai 2 9B ${Math.floor(100 * a / b)}% (${(a / 2 ** 30).toFixed(2)} GB)`);
    } else if (p.status === 'ready') onStatus('preparing Bonsai 2 9B…');
  };
  const tok = await AutoTokenizer.from_pretrained(id, { revision, progress_callback: progress });
  const model = await AutoModelForCausalLM.from_pretrained(id, {
    revision, subfolder: 'onnx', device: 'webgpu', progress_callback: progress,
    dtype: { embed_tokens: 'q2f16', decoder_model_merged: 'q2f16' },
  });
  patch(T, model);
  onStatus('Bonsai 2 9B ready');
  return { T, tok, model, queue: Promise.resolve(), unload() { try { model.dispose?.(); } catch {} } };
}

// Transformers.js reads the whole prompt in one pass, and this model's attention
// needs memory growing with its square: on a 12 GB card a prompt of 4,500 tokens
// ran out and lost the device. So a long prompt is read in pieces of CHUNK tokens,
// each continuing the cache of the last (generate with max_new_tokens 1 keeps the
// cache of exactly the tokens it read; the next call reads only the new ones).
export const CHUNK = 1024;
export const MAX_PROMPT = 32768;

const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

// One turn at a time; the reply's text (thinking stripped)
export function generateBonsai9b(engine, _prompt, opts = {}) {
  const run = async () => {
    if (opts.dryRun) return '';
    const { T, tok, model } = engine;
    const messages = (opts.messages || []).map(m => ({ role: m.role, content: plain(m.content) }));
    const inputs = tok.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: !!opts.enableThinking });
    const n = inputs.input_ids.dims[1];
    if (n > MAX_PROMPT) throw new Error(`Bonsai 2 9B reads at most ${MAX_PROMPT} tokens (this prompt has ${n})`);
    let text = '';
    const streamer = new T.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: false, callback_function: t => {
      // special tokens kept so </think> survives; <|im_end|> and the like dropped
      text += t.replace(/<\|[^|]*\|>/g, ''); opts.onToken?.(answerOf(text, opts.enableThinking));
    } });
    const t = opts.temperature ?? 0.7;
    const chunk = opts.chunk ?? CHUNK;
    let past = null;
    try {
      for (let end = chunk; chunk > 0 && end < n; end += chunk) {
        const r = await model.generate({ input_ids: inputs.input_ids.slice(null, [0, end]), attention_mask: inputs.attention_mask.slice(null, [0, end]),
          ...(past ? { past_key_values: past } : {}), max_new_tokens: 1, do_sample: false, return_dict_in_generate: true });
        past = r.past_key_values;
      }
      const r = await model.generate({ ...inputs, ...(past ? { past_key_values: past } : {}), max_new_tokens: opts.maxTokens || 256, streamer, return_dict_in_generate: true,
        ...(t > 0 ? { do_sample: true, temperature: t, top_p: opts.topP ?? 0.95, top_k: opts.topK ?? 20 } : { do_sample: false }) });
      past = r.past_key_values;
    } finally { try { await past?.dispose?.(); } catch {} }
    return answerOf(text, opts.enableThinking);
  };
  const p = engine.queue.then(run, run); engine.queue = p.catch(() => {});
  return p;
}

// Transformers.js keeps the files in the Cache API ('transformers-cache'), by URL
const CACHE = 'transformers-cache';
export async function hasBonsai9bCached() {
  try {
    const c = await caches.open(CACHE);
    for (const k of await c.keys()) if (/bonsai-2-9b-onnx|Ternary-Bonsai-2-9B-ONNX/i.test(k.url) && /decoder_model_merged_q2f16\.onnx_data_4$/.test(k.url)) return true;
  } catch {}
  return false;
}
export async function clearBonsai9bCache() {
  try { const c = await caches.open(CACHE); for (const k of await c.keys()) if (/bonsai-2-9b-onnx|Ternary-Bonsai-2-9B-ONNX/i.test(k.url)) await c.delete(k); } catch {}
}
