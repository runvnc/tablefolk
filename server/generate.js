// Scenario generator: a prompt in, a playable scenario link out.
//
//   GET /world/<prompt words>[?mode=generate|grid|map&model=...&endpoint=local&view=builder|loading]
//       a page that shows progress and then opens the scenario
//   GET /api/generate?prompt=...&mode=...&model=...&endpoint=...[&stream=1]
//       the JSON result ({ scenario, code, link, warnings, ms }), or with
//       stream=1 server-sent events: progress, then a final "done"
//   POST /api/revise {scenario, request}
//       the same events for a change to an existing scenario (the builder's
//       "ask the AI for changes" box)
//
// One fast pass of the "fast skill" (server/fast-skill.md, a condensed
// tablefolk-scenario skill) on the generator endpoint (GEN_* settings,
// default deepseek/deepseek-v4.1-flash-1017 on OpenRouter (or OpenAI directly,
// set on the admin page); endpoint=local uses litert-lm
// serve), checked here (the procedural generator runs too, so a bad "in" is
// caught), with one repair round if it has problems. Results are saved under
// generated/.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenAI, collect } from '../libs/brain/engines/openai.js';
import { config, ROOT, endpoint, LITERT_URL } from './config.js';
import { isAdmin, overLimit } from './admin.js';
import { voicesText, packVoices, guestMay } from './settings.js';
import { checkScenario as checkCore, parseJSON, encodeScenario, systemPrompt as systemCore, generateUser, reviseRequest, mergeKept, finishScenario, worldPage, BROWSER_MODELS, OWN_MODELS } from './worldgen-core.js';
export { encodeScenario };
export const checkScenario = s => checkCore(s, packVoices());

// The last generations, for the admin page: { at, prompt, model, ms, ok, title, error }.
export const recent = [];

const SKILL = readFileSync(join(ROOT, 'server/fast-skill.md'), 'utf8');

