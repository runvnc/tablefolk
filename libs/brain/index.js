// @tablefolk/brain -- a language model in the browser with one call: it
// picks a model this device can run (Gemma 4 on WebGPU, a tiny Qwen without
// a graphics card, Chrome's built-in model, or an OpenAI-compatible server
// such as OpenRouter), downloads and caches it, and gives you plain methods.
//
//   import { createBrain } from '@tablefolk/brain';
//   const brain = await createBrain({ onStatus: s => console.log(s) });
//   brain.why                                       // "Gemma 4 E2B: 8 GB usable, 210 GB/s"
//   await brain.chat('Say hi as a blacksmith')      // -> text
//   for await (const piece of brain.stream('Tell a short story')) out.textContent += piece;
//   await brain.pick('Which fits "fix my sword"?', ['repair', 'buy', 'leave'])   // -> { index, choice, by, confidence? }
//   await brain.yesno('Is the player angry?', { context: 'Player: "Give it back NOW!"' })   // -> 0..1
//   await brain.json('Name and age of a tavern keeper', { example: { name: 'Mara', age: 40 } })   // -> object
//   const s = await brain.languageModel.create({ initialPrompts: [{ role: 'system', content: '...' }] });
//   await s.prompt('Hello')                         // Chrome's Prompt API shape (LanguageModel), on any model
//
// Options:
//   model     'auto' (default), a key of MODELS, 'endpoint', or 'chrome'
//   endpoint  { baseURL, apiKey, model }: any OpenAI-compatible server
//             (openrouter.js signs a visitor in and gives one)
//   fallback  where to go when nothing local fits or loading fails, in order
//             (default ['chrome', 'endpoint', 'qwen1.5-0.5b'])
//   decider   a @tablefolk/decider instance: pick() and yesno() use it
//   engine    your own { generate(messages, opts) -> text, unload() } instead of a model here
//   onStatus  progress text (downloads, loading)
//   ask       async (model) => true to allow a download (default: allowed)
//
// Model files come from Hugging Face, or Tablefolk's mirror on tablefolk.world
// (@tablefolk/models). Gemma's files are cached in the browser (OPFS), so
// the download happens once.
import { detectHardware, recommendModel, noteBrainSpeed, usableGB } from '../device/index.js';
import { note } from '../models/index.js';
import { samplingFor } from './sampling.js';

// needGB: graphics memory it wants (with a page drawing beside it); readGB:
// weights read per token (with the measured bandwidth: how fast it writes)
export const MODELS = {
  'gemma4-e2b': { engine: 'litert', id: 'gemma4-e2b-litert', label: 'Gemma 4 E2B', size: '2 GB', needGB: 3, readGB: 1.3 },
  'gemma4-e4b': { engine: 'litert', id: 'gemma4-e4b-litert', label: 'Gemma 4 E4B', size: '3 GB', needGB: 6, readGB: 2.3 },
  'gemma4-e2b-vision': { engine: 'litert', id: 'gemma4-e2b-vision', label: 'Gemma 4 E2B with sight', size: '2.6 GB', vision: true, hidden: true },
  'bonsai2-27b': { engine: 'bonsai2', id: 'bonsai2-27b', label: 'Bonsai 2 27B', size: '5.9 GB', needGB: 10, readGB: 5.9 },
  'qwen1.5-0.5b': { engine: 'wllama', id: 'qwen1.5-0.5b', label: 'Qwen1.5 0.5B', size: '0.4 GB', tiny: true },
  'qwen2.5-0.5b': { engine: 'wllama', id: 'qwen2.5-0.5b', label: 'Qwen2.5 0.5B', size: '0.5 GB', tiny: true },
};
const DEFAULT = 'gemma4-e2b';

