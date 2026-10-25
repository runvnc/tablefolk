// Main-thread proxy for the LiteRT-LM (Gemma 4 E2B) engine, which now runs
// entirely inside llm_js/litert-worker.js. This file keeps the exact same
// exported API it had when it ran the engine in-process, so agent-brain.js
// and world-integration.js need no changes - only the implementation moved.
//
// Why: profiling found @litert-lm/core running single-threaded directly on
// the main thread, with its own ~1.35GB WebGPU-backed WASM memory, competing
// with Babylon's renderer for the same thread and GPU queue. The library
// never used a Worker itself (confirmed by reading its source - no Worker/
// postMessage/pthread anywhere, and it calls setSingleThreadedExecution(true)),
// but its script-loader already branches on `typeof importScripts`, i.e. it
// was written to be Worker-safe. It just wasn't run that way here.

const MODEL_CONFIG = {
  'gemma4-e2b-litert': { label: 'Gemma 4 E2B (LiteRT-LM)' },
  'gemma4-e4b-litert': { label: 'Gemma 4 E4B (LiteRT-LM)' },
  'gemma4-e2b-vision': { label: 'Gemma 4 E2B with sight (LiteRT-LM)', vision: true },
  'nemotron-bolt-e4b-litert': { label: 'Nemotron 3.5 Bolt E4B (LiteRT-LM)' },
  'bonsai-1.7b-litert': { label: 'Ternary Bonsai 1.7B (LiteRT-LM)' },
  'bonsai-8b-litert': { label: 'Ternary Bonsai 8B (LiteRT-LM)' },
};

let worker = null, shared = false;
let nextId = 1;
// One URL for every page (the game and the world builder), so they share it.
const WORKER_URL = '/app/llm_js/litert-worker.js?v=20261025d';
// A model this browser has loaded before (so it is in OPFS): the engine runs
// in a shared worker, which survives a reload or the step from the world
// builder into the game: it keeps the model 2 minutes after the last page
// lets go (litert-worker.js), while Chrome keeps the worker running. The
// first download stays in a dedicated worker: only there can it write OPFS
// with a sync access handle (a shared worker's async writes cap near 34 MB/s).
const CACHED = 'tablefolkLitertCached';
const wasCached = () => { try { return !!localStorage.getItem(CACHED); } catch { return false; } };
const pending = new Map(); // id -> {resolve, reject, onProgress, onToken}

// Mirrors the worker's own load/unload state so getCurrentModel()/isLoaded()
// can stay synchronous, matching their pre-Worker signatures.
let currentModel = null;
let loaded = false;

function onReply(e) {
  const { id, type } = e.data;
  const p = pending.get(id);
  if (!p) return;
  if (type === 'progress') { p.onProgress?.(e.data.data); return; }
  if (type === 'token') { p.onToken?.(e.data.text); return; }
  pending.delete(id);
  if (type === 'result') p.resolve(e.data.data);
  else if (type === 'error') p.reject(new Error(e.data.message));
}
function failAll(e) {
  console.error('[model-loader-litert] worker error', e);
  for (const [id, p] of pending) { p.reject(new Error(e.message || 'LiteRT worker error')); pending.delete(id); }
}
function getWorker(noShared = false) {
  if (!worker) {
    // Classic (not module) workers on purpose - see the comment at the top of
    // litert-worker.js for why a module worker breaks the library's own
    // importScripts()-based WASM glue loader.
    if (!noShared && wasCached() && typeof SharedWorker === 'function') {
      try {
        const sw = new SharedWorker(WORKER_URL, { name: 'tablefolk-litert', extendedLifetime: true });
        sw.onerror = failAll; worker = sw.port; worker.onmessage = onReply; worker.start(); shared = true;
        // The worker keeps the model while some page holds one of these locks,
        // and unloads it 2 minutes after the last one is let go (a page that
        // closes, or leaves, releases it).
        navigator.locks?.request('tablefolk-litert-page-' + Math.random(), () => new Promise(() => {})).catch(() => {});
      } catch (e) { console.warn('[model-loader-litert] no shared worker:', e); worker = null; }
    }
    if (!worker) { worker = new Worker(WORKER_URL); worker.onmessage = onReply; worker.onerror = failAll; shared = false; }
  }
  return worker;
}