// Where the builder may run a model, and which: an admin anything, a guest
// what the admin page allows (config.worldgen.guest). "browser" runs in the
// page itself (app/worldgen-browser.js), so it only needs listing here.
async function localModels() {
  try { const r = await fetch(LITERT_URL + '/models', { signal: AbortSignal.timeout(1200) }); const d = await r.json(); return (d.data || []).map(m => m.id).filter(Boolean); } catch { return null; }
}
export async function worldgenOptions(req) {
  const admin = isAdmin(req), wg = config.worldgen, g = wg.guest;
  const cloudAll = [...new Set([config.generator.model, ...wg.cloudModels].filter(Boolean))];
  const local = await localModels();
  const where = [], may = id => admin || guestMay.build(id);
  if (may('browser')) where.push({ id: 'browser', label: 'In this browser', note: 'free and private: the model runs on your own graphics card (downloaded once, then kept)', models: BROWSER_MODELS.map(([id, label]) => ({ id, label })) });
  if (may('own')) where.push({ id: 'own', label: 'Your own key', note: 'your OpenRouter key, or any OpenAI-compatible server (a local one too); your browser calls it directly, the key never reaches this server', models: OWN_MODELS.map(id => ({ id, label: id })) });
  if (may('server') && (local?.length || admin)) where.push({ id: 'server', label: 'On this server', note: local ? 'the local model server' : 'the local model server is not running', models: (local?.length ? local : [endpoint('local', '', '', '').model]).map(id => ({ id, label: id })), down: !local });
  if (may('cloud')) {
    const models = admin ? cloudAll : g.cloudModels.length ? g.cloudModels : [config.generator.model];
    where.push({ id: 'cloud', label: config.generator.provider === 'openrouter' ? 'Cloud (OpenRouter)' : config.generator.provider === 'openai' ? 'Cloud (OpenAI)' : 'Cloud', note: 'fast, thinks longest', models: models.map(id => ({ id, label: id.replace(/^[\w-]+\//, '') + (id === config.generator.model ? ' (default)' : '') })) });
  }
  return { admin, byo: !!config.byoModel, where, default: where.find(w => w.id === 'cloud') ? 'cloud' : where.find(w => w.id === 'own') && config.byoModel ? 'own' : where[0]?.id || null, custom: admin };
}
// The endpoint for ?where=server|cloud&model= (older links: ?endpoint=local),
// or an error when this visitor may not use it.
function pickEndpoint(url, req) {
  const q = url.searchParams, admin = isAdmin(req), g = config.worldgen.guest;
  const where = q.get('where') || (q.get('endpoint') === 'local' ? 'server' : 'cloud'), model = (q.get('model') || '').trim();
  if (where === 'server') {
    if (!admin && !guestMay.build('server')) return { error: 'running models on this server is not open to guests: build in your browser or with your own key' };
    return endpoint('local', '', model, '');
  }
  if (!admin && !guestMay.build('cloud')) return { error: 'this server\'s cloud models are not open to guests: build in your browser or with your own key' };
  if (model && !admin) {
    const ok = g.cloudModels.length ? g.cloudModels : [config.generator.model];
    if (!ok.includes(model)) return { error: `the model ${model} is not open to guests` };
  }
  return { ...config.generator, model: model || config.generator.model };
}

// The generator's system prompt: the fast skill and the voices.
const systemPrompt = () => systemCore(SKILL, voicesText());
// Run the generator; `emit(event, data)` reports progress.
export async function generateScenario({ prompt, mode = 'auto', ep, emit = () => {} }) {
  // reasoning models (deepseek) think at length before the JSON: room for both
  return runModel({ label: prompt, mode, ep, emit, maxTokens: 17000, user: generateUser(prompt, mode) });
}

// Change an existing scenario as asked ("make the goblin a shopkeeper",
// "add a second treasure room"); the whole updated JSON comes back.
export async function reviseScenario({ scenario, request, ep, emit = () => {} }) {
  const { kept, maxTokens, user } = reviseRequest(scenario, request);
  return runModel({ label: 'change: ' + request, mode: 'revise', ep, emit, maxTokens, user, merge: kept ? out => mergeKept(out, kept) : null });
}
async function runModel({ label, mode, ep, emit, user, maxTokens, merge = null }) {
  const t0 = Date.now(), prompt = label;
  const client = new OpenAI({ baseURL: ep.baseURL, apiKey: ep.apiKey, defaultHeaders: ep.headers || {}, timeout: 600000 });   // long thinking: up to 10 minutes
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ];
  let scenario = null, problems = [], raw = '';
  for (let round = 0; round < 2; round++) {
    emit('progress', { stage: round ? 'repairing' : 'waiting', model: ep.model });
    let chars = 0, last = 0, lastT = -1;
    const out = await collect(await client.chat.completions.create({ model: ep.model, messages, stream: true, temperature: 0.7, max_tokens: maxTokens }), text => {
      chars = text.length;
      if (chars - last > 120) { last = chars; emit('progress', { stage: round ? 'repairing' : 'writing', chars, preview: text.slice(-160) }); }
    }, (thought, tail) => {
      if (!chars && (lastT < 0 || thought - lastT > 80)) { lastT = thought; emit('progress', { stage: 'thinking', thought, preview: tail.slice(-220) }); }
    });
    raw = out.text;
    try { scenario = parseJSON(raw); if (merge) scenario = merge(scenario); problems = checkScenario(scenario); }
    catch (e) { scenario = null; problems = [e.message]; }
    if (!problems.length) break;
    emit('progress', { stage: 'problems', problems });
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Fix these problems and reply with the whole corrected JSON object only:\n- ${problems.join('\n- ')}` });
  }
  if (!scenario) { recent.push({ at: Date.now(), prompt, model: ep.model, ms: Date.now() - t0, ok: false, error: problems.join('; ').slice(0, 300) }); if (recent.length > 50) recent.shift(); throw new Error('the model did not produce a usable scenario: ' + problems.join('; ')); }
  recent.push({ at: Date.now(), prompt, model: ep.model, ms: Date.now() - t0, ok: true, title: scenario.title || '' }); if (recent.length > 50) recent.shift();
  const code = encodeScenario(scenario);
  const slug = (scenario.title || prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'scenario';
  try {
    mkdirSync(join(ROOT, 'generated'), { recursive: true });
    writeFileSync(join(ROOT, 'generated', `${slug}-${Date.now()}.json`), JSON.stringify({ prompt, mode, model: ep.model, ...scenario }, null, 2) + '\n');
  } catch {}
  return { scenario, code, warnings: problems, ms: Date.now() - t0, model: ep.model };
}

// POST /api/revise {scenario, request} -> server-sent events like
// /api/generate?stream=1: progress, then "done" {scenario, code, link, ...}
export async function handleRevise(req, url) {
  if (req.method !== 'POST') return Response.json({ error: 'POST {scenario, request}' }, { status: 405 });
  let body; try { body = await req.json(); } catch { return Response.json({ error: 'bad JSON' }, { status: 400 }); }
  const request = String(body?.request || '').trim().slice(0, 2000), scenario = body?.scenario;
  if (!request || !scenario || typeof scenario !== 'object') return Response.json({ error: 'scenario and request required' }, { status: 400 });
  if (JSON.stringify(scenario).length > 400000) return Response.json({ error: 'scenario too large' }, { status: 413 });
  let ep = pickEndpoint(url, req); const enc = new TextEncoder();
  if (!ep.error && overLimit(req, 'revise', 20, 3600e3)) ep = { error: 'too many changes this hour: try again later' };
  if (ep.error) return Response.json({ error: ep.error }, { status: 403 });
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event, data) => { try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try { const r = await reviseScenario({ scenario, request, ep, emit: send }); send('done', { ...r, link: '/app/#s=' + r.code }); }
      catch (e) { failed('change: ' + request, ep, e); send('failed', { error: e.message }); }
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

function failed(prompt, ep, e) {
  if (recent.at(-1)?.prompt === prompt && !recent.at(-1).ok) return;   // already noted
  recent.push({ at: Date.now(), prompt, model: ep.model, ms: 0, ok: false, error: String(e.message).slice(0, 300) }); if (recent.length > 50) recent.shift();
}
export async function handleGenerate(req, url) {
  const prompt = (url.searchParams.get('prompt') || '').trim().slice(0, 2000);
  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 });
  const mode = url.searchParams.get('mode') || 'auto';
  // a visitor builds at most 8 worlds an hour with the server's models
  let ep = pickEndpoint(url, req);
  if (!ep.error && overLimit(req, 'generate', 8, 3600e3)) ep = { error: 'you have built a lot of worlds this hour: try again later, or build in your browser' };
  // a stream (EventSource) gets the refusal as its "failed" event
  if (ep.error && url.searchParams.get('stream') === '1') return new Response(`event: failed\ndata: ${JSON.stringify({ error: ep.error })}\n\n`, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  if (ep.error) return Response.json({ error: ep.error }, { status: 403 });
  if (url.searchParams.get('stream') !== '1') {
    try { const r = await generateScenario({ prompt, mode, ep }); return Response.json({ ...r, link: '/app/#s=' + r.code }); }
    catch (e) { failed(prompt, ep, e); return Response.json({ error: e.message }, { status: 502 }); }
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event, data) => { try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try {
        const r = await generateScenario({ prompt, mode, ep, emit: send });
        send('done', { ...r, link: '/app/#s=' + r.code });
      } catch (e) { failed(prompt, ep, e); send('failed', { error: e.message }); }
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' } });
}

// POST /api/worldgen/messages {prompt, mode} or {scenario, request}: the
// messages this server would send its own model, for the visitor's own key or
// server ("Your own key" in the builder): the page calls the model itself and
// sends the answer to /api/finish (with "kept" for a big map's revision),
// which checks it like a generated one; its problems go back to the model.
export async function handleWorldgenMessages(req) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (req.method !== 'POST') return Response.json({ error: 'POST {prompt, mode} or {scenario, request}' }, { status: 405, headers: cors });
  const text = await req.text().catch(() => '');
  if (text.length > 400000) return Response.json({ error: 'scenario too large' }, { status: 413, headers: cors });
  if (!isAdmin(req) && !guestMay.build('own')) return Response.json({ error: 'building with your own key is not open here' }, { status: 403, headers: cors });
  let b = {}; try { b = JSON.parse(text) || {}; } catch {}
  const system = { role: 'system', content: systemPrompt() };
  if (b.scenario && typeof b.scenario === 'object') {
    const request = String(b.request || '').trim().slice(0, 2000); if (!request) return Response.json({ error: 'request required' }, { status: 400, headers: cors });
    const { kept, maxTokens, user } = reviseRequest(b.scenario, request);
    return Response.json({ messages: [system, { role: 'user', content: user }], maxTokens, temperature: 0.7, kept }, { headers: cors });
  }
  const prompt = String(b.prompt || '').trim().slice(0, 2000); if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400, headers: cors });
  return Response.json({ messages: [system, { role: 'user', content: generateUser(prompt, String(b.mode || 'auto')) }], maxTokens: 17000, temperature: 0.7 }, { headers: cors });
}

// POST /api/finish {scenario, prompt, model, ms[, kept]}: a scenario made elsewhere
// (the world builder's step-by-step run with the model in the browser,
// app/worldgen-browser.js) checked like a generated one; problems come back
// for the model to fix, else it is saved and its link returned.
export async function handleFinish(req) {
  if (req.method !== 'POST') return Response.json({ error: 'POST {scenario, prompt}' }, { status: 405 });
  const text = await req.text().catch(() => '');
  const cors0 = { 'Access-Control-Allow-Origin': '*' };
  if (text.length > 400000) return Response.json({ error: 'scenario too large' }, { status: 413, headers: cors0 });
  if (overLimit(req, 'finish', 30, 3600e3)) return Response.json({ error: 'too many worlds saved this hour' }, { status: 429, headers: cors0 });
  let parsed = {}; try { parsed = JSON.parse(text); } catch {}
  const { prompt = '', model = 'browser', ms = 0 } = parsed || {};
  const cors = { 'Access-Control-Allow-Origin': '*' };   // tools/browser-test/worldgen-test.html runs on another port
  const r = finishScenario(parsed, packVoices());
  if (r.problems) return Response.json({ problems: r.problems }, { headers: cors });
  const { scenario, code } = r;
  recent.push({ at: Date.now(), prompt: String(prompt).slice(0, 300), model, ms, ok: true, title: scenario.title || '' }); if (recent.length > 50) recent.shift();
  const slug = (scenario.title || prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'scenario';
  try { mkdirSync(join(ROOT, 'generated'), { recursive: true }); writeFileSync(join(ROOT, 'generated', `${slug}-${Date.now()}.json`), JSON.stringify({ prompt, mode: String(parsed.mode || 'browser').slice(0, 20), model: String(model).slice(0, 120), ...scenario }, null, 2) + '\n'); } catch {}
  return Response.json({ scenario, code, link: '/app/#s=' + code, ms, model, warnings: [] }, { headers: cors });
}


// The /world/ page (worldgen-core.js worldPage): the builder, or the loading
// view (config.worldView; ?view= overrides).
export async function handleWorld(req, url, { saved = null } = {}) {
  const page = worldPage(url, { saved, admin: isAdmin(req), defaultView: config.worldView });
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
