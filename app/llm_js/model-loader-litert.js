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
};

let worker = null;
let nextId = 1;
const pending = new Map(); // id -> {resolve, reject, onProgress, onToken}

// Mirrors the worker's own load/unload state so getCurrentModel()/isLoaded()
// can stay synchronous, matching their pre-Worker signatures.
let currentModel = null;
let loaded = false;

function getWorker() {
  if (!worker) {
    // Classic (not module) worker on purpose - see the comment at the top of
    // litert-worker.js for why a module worker breaks the library's own
    // importScripts()-based WASM glue loader.
    worker = new Worker('./llm_js/litert-worker.js?v=20261018a');
    worker.onmessage = (e) => {
      const { id, type } = e.data;
      const p = pending.get(id);
      if (!p) return;
      if (type === 'progress') { p.onProgress?.(e.data.data); return; }
      if (type === 'token') { p.onToken?.(e.data.text); return; }
      pending.delete(id);
      if (type === 'result') p.resolve(e.data.data);
      else if (type === 'error') p.reject(new Error(e.data.message));
    };
    worker.onerror = (e) => {
      console.error('[model-loader-litert] worker error', e);
      for (const [id, p] of pending) { p.reject(new Error(e.message || 'LiteRT worker error')); pending.delete(id); }
    };
  }
  return worker;
}

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
  try {
    await call('load', { modelKey }, { onProgress: wrappedProgress });
    currentModel = modelKey;
    loaded = true;
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
  // What the worker last sent to the model (tests/debugging).
  lastPrompt() { return call('debugLastPrompt'); },
  unload() {
    unloadModel();
  },
};

// DevTools/test access: window.__tablefolkLiteRT.lastPrompt()
try { window.__tablefolkLiteRT = litertClient; } catch {}