// ---- engines: each loads to { generate(messages, opts) -> text, unload() }
// opts: { maxTokens, temperature, topP, topK, onToken(fullTextSoFar), agentId }
const ENGINES = {
  async litert(m, onStatus) {
    const L = await import('./engines/litert.js'), R = await import('./engines/litert-runner.js');
    const client = await L.loadModel(m.id, p => onStatus(typeof p === 'string' ? p : p?.text || ''));
    const engine = R.createLiteRTEngine(client);
    return { generate: (messages, o) => R.generate(engine, '', { ...o, messages }), unload: () => L.unloadModel(), see: client.canSee() ? (img, prompt, sys) => client.see(img, prompt, sys) : null };
  },
  async wllama(m, onStatus) {
    const L = await import('./engines/wllama.js'), R = await import('./engines/wllama-runner.js');
    const w = await L.loadModel(m.id, p => onStatus(typeof p === 'string' ? p : p?.text || ''));
    const engine = R.createWllama3Engine(w);
    return { generate: (messages, o) => R.generate(engine, '', { ...o, messages }), unload: () => L.unloadModel() };
  },
  async bonsai2(m, onStatus) {
    const B = await import('./engines/bonsai2.js');
    const engine = await B.loadBonsai2(onStatus);
    return { generate: (messages, o) => B.generateBonsai2(engine, '', { ...o, messages }), unload: () => engine.unload() };
  },
  async endpoint(m, onStatus, { endpoint }) {
    if (!endpoint?.baseURL) throw new Error('no endpoint given (createBrain({ endpoint: { baseURL, apiKey, model } }))');
    const { OpenAI, collect } = await import('./engines/openai.js');
    const client = new OpenAI({ baseURL: endpoint.baseURL, apiKey: endpoint.apiKey || '' });
    onStatus(`using ${endpoint.model || 'the server\'s model'} at ${endpoint.baseURL}`);
    return {
      async generate(messages, o = {}) {
        const body = { model: endpoint.model || undefined, messages, max_tokens: o.maxTokens ?? 512, temperature: o.temperature ?? 0.7, stream: true };
        if (o.topP != null) body.top_p = o.topP;
        if (o.topK != null) body.top_k = o.topK;
        if (samplingFor(endpoint.model)) body.chat_template_kwargs = { enable_thinking: false };
        return (await collect(await client.chat.completions.create(body), o.onToken)).text;
      },
      unload() {},
    };
  },
  // Chrome's built-in model (Gemini Nano: the Prompt API, LanguageModel)
  async chrome(m, onStatus) {
    const LM = globalThis.LanguageModel;
    if (!LM) throw new Error('no built-in model in this browser');
    const a = await LM.availability();
    if (a === 'unavailable') throw new Error('the browser\'s built-in model is unavailable here');
    onStatus(a === 'available' ? 'the browser\'s built-in model' : 'the browser is downloading its built-in model…');
    return {
      async generate(messages, o = {}) {
        const last = messages[messages.length - 1];
        const initialPrompts = messages.slice(0, -1).map(x => ({ role: x.role, content: plain(x.content) }));
        const s = await LM.create({ initialPrompts, ...(o.temperature != null ? { temperature: Math.max(o.temperature, 0.0001), topK: o.topK || (o.temperature === 0 ? 1 : 3) } : {}) });
        try {
          if (!o.onToken) return await s.prompt(plain(last?.content));
          let text = '';
          for await (const c of s.promptStreaming(plain(last?.content))) { text = c.startsWith(text) ? c : text + c; o.onToken(text); }
          return text;
        } finally { s.destroy(); }
      },
      unload() {},
    };
  },
};
const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const asMessages = (input, system) => {
  const msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : [...input];
  return system && msgs[0]?.role !== 'system' ? [{ role: 'system', content: system }, ...msgs] : msgs;
};
const chromeReady = async () => { try { return !!globalThis.LanguageModel && (await globalThis.LanguageModel.availability()) !== 'unavailable'; } catch { return false; } };

// What to run here, and why (in words)
export async function chooseModel({ model = 'auto', endpoint = null } = {}) {
  if (model !== 'auto') return { key: model, why: 'asked for' };
  const hw = await detectHardware().catch(() => null);
  // keyed by engine id: measured speeds (noteBrainSpeed) are kept under it, shared with the Tablefolk game
  const list = Object.values(MODELS).map(m => ({ ...m, key: m.id }));
  const byId = id => Object.keys(MODELS).find(k => MODELS[k].id === id) || null;
  if (hw?.webgpu) {
    const gb = usableGB(hw), key = byId(recommendModel(hw, list, null));
    if (key) return { key, why: `${MODELS[key].label}: ${hw.choiceWhy}`, hw };
    if (gb == null) return { key: DEFAULT, why: `${MODELS[DEFAULT].label}: graphics memory unknown, the default`, hw };
    // too little graphics memory for Gemma
    if (await chromeReady()) return { key: 'chrome', why: `${gb} GB usable is too little for Gemma: the browser's built-in model`, hw };
    if (endpoint?.baseURL) return { key: 'endpoint', why: `${gb} GB usable is too little for Gemma: the server given`, hw };
    return { key: 'qwen1.5-0.5b', why: `${gb} GB usable is too little for Gemma: a tiny model`, hw };
  }
  if (await chromeReady()) return { key: 'chrome', why: 'no WebGPU here: the browser\'s built-in model', hw };
  if (endpoint?.baseURL) return { key: 'endpoint', why: 'no WebGPU here: the server given', hw };
  return { key: 'qwen1.5-0.5b', why: 'no WebGPU here: a tiny model on the processor', hw };
}