// Leaving or reloading the page: end the worker now, which frees the model's
// GPU memory (gigabytes) at once instead of whenever the old page is collected.
// A page restored from the back/forward cache has lost its worker: reload it.
// (A shared worker is only let go: Chrome ends it 30 s after the last page.)
addEventListener('pagehide', () => {
  if (!worker) return;
  if (shared) worker.close(); else worker.terminate();
  worker = null; loaded = false; currentModel = null;
  for (const [id, p] of pending) { p.reject(new Error('page closed')); pending.delete(id); }
});
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

function call(type, payload = {}, { onProgress, onToken } = {}) {
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, onToken });
    w.postMessage({ id, type, ...payload });
  });
}

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));
}

export function getCurrentModel() {
  return currentModel;
}

export function isLoaded() {
  return loaded;
}

export function getEngine() {
  return 'litert-lm';
}

export async function getCapabilityInfo() {
  return call('capabilityInfo');
}

export async function loadModel(modelKey, onProgress) {
  if (!MODEL_CONFIG[modelKey]) throw new Error(`Unknown model: ${modelKey}`);
  const wrappedProgress = (p) => {
    // Old call sites pass either a plain string or a {phase,percent,text,...}
    // object straight through to onProgress - preserve both shapes exactly.
    onProgress?.(p);
  };
  let url = ''; try { url = localStorage.getItem('tablefolk_model_url:' + modelKey) || ''; } catch {}
  try {
    try { await call('load', { modelKey, url }, { onProgress: wrappedProgress }); }
    catch (e) {
      // the worker runs another LiteRT-LM version (the vision model needs the
      // nightly): a fresh dedicated worker for this one
      if (/RESTART_WORKER/.test(e.message)) {
        try { await call('unload'); } catch {}
        try { shared ? worker.close() : worker.terminate(); } catch {}
        worker = null; getWorker(true);
        await call('load', { modelKey, url }, { onProgress: wrappedProgress });
      } else {
      // a shared worker that cannot run it (no WebGPU there, say): once more, dedicated
      if (!shared) throw e;
      console.warn('[model-loader-litert] shared worker failed, using a dedicated one:', e.message);
      try { worker.close(); } catch {}
      worker = null; getWorker(true);
      await call('load', { modelKey, url }, { onProgress: wrappedProgress });
      }
    }
    currentModel = modelKey;
    loaded = true;
    try { localStorage.setItem(CACHED, modelKey); } catch {}
  } catch (e) {
    throw new Error(`Failed to load LiteRT-LM model: ${e.message}`);
  }
  // gpt-runner-litert.js's createLiteRTEngine() just needs a handle it can
  // call generate()/unload()/clearConversations() on - this module itself
  // is that handle now.
  return litertClient;
}

export function unloadModel() {
  call('unload').catch(() => {});
  currentModel = null;
  loaded = false;
}

export async function clearModelCache(modelKey) {
  try { localStorage.removeItem(CACHED); } catch {}
  return call('clearCache', { modelKey: modelKey || 'gemma4-e2b-litert' });
}

export async function hasModelCached(modelKey) {
  return call('hasCached', { modelKey: modelKey || 'gemma4-e2b-litert' });
}

export function getCacheBackend() {
  return 'opfs';
}

export function setCacheBackend() {
  return false;
}

// ---- handle consumed by gpt-runner-litert.js (replaces direct access to a
// real litert Engine instance, which now only exists inside the worker) ----
export const litertClient = {
  async generate(messages, opts, onToken) {
    const data = await call('generate', { messages, opts, streaming: !!onToken }, { onToken });
    // Thinking mode: the reasoning is split off the answer in the worker;
    // surface it for the UI log without mixing it into the command text.
    if (data.thinking) {
      console.log('%c[tablefolk-litert] thinking (' + (opts?.agentId || 'default') + ')\n' + data.thinking, 'color:#888');
      try { self.dispatchEvent(new CustomEvent('tablefolk-thinking', { detail: { agentId: opts?.agentId || 'default', thinking: data.thinking } })); } catch {}
    }
    return data.text;
  },
  async clearConversations(agentId = null) {
    await call('clearConversations', { agentId });
  },
  // Vision models: what is in the picture (an image Blob), as an answer to
  // prompt, with system as the character's own framing.
  async see(image, prompt, system = '') {
    const data = await call('see', { image, prompt, system });
    return data.text;
  },
  canSee() { return !!MODEL_CONFIG[currentModel]?.vision && loaded; },
  // What the worker last sent to the model (tests/debugging).
  lastPrompt() { return call('debugLastPrompt'); },
  unload() {
    unloadModel();
  },
};

// DevTools/test access: window.__tablefolkLiteRT.lastPrompt()
try { window.__tablefolkLiteRT = litertClient; } catch {}
