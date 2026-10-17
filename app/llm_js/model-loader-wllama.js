// wllama (llama.cpp -> WASM) model loader for MiniCPM5-1B.
// CPU engine using GGUF weights from Hugging Face (openbmb/MiniCPM5-1B-GGUF).
// This is the normal CPU version that works on GPUs without shader-f16.
import { Wllama } from "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js";

const WLLAMA_BASE = "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/";
const CONFIG_PATHS = {
  "single-thread/wllama.wasm": WLLAMA_BASE + "esm/single-thread/wllama.wasm",
  "multi-thread/wllama.wasm": WLLAMA_BASE + "esm/multi-thread/wllama.wasm",
};

const HF_BASE = "https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/";

const MODEL_CONFIG = {
  'minicpm5-1b': {
    label: 'MiniCPM5-1B (CPU)',
    file: 'MiniCPM5-1B-Q4_K_M.gguf',
    size: 688 * 1024 * 1024,
    vram: 'CPU · WASM',
  },
  'minicpm5-1b-q8': {
    // Prefill-speed experiment. Q4_K is a k-quant: every weight needs
    // super-block dequantization (scales + mins + 6-bit sub-scales) before the
    // dot product, which is expensive under WASM SIMD128. Q8_0 is a flat int8
    // dot that vectorizes cleanly, so it often prefills FASTER than Q4_K_M in
    // WASM despite being ~1.7x the download.
    label: 'MiniCPM5-1B (CPU, Q8_0 - faster prefill?)',
    file: 'MiniCPM5-1B-Q8_0.gguf',
    size: 1150 * 1024 * 1024,
    vram: 'CPU · WASM',
  },
};

let wllama = null;
let currentModel = null;
let loading = false;
let loadedQuant = null;
let loadedCtx = 0;

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));
}

export function getCurrentModel() {
  return currentModel;
}

export function isLoaded() {
  return wllama !== null;
}

export function getEngine() {
  return 'wllama';
}

export async function getCapabilityInfo() {
  // wllama runs on CPU/WASM - no WebGPU required.
  return { webgpu: true, shaderF16: false, cpu: true };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (wllama && currentModel === modelKey) return wllama;
  if (loading) return;

  if (wllama) {
    try { await wllama.exit(); } catch {}
    wllama = null;
  }
  currentModel = null;
  loading = true;

  onProgress?.('Loading MiniCPM5-1B (CPU / wllama)...');
  onProgress?.(`Model: ${cfg.label}`);

  // llama.cpp is fastest at n_threads = PHYSICAL cores. hardwareConcurrency
  // reports logical CPUs, so on a hyperthreaded chip (i7-10750H: 6 cores / 12
  // threads) the old Math.min(8, 12)=8 oversubscribed the 6 real cores -
  // sibling threads contend for the same SIMD units and prefill gets slower,
  // not faster. Halve it as a physical-core estimate; ?threads=N overrides for
  // benchmarking.
  const qsThreads = Number(new URLSearchParams(location.search).get('threads'));
  const logical = navigator.hardwareConcurrency || 4;
  const wantThreads = Number.isFinite(qsThreads) && qsThreads > 0
    ? qsThreads
    : Math.max(1, Math.min(8, Math.floor(logical / 2)));
  console.log('[tablefolk-wllama] load: crossOriginIsolated=', self.crossOriginIsolated,
    'hardwareConcurrency=', navigator.hardwareConcurrency,
    'requesting n_threads=', wantThreads,
    '-> wasm build should be', self.crossOriginIsolated ? 'multi-thread' : 'single-thread (crossOriginIsolated is false, so multi-thread is unavailable regardless of n_threads)');

  try {
    wllama = new Wllama(CONFIG_PATHS, { allowOffline: false });
    await wllama.loadModelFromUrl(HF_BASE + cfg.file, {
      n_ctx: 4096,
      n_threads: wantThreads,
      progressCallback: ({ loaded, total }) => {
        const totalBytes = total || cfg.size;
        const percent = totalBytes ? Math.min(100, (loaded / totalBytes) * 100) : null;
        onProgress?.({
          phase: 'download',
          percent,
          text: percent !== null ? `Downloading GGUF: ${percent.toFixed(1)}%` : 'Downloading GGUF...',
        });
      },
    });
    try {
      const loadedBuild = wllama.isMultithread?.() ?? wllama.multithread ?? wllama.config?.n_threads ?? 'unknown (no introspection API on this wllama version)';
      console.log('[tablefolk-wllama] load: actual thread mode reported by wllama instance =', loadedBuild);
    } catch (introErr) {
      console.log('[tablefolk-wllama] load: could not introspect thread mode:', introErr?.message);
    }
    currentModel = modelKey;
    loadedQuant = 'Q4_K_M';
    loadedCtx = 4096;
    onProgress?.('MiniCPM5-1B ready (CPU / wllama)');
    return wllama;
  } catch (e) {
    throw new Error(`Failed to load wllama model: ${e.message}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (wllama) {
    try { wllama.exit(); } catch {}
  }
  wllama = null;
  currentModel = null;
}

export async function clearModelCache(modelKey) {
  // wllama uses browser HTTP cache; nothing to clear explicitly.
  console.log('wllama cache clear: no-op (uses browser HTTP cache)');
}

export async function hasModelCached(modelKey) {
  // wllama uses browser HTTP cache; we can't easily check. Return false so
  // the download consent flow runs (it will be fast if cached by the browser).
  return false;
}

export function getCacheBackend() {
  return 'browser-http';
}

export function setCacheBackend() {
  return false;
}
