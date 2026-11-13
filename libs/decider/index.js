// The Strands Decider in the browser: a small decision model that picks one of
// a list of options (or answers yes/no) with calibrated probabilities, instead
// of writing text. StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 (Apache-2.0,
// Qwen3.5-2B-Base with the decider's LoRA merged), as the community GGUF
// ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF (Q8_0, 2.0 GB; its
// answers within 0.013 of the original), run by wllama (llama.cpp, WebGPU) as
// an embedding model: the GGUF has pooling "last", so each input gives the
// final hidden state at its last token. The pointer head (head.safetensors,
// 12 MB: LayerNorm, then q and k projections) turns them into the answer, as
// the GGUF's decide.py and strands-decider 0.2.0 do: one input per option (the
// prompt cut after that option's line) and one with the whole prompt.
// llama.cpp's own System One API (wllama createSystemOne) does not take this
// model: its head has a LayerNorm the Kev format lacks.
//
//   const d = await loadDecider(status => ...);
//   await d.decide(state, { pick: { type: 'choice', instructions, criteria: { id: description } } })
//     -> { pick: { choice, probabilities: { id: p }, confidence } }
//   noul (yes/no) questions: { type: 'noul', instructions } -> { noul: P(true) }
import { Wllama } from 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js';

const GGUF = 'https://huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF/resolve/main/strands-decider-2B-qwen3.5-v1-2610-Q8_0.gguf';
const HEAD = 'https://huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF/resolve/main/head.safetensors';
const TOKENIZER = 'StrandsAgents/strands-decider-2B-qwen3.5-v1-2610';
const WASM = { default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm/wllama.wasm' };
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
export function loadDecider(onStatus = () => {}, { gpuLayers = 99, ggufUrl = GGUF, headUrl = HEAD } = {}) {
  return loading ||= (async () => {
    onStatus('loading the decision model');
    const [{ AutoTokenizer }, H] = await Promise.all([import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2'), loadHead(headUrl)]);
    const tok = await AutoTokenizer.from_pretrained(TOKENIZER);
    // each token's size in bytes: byte-level BPE writes one character per byte;
    // an added (special) token counts its text
    // (Transformers.js 4.x: the inner tokenizer's id_to_token gives the raw byte-level piece)
    const T = tok._tokenizer || tok.tokenizer;
    const added = new Map((T.added_tokens || []).map(t => [t.id, t.content]));
    const pieces = ids => ids.map(i => T.id_to_token(i));
    const tokenize = text => { const ids = tok.encode(text, { add_special_tokens: false }); const p = pieces(ids); return ids.map((id, i) => [id, added.has(id) ? bytes(added.get(id)) : [...(p[i] || '')].length]); };
    const w = new Wllama(WASM, { allowOffline: false });
    // batches of 512 tokens (a prompt is ~250): a 4096 batch ran a 6 GB card out of memory
    await w.loadModelFromUrl(ggufUrl, { n_ctx: MAX_TOKENS + 512, n_batch: 512, n_ubatch: 512, flash_attn: false, embeddings: true, pooling_type: 'last', n_gpu_layers: gpuLayers,
      progressCallback: ({ loaded, total }) => onStatus(`downloading the decision model ${total ? Math.round(100 * loaded / total) + '%' : ''}`) });
    onStatus('decision model ready');
    async function decide(state, questions) {
      const rendered = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, render(q)]));
      const toks = Object.fromEntries(Object.entries(rendered).map(([k, r]) => [k, tokenize(r.text)]));
      const budget = MAX_TOKENS - Math.max(...Object.values(toks).map(t => t.length));
      const stateIds = tokenize(`<state>\n${String(state).trim()}\n</state>\n`.normalize('NFC')).map(t => t[0]).slice(0, budget);
      const inputs = [], layout = {};
      for (const [k, { names, spans }] of Object.entries(rendered)) {
        layout[k] = [inputs.length, names];
        const ids = toks[k].map(t => t[0]), ends = []; let acc = 0;
        for (const [, sz] of toks[k]) ends.push(acc += sz);
        const starts = ends.map((e, i) => e - toks[k][i][1]);
        for (const [a, b] of spans) {
          let last = -1; for (let i = 0; i < ids.length; i++) if (starts[i] >= a && ends[i] <= b) last = i;
          inputs.push(stateIds.concat(ids.slice(0, last + 1)));
        }
        inputs.push(stateIds.concat(ids));
      }
      const r = await w.createEmbedding({ input: inputs });
      const hidden = r.data.sort((a, b) => a.index - b.index).map(d => Float32Array.from(d.embedding));
      return Object.fromEntries(Object.entries(layout).map(([k, [first, names]]) => [k, head(H, questions[k].type, names, hidden.slice(first, first + names.length + 1))]));
    }
    return { decide, wllama: w, unload: () => w.exit() };
  })().catch(e => { loading = null; throw e; });
}
