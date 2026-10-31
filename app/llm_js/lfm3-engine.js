// Liquid AI's LFM3-1.7B (Oct 27 2026; LFM Open License 1.0, free under $10M
// revenue) on WebGPU, run by the webml-community kernel runtime
// (Lfm3ForCausalLM.js, Apache-2.0, from the LFM3-1.7B-WebGPU-Pi Space, loaded
// at a pinned revision) on the official GGUF (LiquidAI/LFM3-1.7B-GGUF,
// Q4_K_M, 1.1 GB). Unlike the ggml WebGPU backend and the q4f16 ONNX builds
// it falls back to 32-bit kernels where the GPU lacks shader-f16 (Chrome on
// Linux with NVIDIA). Liquid's ONNX export failed on Transformers.js 4.3.2
// (a logits_to_keep input it doesn't feed, then "divide by zero").
//
//   const engine = await loadLfm3(status => ...);
//   const text = await generateLfm3(engine, '', { messages, maxTokens, temperature, topK });
const SPACE_REV = '3ad7ce876d3272d4b3496ad7dd06da5e7e334f2c';
const RUNTIME_URL = `https://huggingface.co/spaces/webml-community/LFM3-1.7B-WebGPU-Pi/resolve/${SPACE_REV}/dist/runtime/Lfm3ForCausalLM.js`;
const MODEL_ID = 'LiquidAI/LFM3-1.7B-GGUF', MODEL_FILE = 'LFM3-1.7B-Q4_K_M.gguf';
const LOADED = 'tablefolk_lfm3_loaded';
const CONTEXT = 8192;

// Hugging Face serves the file as text/plain, which a module import refuses:
// fetched and imported from a blob URL (it is self-contained).
let runtimePromise = null;
const runtime = () => runtimePromise ||= fetch(RUNTIME_URL).then(r => { if (!r.ok) throw new Error('LFM3 runtime: HTTP ' + r.status); return r.text(); })
  .then(async js => { const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' })); try { return await import(url); } finally { URL.revokeObjectURL(url); } })
  .catch(e => { runtimePromise = null; throw e; });

export async function loadLfm3(onStatus = () => {}) {
  const { Lfm3ForCausalLM } = await runtime();
  const check = await Lfm3ForCausalLM.checkAvailability(MODEL_ID, {}).catch(() => null);
  if (check && check.ok === false) throw new Error('LFM3 cannot run here: ' + (check.reason || 'unsupported GPU'));
  const model = await Lfm3ForCausalLM.from_pretrained(MODEL_ID, {
    maxLength: CONTEXT,
    onProgress: e => {
      if (e?.status === 'weights' && e.kind === 'bytes' && e.total > 0) onStatus(`${e.fromCache ? 'reading cached' : 'downloading'} LFM3 1.7B ${Math.floor(100 * e.loaded / e.total)}% (${(e.loaded / 2 ** 30).toFixed(2)} / ${(e.total / 2 ** 30).toFixed(2)} GB)`);
      else if (e?.message) onStatus('LFM3: ' + e.message);
    },
  });
  try { localStorage.setItem(LOADED, '1'); } catch {}
  return { model, session: model.create_session(), queue: Promise.resolve(), unload() { try { this.session?.dispose(); this.model.dispose?.(); } catch {} } };
}

const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

// One turn at a time (the model holds one session; it reuses the cached
// prefix when the next prompt starts the same way).
export function generateLfm3(engine, _prompt, opts = {}) {
  const run = async () => {
    if (opts.dryRun) return '';
    const messages = (opts.messages || []).map(m => ({ role: m.role, content: plain(m.content) }));
    // Greedy: this runtime's LFM3 path decodes greedily only ("this model
    // decodes greedily only" when asked to sample), the Space's agent does the
    // same, and Liquid's recommended temperature 0.1 is close to it. No
    // repetition penalty either.
    const turn = engine.session.generate(messages, { max_new_tokens: opts.maxTokens || 256, enable_thinking: false, do_sample: false });
    const out = await turn.result;
    const text = String(out?.message?.content ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
    opts.onToken?.(text);
    return text;
  };
  const p = engine.queue.then(run, run); engine.queue = p.catch(() => {});
  return p;
}

export const hasLfm3Cached = () => { try { return localStorage.getItem(LOADED) === '1'; } catch { return false; } };
