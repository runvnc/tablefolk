// wllama 3.6.0 loader - llama.cpp -> WASM *with a WebGPU backend*.
//
// Why this exists alongside model-loader-wllama.js (2.3.7):
//   The 2.3.7 CPU path works but is capped around 10-12 tok/s prefill, because
//   the WASM build has no CPU_REPACK kernels (llama.cpp's interleaved-weight
//   layout) for ANY quant - verified with both Q4_K_M and Q8_0. Without it,
//   batched prefill degrades to roughly the per-token decode path.
//
//   wllama 3.6.0 compiles in GGML's WebGPU backend and exposes llama.cpp's
//   n_gpu_layers, so the SAME GGUF can be offloaded to the GPU. Unlike the
//   ONNX Runtime Web path (model-loader-tjs-v2.js), weights stay quantized -
//   that route needed an fp32-activation export whose 130k-token vocabulary
//   inflated the embedding + output matrices to ~800MB each and OOM-killed the
//   tab. GGUF on GPU has no such inflation, and n_gpu_layers allows partial
//   offload so there is no all-at-once allocation spike.
//
// 2.3.7 is deliberately left in place and untouched, so a failed experiment
// here cannot break the working CPU engine.
import { Wllama } from 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js';

// 3.x ships ONE wasm and takes { default: url }; the old
// single-thread/multi-thread keys are deprecated.
const WLLAMA3_WASM = {
  default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/src/wasm/wllama.wasm',
};

const HF_BASE = 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/';

// wllama names its cache entry after the URL: a copy already cached from the
// fallback host is used as is; otherwise the mirror, then the fallback.
async function cachedFromUrl(cfg, url) {
  try {
    const cache = wllama?.cacheManager || new Wllama(WLLAMA3_WASM, { allowOffline: false }).cacheManager;
    return await cache.getSize(await cache.getNameFromURL(url)) > 0;
  } catch { return false; }
}
function modelUrls(cfg) {
  return [(cfg.base || HF_BASE) + cfg.file, ...(cfg.fallbackBase ? [cfg.fallbackBase + cfg.file] : [])];
}
async function pickModelUrl(cfg) {
  const urls = modelUrls(cfg);
  for (const url of urls) if (await cachedFromUrl(cfg, url)) return url;
  for (const url of urls.slice(0, -1)) {
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
      await r.body?.cancel();
      if (r.ok) return url;
    } catch {}
    console.warn('[tablefolk-wllama3] not reachable, using the next source:', url);
  }
  return urls[urls.length - 1];
}

const MODEL_CONFIG = {
  'minicpm5-1b-wgpu': {
    label: 'MiniCPM5-1B (WebGPU, GGUF)',
    file: 'MiniCPM5-1B-Q4_K_M.gguf',
    size: 688 * 1024 * 1024,
  },
  'minicpm5-1b-wgpu-q8': {
    label: 'MiniCPM5-1B (WebGPU, GGUF Q8_0)',
    file: 'MiniCPM5-1B-Q8_0.gguf',
    size: 1150 * 1024 * 1024,
  },
  'qwen1.5-0.5b': {
    label: 'Qwen1.5 0.5B Chat (WebGPU, GGUF Q4_0)',
    // Mirrored on R2 (same bytes); Hugging Face is the fallback.
    base: 'https://geebr-models.mindroot.io/',
    fallbackBase: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/',
    file: 'qwen1_5-0_5b-chat-q4_0.gguf',   // the quantization Ollama's qwen:0.5b uses
    size: 395 * 1024 * 1024,
    gpuLayers: 99,
    template: 'chatml',
  },
  'qwen2.5-0.5b-q2': {
    label: 'Qwen2.5 0.5B (WebGPU, GGUF Q2_K)',
    base: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/',
    file: 'qwen2.5-0.5b-instruct-q2_k.gguf',
    size: 415 * 1024 * 1024,
    gpuLayers: 99,
    template: 'chatml',
  },
  // Small enough to offload whole; Qwen's own ChatML template (gpt-runner-wllama3.js)
  'qwen2.5-0.5b': {
    label: 'Qwen2.5 0.5B (WebGPU, GGUF Q4_K_M)',
    base: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491 * 1024 * 1024,
    gpuLayers: 99,
    template: 'chatml',
  },
};

