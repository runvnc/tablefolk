// embed-worker.js -- EmbeddingGemma 2 (text, q4, ~175 MB) in a worker, for
// embed.js. Transformers.js caches the model in Cache Storage per origin.
//   in:  { type: 'load' } | { id, texts: [...] }
//   out: { type: 'ready', device } | { type: 'progress', loaded, total } | { type: 'error', error } | { id, vectors }
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

const MODEL = 'onnx-community/embeddinggemma-2-ONNX', DIM = 256;
let extractor = null;

async function load() {
  const progress = p => { if (p.status === 'progress' && p.file?.endsWith('.onnx_data')) postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); };
  for (const device of (self.navigator?.gpu ? ['webgpu', 'wasm'] : ['wasm'])) {
    try {
      extractor = await pipeline('feature-extraction', MODEL, { device, dtype: 'q4', progress_callback: progress });
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

self.onmessage = async e => {
  const d = e.data;
  if (d.type === 'load') return load();
  if (!extractor) return postMessage({ id: d.id, error: 'not loaded' });
  try {
    const out = await extractor(d.texts, { pooling: 'mean', normalize: true });
    const [n, dim] = out.dims, data = out.data, vectors = [];
    for (let i = 0; i < n; i++) vectors.push(shrink(Float32Array.from(data.subarray(i * dim, (i + 1) * dim))));
    postMessage({ id: d.id, vectors }, vectors.map(v => v.buffer));
  } catch (err) { postMessage({ id: d.id, error: String(err?.message || err) }); }
};
