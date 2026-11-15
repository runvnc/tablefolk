// embed-worker.js -- EmbeddingGemma 2 (text, q4, ~175 MB) in a worker, for
// embed.js. Transformers.js caches the model in Cache Storage per origin.
//   in:  { type: 'load' } | { id, texts: [...] } | { id, rerank: { query, docs } }
//   out: { type: 'ready', device } | { type: 'progress', loaded, total } | { type: 'error', error } | { id, vectors } | { id, scores }
// rerank (books.js): a cross-encoder, ms-marco MiniLM-L6 (int8, 23 MB, loaded on
// the first use, on the CPU): one relevance score (a logit: > 0 relevant, around
// -10 unrelated) for each passage read together with the question.
import { pipeline, AutoTokenizer, AutoModelForSequenceClassification } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

const MODEL = 'onnx-community/embeddinggemma-2-ONNX', DIM = 256;
let extractor = null;

async function load(want) {
  const progress = p => { if (p.status === 'progress' && p.file?.endsWith('.onnx_data')) postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); };
  // WebGPU (q4, 174 MB) unless ?embed=wasm; the CPU needs the int8 file
  // (314 MB: WASM has no GatherBlockQuantized for q4).
  for (const device of (want !== 'wasm' && self.navigator?.gpu ? ['webgpu', 'wasm'] : ['wasm'])) {
    try {
      extractor = await pipeline('feature-extraction', MODEL, { device, dtype: device === 'wasm' ? 'quantized' : 'q4', progress_callback: progress });
      await extractor(['title: none | text: warm up'], { pooling: 'mean', normalize: true });
      postMessage({ type: 'ready', device });
      return;
    } catch (e) { console.warn('[embed] ' + device + ' failed:', e); }
  }
  postMessage({ type: 'error', error: 'could not load the embedding model' });
}

// Matryoshka: the first DIM numbers, normalized again.
function shrink(row) {
  const v = row.slice(0, DIM); let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

const RERANKER = 'Xenova/ms-marco-MiniLM-L-6-v2';
let ce = null;
async function rerank(query, docs) {
  ce ||= Promise.all([AutoTokenizer.from_pretrained(RERANKER), AutoModelForSequenceClassification.from_pretrained(RERANKER, { device: 'wasm', dtype: 'q8' })]);
  const [tok, model] = await ce;
  const inputs = tok(new Array(docs.length).fill(query), { text_pair: docs, padding: true, truncation: true, max_length: 256 });
  const { logits } = await model(inputs);
  return Array.from(logits.data);
}

self.onmessage = async e => {
  const d = e.data;
  if (d.type === 'load') return load(d.device);
  if (d.rerank) { try { postMessage({ id: d.id, scores: await rerank(d.rerank.query, d.rerank.docs) }); } catch (err) { ce = null; postMessage({ id: d.id, error: String(err?.message || err) }); } return; }
  if (!extractor) return postMessage({ id: d.id, error: 'not loaded' });
  try {
    const out = await extractor(d.texts, { pooling: 'mean', normalize: true });
    const [n, dim] = out.dims, data = out.data, vectors = [];
    for (let i = 0; i < n; i++) vectors.push(shrink(Float32Array.from(data.subarray(i * dim, (i + 1) * dim))));
    postMessage({ id: d.id, vectors }, vectors.map(v => v.buffer));
  } catch (err) { postMessage({ id: d.id, error: String(err?.message || err) }); }
};
