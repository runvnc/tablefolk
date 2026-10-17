// WebLLM model loader with WebGPU capability detection and fallback.
// Uses IndexedDB cache backend by default to avoid Cache API ERR_FAILED 200
// issues with HuggingFace Xet/CAS CDN. Browser downloads directly from HF,
// no server-side proxy needed.
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_VARIANTS = {
  'qwen3.5-0.8b': {
    label: 'Qwen3.5-0.8B',
    f16: { modelId: 'Qwen3.5-0.8B-q4f16_1-MLC', vram: '1.6GB' },
    f32: { modelId: 'Qwen3.5-0.8B-q4f32_1-MLC', vram: '1.9GB' },
  },
  'minicpm5-1b': {
    label: 'MiniCPM5-1B',
    custom: true,
    modelId: 'minicpm5-q4f32_1-MLC',
    vram: '1.2GB',
    model: '/minicpm5/webllm/resolve/main/',
    modelLib: '/minicpm5/webllm/minicpm5-q4f32_1-MLC-webgpu.wasm',
    overrides: { context_window_size: 4096 },
  },
};

let engine = null;
let currentModel = null;
let loading = false;
let hasShaderF16 = null;

// Cache backend preference: 'indexeddb' (default, most reliable for large files),
// 'opfs' (faster on supported browsers), or 'cache' (Cache API, may hit ERR_FAILED 200).
function getPreferredCacheBackend() {
  try {
    const stored = localStorage.getItem('tablefolk_cache_backend');
    if (stored === 'opfs' || stored === 'indexeddb' || stored === 'cache') return stored;
  } catch {}
  return 'indexeddb';
}

function forceF32Mode() {
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.has('f32') || localStorage.getItem('tablefolk_force_f32') === '1';
  } catch {
    return false;
  }
}

async function detectShaderF16() {
  if (hasShaderF16 !== null) return hasShaderF16;
  if (!navigator.gpu) return (hasShaderF16 = false);
  try {
    const adapter = await navigator.gpu.requestAdapter();
    hasShaderF16 = !!adapter?.features?.has('shader-f16');
    return hasShaderF16;
  } catch {
    hasShaderF16 = false;
    return false;
  }
}

function getBestVariant(modelKey) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) return null;
  if (model.custom) return { ...model, variant: 'custom' };
  if (forceF32Mode()) return { ...model.f32, variant: 'f32' };
  return hasShaderF16 === true ? { ...model.f16, variant: 'f16' } : { ...model.f32, variant: 'f32' };
}

function getFallbackVariant(modelKey) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) return null;
  if (model.custom) return null;
  if (forceF32Mode()) return hasShaderF16 === true ? { ...model.f16, variant: 'f16' } : null;
  return hasShaderF16 === true ? { ...model.f32, variant: 'f32' } : { ...model.f16, variant: 'f16' };
}

export function getAvailableModels() {
  return Object.entries(MODEL_VARIANTS).map(([key, cfg]) => ({ key, label: cfg.label }));
}

export function getCurrentModel() {
  return currentModel;
}

export function getCacheBackend() {
  return getPreferredCacheBackend();
}

export function setCacheBackend(backend) {
  if (backend === 'indexeddb' || backend === 'opfs' || backend === 'cache') {
    try { localStorage.setItem('tablefolk_cache_backend', backend); } catch {}
    return true;
  }
  return false;
}

export async function clearModelCache(modelKey) {
  const key = modelKey || 'qwen3.5-0.8b';
  const model = MODEL_VARIANTS[key];
  if (!model) return;
  const backend = getPreferredCacheBackend();
  const appConfig = webllm.prebuiltAppConfig;
  appConfig.cacheBackend = backend;
  if (model.custom) {
    try {
      await webllm.deleteModelAllInfoInCache(model.modelId, appConfig);
    } catch (e) {
      console.warn('cache clear failed for', model.modelId, e);
    }
    return;
  }
  // Clear both f16 and f32 variants
  for (const v of [model.f16, model.f32]) {
    try {
      await webllm.deleteModelAllInfoInCache(v.modelId, appConfig);
    } catch (e) {
      console.warn('cache clear failed for', v.modelId, e);
    }
  }
}

