// Prism ML's Ternary Bonsai 2 and 2.5 (Apache-2.0, made from Qwen3.5/3.8) on WebGPU,
// run by webml-community's kernel engine for Bonsai 2 GGUFs: the 27B (Bonsai 2.5,
// Ternary-Bonsai-2.5-27B-PTQ1_0.gguf, 5.99 GB, since 2026-11-27; Bonsai 2's 5.95 GB
// file before; ~9.1 GB on the card at an 8192 window) and the 9B (Ternary-Bonsai-2-9B-PTQ1_0.gguf, 1.86 GB; ~3.4 GB).
//
// The engine is the `qwen35-vision` module of webml-community's "Ternary Bonsai 2
// Hermes WebGPU" Space (2026-10-15, the release that added the 2B, 4B and 9B):
// fetched at a pinned revision and imported from a blob URL (Hugging Face serves
// it as text/plain), so nothing of it is copied into this repository. It replaced
// the older single-model engine (the ternary-bonsai-2-webgpu-kernels Space,
// 2026-09-17), which had no kernel for the 9B ("com.xenova.BlockHadamard has no
// runnable variant"), could only decode greedily, and left the </think> token out
// of its text. This one reads a long prompt in batches, streams reasoning and
// answer as separate events, samples (temperature, top-k up to 64, top-p,
// min-p), and on the 4070 (2026-11-13) ran the 9B at ~107 tokens/s (7,705-token
// prompt read in 12 s) and the 27B at ~37 (that prompt in 43 s).
//
//   const engine = await loadBonsai2(status => ..., { size: '9B' });
//   const text = await generateBonsai2(engine, '', { messages, maxTokens, enableThinking, onToken });
const ENGINE_REV = '621e20782f208660f4f58283c2ce58430020f243';
const ENGINE_URL = `https://huggingface.co/spaces/webml-community/ternary-bonsai-2-hermes-webgpu/resolve/${ENGINE_REV}/assets/qwen35-vision-Kzp5MMIJ.js`;
// '27B' is Ternary Bonsai 2.5 27B (2026-11-24: the same Qwen3.8-27B architecture,
// tokenizer, chat template and Hadamard rotation as Bonsai 2, new weights; only
// the 96 small ssm_alpha/ssm_beta tensors went from BF16 to F32, 47 MB more), pinned
// to a revision. '27B-v2' is the Bonsai 2 27B it replaced (hidden picker entry
// bonsai2-27b-v2). flag: the localStorage key that marks a finished load, so a
// Bonsai 2 copy in the cache does not pass for 2.5. The 9B stays unpinned: pinning
// would change its URL and so the engine's cache key (a fresh download for everyone).
export const SIZES = {
  '27B': { repo: 'prism-ml/Ternary-Bonsai-2.5-27B-GGUF', revision: '28a7093cc25bc151cc2b284c5570f12ce343fdcf', file: 'Ternary-Bonsai-2.5-27B-PTQ1_0.gguf', mirror: 'https://geebr-models.mindroot.io/bonsai/hf/prism-ml/Ternary-Bonsai-2.5-27B-GGUF/resolve/28a7093cc25bc151cc2b284c5570f12ce343fdcf/Ternary-Bonsai-2.5-27B-PTQ1_0.gguf', flag: '_bonsai25_loaded', name: 'Bonsai 2.5 27B', replaces: 'Ternary-Bonsai-2-27B-PTQ1_0.gguf' },   // mirrored on R2 2026-11-27 (SHA-256 checked)
  '27B-v2': { repo: 'prism-ml/Ternary-Bonsai-2-27B-gguf', revision: '839bd57023c1558945afea70a74fa83c054f35f9', file: 'Ternary-Bonsai-2-27B-PTQ1_0.gguf', mirror: 'https://geebr-models.mindroot.io/bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf', flag: '_bonsai2_loaded', name: 'Bonsai 2 27B' },
  '9B': { repo: 'prism-ml/Ternary-Bonsai-2-9B-gguf', file: 'Ternary-Bonsai-2-9B-PTQ1_0.gguf', mirror: null, flag: '_bonsai2_loaded_9B', name: 'Bonsai 2 9B' },   // not mirrored on R2 yet
};
export const BONSAI2_FILE = SIZES['27B'].file;
import { mirrorAllowed, local } from '../../models/index.js';
const LOADED = '_bonsai2_loaded';   // the old flag (Bonsai 2 27B); per size: SIZES[size].flag, '1' cached from Hugging Face, 'r2' from the mirror
const CONTEXT = 8192;   // tokens