// MiniCPM5-1B has 24 layers. wllama 3.x defaults n_gpu_layers to 99999 (ALL of
// them) whenever WebGPU exists, which is exactly the kind of unbounded
// allocation that hard-crashed this machine before. Default to a partial
// offload and let ?gpulayers=N tune it: 0 = CPU only, 24+ = fully on GPU.
const DEFAULT_GPU_LAYERS = 12;

let wllama = null;
let currentModel = null;
let loading = false;

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));
}

export function getCurrentModel() { return currentModel; }
export function isLoaded() { return wllama !== null; }
export function getEngine() { return 'wllama3'; }

export async function getCapabilityInfo() {
  // The renderer already hard-requires WebGPU to boot, so this is really just a
  // sanity check. Report webgpu:true either way so a WebGPU hiccup surfaces as
  // a load error we can read, rather than a generic capability refusal.
  return { webgpu: true, shaderF16: false, cpu: true };
}

function resolveGpuLayers(cfg) {
  const raw = new URLSearchParams(location.search).get('gpulayers');
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= 0 ? n : (cfg.gpuLayers ?? DEFAULT_GPU_LAYERS);
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

  const nGpuLayers = resolveGpuLayers(cfg);
  console.log('[tablefolk-wllama3] loading', cfg.file,
    '| n_gpu_layers=', nGpuLayers, '(0=CPU only, 24+=all layers; override with ?gpulayers=N)',
    '| hardwareConcurrency=', navigator.hardwareConcurrency);

  // JSPI is the hard prerequisite for the WebGPU backend. ggml-webgpu reaches
  // WebGPU through async imports (requestAdapter/requestDevice return
  // Promises), and wasm can only await those if WebAssembly.Suspending exists.
  // wllama ships a stub that no-ops when JSPI is missing - its own comment says
  // "async imports won't be called" - so without JSPI the GPU backend silently
  // never registers and every layer stays on CPU, with no error logged.
  const hasJSPI = typeof WebAssembly.Suspending === 'function';
  console.log('[tablefolk-wllama3] JSPI (WebAssembly.Suspending) available:', hasJSPI);
  if (!hasJSPI && nGpuLayers > 0) {
    console.warn('[tablefolk-wllama3] NO JSPI -> the WebGPU backend cannot initialize and this will run CPU-only ' +
      'regardless of n_gpu_layers. Enable chrome://flags/#enable-experimental-webassembly-jspi (or use Chrome 137+).');
    onProgress?.('WebGPU unavailable (JSPI off) - will run on CPU');
  }
  try {
    const adapter = await navigator.gpu?.requestAdapter?.();
    if (adapter) {
      // ggml-webgpu's WGSL declares `enable chromium_experimental_subgroup_matrix`
      // and calls subgroupMatrixMultiplyAccumulate(). It does NOT use f16 - there
      // is no `enable f16` anywhere in the wasm - so shader-f16 is a red herring.
      // Subgroup-matrix support is the actual gate: without it the backend cannot
      // compile its shaders and silently declines to register, which is exactly
      // the observed "backend_ptrs.size() = 1" (CPU only).
      const feats = [...(adapter.features ?? [])];
      console.log('[tablefolk-wllama3] WebGPU adapter features:', feats);
      console.log('[tablefolk-wllama3] subgroups:', adapter.features?.has?.('subgroups'),
        '| chromium-experimental-subgroup-matrix:', adapter.features?.has?.('chromium-experimental-subgroup-matrix'),
        '| shader-f16:', adapter.features?.has?.('shader-f16'),
        '| maxBufferSize:', adapter.limits?.maxBufferSize);
      try {
        const info = adapter.info ?? (await adapter.requestAdapterInfo?.());
        if (info) console.log('[tablefolk-wllama3] adapter info:', info.vendor, info.architecture, info.device, info.description);
      } catch {}
    } else {
      console.warn('[tablefolk-wllama3] navigator.gpu.requestAdapter() returned no adapter');
    }
  } catch (e) {
    console.warn('[tablefolk-wllama3] WebGPU adapter probe failed:', e?.message);
  }
  onProgress?.(`Loading ${cfg.label} (GPU layers: ${nGpuLayers})...`);

  try {
    const modelUrl = await pickModelUrl(cfg);
    const loadAt = async layers => {
    wllama = new Wllama(WLLAMA3_WASM, { allowOffline: false });
    await wllama.loadModelFromUrl(modelUrl, {
      n_ctx: 4096,
      n_gpu_layers: layers,
      // ?threads=1 forces the single-threaded build. Emscripten's WebGPU and
      // pthreads do not always coexist (WebGPU objects cannot be shared across
      // worker threads), so if ggml-webgpu registers under ?threads=1 but not
      // multi-threaded, the pthread pool is the blocker rather than the GPU's
      // missing shader-f16. Confirm via "backend_ptrs.size()" in the debug log:
      // 1 = CPU only, 2 = WebGPU registered.
      ...(Number(new URLSearchParams(location.search).get('threads')) > 0
        ? { n_threads: Number(new URLSearchParams(location.search).get('threads')) }
        : {}),
      // ?wllamadebug=1 drops llama.cpp to LogLevel.DEBUG (1). At INFO the
      // backend-registration lines are suppressed, so a WebGPU backend that
      // fails to register leaves no trace at all - which is exactly the
      // symptom we are chasing (CPU-only buffers, zero ggml_webgpu output).
      ...(new URLSearchParams(location.search).has('wllamadebug') ? { log_level: 1 } : {}),
      // n_threads omitted on purpose: 3.x already defaults to
      // hardwareConcurrency/2, i.e. physical cores, which is what we want.
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
    };
    // A card too full for the weights: its buffer comes back invalid and the engine
    // aborts ("Invalid Buffer tensor_buf0", seen with 5.4 of 6 GB in use). The CPU is
    // slower (11-13 tok/s against 35-55 for Qwen 0.5B) but it answers.
    let usedLayers = nGpuLayers;
    try { await loadAt(nGpuLayers); }
    catch (e) {
      if (!(nGpuLayers > 0)) throw e;
      console.warn('[tablefolk-wllama3] could not load on the graphics card, trying the CPU:', e?.message);
      globalThis.tablefolkDiag?.note('brain', 'not on the graphics card (' + (e?.message || 'error') + '): trying the processor');
      onProgress?.('Not enough graphics memory: loading on the CPU...');
      Promise.resolve().then(() => wllama?.exit()).catch(() => {});
      usedLayers = 0;
      await loadAt(0);
    }
    currentModel = modelKey;
    globalThis.tablefolkDiag?.note('brain', `${cfg.label} loaded on the ${usedLayers > 0 ? 'graphics card' : 'processor'} (${usedLayers > 0 ? usedLayers + ' layers on the GPU' : 'no WebGPU for it here'})`);
    wllama.tablefolkTemplate = cfg.template || 'minicpm';   // on the instance: the runner may import another copy of this module
    console.log('[tablefolk-wllama3] load complete');
    onProgress?.(`${cfg.label} ready (GPU layers: ${usedLayers})`);
    return wllama;
  } catch (e) {
    wllama = null;
    throw new Error(`Failed to load wllama3 model: ${e.message}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (wllama) { try { wllama.exit(); } catch {} }
  wllama = null;
  currentModel = null;
}

export async function clearModelCache() {
  try { await wllama?.cacheManager?.clear(); } catch (e) {
    console.log('[tablefolk-wllama3] cache clear unavailable:', e?.message);
  }
}

export async function hasModelCached(modelKey) {
  // A Wllama instance does nothing until a model loads; its cache manager
  // reads the browser's storage. Unknown means the download question shows.
  const cfg = MODEL_CONFIG[modelKey]; if (!cfg) return false;
  for (const url of modelUrls(cfg)) if (await cachedFromUrl(cfg, url)) return true;
  return false;
}

export function getCacheBackend() { return 'wllama3-internal'; }
export function setCacheBackend() { return false; }
