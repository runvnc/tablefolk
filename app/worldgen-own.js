/* worldgen-own.js -- the world builder with the visitor's own model: their
 * OpenRouter key, or any OpenAI-compatible server (a local one too). The page
 * calls the model itself, so the key never reaches the Tablefolk server; the
 * server only hands out the prompt (POST /api/worldgen/messages: the same
 * messages its own model would get) and checks the answer (POST /api/finish,
 * the same checks, one repair round with its problems).
 *
 *   window.tfOwnModel = {
 *     get(), set(cfg)          { provider: 'openrouter'|'custom', baseURL, apiKey, model, useForPlay, context }
 *     modelInfo(cfg?)          { context, maxOutput, tools, source }: what the provider reports (answers get
 *                              what the window leaves, within the model's limit; 32768 when nothing says)
 *                              (this browser's localStorage, 'tablefolk_own_model')
 *     signIn()                 OpenRouter's sign-in (OAuth PKCE): back here with a key of your own
 *     finishSignIn()           on return (?code=...): trades the code for the key; true when it did
 *     run(prompt, mode, emit, {agent})  build a world (agent: the tool-calling agent, worldgen-agent.js); emit like the server's stream: 'progress'
 *                              {stage, chars, thought, preview, model}, 'done' {scenario, code, link, ms, model}, 'failed' {error}
 *     revise(scenario, request, emit, {agent})   the same for "ask the AI for changes" (agent: the same session)
 *     critique(body, image, say)  one review round of the builder's agent: {text, sawImage, ms, model}
 *   }
 *
 * "Also for the characters" (useForPlay) points the game's endpoint brain
 * (agent-brain.js, 'tablefolk_llm_endpoint') at the same provider and key with
 * a quick model, and picks that brain in this browser.
 */
