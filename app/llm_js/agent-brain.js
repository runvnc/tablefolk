import { loadModel as loadModelWebLLM, getCapabilityInfo as getCapWebLLM } from './model-loader.js?v=20261018a';
import { generate as generateWebLLM } from './gpt-runner.js?v=20261018a';
import { loadModel as loadModelTJS, getCapabilityInfo as getCapTJS } from './model-loader-tjs-v2.js?v=20261025c';
import { generate as generateTJS, createTJSEngine } from './gpt-runner-tjs.js?v=20261025b';
import { loadModel as loadModelLiteRT, getCapabilityInfo as getCapLiteRT } from './model-loader-litert.js?v=20261025i';
import { generate as generateLiteRT, createLiteRTEngine, clearLiteRTConversations } from './gpt-runner-litert.js?v=20261025h';
import { loadModel as loadModelWllama, getCapabilityInfo as getCapWllama } from './model-loader-wllama.js?v=20261018a';
import { generate as generateWllama, createWllamaEngine } from './gpt-runner-wllama.js?v=20261018a';
import { loadModel as loadModelWllama3, getCapabilityInfo as getCapWllama3 } from './model-loader-wllama3.js?v=20261018a';
import { generate as generateWllama3, createWllama3Engine } from './gpt-runner-wllama3.js?v=20261018a';
import { OpenAI, collect } from './openai-client.js?v=20261024a';
import { getBuiltInResponseFormat, getGrammarInstruction, buildDynamicGrammar } from './grammar.js?v=20261018a';

// hidden: kept working but not offered in the model picker (MiniCPM retired
// from the UI 2026-10-11). Still reachable with ?model=<key>.
const SUPPORTED_MODELS = {
  'minicpm5-1b': { label: 'MiniCPM5-1B (CPU)', engine: 'wllama', size: '~690 MB', hidden: true },
  'minicpm5-1b-q8': { label: 'MiniCPM5-1B (CPU, Q8_0)', engine: 'wllama', size: '~1.15 GB', hidden: true },
  'minicpm5-1b-wgpu': { label: 'MiniCPM5-1B (WebGPU GGUF)', engine: 'wllama3', size: '~690 MB', hidden: true },
  'minicpm5-1b-wgpu-q8': { label: 'MiniCPM5-1B (WebGPU GGUF Q8_0)', engine: 'wllama3', size: '~1.15 GB', hidden: true },
  'minicpm5-1b-gpu': { label: 'MiniCPM5-1B (GPU/WebGPU)', engine: 'transformers.js', size: '~1.4 GB', hidden: true },
  'gemma4-e2b-litert': { label: 'Gemma 4 E2B (LiteRT-LM)', engine: 'litert-lm', size: '~2 GB' },
  'gemma4-e4b-litert': { label: 'Gemma 4 E4B (LiteRT-LM, larger)', engine: 'litert-lm', size: '~3 GB' },
  // NVIDIA's post-trained Gemma 4 E4B: takes the E4B's place once its
  // .litertlm is on R2 (tools/convert-litertlm.sh); hidden until then.
  'nemotron-bolt-e4b-litert': { label: 'Nemotron 3.5 Bolt E4B (LiteRT-LM, larger)', engine: 'litert-lm', size: '~3 GB', hidden: true },
  // Prism ML's ternary Bonsai (Qwen3 based): small downloads; experimental,
  // not tested on every graphics card
  'bonsai-1.7b-litert': { label: 'Ternary Bonsai 1.7B (LiteRT-LM)', engine: 'litert-lm', size: '~0.8 GB', hidden: true },   // loads on the nightly engine, but a system message breaks its template and the GPU answers "!!!!" (2026-10-25, RTX 2060)
  'bonsai-8b-litert': { label: 'Ternary Bonsai 8B (LiteRT-LM)', engine: 'litert-lm', size: '~2.6 GB', hidden: true },
  // Prism ML's 1-bit Bonsai on Transformers.js (the webml-community demo's way)
  'bonsai-1.7b-onnx': { label: 'Bonsai 1-bit 1.7B (Transformers.js, tiny; experimental)', engine: 'transformers.js', size: '~0.3 GB' },
  // The full multimodal E2B: characters really see when they look
  'gemma4-e2b-vision': { label: 'Gemma 4 E2B with sight: characters see when they look (needs a 6 GB graphics card)', engine: 'litert-lm', size: '~2.6 GB', vision: true },
  // Any OpenAI-compatible server (settings: Brain options > endpoint). No
  // download; by default this Tablefolk server's /api/llm proxy.
  'endpoint': { label: 'OpenAI-compatible endpoint', engine: 'openai', size: 'remote' },
};

