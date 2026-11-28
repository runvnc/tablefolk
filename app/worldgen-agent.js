/* worldgen-agent.js -- the world builder's agent mode: a model that can call
 * tools builds the world step by step (set the map, add a character, check,
 * look, fix...) instead of writing it as one JSON answer, and keeps going until
 * it calls "finish". The tools run on the server (POST /api/worldgen/tool,
 * server/worldgen-tools.js: the same checks as every built world); the model
 * runs where the player chose: their own key or server (OpenAI-style "tools",
 * worldgen-own.js), or a strong model in this browser (Bonsai 2.5 27B and
 * Bonsai 2 9B, Inkling 2 Mini, SenseNova-Loop-9B: worldgen-browser.js
 * agentBackend), which writes its calls in its own chat template's format
 * (renderMessages / inklingPrompt in, parseToolCalls out).
 *
 *   window.tfWorldAgent = {
 *     build(prompt, backend, emit, opts) a new world; emit like the other runs: 'progress'
 *                                        {stage: 'agent', label, preview, step}, 'done' {scenario,
 *                                        code, link, ms, model, summary, agent: true}, 'failed' {error, noTools?}
 *                                        opts {sections, shape}: a world in sections (plan_sections first)
 *     change(scenario, request, emit, backend?, opts?)  a follow-up in the same session (same model, same
 *                                        history; old turns are summarised when the window fills);
 *                                        opts.review {round, rounds, history}: a "Look it over" round
 *     stop()                             ends the run after the current step; what is built is
 *                                        finished if it passes the checks
 *     session                            { backend, messages, scenario, log, steps, tokens } or null
 *     canAgent(modelKey, info?)          { ok, format, why, dflt }: whether agent mode can run that model
 *                                        (and whether it is on by default)
 *     openaiBackend(cfg, info)           a backend over an OpenAI-compatible endpoint
 *     serverBackend({where, model}, info) the server's own model (where cloud | server), each step through
 *                                        POST /api/worldgen/step (the server's system message and tools)
 *     localBackend(spec)                 a backend over an in-browser engine (worldgen-browser.js)
 *     parseToolCalls(text, format), renderMessages(messages, tools, format), inklingPrompt(messages, tools), compact(...)
 *   }
 *
 * A backend: { name, kind: 'openai' | 'local', context (tokens), step(messages, tools, onStream)
 * -> { text, calls: [{ id, name, args }], usage, cost } }. A step cap (60) and a token budget
 * (2M tokens, ?agentTokens=) end a run that does not finish by itself; a tool's error goes
 * back to the model as its result, not as a failure of the run.
 *
 * Going round in circles (watch()): the same call with the same arguments three times, a
 * call repeated while the world has not changed (answered "already done" without running),
 * set_map or plan_sections four times running, one tool failing three times running, or six
 * steps without a change to the world: the model is told what it is doing, what the world
 * is now and what to do next (recovery()); the third time the run ends. A run that ends
 * without a finished world (stop, the caps, circles, a model that stops calling tools or
 * fails mid-run) asks finish with auto: code completes and repairs what it can
 * (worldgen-tools.js autoComplete), so every model ends with a world or a plain message.
 *
 * Plain script, no dependencies; node loads it for tools/worldgen-tools-test.mjs
 * (globalThis.TablefolkWorldAgent).
 */
