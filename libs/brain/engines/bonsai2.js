// Prism ML's Ternary Bonsai 2 27B (prism-ml/Ternary-Bonsai-2-27B-gguf, the
// 5.95 GB PTQ1_0 file) on WebGPU, run by the webml-community kernel engine.
//
// That engine is published only inside its demo page
// (huggingface.co/spaces/webml-community/ternary-bonsai-2-webgpu-kernels):
// the page's second module script starts with it and ends its engine part
// with `export{... as TernaryBonsai2 ...}`. We fetch the page at a pinned
// revision, cut the module there and import it from a blob URL (the way
// xen0bit/smolbox runs it), so nothing of it is copied into this repository.
// The engine streams the weights from our R2 mirror (same bytes; Hugging
// Face is the fallback) and keeps them in its cache.
//
//   const model = await loadBonsai2(status => ...);
//   const text = await generateBonsai2(model, '', { messages, maxTokens, onToken });
const SPACE_REV = '94320c9da2b7aeac5b5807c9e61d696a3c09edb5';
const SPACE_URL = `https://huggingface.co/spaces/webml-community/ternary-bonsai-2-webgpu-kernels/resolve/${SPACE_REV}/index.html`;
export const BONSAI2_FILE = 'Ternary-Bonsai-2-27B-PTQ1_0.gguf';
const MIRROR_URL = `https://geebr-models.mindroot.io/bonsai-2-27b/${BONSAI2_FILE}`;
import { mirrorAllowed, local } from '../../models/index.js';
const LOADED = '_bonsai2_loaded';   // '1': cached from Hugging Face, 'r2': from the mirror
const CONTEXT = 8192;   // tokens; the engine's default is 16384

let modulePromise = null;
export function bonsai2Module() {
  return modulePromise ||= (async () => {
    const res = await fetch(SPACE_URL);
    if (!res.ok) throw new Error(`Bonsai 2 engine page: HTTP ${res.status}`);
    const html = await res.text();
    const src = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]).find(t => t.includes('as TernaryBonsai2'));
    if (!src) throw new Error('Bonsai 2 engine not found in its page');
    const at = src.indexOf('as TernaryBonsai2'), end = src.indexOf('}', at) + 1;
    const url = URL.createObjectURL(new Blob([src.slice(0, end) + ';'], { type: 'text/javascript' }));
    try { return await import(url); } finally { URL.revokeObjectURL(url); }
  })().catch(e => { modulePromise = null; throw e; });
}

// opts.context: the context window in tokens (default 8192; the world builder's
// one-answer mode wants 12288: the whole guide plus a whole world)
// The engine reads the model in ranges only when a HEAD answer says
// "Accept-Ranges: bytes"; the R2 mirror supports ranges but does not expose that
// header to pages (CORS), so the engine fell back to reading the whole 5.9 GB
// file into one array, which browsers refuse ("Array buffer allocation failed",
// 2026-11-13, an RTX 4070 in the cloud). HEAD answers from the mirror get the
// header added here.
let fetchPatched = false;
function patchMirrorHead() {
  if (fetchPatched || typeof globalThis.fetch !== 'function') return;
  fetchPatched = true;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const res = await real(input, init);
    const url = String(input?.url || input), method = (init?.method || input?.method || 'GET').toUpperCase();
    if (method !== 'HEAD' || !/\.mindroot\.io\//.test(url) || res.headers.get('accept-ranges')) return res;
    const headers = new Headers(res.headers); headers.set('accept-ranges', 'bytes');
    return new Response(null, { status: res.status, statusText: res.statusText, headers });
  };
}

export async function loadBonsai2(onStatus = () => {}, { context = CONTEXT } = {}) {
  patchMirrorHead();
  const { TernaryBonsai2 } = await bonsai2Module();
  // The engine caches by URL: a copy cached from Hugging Face stays there.
  let source = null;
  const cachedFromHF = local.get(LOADED) === '1';
  // the mirror only on tablefolk.world (@tablefolk/models mirrorAllowed)
  if (!cachedFromHF && mirrorAllowed()) {
    try {
      const r = await fetch(MIRROR_URL, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
      await r.body?.cancel();
      if (r.ok) source = MIRROR_URL;
    } catch {}
  }
  const check = await TernaryBonsai2.checkAvailability(source, { file: BONSAI2_FILE }).catch(() => null);
  if (check && check.ok === false) throw new Error('Bonsai 2 27B cannot run here: ' + (check.reason || 'unsupported GPU'));
  const gb = n => (n / 2 ** 30).toFixed(2);
  const model = await TernaryBonsai2.load(source, {
    file: BONSAI2_FILE, maxLength: context, chatTemplateArgs: { enable_thinking: false },
    onProgress: e => {
      if (e.status === 'weights' && e.kind === 'bytes' && e.total > 0) onStatus(`${e.fromCache ? 'reading cached' : 'downloading'} Bonsai 2 27B ${Math.floor(100 * e.loaded / e.total)}% (${gb(e.loaded)} / ${gb(e.total)} GB)`);
      else if (e.status === 'weights' && e.kind === 'tensors') onStatus(/warm|compil|tuning/i.test(e.message || '') ? 'compiling WebGPU kernels…' : `packing weights ${e.loaded || 0} / ${e.total || '?'}`);
      else onStatus(e.message || e.status || 'loading Bonsai 2');
    },
  });
  local.set(LOADED, source ? 'r2' : '1');
  return { model, queue: Promise.resolve(), unload() { try { model.dispose?.(); } catch {} } };
}

const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

// One turn at a time (the engine leases its single cache); it reuses the
// cached prefix when the next prompt starts the same way.
export function generateBonsai2(engine, _prompt, opts = {}) {
  const run = async () => {
    if (opts.dryRun) return '';
    const messages = (opts.messages || []).map(m => ({ role: m.role, content: plain(m.content) }));
    let text = '';
    for await (const c of engine.model.generate(messages, { maxNewTokens: opts.maxTokens || 256 })) {
      if (c.delta) { text += c.delta; opts.onToken?.(text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart()); }
    }
    return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  };
  const p = engine.queue.then(run, run); engine.queue = p.catch(() => {});
  return p;
}

export const hasBonsai2Cached = () => !!local.get(LOADED);
export async function clearBonsai2Cache() {
  local.remove(LOADED);
  for (const d of await indexedDB.databases?.() || []) if (/bonsai|gguf|kernel/i.test(d.name || '')) indexedDB.deleteDatabase(d.name);
}