// The endpoint brain's settings: ?llm=<baseURL>&llmModel=<model> override,
// else what was saved in this browser, else this server's proxy.
export function getEndpointConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('tablefolk_llm_endpoint') || '{}') || {}; } catch {}
  const qs = new URLSearchParams(location.search);
  const baseURL = qs.get('llm') || saved.baseURL || '/api/llm/v1';
  return { baseURL: new URL(baseURL, location.href).href.replace(/\/+$/, ''), apiKey: saved.apiKey || '', model: qs.get('llmModel') || saved.model || '' };
}
export function setEndpointConfig(cfg) {
  try { localStorage.setItem('tablefolk_llm_endpoint', JSON.stringify({ baseURL: cfg.baseURL || '', apiKey: cfg.apiKey || '', model: cfg.model || '' })); } catch {}
}

function createEndpointEngine() {
  const cfg = getEndpointConfig();
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  return { client, model: cfg.model, unload() {} };
}

async function generateEndpoint(engine, _prompt, opts = {}) {
  const fresh = getEndpointConfig();
  // Settings may change between turns; rebuild the client when they do.
  if (fresh.baseURL !== engine.client.baseURL || fresh.apiKey !== engine.client.apiKey) Object.assign(engine, createEndpointEngine());
  const body = { model: fresh.model || undefined, messages: opts.messages || [], max_tokens: opts.maxTokens ?? 256, temperature: opts.temperature ?? 0.7, stream: true };
  if (opts.dryRun) return '';
  const started = performance.now();
  const out = await collect(await engine.client.chat.completions.create(body), opts.onToken ? text => opts.onToken(text, true) : null);
  opts.debugLog?.('endpoint finished', { ms: Math.round(performance.now() - started), finish: out.finish_reason, usage: out.usage });
  return out.text;
}
const DEFAULT_MODEL = 'gemma4-e2b-litert';

// Default model is Gemma 4 E2B. ?model=<key> picks any model, hidden ones
// included; a remembered choice (localStorage tablefolk_model) only counts if
// that model is still offered in the picker.
function resolveDefaultModel() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromQs = qs.get('model');
    if (fromQs && SUPPORTED_MODELS[fromQs]) return fromQs;
    const stored = localStorage.getItem('tablefolk_model');
    if (stored && SUPPORTED_MODELS[stored] && !SUPPORTED_MODELS[stored].hidden) return stored;
  } catch {}
  return DEFAULT_MODEL;
}