(function () {
  const W = typeof window !== 'undefined' ? window : null;
  const q = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } };
  const MAX_STEPS = 60;
  const TOKEN_BUDGET = () => +q().get('agentTokens') || 2e6;

  // ---- which models can run it, and how they write a call ----
  // qwen-xml: Qwen 3.5's template (Bonsai 2/2.5 are Qwen 3.5 based; SenseNova-Loop-9B's own template):
  //   <tool_call>\n<function=NAME>\n<parameter=KEY>\nVALUE\n</parameter>\n</function>\n</tool_call>
  // inkling: Inkling 2's template: <|message_model|>NAME<|content_invoke_tool_json|>{"name":NAME,"args":{...}}<|end_message|>
  const AGENT_MODELS = { 'bonsai2-27b': 'qwen-xml', 'bonsai2-9b': 'qwen-xml', 'sensenova-loop-9b-wllama': 'qwen-xml', 'inkling2-mini-wllama': 'inkling', 'inkling2-mini-small-wllama': 'inkling' };
  function canAgent(modelKey, info = null) {
    if (modelKey === 'endpoint' || modelKey === 'own') {
      if (info?.tools === false) return { ok: false, format: 'openai', why: 'the provider says this model does not take tools' };
      return { ok: true, format: 'openai', dflt: true, why: info?.tools ? 'the model takes tools' : 'the provider does not say; agent mode tries it and falls back to one answer' };
    }
    // the server's own model (cloud: OpenRouter or OpenAI; server: the local model server):
    // on by default where the provider says it takes tools (/api/worldgen/options)
    if (modelKey === 'cloud' || modelKey === 'server') {
      if (info?.tools === false) return { ok: false, format: 'openai', why: 'the provider says this model does not take tools' };
      return { ok: true, format: 'openai', dflt: info?.tools === true, why: info?.tools ? 'the model takes tools' : 'the server does not say whether this model takes tools; agent mode tries it and falls back to one answer' };
    }
    if (AGENT_MODELS[modelKey]) return { ok: true, format: AGENT_MODELS[modelKey], dflt: true, why: 'it calls tools in its own format' };
    if (/gemma|raon|qwen1|qwen2|minicpm|lfm/.test(String(modelKey))) return { ok: false, why: 'too small to work through tools reliably: it writes the world step by step in plain answers' };
    return { ok: false, why: 'not a model agent mode knows' };
  }
  // a provider's refusal of the tools themselves (the model takes none): fall back to one answer
  const toolsRefused = e => /tool|function/i.test(String(e)) && /400|404|422|support|not allowed|unrecogni|invalid/i.test(String(e));

  // ---- loose JSON: the first balanced {...}, fences, comments and trailing commas forgiven ----
  function looseJSON(text) {
    const t = String(text).replace(/```(?:json)?/g, ''), start = t.indexOf('{'); if (start < 0) return null;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { end = i; break; }
    }
    let s = t.slice(start, end < 0 ? undefined : end + 1);
    if (end < 0) s += '}'.repeat(Math.max(1, depth));
    s = s.replace(/,\s*([}\]])/g, '$1');
    try { return { value: JSON.parse(s), end: end < 0 ? t.length : end + 1 }; } catch { return null; }
  }
  const value = raw => {
    const v = String(raw).replace(/^\n/, '').replace(/\n$/, '');
    const t = v.trim();
    if (/^[[{]/.test(t)) { const j = looseJSON(t.startsWith('[') ? '{"a":' + t + '}' : t); if (j) return t.startsWith('[') ? j.value.a : j.value; }
    if (/^-?\d+(\.\d+)?$/.test(t)) return +t;
    if (t === 'true' || t === 'false') return t === 'true';
    if (t === 'null') return null;
    return t;
  };
  let seq = 0;
  const callId = () => 'call_' + Date.now().toString(36) + '_' + (++seq);
  const fromJSON = o => o && typeof o === 'object' && typeof o.name === 'string' ? { name: o.name, args: o.arguments ?? o.args ?? o.parameters ?? {} } : null;

  // The calls in a model's answer, whatever shape they came in: { text, calls }.
  // text is what came before the first call (its reasoning or its last words).
  function parseToolCalls(raw, format = 'qwen-xml') {
    let text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '');
    const calls = []; let first = -1;
    const add = (c, at) => { if (!c) return; if (typeof c.args === 'string') c.args = looseJSON(c.args)?.value ?? {}; if (!c.args || typeof c.args !== 'object') c.args = {}; calls.push({ id: callId(), name: c.name.trim(), args: c.args }); if (first < 0 || at < first) first = at; };
    // Inkling: NAME<|content_invoke_tool_json|>{"name": NAME, "args": {...}}
    if (format === 'inkling' || /<\|content_invoke_tool_json\|>/.test(text)) {
      const re = /(?:<\|message_model\|>)?([A-Za-z_][\w.-]*)?<\|content_invoke_tool_json\|>/g; let m;
      while ((m = re.exec(text))) { const j = looseJSON(text.slice(m.index + m[0].length)); const c = j && fromJSON(j.value); if (c || m[1]) add(c || { name: m[1], args: {} }, m.index); }
    }
    // Qwen: <tool_call> with <function=NAME> and <parameter=KEY> blocks, or JSON inside (Qwen 2.5/3)
    if (!calls.length) {
      const re = /<tool_call>([\s\S]*?)(?:<\/tool_call>|(?=<tool_call>)|$)|<function=[\s\S]*?(?:<\/function>|$)/g; let m;
      while ((m = re.exec(text))) {
        const body = m[1] ?? m[0];
        const f = body.match(/<function=([^>\n]+)>/);
        if (f) {
          const args = {}, pre = /<parameter=([^>\n]+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|(?=<\/function>)|$)/g; let p;
          while ((p = pre.exec(body))) args[p[1].trim()] = value(p[2]);
          add({ name: f[1], args }, m.index);
        } else { const j = looseJSON(body); add(j && fromJSON(j.value), m.index); }
        if (m[0] === '') re.lastIndex++;
      }
    }
    // no tags: a bare {"name": ..., "arguments": ...} (in a fence or not)
    if (!calls.length && /"name"\s*:/.test(text)) {
      let at = 0;
      for (let guard = 0; guard < 10; guard++) {
        const i = text.indexOf('{', at); if (i < 0) break;
        const j = looseJSON(text.slice(i)); if (!j) { at = i + 1; continue; }
        const c = fromJSON(j.value); if (c && ('arguments' in j.value || 'args' in j.value || 'parameters' in j.value)) add(c, i);
        at = i + j.end;
      }
    }
    const before = first >= 0 ? text.slice(0, first) : text;
    return { text: before.replace(/<\|[a-z_]+\|>/g, '').replace(/```(json)?/g, '').trim(), calls };
  }

  // ---- the model's own prompt format ----
  // Qwen 3.5 (as its chat template writes it): the tool list first in the system message,
  // the calls in the assistant's text, the results as a user message of <tool_response> blocks
  function qwenTools(tools) {
    return '# Tools\n\nYou have access to the following functions:\n\n<tools>' + tools.map(t => '\n' + JSON.stringify(t)).join('') + '\n</tools>'
      + '\n\nIf you choose to call a function ONLY reply in the following format with NO suffix:\n\n<tool_call>\n<function=example_function_name>\n<parameter=example_parameter_1>\nvalue_1\n</parameter>\n<parameter=example_parameter_2>\nThis is the value for the second parameter\nthat can span\nmultiple lines\n</parameter>\n</function>\n</tool_call>'
      + '\n\n<IMPORTANT>\nReminder:\n- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags\n- Required parameters MUST be specified\n- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after\n- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls\n</IMPORTANT>';
  }
  const argsOf = tc => { const a = tc.function?.arguments; if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return {}; } };
  function renderMessages(messages, tools, format = 'qwen-xml') {
    const out = [];
    for (const m of messages) {
      if (m.role === 'system') { out.push({ role: 'system', content: qwenTools(tools) + '\n\n' + m.content }); continue; }
      if (m.role === 'assistant') {
        const calls = (m.tool_calls || []).map((tc, i) => (i ? '\n' : '') + '<tool_call>\n<function=' + tc.function.name + '>\n'
          + Object.entries(argsOf(tc)).map(([k, v]) => '<parameter=' + k + '>\n' + (v && typeof v === 'object' ? JSON.stringify(v) : String(v)) + '\n</parameter>\n').join('') + '</function>\n</tool_call>').join('');
        out.push({ role: 'assistant', content: (m.content || '').trim() ? (m.content.trim() + (calls ? '\n\n' + calls : '')) : calls });
        continue;
      }
      if (m.role === 'tool') {
        const block = '<tool_response>\n' + m.content + '\n</tool_response>';
        const last = out[out.length - 1];
        if (last?.toolResults) last.content += '\n' + block; else out.push({ role: 'user', content: block, toolResults: true });
        continue;
      }
      out.push({ role: m.role, content: String(m.content) });
    }
    return out.map(({ role, content }) => ({ role, content }));
  }
  // Inkling 2 (its chat template): the tool list declared first, each call and result a message
  // of its own; the answer starts at a bare model header (a name after it is a call)
  function inklingPrompt(messages, tools) {
    const specs = tools.map(t => { const f = t.function || t; return sortKeys({ description: f.description || '', name: f.name, parameters: f.parameters || {}, type: t.type || 'function' }); });
    let p = '<|message_system|>tool_declare<|content_xml|>' + JSON.stringify(specs) + '<|end_message|>', effort = false;
    const effortOnce = () => { if (!effort) { p += '<|message_system|><|content_text|>Thinking effort level: 0<|end_message|>'; effort = true; } };
    const names = {};
    for (const m of messages) {
      if (m.role !== 'system') effortOnce();
      if (m.role === 'system') { p += '<|message_system|><|content_text|>' + m.content + '<|end_message|>'; continue; }
      if (m.role === 'user') { p += '<|message_user|><|content_text|>' + m.content + '<|end_message|>'; continue; }
      if (m.role === 'tool') { p += '<|message_tool|>' + (names[m.tool_call_id] || '') + '<|content_text|>' + m.content + '<|end_message|>'; continue; }
      // the model's own words as it wrote them (raw): the prompt then starts with what llama.cpp
      // has cached, so the next step reads only what is new (Inkling's recurrent layers keep no
      // checkpoints here: a prompt that differs anywhere is read again whole, about 70 s)
      if (m.role === 'assistant' && m.raw != null && (m.tool_calls || []).length <= 1) {
        (m.tool_calls || []).forEach(tc => { names[tc.id] = tc.function.name; });
        p += '<|message_model|>' + m.raw + '<|end_message|><|content_model_end_sampling|>';
        continue;
      }
      if (m.role === 'assistant') {
        if ((m.content || '').trim()) p += '<|message_model|><|content_text|>' + m.content.trim() + '<|end_message|>';
        for (const tc of m.tool_calls || []) {
          names[tc.id] = tc.function.name;
          p += '<|message_model|>' + tc.function.name + '<|content_invoke_tool_json|>{"name":' + JSON.stringify(tc.function.name) + ',"args":' + JSON.stringify(sortKeys(argsOf(tc))) + '}<|end_message|>';
        }
        p += '<|content_model_end_sampling|>';
      }
    }
    effortOnce();
    return p + '<|message_model|>';
  }
  function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])); return v; }

  // ---- the window: old turns summarised when it fills ----
  // Keeps the system message and the first request, a summary of what was done (the log),
  // and the newest turns that fit in maxChars (never starting on a result without its call).
  function compact(messages, log, maxChars) {
    const head = messages.slice(0, 2), rest = messages.slice(2), keep = [];
    let size = 0;
    for (let i = rest.length - 1; i >= 0; i--) { const n = JSON.stringify(rest[i]).length; if (size + n > maxChars && keep.length) break; size += n; keep.unshift(rest[i]); }
    while (keep.length && keep[0].role === 'tool') keep.shift();
    if (keep.length === rest.length) return messages;
    const note = { role: 'user', content: 'Earlier steps, summarised (the details are in the world: read it with get_scenario):\n- ' + log.slice(-80).join('\n- ') };
    return [...head, note, ...keep];
  }
  const chars = messages => messages.reduce((n, m) => n + String(m.content || '').length + JSON.stringify(m.tool_calls || '').length, 0);

  // ---- backends ----
  // an OpenAI-compatible endpoint with "tools" (the visitor's key or server)
  function openaiBackend(cfg, info = {}) {
    let client = null, lib = null;
    const OPENROUTER = /openrouter\.ai/.test(cfg.baseURL);
    return {
      name: cfg.model, kind: 'openai', context: info.context || 32768,
      async step(messages, tools, onStream, signal) {
        lib ||= await import('/libs/brain/engines/openai.js');
        client ||= new lib.OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: 600000, defaultHeaders: OPENROUTER ? { 'HTTP-Referer': location.origin, 'X-Title': 'Tablefolk' } : {} });
        const room = Math.max(2048, (info.context || 32768) - Math.ceil(JSON.stringify(messages).length / 3.5) - Math.ceil(JSON.stringify(tools).length / 3.5) - 512);
        const body = { model: cfg.model, messages, tools, tool_choice: 'auto', stream: true, temperature: 0.4, max_tokens: Math.min(info.maxOutput || room, room, 32768), ...(OPENROUTER ? { usage: { include: true } } : { stream_options: { include_usage: true } }) };
        let res;
        try { res = await client.chat.completions.create(body, { signal }); }
        catch (e) { if ((e?.status === 402 || /max_tokens|fewer/i.test(e?.message)) && body.max_tokens > 8192) res = await client.chat.completions.create({ ...body, max_tokens: 8192 }, { signal }); else throw e; }
        const out = await lib.collect(res, t => onStream?.({ text: t }), (n, tail) => onStream?.({ thought: n, tail }), calls => onStream?.({ calls: calls.map(c => ({ name: c.function.name, chars: c.function.arguments.length })) }));
        return readAnswer(out);
      },
    };
  }
  // an OpenAI-style answer {text, tool_calls, usage} -> { text, calls, usage, cost }
  function readAnswer(out) {
    const calls = (out.tool_calls || []).filter(tc => tc?.function?.name).map(tc => { let args = {}, bad = null; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { const j = looseJSON(tc.function.arguments); if (j) args = j.value; else bad = 'the arguments were not valid JSON: ' + e.message; } return { id: tc.id || callId(), name: tc.function.name, args, bad }; });
    // a model that writes its calls as text despite the tools (some local servers): read them from the text
    if (!calls.length && /<tool_call>|<function=|"arguments"\s*:/.test(out.text || '')) { const p = parseToolCalls(out.text, 'qwen-xml'); return { text: p.text, calls: p.calls, usage: out.usage, cost: out.usage?.cost }; }
    return { text: out.text || '', calls, usage: out.usage, cost: out.usage?.cost };
  }
  // the server's own model ("Cloud" or "On this server"): each step through POST /api/worldgen/step,
  // which puts the server's system message and tools in front and streams back progress, then the answer
  function serverBackend(cfg, info = {}) {
    return {
      name: cfg.model || "the server's model", kind: 'openai', context: info.context || 65536, where: cfg.where,
      async step(messages, tools, onStream, signal) {
        const q = new URLSearchParams({ where: cfg.where || 'cloud' }); if (cfg.model) q.set('model', cfg.model);
        const r = await fetch('/api/worldgen/step?' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.filter(m => m.role !== 'system').map(({ raw, ...m }) => m) }), signal });
        if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); const e = new Error(d.error || 'HTTP ' + r.status); e.status = r.status; throw e; }
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = null;
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = chunk.match(/^event: (.*)$/m)?.[1]; let d = {}; try { d = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] || '{}'); } catch {}
            if (ev === 'progress') onStream?.(d);
            else if (ev === 'failed') { const e = new Error(d.error || 'the model failed'); e.status = d.status; throw e; }
            else if (ev === 'done') out = d;
          }
        }
        if (!out) throw new Error('no answer from the server (connection lost?)');
        return readAnswer(out);
      },
    };
  }
  // an engine in this browser: spec { name, format, context, generate(messages, {maxTokens, temperature}, onToken)
  // (chat messages, for qwen-xml), raw(prompt, {maxTokens, temperature, stops}, onToken) (a whole prompt, for inkling) }
  function localBackend(spec) {
    return {
      name: spec.name, kind: 'local', context: spec.context || 8192, format: spec.format,
      async step(messages, tools, onStream) {
        const promptChars = chars(messages) + JSON.stringify(tools).length;
        const maxTokens = Math.max(1024, Math.min(4096, (spec.context || 8192) - Math.ceil(promptChars / 3.2) - 64));
        let text;
        if (spec.format === 'inkling') {
          let prompt = inklingPrompt(messages, tools);
          const stops = ['<|end_message|>', '<|content_model_end_sampling|>', '<|message_'];
          for (let i = 0; i < 3; i++) {
            text = await spec.raw(prompt, { maxTokens, temperature: 0.4, stops }, t => onStream?.({ text: t }));
            // it thought first (a thinking block ends at <|end_message|>): keep the thought, ask for the answer
            if (/^\s*<\|content_thinking\|>/.test(text) || (/^\s*$/.test(text) && i === 0)) { prompt += text + '<|end_message|><|message_model|>'; continue; }
            break;
          }
        } else text = await spec.generate(renderMessages(messages, tools, spec.format), { maxTokens, temperature: 0.4 }, t => onStream?.({ text: t }));
        const p = parseToolCalls(text, spec.format);
        return { text: p.text, calls: p.calls, usage: { prompt_tokens: Math.ceil(promptChars / 3.2), completion_tokens: Math.ceil(String(text).length / 3.2) }, raw: text };
      },
    };
  }

  // ---- the loop ----
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  };
  let session = null, stopping = false, aborter = null;
  const say = (emit, label, extra = {}) => emit('progress', { stage: 'agent', label, ...extra, preview: session.log.slice(-6).join('\n') });

  // ---- going round in circles: what the world is now, and what is left ----
  const READ_ONLY = new Set(['get_scenario', 'get_catalog', 'validate', 'preview']);
  const sigOf = c => c.name + ' ' + JSON.stringify(c.args || {});
  const hasMap = s => !!(s?.generate || (Array.isArray(s?.grid) && s.grid.length) || (Array.isArray(s?.map) && s.map.length));
  function worldNow(s) {
    const subs = Object.entries(s.subworlds || {});
    const parts = [s.title ? `"${s.title}"` : 'no title yet', hasMap(s) ? `a ${s.generate ? s.generate.kind + ' map' : s.grid ? 'drawn room' : 'laid-out scene'}` : 'no map yet',
      (s.agents || []).length ? 'characters ' + s.agents.map(a => a.id).join(', ') : 'no characters yet', `${(s.objects || []).length} things`];
    if (subs.length) parts.push('sections ' + subs.map(([k, v]) => `${k} (${v.generate?.kind || 'no map'}: ${(v.agents || []).map(a => a.id).join(', ') || 'nobody yet'})`).join('; '));
    return parts.join('; ');
  }
  function nextStep(S) {
    const s = S.scenario, empty = Object.entries(s.subworlds || {}).filter(([, v]) => !(v.agents || []).length).map(([k]) => k);
    if (!hasMap(s)) return 'call set_map (method "generate") once';
    if (!(s.agents || []).length) return 'add the characters one by one with character (action "add", each with a personality)';
    if (empty.length) return `add the characters of section${empty.length > 1 ? 's' : ''} ${empty.join(', ')} (character add with "section")`;
    if (S.problems?.length) return 'fix the first problem validate listed: ' + String(S.problems[0]).slice(0, 200);
    if (!s.title) return 'give it a title with set_meta';
    return 'call validate, fix what it lists, then call finish with a short summary';
  }
  const recovery = (S, why) => `You are going round in circles: ${why}. Do not make that call again.\nThe world now: ${worldNow(S.scenario)}.\nNext: ${nextStep(S)}. Make one new call now; if the world is complete, call finish.`;
  // after a step: the calls made ({sig, name, ok, changed}); returns why the run looks stuck, or null
  function watch(S) {
    const c = S.calls, last = c[c.length - 1]; if (!last) return null;
    const same = c.slice(-8).filter(x => x.sig === last.sig).length;
    if (same >= 3) return `you called ${last.name} with the same arguments ${same} times`;
    const run = n => c.length >= n && c.slice(-n).every(x => x.name === last.name);
    if (['set_map', 'plan_sections'].includes(last.name) && run(4)) return `you called ${last.name} 4 times running`;
    if (!READ_ONLY.has(last.name) && run(3) && c.slice(-3).every(x => !x.ok)) return `${last.name} failed 3 times running (last: ${String(last.error || '').slice(0, 160)}); read its error, use get_catalog if a name is wrong, or do something else first`;
    if (S.idle >= 6) return `${S.idle} steps without a change to the world`;
    return null;
  }

  async function loop(emit, t0) {
    const S = session, B = S.backend;
    let nudges = 0, why = '';
    stopping = false; S.calls = []; S.idle = 0; S.stuck = 0; S.problems = null;
    for (let n = 0; n < MAX_STEPS; n++) {
      if (stopping) { why = 'was stopped'; break; }
      if (S.tokens > TOKEN_BUDGET()) { why = `used up the token budget (${TOKEN_BUDGET().toLocaleString()})`; S.log.push('stopped: ' + why); break; }
      // the window: compact at 60% of it (about 3.5 characters a token)
      const limit = B.context * 3.5 * 0.6;
      if (chars(S.messages) + JSON.stringify(S.tools).length > limit) S.messages = compact(S.messages, S.log, Math.max(4000, limit * 0.5 - chars(S.messages.slice(0, 2))));
      S.steps++;
      say(emit, `step ${S.steps}: ${B.kind === 'local' ? 'the model is writing' : 'waiting for ' + B.name}…`, { step: S.steps });
      let r;
      aborter = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let lastShown = 0;
      try {
        r = await B.step(S.messages, S.tools, d => {
          const now = Date.now(); if (now - lastShown < 400) return; lastShown = now;
          if (d.calls?.length) { const c = d.calls[d.calls.length - 1]; say(emit, `step ${S.steps}: writing ${c.name || 'a call'}… ${c.chars || 0} characters`, { step: S.steps }); }
          else if (d.thought) say(emit, `step ${S.steps}: thinking… ${d.thought} characters`, { step: S.steps });
          else if (d.text) say(emit, `step ${S.steps}: writing… ${typeof d.text === 'number' ? d.text : d.text.length} characters`, { step: S.steps });
        }, aborter?.signal);
      } catch (e) {
        if (stopping) { why = 'was stopped'; break; }
        // nothing built yet: the error is the answer (the caller may fall back to one answer)
        if (!S.version) throw e;
        why = `failed at step ${S.steps} (${String(e?.message || e).slice(0, 200)})`; S.log.push('the model ' + why); break;
      }
      S.tokens += (r.usage?.prompt_tokens || 0) + (r.usage?.completion_tokens || 0); if (r.cost) S.cost += +r.cost || 0;
      S.messages.push({ role: 'assistant', content: r.text || '', ...(B.format === 'inkling' && r.raw != null ? { raw: r.raw } : {}), ...(r.calls.length ? { tool_calls: r.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) });
      if (!r.calls.length) {
        if (r.text) S.log.push('the model: ' + r.text.slice(0, 160));
        if (++nudges > 2) { why = 'stopped calling tools'; S.log.push('the model stopped calling tools'); break; }
        S.messages.push({ role: 'user', content: (S.version ? `The world now: ${worldNow(S.scenario)}. Next: ${nextStep(S)}. ` : '') + 'Use the tools to build the world (one call or several); when it is complete and validate shows no problems, call finish with a short summary.' });
        continue;
      }
      nudges = 0;
      const v0 = S.version;
      for (const c of r.calls) {
        let d;
        const sig = sigOf(c);
        if (c.bad) d = { result: { error: c.bad }, log: `${c.name}: ${c.bad}` };
        else if (c.name === 'undo') {
          const prev = S.history.pop();
          if (prev) { S.scenario = JSON.parse(prev); S.version++; d = { result: { ok: true }, log: 'took back the last change' }; } else d = { result: { error: 'nothing to take back' }, log: 'undo: nothing to take back' };
        } else if (!READ_ONLY.has(c.name) && c.name !== 'finish' && S.lastChange?.sig === sig && S.lastChange.version === S.version) {
          // the same change again on the same world: already done (it would change nothing)
          d = { result: { ok: true, unchanged: true, note: `already done: this exact call was made last time and the world has not changed since. Do not repeat it. Next: ${nextStep(S)}.` }, log: `${c.name}: already done (repeated)`, repeat: true };
        } else {
          try { d = await post('/api/worldgen/tool', { scenario: S.scenario, name: c.name, args: c.args, prompt: S.prompt, fresh: S.fresh }); }
          catch (e) { d = { result: { error: 'the tool could not run: ' + e.message }, log: `${c.name}: ${e.message}` }; }
          if (d.changed && d.scenario) { S.history.push(JSON.stringify(S.scenario)); if (S.history.length > 80) S.history.shift(); S.scenario = d.scenario; S.version++; S.lastChange = { sig, version: S.version }; }
          if (c.name === 'validate' && Array.isArray(d.result?.problems)) S.problems = d.result.problems;
          if (c.name === 'finish' && d.problems) S.problems = d.problems;
        }
        S.calls.push({ sig, name: c.name, ok: !d.result?.error && d.result?.ok !== false && !d.repeat, error: d.result?.error || (d.result?.problems || []).join('; ') });
        if (S.calls.length > 40) S.calls.shift();
        S.messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(d.result).slice(0, 12000) });
        if (d.log) { S.log.push(d.log); say(emit, d.log, { step: S.steps }); }
        if (d.done) return done(emit, d.done, t0);
      }
      S.idle = S.version > v0 ? 0 : S.idle + 1;
      const stuck = watch(S);
      if (stuck) {
        S.stuck++; S.calls = []; S.idle = 0;
        S.log.push('going round in circles: ' + stuck);
        say(emit, `step ${S.steps}: the model is going round in circles (${stuck}); telling it how to go on`, { step: S.steps });
        if (S.stuck >= 3) { why = 'kept going round in circles (' + stuck + ')'; break; }
        S.messages.push({ role: 'user', content: recovery(S, stuck) });
      }
    }
    if (!why) why = `reached the step limit (${MAX_STEPS})`;
    // stop, the caps, circles, no more calls, a failed model: finish what is there; code completes what it can
    if (!S.version && !stopping) {
      const said = S.log.filter(l => l.startsWith('the model: ')).pop();
      return emit('failed', { error: `${B.name} ${why} before building anything${said ? ' (' + said.slice(0, 200) + ')' : ''}. Try again, or turn agent mode off to have it write the world as one answer.`, noTools: why === 'stopped calling tools' });
    }
    say(emit, `the agent ${why}: checking what was built…`);
    const d = await post('/api/worldgen/tool', { scenario: S.scenario, name: 'finish', args: { summary: stopping ? 'Stopped by the player.' : `The agent ${why}; what it built was checked and completed.` }, prompt: S.prompt, fresh: S.fresh, auto: true }).catch(e => ({ result: { problems: [e.message] } }));
    if (d.done) { if (d.done.auto?.length) S.log.push('completed by code: ' + d.done.auto.join('; ')); return done(emit, d.done, t0, why); }
    emit('failed', { error: `${B.name} ${why}, and the world could not be completed: ${(d.result?.problems || []).slice(0, 4).join('; ')}. Try again (runs differ), ask for a smaller world, or turn agent mode off to have the model write it as one answer.` });
  }
  async function done(emit, d, t0, why = '') {
    const S = session;
    S.scenario = d.scenario; S.history.push(JSON.stringify(d.scenario));
    // the server's record and link, as other built worlds (no request: the checks already ran)
    let saved = null; try { saved = await post('/api/finish', { scenario: d.scenario, model: S.backend.name + ' (agent)', ms: Date.now() - t0, mode: 'agent' }); } catch {}
    const cost = S.cost ? ` · $${S.cost.toFixed(4)}` : '';
    const auto = d.auto?.length ? ` (The agent ${why || 'ended early'}; code completed: ${d.auto.join('; ')}.)` : why ? ` (The agent ${why}.)` : '';
    emit('done', { scenario: saved?.scenario || d.scenario, code: saved?.code || d.code, link: saved?.link || d.link, ms: Date.now() - t0, model: `${S.backend.name} (agent mode, ${S.steps} steps${cost})`,
      summary: (d.summary || '') + auto, agent: true, steps: S.steps, tokens: S.tokens, cost: S.cost, log: S.log.slice(), report: d.report, ended: why || null });
  }
  async function start(body) {
    const d = await post('/api/worldgen/agent', body);
    if (!d.tools) throw new Error(d.error || 'no tools from the server');
    return d;
  }
  const fresh = (backend, d, scenario, prompt) => ({ backend, tools: d.tools, messages: [{ role: 'system', content: d.system }, { role: 'user', content: d.user }], scenario, history: [], log: [], steps: 0, tokens: 0, cost: 0, version: 0, prompt, fresh: !prompt ? false : true });
  async function build(prompt, backend, emit, opts = {}) {
    const t0 = Date.now();
    try {
      const d = await start({ prompt, ...(+opts.sections > 1 ? { sections: +opts.sections, shape: opts.shape || 'auto' } : {}) });
      session = fresh(backend, d, {}, prompt);
      say(emit, `agent mode: ${backend.name} builds the world with tools${+opts.sections > 1 ? ` in ${opts.sections} sections` : ''}`);
      await loop(emit, t0);
    } catch (e) { emit('failed', { error: String(e?.message || e) }); }
  }
  async function change(scenario, request, emit, backend = null, opts = {}) {
    const t0 = Date.now();
    try {
      if (!session && !backend) throw new Error('no agent session: build a world in agent mode first');
      const body = opts.review ? { review: opts.review } : { request };
      if (!session || (backend && backend !== session.backend)) {
        const d = await start({ ...body, system: true });
        session = fresh(backend || session.backend, d, scenario, '');
      } else {
        const d = await start(body);
        session.messages.push({ role: 'user', content: d.user });
        session.scenario = scenario; session.fresh = false;
      }
      session.log.push(opts.review ? `review round ${opts.review.round} of ${opts.review.rounds}` : 'the player asked: ' + String(request).slice(0, 160));
      session.steps = 0; session.cost = 0; session.tokens = 0; session.version = 1;   // the step cap and the budget are per request; the world exists
      session.lastChange = null;
      await loop(emit, t0);
    } catch (e) { emit('failed', { error: String(e?.message || e) }); }
  }
  function stop() { stopping = true; try { aborter?.abort(); } catch {} }

  const api = { build, change, stop, canAgent, toolsRefused, openaiBackend, serverBackend, localBackend, readAnswer, parseToolCalls, renderMessages, inklingPrompt, compact, watch, recovery, nextStep, worldNow, AGENT_MODELS, get session() { return session; }, reset() { session = null; } };
  globalThis.TablefolkWorldAgent = api;
  if (W) W.tfWorldAgent = api;
})();