(function () {
  const KEY = 'tablefolk_own_model', VERIFIER = 'tablefolk_or_verifier';
  const OPENROUTER = 'https://openrouter.ai/api/v1';
  const PLAY_MODEL = 'google/gemma-4-26b-a4b-it';   // the server's default characters' model: quick and cheap
  const CLIENT = '/libs/brain/engines/openai.js';

  function get() {
    let c = {}; try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
    const provider = c.provider === 'custom' ? 'custom' : 'openrouter';
    return { provider, baseURL: provider === 'openrouter' ? OPENROUTER : String(c.baseURL || ''), apiKey: String(c.apiKey || ''), model: String(c.model || ''), useForPlay: !!c.useForPlay, context: +c.context > 0 ? +c.context : null };
  }
  function set(cfg) {
    const c = { ...get(), ...cfg };
    try { localStorage.setItem(KEY, JSON.stringify({ provider: c.provider, baseURL: c.provider === 'custom' ? c.baseURL : '', apiKey: c.apiKey, model: c.model, useForPlay: !!c.useForPlay, context: +c.context > 0 ? +c.context : null })); } catch {}
    if (c.useForPlay && (c.apiKey || c.provider === 'custom')) {
      try {
        localStorage.setItem('tablefolk_llm_endpoint', JSON.stringify({ baseURL: c.baseURL, apiKey: c.apiKey, model: c.provider === 'openrouter' ? PLAY_MODEL : c.model }));
        localStorage.setItem('tablefolk_model', 'endpoint');
      } catch {}
    }
    return c;
  }

  // ---- OpenRouter sign-in (OAuth PKCE: no secret on our side) ----
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function signIn() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    try { sessionStorage.setItem(VERIFIER, verifier); } catch {}
    const back = new URL(location.href); back.searchParams.delete('code');
    location.href = 'https://openrouter.ai/auth?' + new URLSearchParams({ callback_url: back.href, code_challenge: challenge, code_challenge_method: 'S256' });
  }
  async function finishSignIn() {
    const u = new URL(location.href), code = u.searchParams.get('code');
    let verifier = null; try { verifier = sessionStorage.getItem(VERIFIER); } catch {}
    if (!code || !verifier) return false;
    u.searchParams.delete('code'); history.replaceState(null, '', u.href);
    try { sessionStorage.removeItem(VERIFIER); } catch {}
    const r = await fetch(OPENROUTER + '/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.key) throw new Error('OpenRouter sign-in failed: ' + (d.error?.message || d.message || 'HTTP ' + r.status));
    set({ provider: 'openrouter', apiKey: d.key });
    return true;
  }

  // ---- a run: the server's prompt, the visitor's model, the server's checks ----
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }
  // A plain reason for the usual failures (the browser only says "Failed to fetch").
  function explain(e, cfg) {
    const m = String(e?.message || e);
    if (e?.status === 401 || /401|unauthori[sz]ed|invalid.*key|no auth/i.test(m)) return cfg.provider === 'openrouter' ? 'OpenRouter did not accept the key: sign in again or paste a new one' : 'the server did not accept the key';
    if (e?.status === 402 || /402|credit|insufficient/i.test(m)) return 'the key has no credit left (openrouter.ai/settings/credits)';
    if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(m)) return cfg.provider === 'custom'
      ? `could not reach ${cfg.baseURL}: is it running, and does it allow requests from this page (CORS)? llama.cpp's llama-server allows them; Ollama needs OLLAMA_ORIGINS=* ; LM Studio: turn on "Enable CORS" in its server settings`
      : 'could not reach OpenRouter (offline?)';
    return m;
  }
  function parseJSON(text) {
    const t = String(text), start = t.indexOf('{'); if (start < 0) throw new Error('no JSON object in the reply');
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
    throw new Error('the JSON object is incomplete (reply cut off?)');
  }
  // ---- what the provider says about the model: its window, its longest answer, tools ----
  // OpenRouter: its public models list (context_length, top_provider.max_completion_tokens,
  // supported_parameters). Another server: llama-server's /props (n_ctx, chat_template_caps),
  // else its /models (context_length, vLLM's max_model_len, LM Studio's max_context_length,
  // llama-server's meta.n_ctx_train). The setting "context" overrides; else 32768.
  const infoCache = {};
  async function modelInfo(cfg = get()) {
    const k = [cfg.provider, cfg.baseURL, cfg.model, cfg.context].join('|');
    if (infoCache[k]) return infoCache[k];
    const info = { context: null, maxOutput: null, tools: null, source: '' };
    const getJSON = (url, h = {}) => fetch(url, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (cfg.provider === 'openrouter' && cfg.model) {
      const d = await getJSON(OPENROUTER + '/models');
      const m = (d?.data || []).find(x => x.id === cfg.model || x.canonical_slug === cfg.model);
      if (m) { info.context = m.context_length || m.top_provider?.context_length || null; info.maxOutput = m.top_provider?.max_completion_tokens || null; info.tools = (m.supported_parameters || []).includes('tools'); info.source = 'OpenRouter'; }
    } else if (/^https?:/.test(cfg.baseURL)) {
      const h = cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {};
      const p = await getJSON(cfg.baseURL.replace(/\/v1\/?$/, '') + '/props', h);
      if (p) {
        info.context = p.default_generation_settings?.n_ctx || p.n_ctx || null;
        const caps = p.chat_template_caps;
        info.tools = caps ? !!(caps.supports_tools ?? caps.supports_tool_calls) : typeof p.chat_template === 'string' ? /tool/.test(p.chat_template) : null;
        info.source = 'the server (/props)';
      }
      if (!info.context) {
        const d = await getJSON(cfg.baseURL + '/models', h), list = d?.data || [];
        const m = list.find(x => x.id === cfg.model) || list[0];
        const c = m && (m.context_length || m.max_model_len || m.max_context_length || m.meta?.n_ctx || m.meta?.n_ctx_train);
        if (c) { info.context = +c; info.source = 'the server (/models)'; }
      }
    }
    if (+cfg.context > 0) { info.context = +cfg.context; info.source = 'your setting'; }
    if (!info.context) { info.context = 32768; info.source = 'the default (not reported by the server)'; }
    return infoCache[k] = info;
  }
  // the longest answer: what the window leaves after the prompt (about 3.5 characters a
  // token), within the model's own limit; never less than 2048
  const promptTokens = messages => Math.ceil(JSON.stringify(messages).length / 3.5);
  function outCap(info, messages) {
    const room = Math.max(2048, info.context - promptTokens(messages) - 512);
    return info.maxOutput ? Math.min(info.maxOutput, room) : room;
  }
  // a request; when OpenRouter refuses the size (a key with little credit is checked
  // against max_tokens: 402 "fewer max_tokens"), again with the old fixed size
  async function create(client, body, fallback) {
    try { return await client.chat.completions.create(body); }
    catch (e) {
      if (fallback && body.max_tokens > fallback && (e?.status === 402 || /max_tokens|fewer/i.test(String(e?.message)))) return client.chat.completions.create({ ...body, max_tokens: fallback });
      throw e;
    }
  }
  async function runWith(body, label, emit) {
    const cfg = get(), t0 = Date.now();
    try {
      if (cfg.provider === 'openrouter' && !cfg.apiKey) throw new Error('no OpenRouter key yet: sign in with OpenRouter or paste a key');
      if (cfg.provider === 'custom' && !/^https?:\/\//.test(cfg.baseURL)) throw new Error('no server address yet (e.g. http://localhost:8080/v1)');
      if (!cfg.model) throw new Error('no model chosen');
      const { OpenAI, collect } = await import(CLIENT);
      const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: 600000,
        defaultHeaders: cfg.provider === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'Tablefolk' } : {} });
      const spec = await post('/api/worldgen/messages', body);
      const messages = spec.messages, info = await modelInfo(cfg);
      for (let round = 0; round < 2; round++) {
        emit('progress', { stage: round ? 'repairing' : 'waiting', model: cfg.model });
        let last = 0, lastT = -1, chars = 0;
        let out;
        try {
          out = await collect(await create(client, { model: cfg.model, messages, stream: true, temperature: spec.temperature ?? 0.7, max_tokens: outCap(info, messages) }, spec.maxTokens || 17000), text => {
            chars = text.length;
            if (chars - last > 120) { last = chars; emit('progress', { stage: round ? 'repairing' : 'writing', chars, preview: text.slice(-160) }); }
          }, (thought, tail) => {
            if (!chars && (lastT < 0 || thought - lastT > 80)) { lastT = thought; emit('progress', { stage: 'thinking', thought, preview: tail.slice(-220) }); }
          });
        } catch (e) { throw new Error(explain(e, cfg)); }
        let scenario = null, problems = [];
        try { scenario = parseJSON(out.text); } catch (e) { problems = [e.message]; }
        if (scenario) {
          const d = await post('/api/finish', { scenario, prompt: label, model: cfg.model, ms: Date.now() - t0, kept: spec.kept || null, mode: 'own' });
          if (!d.problems) return emit('done', { ...d, ms: Date.now() - t0, model: cfg.model });
          problems = d.problems;
        }
        emit('progress', { stage: 'problems', problems });
        messages.push({ role: 'assistant', content: out.text }, { role: 'user', content: `Fix these problems and reply with the whole corrected JSON object only:\n- ${problems.join('\n- ')}` });
      }
      throw new Error('the model did not produce a usable world (try another model)');
    } catch (e) { emit('failed', { error: String(e.message || e) }); }
  }
  // One review round of the builder's agent (app/builder.js): the server's
  // review prompt, the map's picture added here (a model without sight is
  // asked again with the text map only); the answer as /api/critique gives it.
  async function critique(body, image, say = () => {}) {
    const cfg = get(), t0 = Date.now();
    if (cfg.provider === 'openrouter' && !cfg.apiKey) throw new Error('no OpenRouter key yet: sign in with OpenRouter or paste a key');
    if (!cfg.model) throw new Error('no model chosen');
    const { OpenAI, collect } = await import(CLIENT);
    const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: 300000,
      defaultHeaders: cfg.provider === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'Tablefolk' } : {} });
    const ask = async withImage => {
      const spec = await post('/api/worldgen/messages', { ...body, critique: true, withImage });
      const m = spec.messages, last = m[m.length - 1];
      if (withImage) last.content = [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: image } }];
      let chars = 0;
      const out = await collect(await create(client, { model: cfg.model, messages: m, stream: true, temperature: spec.temperature ?? 0.4, max_tokens: outCap(await modelInfo(cfg), m) }, spec.maxTokens || 6000),
        t => { if (t.length - chars > 200) { chars = t.length; say(`reviewing… ${chars} characters`); } }, () => say('thinking…'));
      return out.text;
    };
    let text, saw = !!image;
    try { text = await ask(saw); }
    catch (e) { if (!saw) throw new Error(explain(e, cfg)); saw = false; text = await ask(false).catch(e2 => { throw new Error(explain(e2, cfg)); }); }
    return { text, sawImage: saw, ms: Date.now() - t0, model: cfg.model };
  }
  // ---- agent mode (app/worldgen-agent.js): the model calls the builder's tools ----
  // A model the provider says takes no tools, or one whose first step is refused for its tools,
  // falls back to the one-answer run above (the progress line says so).
  const toolsRefused = e => /tool|function/i.test(String(e)) && /400|404|422|support|not allowed|unrecogni|invalid/i.test(String(e));
  async function agentFor(cfg) {
    if (cfg.provider === 'openrouter' && !cfg.apiKey) throw new Error('no OpenRouter key yet: sign in with OpenRouter or paste a key');
    if (cfg.provider === 'custom' && !/^https?:\/\//.test(cfg.baseURL)) throw new Error('no server address yet (e.g. http://localhost:8080/v1)');
    if (!cfg.model) throw new Error('no model chosen');
    if (!window.tfWorldAgent) throw new Error('the agent script is not loaded');
    const info = await modelInfo(cfg);
    return { info, backend: window.tfWorldAgent.openaiBackend(cfg, info) };
  }
  async function runAgent(prompt, mode, emit, scenario = null, request = null) {
    const cfg = get();
    let a; try { a = await agentFor(cfg); } catch (e) { return emit('failed', { error: e.message }); }
    const json = () => { emit('progress', { stage: 'waiting', label: `${cfg.model} takes no tools here: writing the world as one answer instead`, model: cfg.model }); return scenario ? runWith({ scenario, request }, 'change: ' + request, emit) : runWith({ prompt, mode }, prompt, emit); };
    if (a.info.tools === false) return json();
    let fellBack = false;
    const watch = (ev, d) => {
      if (ev === 'failed' && !fellBack && toolsRefused(d.error) && (window.tfWorldAgent.session?.steps || 0) <= 1) { fellBack = true; window.tfWorldAgent.reset(); return json(); }
      if (ev === 'failed') d = { ...d, error: explain({ message: d.error }, cfg) };
      emit(ev, d);
    };
    if (scenario) await window.tfWorldAgent.change(scenario, request, watch, window.tfWorldAgent.session?.backend?.name === cfg.model ? null : a.backend);
    else await window.tfWorldAgent.build(prompt, a.backend, watch);
  }
  // opts.agent: agent mode (the builder's toggle)
  const run = (prompt, mode, emit, opts = {}) => opts.agent ? runAgent(prompt, mode, emit) : runWith({ prompt, mode }, prompt, emit);
  const revise = (scenario, request, emit, opts = {}) => opts.agent ? runAgent('', '', emit, scenario, request) : runWith({ scenario, request }, 'change: ' + request, emit);

  window.tfOwnModel = { get, set, signIn, finishSignIn, run, revise, critique, parseJSON, modelInfo, PLAY_MODEL };
})();
