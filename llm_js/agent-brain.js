import { loadModel as loadModelWebLLM, getCapabilityInfo as getCapWebLLM } from './model-loader.js';
import { generate as generateWebLLM } from './gpt-runner.js';
import { loadModel as loadModelTJS, getCapabilityInfo as getCapTJS } from './model-loader-tjs.js';
import { generate as generateTJS, createTJSEngine } from './gpt-runner-tjs.js';
import { loadModel as loadModelLiteRT, getCapabilityInfo as getCapLiteRT } from './model-loader-litert.js';
import { generate as generateLiteRT, createLiteRTEngine } from './gpt-runner-litert.js';
import { getBuiltInResponseFormat, getGrammarInstruction, buildDynamicGrammar } from './grammar.js';

const SUPPORTED_MODELS = {
  'gemma4-e2b-litert': { label: 'Gemma 4 E2B (LiteRT-LM)', engine: 'litert-lm' },
  'minicpm5-1b': { label: 'MiniCPM5-1B (WebLLM)', engine: 'webllm' },
};

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function firstCommandLine(text) {
  return String(text || '')
    // Strip markdown code fences
    .replace(/```[a-z]*\n?/gi, '\n')
    .replace(/```/g, '\n')
    // Strip leading/trailing whitespace per line
    .split('\n')
    .map(x => x.trim())
    // Filter out empty lines and pure markdown artifacts
    .filter(x => x && x !== '```' && !x.match(/^[`*#]+$/))
    .filter(Boolean)[0] || '';
}

export function createAgentBrainManager(config = {}) {
  let engine = null;
  let loaded = false;
  let currentModelKey = config.modelKey || 'gemma4-e2b-litert';
  const onStatus = config.onStatus || (() => {});
  const onDebug = config.onDebug || (() => {});

  function getEngineType() {
    return SUPPORTED_MODELS[currentModelKey]?.engine || 'webllm';
  }

  async function load() {
    if (loaded && engine) return engine;
    onStatus('checking WebGPU...');
    console.log('[tablefolk-brain] load() starting, model:', currentModelKey, 'engine type:', getEngineType());
    const getCap = getEngineType() === 'transformers.js' ? getCapTJS
      : getEngineType() === 'litert-lm' ? getCapLiteRT
      : getCapWebLLM;
    const cap = await getCap();
    if (!cap.webgpu) throw new Error('WebGPU unavailable; use Chrome/Edge with WebGPU enabled.');

    const loadFn = getEngineType() === 'transformers.js' ? loadModelTJS
      : getEngineType() === 'litert-lm' ? loadModelLiteRT
      : loadModelWebLLM;
    console.log('[tablefolk-brain] calling loadFn...');
    const result = await loadFn(currentModelKey, msg => onStatus(msg));
    console.log('[tablefolk-brain] loadFn returned:', typeof result);

    // Wrap the model into a chat-compatible engine
    if (getEngineType() === 'transformers.js' && result.model && result.processor) {
      engine = createTJSEngine(result.model, result.processor);
    } else if (getEngineType() === 'litert-lm') {
      console.log('[tablefolk-brain] creating LiteRT engine wrapper...');
      engine = createLiteRTEngine(result);
      console.log('[tablefolk-brain] LiteRT engine wrapper created');
    } else {
      engine = result;
    }

    loaded = true;
    console.log('[tablefolk-brain] load() complete, loaded=true');
    onStatus(`${SUPPORTED_MODELS[currentModelKey]?.label || currentModelKey} ready`);
    return engine;
  }

  async function decide(agent) {
    if (!engine) await load();
    const onToken = agent.onToken ?? null;
    const useGrammar = agent.useGrammar !== false;
    let responseFormat = null;
    let constraintInstruction = '';
    if (useGrammar) {
      const allowed = agent.allowedCommands || [];
      const allowedSet = new Set(Array.isArray(allowed) ? allowed : []);
      const dyn = buildDynamicGrammar(allowedSet);
      responseFormat = dyn.responseFormat;
      constraintInstruction = dyn.instruction;
    }
    console.log('---------------------------------- messages fed to LLM ------------------------------')
    console.log(agent.messages)

    const generateFn = getEngineType() === 'transformers.js' ? generateTJS
      : getEngineType() === 'litert-lm' ? generateLiteRT
      : generateWebLLM;

    const text = await generateFn(engine, '', {
      maxTokens: agent.maxTokens || 48,
      temperature: agent.temperature ?? 0,
      frequencyPenalty: agent.frequencyPenalty ?? 0.15,
      responseFormat,
      constraintInstruction,
      messages: agent.messages || [],
      enableThinking: agent.enableThinking ?? false,
      onToken: onToken,
      debugLog: (msg, data) => onDebug(msg, data),
    });
    const line = firstCommandLine(text);
    onDebug('decision', { agentId: agent.agentId, text, line });
    return line;
  }

  function setModel(modelKey) {
    if (!SUPPORTED_MODELS[modelKey]) return false;
    if (currentModelKey === modelKey && loaded) return true;
    // Unload current engine if switching
    if (loaded && engine) {
      try { engine.unload?.(); } catch {}
      engine = null;
      loaded = false;
    }
    currentModelKey = modelKey;
    return true;
  }

  function getModelKey() {
    return currentModelKey;
  }

  return {
    modelKey: currentModelKey,
    load,
    decide,
    isLoaded: () => loaded,
    setModel,
    getModelKey,
    getSupportedModels: () => Object.entries(SUPPORTED_MODELS).map(([key, cfg]) => ({ key, label: cfg.label })),
  };
}