export async function createBrain(opts = {}) {
  const { endpoint = null, onStatus = () => {}, ask = null, fallback = ['chrome', 'endpoint', 'qwen1.5-0.5b'], system = '' } = opts;
  let decider = opts.decider || null;
  const first = opts.engine ? { key: 'custom', why: 'an engine of your own' } : await chooseModel(opts);
  const tried = [];
  let engine = opts.engine || null, key = opts.engine ? 'custom' : null, why = opts.engine ? 'an engine of your own' : first.why;
  for (const k of engine ? [] : [first.key, ...fallback.filter(f => f !== first.key)]) {
    if (k === 'endpoint' && !endpoint?.baseURL) continue;
    const m = MODELS[k] || { engine: k, label: k === 'chrome' ? 'the browser\'s built-in model' : k === 'endpoint' ? (endpoint?.model || 'the server') : k };
    const load = ENGINES[m.engine]; if (!load) { tried.push(`${k}: unknown model`); continue; }
    if (ask && MODELS[k] && !(await ask({ key: k, ...m }))) { tried.push(`${k}: download declined`); continue; }
    try {
      engine = await load(m, s => onStatus(s), { endpoint });
      key = k;
      if (tried.length) why = `${m.label} (${tried.join('; ')})`;
      break;
    } catch (e) {
      tried.push(`${k}: ${e?.message || e}`);
      note('brain', `${m.label} did not load: ${e?.message || e}`);
    }
  }
  if (!engine) throw new Error('no model could run here: ' + tried.join('; '));
  note('brain', why, { model: key });
  onStatus(`${MODELS[key]?.label || key} ready`);

  let warm = 0;
  async function generate(input, o = {}) {
    const messages = asMessages(input, o.system ?? system);
    const t0 = performance.now();
    const text = await engine.generate(messages, { maxTokens: o.maxTokens ?? 512, temperature: o.temperature ?? 0.7, topP: o.topP, topK: o.topK, onToken: o.onToken, agentId: o.agentId || 'tf-brain' });
    // how fast it runs here: @tablefolk/device skips models measured too slow
    if (MODELS[key] && warm++ > 0) noteBrainSpeed(MODELS[key].id, String(text || '').length, (performance.now() - t0) / 1000);
    return String(text || '');
  }
  const greedy = { temperature: 0, topK: 1, topP: 1 };

  const brain = {
    get model() { return key; },
    get label() { return MODELS[key]?.label || key; },
    why, hardware: first.hw || null,
    chat: (input, o = {}) => generate(input, o),
    // pieces of text as they come
    stream(input, o = {}) {
      const queue = [], waiters = []; let done = false, error = null, sent = 0;
      const push = v => { const w = waiters.shift(); if (w) w(v); else queue.push(v); };
      generate(input, { ...o, onToken: full => { const piece = full.slice(sent); sent = full.length; if (piece) push({ value: piece, done: false }); } })
        .then(text => { if (text.length > sent) push({ value: text.slice(sent), done: false }); done = true; push({ value: undefined, done: true }); })
        .catch(e => { error = e; done = true; push({ value: undefined, done: true }); });
      return { [Symbol.asyncIterator]() { return this; },
        next() { if (error) return Promise.reject(error); if (queue.length) return Promise.resolve(queue.shift()); if (done) return Promise.resolve({ value: undefined, done: true }); return new Promise(r => waiters.push(r)); } };
    },
    // one of the options: the decider when attached (calibrated confidence), else the model, greedily
    async pick(question, options, { context = '', none = false } = {}) {
      if (decider) {
        const criteria = Object.fromEntries(options.map((o, i) => ['o' + (i + 1), String(o)]));
        if (none) criteria.none = 'none of these';
        const r = (await decider.decide(context || '', { q: { type: 'choice', instructions: question, criteria } })).q;
        const index = r.choice === 'none' ? -1 : +r.choice.slice(1) - 1;
        return { index, choice: options[index] ?? null, confidence: r.confidence, probabilities: r.probabilities, by: 'decider' };
      }
      const list = options.map((o, n) => `${n + 1}. ${o}`).join('\n') + (none ? '\n0. None of these' : '');
      const out = await generate([{ role: 'system', content: 'Answer with one number and nothing else.' },
        { role: 'user', content: `${context ? context + '\n\n' : ''}${question}\nChoices:\n${list}\n\nAnswer with the number only.` }], { ...greedy, maxTokens: 6, agentId: 'tf-pick' });
      const n = +(out.match(/\d+/)?.[0] ?? 0);
      const index = n >= 1 && n <= options.length ? n - 1 : -1;
      return { index, choice: options[index] ?? null, by: 'model' };
    },
    // how likely the statement is true: the decider's probability, else the model's yes (1) or no (0)
    async yesno(statement, { context = '' } = {}) {
      if (decider) return (await decider.decide(context || '', { q: { type: 'noul', instructions: statement } })).q.noul;
      const out = await generate([{ role: 'system', content: 'You judge whether a statement is true. Answer yes or no, one word.' },
        { role: 'user', content: `${context ? 'The situation:\n' + context + '\n\n' : ''}Statement: ${statement}\nIs the statement true? Answer yes or no.` }], { ...greedy, maxTokens: 3, agentId: 'tf-yesno' });
      return /^\s*y/i.test(out) ? 1 : 0;
    },
    // an object: asked for JSON only, parsed; one retry when it is not valid
    async json(prompt, { example = null, schema = null, ...o } = {}) {
      const shape = example ? `\nLike this example: ${JSON.stringify(example)}` : schema ? `\nFollowing this JSON schema: ${JSON.stringify(schema)}` : '';
      const messages = [{ role: 'system', content: 'Reply with one JSON object and nothing else: no code fence, no comments.' }, { role: 'user', content: prompt + shape }];
      for (let i = 0; i < 2; i++) {
        const out = await generate(messages, { ...greedy, maxTokens: 1024, ...o, agentId: 'tf-json' });
        try { return parseJSON(out); }
        catch (e) { if (i) throw e; messages.push({ role: 'assistant', content: out }, { role: 'user', content: 'That was not valid JSON. Reply with the JSON object only.' }); }
      }
    },
    // Chrome's Prompt API shape, on whichever model runs here
    languageModel: {
      availability: async () => 'available',
      async create({ initialPrompts = [], temperature, topK } = {}) {
        const history = initialPrompts.map(p => ({ role: p.role, content: plain(p.content) }));
        const o = temperature != null ? { temperature, topK } : {};
        const session = {
          async prompt(input) { history.push({ role: 'user', content: plain(input) }); const t = await generate(history, { ...o, system: '' }); history.push({ role: 'assistant', content: t }); return t; },
          promptStreaming(input) {
            history.push({ role: 'user', content: plain(input) });
            let all = '';
            const it = brain.stream(history.slice(), { ...o, system: '' });
            return new ReadableStream({ async pull(c) { const { value, done } = await it.next(); if (done) { history.push({ role: 'assistant', content: all }); c.close(); } else { all += value; c.enqueue(value); } } });
          },
          async append(msgs) { for (const p of [].concat(msgs)) history.push({ role: p.role || 'user', content: plain(p.content) }); },
          clone: async () => brain.languageModel.create({ initialPrompts: history.slice(), temperature, topK }),
          destroy() { history.length = 0; },
        };
        return session;
      },
    },
    see: engine.see || null,
    useDecider(d) { decider = d; },
    unload() { try { engine.unload(); } catch {} },
  };
  return brain;
}

// the first {...} in a reply, balanced (a model may add words around it)
export function parseJSON(text) {
  const t = String(text), start = t.indexOf('{'); if (start < 0) throw new Error('no JSON object in the reply');
  let depth = 0, str = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('the JSON object in the reply is cut off');
}

export { samplingFor, withChaos } from './sampling.js';
export { signIn as openRouterSignIn, finishSignIn as openRouterFinishSignIn, openRouterEndpoint } from './openrouter.js';