function persistModelChoice(key) {
  try { localStorage.setItem('tablefolk_model', key); } catch {}
}

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function commandLines(text) {
  // Keep every plausible command line (multi-command plans); the downstream
  // parser (parseLLMCommandLine) decides what is actually a command.
  return String(text || '')
    // Strip markdown code fences
    .replace(/```[a-z]*\n?/gi, '\n')
    .replace(/```/g, '\n')
    .split('\n')
    .map(x => x.trim())
    // Filter out empty lines and pure markdown artifacts
    .filter(x => x && x !== '```' && !x.match(/^[`*#]+$/))
    .filter(Boolean)
    .join('\n');
}

export function createAgentBrainManager(config = {}) {
  let engine = null;
  let loaded = false;
  let currentModelKey = config.modelKey || resolveDefaultModel();
  const onStatus = config.onStatus || (() => {});
  const onDebug = config.onDebug || (() => {});

  function getEngineType() {
    return SUPPORTED_MODELS[currentModelKey]?.engine || 'webllm';
  }

  async function load() {
    if (loaded && engine) return engine;
    if (getEngineType() === 'openai') {
      engine = createEndpointEngine();
      loaded = true;
      onStatus(`endpoint ready: ${engine.client.baseURL}${engine.model ? ' (' + engine.model + ')' : ''}`);
      return engine;
    }
    onStatus('checking WebGPU...');
    console.log('[tablefolk-brain] load() starting, model:', currentModelKey, 'engine type:', getEngineType());
    const getCap = getEngineType() === 'transformers.js' ? getCapTJS
      : getEngineType() === 'litert-lm' ? getCapLiteRT
      : getEngineType() === 'wllama' ? getCapWllama
      : getEngineType() === 'wllama3' ? getCapWllama3
      : getCapWebLLM;
    const cap = await getCap();
    if (!cap.webgpu) throw new Error('WebGPU unavailable; use Chrome/Edge with WebGPU enabled.');

    const loadFn = getEngineType() === 'transformers.js' ? loadModelTJS
      : getEngineType() === 'litert-lm' ? loadModelLiteRT
      : getEngineType() === 'wllama' ? loadModelWllama
      : getEngineType() === 'wllama3' ? loadModelWllama3
      : loadModelWebLLM;
    console.log('[tablefolk-brain] calling loadFn...');
    const result = await loadFn(currentModelKey, status => onStatus(status));
    console.log('[tablefolk-brain] loadFn returned:', typeof result);

    // Wrap the model into a chat-compatible engine
    if (getEngineType() === 'transformers.js' && result.model && result.processor) {
      engine = createTJSEngine(result.model, result.processor);
    } else if (getEngineType() === 'litert-lm') {
      console.log('[tablefolk-brain] creating LiteRT engine wrapper...');
      engine = createLiteRTEngine(result);
      console.log('[tablefolk-brain] LiteRT engine wrapper created');
    } else if (getEngineType() === 'wllama') {
      console.log('[tablefolk-brain] creating wllama engine wrapper...');
      engine = createWllamaEngine(result);
      console.log('[tablefolk-brain] wllama engine wrapper created');
    } else if (getEngineType() === 'wllama3') {
      console.log('[tablefolk-brain] creating wllama3 (WebGPU) engine wrapper...');
      engine = createWllama3Engine(result);
      console.log('[tablefolk-brain] wllama3 engine wrapper created');
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
    // Constrained decoding (GBNF) is OFF by default. It only ever applied to the
    // wllama engines; the Transformers.js and LiteRT paths ignore responseFormat
    // entirely, so for Gemma 4 E2B this is inert either way. Turning it off
    // keeps the prompt free of the extra constraint instruction and removes a
    // whole class of "failed to parse grammar" sampler errors.
    // Re-enable with ?grammar=1 if you want to experiment with it again.
    const grammarEnabled = (() => {
      try { return new URLSearchParams(window.location.search).has('grammar'); }
      catch { return false; }
    })();
    const useGrammar = grammarEnabled && agent.useGrammar !== false;
    let responseFormat = null;
    let constraintInstruction = '';
    if (useGrammar) {
      const allowed = agent.allowedCommands || [];
      const allowedSet = new Set(Array.isArray(allowed) ? allowed : []);
      const dyn = buildDynamicGrammar(allowedSet);
      responseFormat = dyn.responseFormat;
      constraintInstruction = dyn.instruction;
    }

    const generateFn = getEngineType() === 'openai' ? generateEndpoint
      : getEngineType() === 'transformers.js' ? generateTJS
      : getEngineType() === 'litert-lm' ? generateLiteRT
      : getEngineType() === 'wllama' ? generateWllama
      : getEngineType() === 'wllama3' ? generateWllama3
      : generateWebLLM;

    console.log('[tablefolk-brain] SENDING REQUEST TO LLM', {
      agentId: agent.agentId || 'default',
      engineType: getEngineType(),
      messageCount: (agent.messages || []).length,
      messages: agent.messages || [],
      maxTokens: agent.maxTokens || 256,
      temperature: agent.temperature ?? 0,
      enableThinking: agent.enableThinking ?? false,
      useGrammar,
      constraintInstruction,
    });
    let text;
    try {
      text = await generateFn(engine, '', {
        maxTokens: agent.maxTokens || 256, // room for long multi-line plans/poems
        temperature: agent.temperature ?? 0,
        frequencyPenalty: agent.frequencyPenalty ?? 0.15,
        repetitionPenalty: agent.repetitionPenalty ?? 1.05,
        responseFormat,
        constraintInstruction,
        messages: agent.messages || [],
        enableThinking: agent.enableThinking ?? false,
        onToken: onToken,
        debugLog: (msg, data) => onDebug(msg, data),
        agentId: agent.agentId || 'default',
      });
    } catch (err) {
      console.error('[tablefolk-brain] ERROR AFTER SENDING REQUEST TO LLM:', err);
      console.error('[tablefolk-brain] STACK TRACE:', err && err.stack);
      throw err;
    }
    console.log('[tablefolk-brain] RAW LLM OUTPUT:', text);
    // Ad-hoc console callers (llm()/genmap()) want the model's exact text back
    // (e.g. a fixed-width ASCII grid), not the command-line normalization that
    // strips lines looking like pure markdown artifacts (a wall row of all
    // '#' would otherwise be dropped).
    const line = agent.raw ? String(text || '') : commandLines(text);
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
    persistModelChoice(modelKey);
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
    getSupportedModels: () => Object.entries(SUPPORTED_MODELS).map(([key, cfg]) => ({ key, label: cfg.label, engine: cfg.engine, size: cfg.size, hidden: !!cfg.hidden })),
    clearConversations: (agentId = null) => { if (getEngineType() === 'litert-lm') clearLiteRTConversations(agentId); },
  };
}
