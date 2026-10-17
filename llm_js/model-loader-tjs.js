// Transformers.js v4 model loader for Gemma 4 E2B (multimodal: text + image + audio).
// Alternative engine alongside WebLLM (model-loader.js).
// Uses @huggingface/transformers with WebGPU acceleration.
// Defaults to q4 (4-bit weights, 32-bit activations) to avoid shader-f16 issues
// on older GPUs like RTX 2060. Falls back to CPU if WebGPU fails.
import * as transformers from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

const MODEL_CONFIG = {
  'gemma4-e2b': {
    label: 'Gemma 4 E2B (Transformers.js)',
    modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    dtype: 'q4',       // 4-bit weights, 32-bit activations - safe for GPUs without shader-f16
    vram: '~2GB',
  },
};

let processor = null;
let model = null;
let currentModel = null;
let loading = false;
let hasShaderF16 = null;

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

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({
    key,
    label: cfg.label,
  }));
}

export function getCurrentModel() {
  return currentModel;
}

export function isLoaded() {
  return model !== null && processor !== null;
}

export function getEngine() {
  return 'transformers.js';
}

export async function getCapabilityInfo() {
  await detectShaderF16();
  return { webgpu: !!navigator.gpu, shaderF16: hasShaderF16 };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (model && processor && currentModel === modelKey) return { model, processor };
  if (loading) return;

  // Unload previous if any
  if (model) {
    try { model.dispose?.(); } catch {}
    model = null;
    processor = null;
  }
  currentModel = null;
  loading = true;

  await detectShaderF16();
  // Use q4f16 only if shader-f16 is available, otherwise q4 (32-bit activations)
  const dtype = hasShaderF16 ? 'q4f16' : 'q4';

  onProgress?.('Loading Transformers.js v4...');
  onProgress?.(`Model: ${cfg.label} (dtype: ${dtype}${!hasShaderF16 ? ' [no shader-f16]' : ''})`);

  try {
    onProgress?.('Downloading processor/tokenizer...');
    processor = await transformers.AutoProcessor.from_pretrained(cfg.modelId, {
      progress_callback: (info) => {
        if (info.status === 'progress') {
          onProgress?.(`Tokenizer: ${Math.round(info.progress || 0)}%`);
        } else if (info.status === 'ready') {
          onProgress?.('Tokenizer ready');
        }
      },
    });

    onProgress?.('Downloading model weights (this may take a while on first load)...');
    model = await transformers.Gemma4ForConditionalGeneration.from_pretrained(cfg.modelId, {
      dtype: dtype,
      device: 'webgpu',
      progress_callback: (info) => {
        if (info.status === 'progress') {
          onProgress?.(`Model: ${Math.round(info.progress || 0)}%`);
        } else if (info.status === 'ready') {
          onProgress?.('Model weights loaded');
        } else if (info.status === 'initiate') {
          onProgress?.(`Downloading: ${info.file || ''}`);
        }
      },
    });

    currentModel = modelKey;
    onProgress?.('Gemma 4 E2B ready');
    return { model, processor };
  } catch (e) {
    // Try CPU fallback if WebGPU fails
    onProgress?.(`WebGPU failed: ${e.message}. Trying CPU (q4)...`);
    try {
      model = await transformers.Gemma4ForConditionalGeneration.from_pretrained(cfg.modelId, {
        dtype: 'q4',
        device: 'cpu',
        progress_callback: (info) => {
          if (info.status === 'progress') {
            onProgress?.(`Model (CPU): ${Math.round(info.progress || 0)}%`);
          }
        },
      });
      currentModel = modelKey;
      onProgress?.('Gemma 4 E2B ready (CPU fallback)');
      return { model, processor };
    } catch (e2) {
      throw new Error(`Failed to load model: ${e.message} / CPU fallback: ${e2.message}`);
    }
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (model) {
    try { model.dispose?.(); } catch {}
  }
  model = null;
  processor = null;
  currentModel = null;
}

export async function clearModelCache() {
  // Transformers.js uses browser cache automatically; no explicit cache clear API
  // Could use caches.delete() but that's browser-specific
  console.log('Transformers.js cache clear not implemented - browser manages cache');
}

export async function hasModelCached() {
  // Transformers.js doesn't expose a simple cache check
  return false;
}

export function getCacheBackend() {
  return 'browser';
}

export function setCacheBackend() {
  return false;
}