let modulePromise = null;
export function bonsai2Module() {
  return modulePromise ||= (async () => {
    const res = await fetch(ENGINE_URL);
    if (!res.ok) throw new Error(`Bonsai 2 engine: HTTP ${res.status}`);
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
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

// The window can also come from the page: ?bonsaictx=4096 (or localStorage
// tablefolk_bonsai2_context): its KV cache is most of the memory beyond the 5.95 GB
// of weights, so a smaller window leaves room for a voice beside it.
// How many sessions (speakers with their own cache): ?bonsaisessions=3 or
// localStorage tablefolk_bonsai2_sessions; else what the caller passes.
const pageSessions = () => {
  let v = null;
  try { v = new URLSearchParams(globalThis.location?.search || '').get('bonsaisessions') || globalThis.localStorage?.getItem('tablefolk_bonsai2_sessions'); } catch {}
  const n = Math.round(Number(v));
  return n >= 1 && n <= 6 ? n : null;
};
const pageContext = () => {
  let v = null;
  try { v = new URLSearchParams(globalThis.location?.search || '').get('bonsaictx') || globalThis.localStorage?.getItem('tablefolk_bonsai2_context'); } catch {}
  const n = Math.round(Number(v));
  return n >= 1024 && n <= 32768 ? n : null;
};
export async function loadBonsai2(onStatus = () => {}, { context = pageContext() ?? CONTEXT, size = '27B', sessions = pageSessions() ?? 1 } = {}) {
  patchMirrorHead();
  const S = SIZES[size] || SIZES['27B'], key = S.flag;
  const E = await bonsai2Module();
  // The engine caches by URL: a copy cached from Hugging Face stays there.
  let source = S.repo;
  if (S.mirror && local.get(key) !== '1' && mirrorAllowed()) {
    try {
      const r = await fetch(S.mirror, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
      await r.body?.cancel();
      if (r.ok) source = S.mirror;
    } catch {}
  }
  const gb = n => (n / 2 ** 30).toFixed(2);
  const model = await E.Qwen3_5ForConditionalGeneration.from_pretrained(source, {
    file: S.file, mmproj: null, maxLength: context, ...(S.revision && source === S.repo ? { revision: S.revision } : {}),
    onProgress: e => {
      if (e.kind === 'bytes' && e.total > 0) onStatus(`${e.fromCache ? 'reading cached' : 'downloading'} ${S.name} ${Math.floor(100 * e.loaded / e.total)}% (${gb(e.loaded)} / ${gb(e.total)} GB)`);
      else if (e.kind === 'tensors') onStatus('preparing ' + S.name + '…');
      else onStatus(e.message || e.status || 'loading ' + S.name);
    },
  });
  local.set(key, source === S.mirror ? 'r2' : '1');
  // (a console line, not onStatus: the status line must end on the caller's "ready")
  if (S.replaces) dropCached(S.replaces).then(n => { if (n) { local.remove(LOADED); console.info('[bonsai2] removed the replaced Bonsai 2 27B from the cache'); } }).catch(() => {});
  // A session per speaker (sessions > 1): each keeps its own cache, so a
  // character's next turn reuses its own prompt prefix instead of reading the
  // whole prompt again after someone else spoke (14 s cold, 1.4 s warm for a
  // 2,000-token prompt on an RTX 4070). Each extra one holds a KV cache of the
  // window (about 0.6 GB at 8192).
  const first = model.create_session();
  return { model, size, session: first, pool: new Map([['', first]]), maxSessions: Math.max(1, Math.min(6, sessions | 0)), queue: Promise.resolve(), unload() { try { model.dispose?.(); } catch {} } };
}

// The answer without its reasoning. When the reasoning comes inline (the
// 9B on Transformers.js, bonsai9b.js), the chat template has opened <think> in the
// prompt, so the reply has only the closing tag: everything up to the last
// </think> is reasoning, and without one (still thinking, or out of tokens) there
// is no answer yet.
export function answerOf(text, thinking) {
  const t = String(text || '');
  if (/<\/think>/.test(t)) return t.replace(/^[\s\S]*<\/think>/, '').trim();
  if (thinking) return '';
  return t.replace(/<think>[\s\S]*$/, '').trim();
}

const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

// The session for a speaker: side calls (a plan, a reflection, a menu choice:
// agent ids with "~", or not a character's) share one so they do not push a
// character's cache out; the least recently used goes when the pool is full.
function sessionFor(engine, agentId) {
  if (!engine.pool || engine.maxSessions <= 1) return engine.session;
  const id = String(agentId || ''), key = /~|^(menu|api|tf-|default$)/.test(id) || !id ? '~side' : id;
  const pool = engine.pool;
  if (pool.has(key)) { const s = pool.get(key); pool.delete(key); pool.set(key, s); return s; }
  // the first speaker takes the session made at load
  if (pool.has('') ) { const s = pool.get(''); pool.delete(''); pool.set(key, s); return s; }
  if (pool.size >= engine.maxSessions) { const [oldKey, old] = pool.entries().next().value; pool.delete(oldKey); try { old.dispose?.(); } catch {} }
  let s; try { s = engine.model.create_session(); } catch (e) { console.warn('[bonsai2] no extra session:', e?.message || e); engine.maxSessions = pool.size || 1; return pool.values().next().value || engine.session; }
  pool.set(key, s); return s;
}

// One turn at a time (the engine leases its single cache); it reuses the
// cached prefix when the next prompt starts the same way.
// One turn at a time (one session; it reuses the cached prefix when the next
// prompt starts the same way). Reasoning and answer come as separate events.
export function generateBonsai2(engine, _prompt, opts = {}) {
  const run = async () => {
    if (opts.dryRun) return '';
    const messages = (opts.messages || []).map(m => ({ role: m.role, content: plain(m.content) }));
    const t = opts.temperature ?? 0.7;
    const sampling = t > 0 ? { do_sample: true, temperature: t, top_p: opts.topP ?? 0.95, top_k: Math.min(64, opts.topK ?? 20), ...(opts.minP ? { min_p: opts.minP } : {}) } : {};
    let text = '';
    const g = sessionFor(engine, opts.agentId).generate(messages, { max_new_tokens: opts.maxTokens || 256, enable_thinking: !!opts.enableThinking, ...sampling });
    for await (const e of g) {
      if (e.type !== 'text') continue;
      text += e.text ?? e.delta ?? '';
      opts.onToken?.(answerOf(text, false));
    }
    await g.result?.catch?.(() => {});
    return answerOf(text, false);
  };
  const p = engine.queue.then(run, run); engine.queue = p.catch(() => {});
  return p;
}

export const hasBonsai2Cached = (size = '27B') => !!local.get((SIZES[size] || SIZES['27B']).flag);

// Deletes the engine's cached copy of a file it no longer uses (its IndexedDB
// gguf-cache-v1: a meta entry per cache key, chunks keyed [key, begin, end]), so a
// player who had Bonsai 2 27B does not keep 5.9 GB of it beside 2.5. Returns how
// many entries went.
async function dropCached(fileName) {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await new Promise((ok, no) => { const r = indexedDB.open('gguf-cache-v1'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  try {
    if (!db.objectStoreNames.contains('meta') || !db.objectStoreNames.contains('chunks')) return 0;
    const keys = await new Promise((ok, no) => { const r = db.transaction('meta').objectStore('meta').getAllKeys(); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    const stale = keys.filter(k => typeof k === 'string' && k.includes('/' + fileName));
    for (const k of stale) await new Promise((ok, no) => {
      const t = db.transaction(['chunks', 'meta'], 'readwrite');
      t.objectStore('chunks').delete(IDBKeyRange.bound([k], [k, [], []]));
      t.objectStore('meta').delete(k);
      t.oncomplete = ok; t.onerror = () => no(t.error);
    });
    return stale.length;
  } finally { db.close(); }
}
export async function clearBonsai2Cache() {
  local.remove(LOADED); for (const S of Object.values(SIZES)) local.remove(S.flag);
  for (const d of await indexedDB.databases?.() || []) if (/bonsai|gguf|kernel/i.test(d.name || '')) indexedDB.deleteDatabase(d.name);
}
