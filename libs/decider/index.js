// The Strands Decider in the browser: a small decision model that picks one of
// a list of options (or answers yes/no) with calibrated probabilities, instead
// of writing text. StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 (Apache-2.0,
// Qwen3.5-2B-Base with the decider's LoRA merged), as the community GGUF
// ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF (Q8_0, 2.0 GB; its
// answers within 0.013 of the original). The pointer head (head.safetensors,
// 12 MB: LayerNorm, then q and k projections) turns final hidden states into
// the answer, as the GGUF's decide.py and strands-decider 0.2.0 do: one state
// at the end of each option's line, one at the prompt's last token.
//
// decide.py sends one input per option (the prompt cut after that option's
// line) plus the whole prompt, and reads each input's last hidden state. The
// model is causal (attention and Qwen3.5's recurrent layers), so the hidden
// state at the end of a cut prompt is the hidden state at that position of the
// whole prompt: here the whole prompt goes through once and the states are read
// at those positions ("hidden", an action added to wllama 4.0.0 by
// tools/wllama-inkling/wllama-hidden.patch; the build in ./wllama/ is
// libs/brain's wllama-fast with that patch). The state before the question is
// kept as a snapshot, so more questions about the same state evaluate only
// their own tokens. 2026-11-27: 6-8 s a question -> see README.
// engine: 'embeddings' is the old way (wllama 3.13 embeddings, a forward per option).
// llama.cpp's own System One API (wllama createSystemOne) does not take this
// model: its head has a LayerNorm the Kev format lacks.
//
//   const d = await loadDecider(status => ...);
//   await d.decide(state, { pick: { type: 'choice', instructions, criteria: { id: description } } })
//     -> { pick: { choice, probabilities: { id: p }, confidence } }
//   noul (yes/no) questions: { type: 'noul', instructions } -> { noul: P(true) }
const WLLAMA3 = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js';

const GGUF = 'https://huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF/resolve/main/strands-decider-2B-qwen3.5-v1-2610-Q8_0.gguf';
const HEAD = 'https://huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF/resolve/main/head.safetensors';
const TOKENIZER = 'StrandsAgents/strands-decider-2B-qwen3.5-v1-2610';
const WASM3 = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm/wllama.wasm';
// wllama 4.0.0 + the hidden action (and libs/brain wllama-fast's WebGPU patches)
const FAST_JS = new URL('./wllama/index.js', import.meta.url).href;
const FAST_WASM = new URL('./wllama/wllama.wasm', import.meta.url).href;
const MAX_TOKENS = 4096;   // the model's window: questions first, a long state loses its end
// calibrated temperatures (decide.py; strands_decider_config.json of the source)
const TEMPERATURE = { choice: 0.8629556148274228, noul: 1.0704394404346953 };
const NOUL = { false: 'the statement does not hold for this state', true: 'the statement holds for this state' };
const enc = new TextEncoder();
const bytes = s => enc.encode(s).length;

