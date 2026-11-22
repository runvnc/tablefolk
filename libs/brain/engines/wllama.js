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
import { MIRROR, sources, note } from '../../models/index.js';

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
// the mirror (on tablefolk.world: @tablefolk/models) when the file is there, else Hugging Face
function modelUrls(cfg) {
  return sources({ mirror: cfg.mirrored ? MIRROR + cfg.file : null, hf: (cfg.base || HF_BASE) + cfg.file });
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

// KRAFTON's Raon-1 nano GGUFs need KRAFTON's llama.cpp fork (upstream cannot
// load the raon1_nano architecture yet): a wllama 3.8.1 WASM built against it
// (WebGPU + JSPI, as wllama's own build; brains.md, "Raon-1 nano"). Its files:
// ?raonwasm=<url of wllama.wasm> and ?raonbase=<folder of the split GGUF parts>.
const q = () => new URLSearchParams(globalThis.location?.search || '');
const RAON_WASM = () => q().get('raonwasm') || new URL('./wllama-raon/wllama.wasm', import.meta.url).href;
const RAON_JS = () => q().get('raonjs') || new URL('./wllama-raon/index.js', import.meta.url).href;   // the wllama JS built with that WASM (its glue changed after 3.8.1)
const RAON_BASE = () => q().get('raonbase') || 'https://huggingface.co/KRAFTON/Raon-1-nano-gguf/resolve/main/';
const raon = (quant, parts, gb) => ({
  label: `Raon-1 nano ${quant} (llama.cpp WebGPU)`,
  get base() { return RAON_BASE() + quant + '/'; },
  file: `raon-1-nano-${quant}-00001-of-${String(parts).padStart(5, '0')}.gguf`,
  size: gb * 1024 ** 3,
  gpuLayers: 99,
  template: 'raon',
  ctx: 8192,
  get wasm() { return RAON_WASM(); },
  get js() { return RAON_JS(); },
});

// Inkling 2 Mini and SenseNova-Loop-9B need a newer llama.cpp than wllama 3.8.1 (inkling2_loop, the SenseNova Loop
// PR) and are only fast with our ggml-webgpu patches (cached bind groups, fused kernels): wllama 4.0.0 built against
// llama.cpp 5bacb7c + PR #32588 + tools/wllama-inkling/*.patch (build-fast.sh; brains.md, "Faster in Chrome").
// ?fastwasm= / ?fastjs= override its files. The GGUFs come from Hugging Face at pinned revisions.
const FAST_WASM = () => q().get('fastwasm') || new URL('./wllama-fast/wllama.wasm', import.meta.url).href;
const FAST_JS = () => q().get('fastjs') || new URL('./wllama-fast/index.js', import.meta.url).href;
const fast = cfg => ({
  gpuLayers: 99,
  ctx: 8192,
  // what the speed was measured with: 512-token batches, flash attention
  // no context checkpoints: restoring one aborted the wasm 2-3 minutes into a village day (in
  // llama_io_read_host -> ggml_backend_tensor_set_n, with 32 or 3 a slot; brains.md, "Inkling 2 Mini in the game,
  // in Chrome"). Without them each slot still extends its own cached prompt; ?wckpt=N to try again.
  loadOpts: { n_batch: 512, n_ubatch: 512, flash_attn: true, n_ctx_checkpoints: 0 },
  // stop strings handled by llama.cpp (no cancelled streams). Priming the shared prefix first (prime: true)
  // only helps with checkpoints: measured 5.8 s against 5.2 s a turn without them (?wprime=1 to force it)
  serverStops: true,
  prime: false,
  get wasm() { return FAST_WASM(); },
  get js() { return FAST_JS(); },
  ...cfg,
});

const MODEL_CONFIG = {
  // Thinking Machines' Inkling 2 Mini (26.4B looped MoE): AtomicChat's AD-IQ2_M, ~10.5 GB on the card
  'inkling2-mini-wllama': fast({
    label: 'Inkling 2 Mini AD-IQ2_M (llama.cpp WebGPU)',
    base: 'https://huggingface.co/AtomicChat/Inkling-2-Mini-GGUF/resolve/4f0c56af7e0c242e620be6394983d245b8c3fd27/',
    file: 'Inkling-2-Mini-AD-IQ2_M.gguf',
    size: 8665091680,
    template: 'inkling',
  }),
  // drofn's 8GB-64K file (6.62 GB, ~8.9 GB on the card natively): for 12 GB cards
  'inkling2-mini-small-wllama': fast({
    label: 'Inkling 2 Mini 8GB-64K (llama.cpp WebGPU)',
    base: 'https://huggingface.co/drofn/Inkling-2-Mini-8GB-GGUF/resolve/1101a9e52698296910262e191abde703e4f9e2ea/',
    file: 'Inkling-2-Mini-8GB-64K.gguf',
    size: 6623451456,
    template: 'inkling',
  }),
  // SenseTime's SenseNova-Loop-9B: AtomicChat's AD-Q4_K_M (loads on the PR #32588 graph)
  'sensenova-loop-9b-wllama': fast({
    label: 'SenseNova-Loop-9B AD-Q4_K_M (llama.cpp WebGPU)',
    base: 'https://huggingface.co/AtomicChat/SenseNova-Loop-9B-GGUF/resolve/6c661668960d4f50a2b0bbc63feb0b971255cd71/',
    file: 'SenseNova-Loop-9B-AD-Q4_K_M.gguf',
    size: 5960615008,
    template: 'qwen-nothink',
  }),
  'raon1-nano-q4-wllama': raon('Q4_K_M', 5, 1.94),
  'raon1-nano-q6-wllama': raon('Q6_K', 5, 2.46),
  'raon1-nano-q8-wllama': raon('Q8_0', 6, 3.16),
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
    // Mirrored on R2 (same bytes) for tablefolk.world; Hugging Face elsewhere and as the fallback.
    mirrored: true,
    base: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/',
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
    const W = cfg.js ? (await import(cfg.js)).Wllama : Wllama;
    wllama = new W(cfg.wasm ? { default: cfg.wasm } : WLLAMA3_WASM, { allowOffline: false });
    await wllama.loadModelFromUrl(modelUrl, {
      ...(cfg.loadOpts || {}),
      ...(q().get('wpar') ? { n_parallel: +q().get('wpar') } : {}),   // ?wpar=N: llama.cpp server slots (wllama 4 default 4)
      ...(q().get('wckpt') ? { n_ctx_checkpoints: +q().get('wckpt') } : {}),   // ?wckpt=N: checkpoints a slot
      n_ctx: cfg.ctx || 4096,
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
      note('brain', 'not on the graphics card (' + (e?.message || 'error') + '): trying the processor');
      onProgress?.('Not enough graphics memory: loading on the CPU...');
      Promise.resolve().then(() => wllama?.exit()).catch(() => {});
      usedLayers = 0;
      await loadAt(0);
    }
    currentModel = modelKey;
    note('brain', `${cfg.label} loaded on the ${usedLayers > 0 ? 'graphics card' : 'processor'} (${usedLayers > 0 ? usedLayers + ' layers on the GPU' : 'no WebGPU for it here'})`);
    wllama.tablefolkTemplate = cfg.template || 'minicpm';   // on the instance: the runner may import another copy of this module
    wllama.tablefolkPrime = !!cfg.prime || q().get('wprime') === '1';
    wllama.tablefolkServerStops = !!cfg.serverStops;
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