export async function hasModelCached(modelKey) {
  const key = modelKey || 'qwen3.5-0.8b';
  const model = MODEL_VARIANTS[key];
  if (!model) return false;
  const backend = getPreferredCacheBackend();
  const appConfig = webllm.prebuiltAppConfig;
  appConfig.cacheBackend = backend;
  const variant = getBestVariant(key);
  try {
    return await webllm.hasModelInCache(variant.modelId, appConfig);
  } catch {
    return false;
  }
}

export async function loadModel(modelKey, onProgress) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);
  if (engine && currentModel === modelKey) return engine;
  if (loading) return;

  if (engine) {
    try { engine.unload(); } catch {}
    engine = null;
  }
  currentModel = null;
  loading = true;
  await detectShaderF16();
  const variant = getBestVariant(modelKey);
  const backend = getPreferredCacheBackend();
  onProgress?.(`Selected ${variant.variant.toUpperCase()} variant (${variant.vram})${forceF32Mode() ? ' via f32 safe mode' : ''}`);
  onProgress?.(`Cache backend: ${backend}`);
  try {
    engine = await tryLoadVariant(variant, backend, onProgress);
    currentModel = modelKey;
    onProgress?.('Ready');
    return engine;
  } catch (e) {
    // If cache backend fails, try falling back to another backend
    const fallbackBackend = backend === 'indexeddb' ? 'cache' : 'indexeddb';
    onProgress?.(`${backend} failed: ${e.message}. Trying ${fallbackBackend}...`);
    try {
      setCacheBackend(fallbackBackend);
      engine = await tryLoadVariant(variant, fallbackBackend, onProgress);
      currentModel = modelKey;
      onProgress?.(`Ready (fallback: ${fallbackBackend})`);
      return engine;
    } catch (e2) {
      // Last resort: try the model variant fallback (f16<->f32)
      const fallback = getFallbackVariant(modelKey);
      if (fallback && fallback.modelId !== variant.modelId) {
        onProgress?.(`${variant.variant.toUpperCase()} failed: ${e2.message}. Trying ${fallback.variant.toUpperCase()}...`);
        engine = await tryLoadVariant(fallback, fallbackBackend, onProgress);
        currentModel = modelKey;
        onProgress?.('Ready (model fallback)');
        return engine;
      }
      throw e2;
    }
  } finally {
    loading = false;
  }
}

async function tryLoadVariant(variant, cacheBackend, onProgress) {
  onProgress?.(`Initializing WebLLM (${variant.variant}, ${cacheBackend})...`);
  const appConfig = webllm.prebuiltAppConfig;
  appConfig.cacheBackend = cacheBackend;
  if (cacheBackend === 'opfs') {
    appConfig.opfsAccessMode = 'auto';
  }
  // For custom models, add the model record to the model list
  if (variant.custom) {
    const base = window.location.origin;
    appConfig.model_list = [{
      model: base + variant.model,
      model_id: variant.modelId,
      model_lib: base + variant.modelLib,
      vram_required_MB: 1200,
      low_resource_required: true,
      overrides: variant.overrides || {},
    }];
  }
  return await webllm.CreateMLCEngine(variant.modelId, {
    initProgressCallback: (progress) => { if (progress.text) onProgress?.(progress.text); },
    appConfig: appConfig,
  });
}

export function isLoaded() { return engine !== null; }
export function unloadModel() { if (engine) { try { engine.unload(); } catch {} } engine = null; currentModel = null; }
export function getEngine() { return engine; }
export async function getCapabilityInfo() { await detectShaderF16(); return { webgpu: !!navigator.gpu, shaderF16: hasShaderF16 }; }
