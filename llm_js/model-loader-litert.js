// LiteRT-LM model loader for Gemma 4 E2B (.litertlm format with PLE memory mapping).
// Uses @litert-lm/core with WebGPU acceleration.
// PLE (Per-Layer Embeddings) are memory-mapped, keeping in-memory footprint ~0.8GB
// while 1.12GB of embedding parameters stay on disk/OPFS.
// Implements OPFS caching to avoid re-downloading 2GB on each page load.
import { Engine } from "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.14.0/+esm";

const MODEL_CONFIG = {
  'gemma4-e2b-litert': {
    label: 'Gemma 4 E2B (LiteRT-LM)',
    modelUrl: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    vram: '~0.8GB in-memory (PLE memory-mapped)',
  },
};

let engine = null;
let currentModel = null;
let loading = false;

// OPFS cache helpers
async function getCachedModelFile(modelKey) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`);
    const file = await fileHandle.getFile();
    if (!file.size) {
      await root.removeEntry(`litert-${modelKey}.litertlm`);
      return null;
    }
    return file;
  } catch {
    return null; // not cached
  }
}

function formatBytes(bytes) {
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function reportDownloadProgress(onProgress, received, total, startedAt, force = false) {
  const now = performance.now();
  if (!force && now - reportDownloadProgress.lastReport < 150) return;
  reportDownloadProgress.lastReport = now;
  const elapsed = Math.max((now - startedAt) / 1000, 0.001);
  const speed = received / elapsed;
  if (total > 0) {
    const percent = Math.min(100, (received / total) * 100);
    const remaining = Math.max(0, total - received);
    const eta = speed > 0 ? Math.ceil(remaining / speed) : null;
    onProgress?.({
      phase: 'download',
      percent,
      receivedBytes: received,
      totalBytes: total,
      text: `Downloading model: ${percent.toFixed(1)}% · ${formatBytes(received)} / ${formatBytes(total)}${eta !== null ? ` · about ${eta}s left` : ''}`,
    });
  } else {
    onProgress?.({
      phase: 'download',
      receivedBytes: received,
      totalBytes: null,
      text: `Downloading model: ${formatBytes(received)} received`,
    });
  }
}
reportDownloadProgress.lastReport = 0;

async function downloadModelToOPFS(modelKey, modelUrl, onProgress) {
  let root = null;
  let writable = null;
  try {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    if (!response.body) throw new Error('Download response has no readable body');

    root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`, { create: true });
    writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    let received = 0;
    const startedAt = performance.now();
    reportDownloadProgress.lastReport = 0;
    reportDownloadProgress(onProgress, 0, contentLength, startedAt, true);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      reportDownloadProgress(onProgress, received, contentLength, startedAt);
    }
    await writable.close();
    writable = null;
    reportDownloadProgress(onProgress, received, contentLength || received, startedAt, true);
    onProgress?.({ phase: 'download', percent: 100, text: `Download complete · ${formatBytes(received)} cached on this device` });
    return await fileHandle.getFile();
  } catch (e) {
    try { await writable?.abort(); } catch {}
    try { await root?.removeEntry(`litert-${modelKey}.litertlm`); } catch {}
    throw e;
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
  return engine !== null;
}

export function getEngine() {
  return 'litert-lm';
}

export async function getCapabilityInfo() {
  const webgpu = !!navigator.gpu;
  let shaderF16 = false;
  if (webgpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      shaderF16 = !!adapter?.features?.has('shader-f16');
    } catch {}
  }
  return { webgpu, shaderF16 };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (engine && currentModel === modelKey) return engine;
  if (loading) return;

  // Unload previous if any
  if (engine) {
    try { engine.delete(); } catch {}
    engine = null;
  }
  currentModel = null;
  loading = true;

  onProgress?.('Loading LiteRT-LM...');
  onProgress?.(`Model: ${cfg.label}`);

  try {
    // Try OPFS cache first
    onProgress?.('Checking OPFS cache...');
    let modelFile = await getCachedModelFile(modelKey);

    if (modelFile) {
      onProgress?.({ phase: 'initialize', text: `Loading ${formatBytes(modelFile.size)} from device cache...` });
    } else {
      onProgress?.({ phase: 'download', percent: 0, text: 'Starting first-time model download...' });
      modelFile = await downloadModelToOPFS(modelKey, cfg.modelUrl, onProgress);
    }

    onProgress?.({ phase: 'initialize', percent: 100, text: 'Download complete · initializing local brain...' });
    engine = await Engine.create({
      model: modelFile.stream(),
      mainExecutorSettings: {
        maxNumTokens: 8192,
      },
    });
    currentModel = modelKey;
    onProgress?.('Gemma 4 E2B ready (LiteRT-LM)');
    return engine;
  } catch (e) {
    throw new Error(`Failed to load LiteRT-LM model: ${e.message}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (engine) {
    try { engine.delete(); } catch {}
  }
  engine = null;
  currentModel = null;
}

export async function clearModelCache(modelKey) {
  const key = modelKey || 'gemma4-e2b-litert';
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(`litert-${key}.litertlm`);
    console.log('OPFS cache cleared for', key);
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}

export async function hasModelCached(modelKey) {
  const key = modelKey || 'gemma4-e2b-litert';
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${key}.litertlm`);
    const file = await fileHandle.getFile();
    // A failed/interrupted download can leave a zero-byte OPFS entry.
    return file.size > 0;
  } catch {
    return false;
  }
}

export function getCacheBackend() {
  return 'opfs';
}

export function setCacheBackend() {
  return false;
}