// head.safetensors: 8-byte header length, a JSON header, then the tensors
async function loadHead(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const n = Number(new DataView(buf).getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  const out = {};
  for (const [k, v] of Object.entries(header)) {
    if (k === '__metadata__') continue;
    if (v.dtype !== 'F32') throw new Error('decider head: ' + k + ' is ' + v.dtype);
    const [a, b] = v.data_offsets;
    out[k] = { data: new Float32Array(buf.slice(8 + n + a, 8 + n + b)), shape: v.shape };
  }
  return out;
}

// the question's prompt, its option names and each option line's byte span
function render(q) {
  let options, header;
  if (q.type === 'noul') { const c = { ...NOUL, ...(q.criteria || {}) }; options = [['false', c.false], ['true', c.true]]; header = 'Decide whether the statement is true of the state.'; }
  else { options = Object.entries(q.criteria); header = 'Select exactly one option.'; }
  let text = `<question type="${q.type}">\n${header}\n${String(q.instructions).trim().normalize('NFC')}\n<options>\n`;
  const spans = [];
  options.forEach(([name, desc], i) => {
    desc = String(desc || '').split(/\s+/).filter(Boolean).join(' ');
    const line = `${i + 1}. ${name}${desc ? ' — ' + desc : ''}`.normalize('NFC');
    spans.push([bytes(text), bytes(text + line)]);
    text += line + '\n';
  });
  text += '</options>\n</question>\n<answer>';
  return { text, names: options.map(o => o[0]), spans };
}

function head(H, type, names, hidden) {
  const d = H['norm.weight'].data.length, P = H['q.bias'].data.length;
  const norm = x => {
    let m = 0; for (let i = 0; i < d; i++) m += x[i]; m /= d;
    let v = 0; for (let i = 0; i < d; i++) v += (x[i] - m) ** 2; v /= d;
    const s = 1 / Math.sqrt(v + 1e-5), o = new Float32Array(d);
    for (let i = 0; i < d; i++) o[i] = (x[i] - m) * s * H['norm.weight'].data[i] + H['norm.bias'].data[i];
    return o;
  };
  const proj = (x, w, b) => { const o = new Float32Array(P); for (let r = 0; r < P; r++) { let s = b[r]; const off = r * d; for (let i = 0; i < d; i++) s += w[off + i] * x[i]; o[r] = s; } return o; };
  const q = proj(norm(hidden[hidden.length - 1]), H['q.weight'].data, H['q.bias'].data);
  const logits = hidden.slice(0, -1).map(h => { const k = proj(norm(h), H['k.weight'].data, H['k.bias'].data); let s = 0; for (let i = 0; i < P; i++) s += k[i] * q[i]; return s / Math.sqrt(P) / TEMPERATURE[type]; });
  const mx = Math.max(...logits), ex = logits.map(l => Math.exp(l - mx)), sum = ex.reduce((a, b) => a + b, 0), probs = ex.map(e => e / sum);
  if (type === 'noul') return { noul: probs[names.indexOf('true')] };
  const best = probs.indexOf(Math.max(...probs)), n = names.length;
  return { choice: names[best], probabilities: Object.fromEntries(names.map((nm, i) => [nm, probs[i]])), confidence: n === 1 ? 1 : (n * probs[best] - 1) / (n - 1) };
}

let loading = null;
// options: gpuLayers, ggufUrl, headUrl, engine ('hidden', the default, or 'embeddings'), useCache (wllama's
// model cache, default true), wasmUrl / jsUrl (another build with the hidden action)
export function loadDecider(onStatus = () => {}, { gpuLayers = 99, ggufUrl = GGUF, headUrl = HEAD, engine = 'hidden', useCache = true, wasmUrl = FAST_WASM, jsUrl = FAST_JS } = {}) {
  return loading ||= (async () => {
    onStatus('loading the decision model');
    const fast = engine !== 'embeddings';
    const [{ AutoTokenizer }, H, { Wllama }] = await Promise.all([import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2'), loadHead(headUrl), import(fast ? jsUrl : WLLAMA3)]);
    const tok = await AutoTokenizer.from_pretrained(TOKENIZER);
    // each token's size in bytes: byte-level BPE writes one character per byte;
    // an added (special) token counts its text
    // (Transformers.js 4.x: the inner tokenizer's id_to_token gives the raw byte-level piece)
    const T = tok._tokenizer || tok.tokenizer;
    const added = new Map((T.added_tokens || []).map(t => [t.id, t.content]));
    const pieces = ids => ids.map(i => T.id_to_token(i));
    const tokenize = text => { const ids = tok.encode(text, { add_special_tokens: false }); const p = pieces(ids); return ids.map((id, i) => [id, added.has(id) ? bytes(added.get(id)) : [...(p[i] || '')].length]); };
    const w = new Wllama({ default: fast ? wasmUrl : WASM3 }, { allowOffline: false });
    // batches of 512 tokens (a prompt is ~250): a 4096 batch ran a 6 GB card out of memory.
    // hidden: no pooling (states at any position), two sequences (the work and the state's snapshot)
    await w.loadModelFromUrl(ggufUrl, { n_ctx: MAX_TOKENS + 512, n_batch: 512, n_ubatch: 512, flash_attn: false, embeddings: true, n_gpu_layers: gpuLayers, useCache,
      ...(fast ? { pooling_type: 'none', n_parallel: 2, kv_unified: true, n_ctx_checkpoints: 0 } : { pooling_type: 'last' }),
      progressCallback: ({ loaded, total }) => onStatus(`downloading the decision model ${total ? Math.round(100 * loaded / total) + '%' : ''}`) });
    onStatus('decision model ready');
    const stats = { calls: 0, evaluated: 0, reused: 0, ms: 0 };
    // hidden states (raw, as decide.py's embd_normalize -1) at positions of one prompt; prefix: tokens to keep as a snapshot
    async function hiddenAt(tokens, outputs, prefix) {
      const r = await w.proxy.wllamaAction('hidden', { _name: 'embd_req', data_json: JSON.stringify({ tokens, outputs, prefix }), files: [] });
      const info = JSON.parse(r.data_json), raw = r.data_raw, n = info.n_embd;
      const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      stats.evaluated += info.n_eval; stats.reused += info.n_reused;
      return outputs.map((_, i) => all.subarray(i * n, (i + 1) * n));
    }
    // compile the GPU kernels now, not on the first question (it took 0.3 s more)
    if (fast) { const ids = tokenize('<state>\n' + 'The farmer walks to the mill. '.repeat(12) + '\n</state>\n').map(t => t[0]); await hiddenAt(ids, [ids.length - 1], 0); }
    async function decide(state, questions) {
      const t0 = performance.now();
      const rendered = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, render(q)]));
      const toks = Object.fromEntries(Object.entries(rendered).map(([k, r]) => [k, tokenize(r.text)]));
      const budget = MAX_TOKENS - Math.max(...Object.values(toks).map(t => t.length));
      const stateIds = tokenize(`<state>\n${String(state).trim()}\n</state>\n`.normalize('NFC')).map(t => t[0]).slice(0, budget);
      const out = {};
      const inputs = [], layout = {};
      for (const [k, { names, spans }] of Object.entries(rendered)) {
        const ids = toks[k].map(t => t[0]), ends = []; let acc = 0;
        for (const [, sz] of toks[k]) ends.push(acc += sz);
        const starts = ends.map((e, i) => e - toks[k][i][1]);
        // the last token inside each option's line, then the prompt's last token
        const cuts = spans.map(([a, b]) => { let last = -1; for (let i = 0; i < ids.length; i++) if (starts[i] >= a && ends[i] <= b) last = i; return last; });
        if (fast) {
          const prompt = stateIds.concat(ids), positions = cuts.map(c => stateIds.length + c).concat(prompt.length - 1);
          out[k] = head(H, questions[k].type, names, await hiddenAt(prompt, positions, stateIds.length));
        } else {
          layout[k] = [inputs.length, names];
          for (const c of cuts) inputs.push(stateIds.concat(ids.slice(0, c + 1)));
          inputs.push(stateIds.concat(ids));
        }
      }
      if (!fast) {
        const r = await w.createEmbedding({ input: inputs, embd_normalize: -1 });
        const hidden = r.data.sort((a, b) => a.index - b.index).map(d => Float32Array.from(d.embedding));
        for (const [k, [first, names]] of Object.entries(layout)) out[k] = head(H, questions[k].type, names, hidden.slice(first, first + names.length + 1));
      }
      stats.calls++; stats.ms += performance.now() - t0;
      return out;
    }
    return { decide, wllama: w, engine: fast ? 'hidden' : 'embeddings', stats, unload: () => { loading = null; return w.exit(); } };
  })().catch(e => { loading = null; throw e; });
}
