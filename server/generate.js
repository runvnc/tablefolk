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
import { deflateRawSync } from 'node:zlib';
import { OpenAI, collect } from '../app/llm_js/openai-client.js';
import { config, ROOT, endpoint, LITERT_URL } from './config.js';
import { isAdmin, overLimit } from './admin.js';
import { voicesText, packVoices } from './settings.js';

// The last generations, for the admin page: { at, prompt, model, ms, ok, title, error }.
export const recent = [];
import '../app/procgen.js';

const SKILL = readFileSync(join(ROOT, 'server/fast-skill.md'), 'utf8');
const Procgen = globalThis.TablefolkProcgen;

const COMMANDS = new Set(['say', 'whisper', 'walk', 'face', 'look', 'touch', 'push', 'pull', 'carry', 'drop', 'throw', 'dig', 'build', 'repair',
  'panic', 'emote', 'note', 'give', 'give_quest', 'sell', 'inventory', 'goal', 'spell.push', 'spell.spark', 'spell.fireball', 'attack', 'wield', 'workflow', 'cast', 'steal', 'bandage', 'sing']);
const VOICES = new Set(['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius']);
// app.js AVATAR_MODELS + FIGURES; MINDLESS as in play.js (hostile by default)
const MINDLESS = new Set(['skeleton', 'skeleton_warrior', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon']);
const MODELS = new Set(['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian',
  'woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer', 'villager_woman',
  'skeleton', 'skeleton_warrior', 'skeleton_farmer', 'zombie', 'goblin', 'kobold', 'orc', 'troll', 'demon', 'giant', 'rat', 'spider', 'wolf', 'bat', 'dragon', 'ghost', 'slime']);
// what picking up an object gives (app/play.js PICKUPS)
const PICKUPS = { potion: 'healing potion', scroll: 'scroll', axe: 'axe', pickaxe: 'pickaxe', bag: 'bag', bucket: 'bucket', key: 'key', chalice: 'gold chalice', rope: 'rope', torch: 'torch' };
const MODES = { generate: 'A ("generate")', grid: 'B ("grid")', map: 'C ("map")' };

export function encodeScenario(obj) {
  return deflateRawSync(Buffer.from(JSON.stringify(obj)), { level: 9 }).toString('base64url');
}

// The first complete {...} in the reply (models sometimes add fences or chat).
function parseJSON(text) {
  const t = String(text).replace(/^﻿/, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('no JSON object in the reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('the JSON object is incomplete (reply cut off?)');
}

// Problems the model can fix (returned as text for a repair round), plus
// harmless fixes applied in place.
export function checkScenario(s) {
  const problems = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['the answer must be one JSON object'];
  s.v = 1;
  if (!Array.isArray(s.agents) || !s.agents.length) problems.push('"agents" must list at least one character');
  const ids = (s.agents || []).map(a => a?.id);
  for (const a of s.agents || []) {
    if (!a || typeof a !== 'object') { problems.push('every agent must be an object'); continue; }
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(String(a.id || ''))) problems.push(`agent id ${JSON.stringify(a.id)}: use 1-24 letters, digits, _ or -`);
    if (a.model && !MODELS.has(a.model)) a.model = 'critter';
    // monsters that only fight need no brief
    if (!a.personality && (a.hostile || (a.hostile == null && MINDLESS.has(a.model)))) a.personality = `A hostile ${String(a.model).replace(/_/g, ' ')}.`;
    if (!a.personality) problems.push(`agent ${a.id}: needs a "personality"`);
    if (a.ttsVoiceId) { const raw = String(a.ttsVoiceId).toLowerCase(), v = raw.replace(/^builtin:/, ''); if (packVoices().some(p => p.id === raw)) a.ttsVoiceId = raw; else if (VOICES.has(v)) a.ttsVoiceId = 'builtin:' + v; else delete a.ttsVoiceId; }
    for (const c of a.allowed || []) if (!COMMANDS.has(c)) problems.push(`agent ${a.id} "allowed": unknown command ${c}`);
  }
  if (new Set(ids).size !== ids.length) problems.push('agent ids must be unique');
  if (s.player?.model && !MODELS.has(s.player.model)) delete s.player.model;
  for (const c of s.allowed || []) if (!COMMANDS.has(c)) problems.push(`"allowed": unknown command ${c}`);
  if (!Array.isArray(s.allowed)) s.allowed = ['say', 'walk', 'face', 'emote'];
  // Person-height doors and first person need the tall walls (twice the
  // tabletop height); lower ones put the player's head through the lintel.
  if (!(+s.wallHeight >= 2)) s.wallHeight = 2;
  const methods = ['generate', 'grid', 'map'].filter(k => s[k] && (!Array.isArray(s[k]) || s[k].length));
  if (methods.length > 1 && methods.includes('generate')) problems.push(`use one map method, not ${methods.join(' + ')}`);
  if (s.generate) {
    try {
      const r = Procgen.applyToScenario(JSON.parse(JSON.stringify(s)));
      problems.push(...r.warnings);
      for (const l of Array.isArray(s.locked) ? s.locked : []) if (l?.in && !r.places.some(p => p.id.replace(/\s+\d+$/, '') === String(l.in).toLowerCase().replace(/\s+\d+$/, ''))) problems.push(`"locked": no place "${l.in}" (places: ${r.places.map(p => p.id).join(', ')})`);
    } catch (e) { problems.push('"generate": ' + e.message); }
  }
  if (s.grid) {
    const g = Array.isArray(s.grid) ? s.grid : String(s.grid).split('\n');
    const w = Math.max(...g.map(r => [...r].length));
    if (g.length > 63 || w > 63) problems.push(`"grid" is ${w} x ${g.length}; at most 63 x 63`);
    const digits = new Set(g.join('').match(/[1-9]/g) || []);
    for (const d of digits) if (+d > ids.length && !(s.legend || {})[d]) problems.push(`"grid": digit ${d} but only ${ids.length} agents (digits are agents in order)`);
  }
  if (s.map && !Array.isArray(s.map)) problems.push('"map" must be a list of lines');
  // goal ids
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (['agent_has', 'agent_gold', 'agent_near', 'said'].includes(k) && Array.isArray(v) && !ids.includes(v[0]) && !(k === 'said' && v[0] === 'any')) problems.push(`goal ${k}: ${v[0]} is not an agent id`);
      walk(v);
    }
  };
  walk(s.goal);
  // a locked door's key must be somewhere: carried, in a chest, or lying about
  const keyNames = [...new Set([...(s.objects || []).flatMap(o => [...(Array.isArray(o?.items) ? o.items : []), PICKUPS[o?.type]]), ...(s.agents || []).flatMap(a => (a?.inventory?.items || []).map(i => i?.name || i)), ...(s.player?.items || []).map(i => i?.name || i)].filter(Boolean).map(i => String(i).toLowerCase()))];
  for (const l of Array.isArray(s.locked) ? s.locked : []) {
    const k = String(l?.key || 'key').toLowerCase();
    if (!keyNames.some(n => n === k || (/key/.test(n) && (n.includes(k) || k.includes(n))))) problems.push(`"locked": nobody has the "${k}" and it lies nowhere: put it in a chest or give it to a character`);
  }
  // the player gets things from characters (give/sell), chests, or the floor
  const lying = new Set((s.objects || []).flatMap(o => [...(Array.isArray(o?.items) ? o.items : []), PICKUPS[o?.type]]).filter(Boolean).map(i => String(i).toLowerCase()));
  const want = String(s.goal?.win?.player_has || '').toLowerCase();
  if (want && !lying.has(want) && !(s.allowed || []).concat(...(s.agents || []).map(a => a.allowed || [])).some(c => c === 'give' || c === 'sell')) problems.push('a player_has goal needs some character allowed "give" or "sell" (or the item in a chest)');
  return problems;
}

// Where the builder may run a model, and which: an admin anything, a guest
// what the admin page allows (config.worldgen.guest). "browser" runs in the
// page itself (app/worldgen-browser.js), so it only needs listing here.
const BROWSER_MODELS = [['gemma4-e2b-litert', 'Gemma 4 E2B (about 2 GB, faster)'], ['gemma4-e4b-litert', 'Gemma 4 E4B (about 3 GB, better)']];
async function localModels() {
  try { const r = await fetch(LITERT_URL + '/models', { signal: AbortSignal.timeout(1200) }); const d = await r.json(); return (d.data || []).map(m => m.id).filter(Boolean); } catch { return null; }
}
export async function worldgenOptions(req) {
  const admin = isAdmin(req), wg = config.worldgen, g = wg.guest;
  const cloudAll = [...new Set([config.generator.model, ...wg.cloudModels].filter(Boolean))];
  const local = await localModels();
  const where = [];
  if (admin || g.browser) where.push({ id: 'browser', label: 'In this browser', note: 'free and private: Gemma runs on your own GPU (the game downloads it once)', models: BROWSER_MODELS.map(([id, label]) => ({ id, label })) });
  if ((admin || g.server) && (local?.length || admin)) where.push({ id: 'server', label: 'On this server', note: local ? 'the local model server' : 'the local model server is not running', models: (local?.length ? local : [endpoint('local', '', '', '').model]).map(id => ({ id, label: id })), down: !local });
  if (admin || g.cloud) {
    const models = admin ? cloudAll : g.cloudModels.length ? g.cloudModels : [config.generator.model];
    where.push({ id: 'cloud', label: config.generator.provider === 'openrouter' ? 'Cloud (OpenRouter)' : config.generator.provider === 'openai' ? 'Cloud (OpenAI)' : 'Cloud', note: 'fast, thinks longest', models: models.map(id => ({ id, label: id.replace(/^[\w-]+\//, '') + (id === config.generator.model ? ' (default)' : '') })) });
  }
  return { admin, where, default: where.find(w => w.id === 'cloud') ? 'cloud' : where[0]?.id || null, custom: admin };
}
// The endpoint for ?where=server|cloud&model= (older links: ?endpoint=local),
// or an error when this visitor may not use it.
function pickEndpoint(url, req) {
  const q = url.searchParams, admin = isAdmin(req), g = config.worldgen.guest;
  const where = q.get('where') || (q.get('endpoint') === 'local' ? 'server' : 'cloud'), model = (q.get('model') || '').trim();
  if (where === 'server') {
    if (!admin && !g.server) return { error: 'running models on this server is not open to guests' };
    return endpoint('local', '', model, '');
  }
  if (!admin && !g.cloud) return { error: 'cloud models are not open to guests' };
  if (model && !admin) {
    const ok = g.cloudModels.length ? g.cloudModels : [config.generator.model];
    if (!ok.includes(model)) return { error: `the model ${model} is not open to guests` };
  }
  return { ...config.generator, model: model || config.generator.model };
}

// Run the generator; `emit(event, data)` reports progress.
export async function generateScenario({ prompt, mode = 'auto', ep, emit = () => {} }) {
  const how = MODES[mode] ? `Use map method ${MODES[mode]}.` : 'Choose the map method that fits best.';
  // reasoning models (deepseek) think at length before the JSON: room for both
  return runModel({ label: prompt, mode, ep, emit, maxTokens: 17000,
    user: `Scenario request: ${prompt}\n\n${how} Reply with the JSON object only.` });
}

// Change an existing scenario as asked ("make the goblin a shopkeeper",
// "add a second treasure room"); the whole updated JSON comes back.
export async function reviseScenario({ scenario, request, ep, emit = () => {} }) {
  // A frozen layout (moved in the tabletop view) lists every wall and floor
  // tile: those stay here, and the model sees the rest plus a way to add or
  // remove objects by square, instead of rewriting hundreds of lines.
  const big = (scenario.objects?.length || 0) > 40 || (scenario.paint?.length || 0) > 40;
  const kept = big ? { objects: scenario.objects || [], paint: scenario.paint || [] } : null;
  const shown = big ? { ...scenario, objects: undefined, paint: undefined } : scenario;
  const note = big ? `\n\nThis map has fixed positions: its ${kept.objects.length} objects and ${kept.paint.length} floor tiles are not shown and are kept as they are. `
    + 'Do not write "objects" or "paint". To change the map, add "add_objects": [{"type": ..., "x": ..., "z": ..., ...}] and/or "remove_objects": [[x, z], ...] (removes the objects on those squares; [x, z, "type"] removes only that type) and/or "add_paint": [{"x", "z", "mat"}]. '
    + `Characters and the player move with "at": [x, z]. The board is ${scenario.size?.join(' x ') || 'unknown'} squares, x from west to east is decreasing, z grows to the south. Rooms: ${(scenario.places || []).map(p => p.id + (p.center ? ' at ' + JSON.stringify(p.center) : '')).join(', ') || 'none'}.`
    + `\nObjects by type: ${Object.entries((kept.objects).reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {})).map(([t, n]) => t + ' ' + n).join(', ')}.`
    + `\nNon-wall objects: ${kept.objects.filter(o => !['wall', 'door', 'light'].includes(o.type)).slice(0, 120).map(o => `${o.type} [${Math.round(o.x)},${Math.round(o.z)}]`).join(', ')}.` : '';
  const json = JSON.stringify(shown);
  const maxTokens = Math.min(24000, Math.max(17000, Math.ceil(json.length / 2.5) + 8000));
  const r = await runModel({ label: 'change: ' + request, mode: 'revise', ep, emit, maxTokens,
    user: `Here is a scenario:\n\n${json}${note}\n\nChange it as asked, and keep everything that the request does not touch exactly as it is (ids, positions, map method):\n${request}\n\nReply with the whole updated JSON object only.`,
    merge: big ? out => mergeKept(out, kept) : null });
  return r;
}
function mergeKept(s, kept) {
  const rm = Array.isArray(s.remove_objects) ? s.remove_objects.filter(Array.isArray) : [];
  const gone = o => rm.some(([x, z, t]) => Math.round(o.x) === Math.round(+x) && Math.round(o.z) === Math.round(+z) && (!t || t === o.type));
  s.objects = [...kept.objects.filter(o => !gone(o)), ...(Array.isArray(s.add_objects) ? s.add_objects.filter(o => o && o.type && Number.isFinite(+o.x) && Number.isFinite(+o.z)) : [])];
  s.paint = [...kept.paint, ...(Array.isArray(s.add_paint) ? s.add_paint.filter(c => c && c.mat && Number.isFinite(+c.x) && Number.isFinite(+c.z)) : [])];
  delete s.add_objects; delete s.remove_objects; delete s.add_paint;
  return s;
}

async function runModel({ label, mode, ep, emit, user, maxTokens, merge = null }) {
  const t0 = Date.now(), prompt = label;
  const client = new OpenAI({ baseURL: ep.baseURL, apiKey: ep.apiKey, defaultHeaders: ep.headers || {}, timeout: 600000 });   // long thinking: up to 10 minutes
  const messages = [
    { role: 'system', content: SKILL + `\n\nVoices (ttsVoiceId as written here; match the character's age, gender and manner, and give different characters different voices): ${voicesText()}.` },
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

// POST /api/finish {scenario, prompt, model, ms}: a scenario made elsewhere
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
  const { scenario, prompt = '', model = 'browser', ms = 0 } = parsed || {};
  let problems;
  try { problems = checkScenario(scenario); } catch (e) { problems = [e.message]; }
  const cors = { 'Access-Control-Allow-Origin': '*' };   // tools/browser-test/worldgen-test.html runs on another port
  if (problems.length) return Response.json({ problems }, { headers: cors });
  const code = encodeScenario(scenario);
  recent.push({ at: Date.now(), prompt: String(prompt).slice(0, 300), model, ms, ok: true, title: scenario.title || '' }); if (recent.length > 50) recent.shift();
  const slug = (scenario.title || prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'scenario';
  try { mkdirSync(join(ROOT, 'generated'), { recursive: true }); writeFileSync(join(ROOT, 'generated', `${slug}-${Date.now()}.json`), JSON.stringify({ prompt, mode: 'browser', model, ...scenario }, null, 2) + '\n'); } catch {}
  return Response.json({ scenario, code, link: '/app/#s=' + code, ms, model, warnings: [] }, { headers: cors });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Two views of the same run: "builder" (the prompt form, the stage and a
// preview of the JSON as it streams) and "loading" (just a progress bar with
// little made-up chores, for showing to players). The server's default is
// config.worldView (WORLD_VIEW=loading or --world-loading); ?view= overrides.
export async function handleWorld(req, url, { saved = null } = {}) {
  const words = decodeURIComponent(url.pathname.replace(/^\/world\/?/, '').replace(/\+/g, ' ')).replace(/[/_]+/g, ' ').trim();
  const qs = new URLSearchParams(url.search);
  const view = words && (qs.get('view') || config.worldView) === 'loading' ? 'loading' : 'builder';
  const admin = isAdmin(req);
  const builderBody = `<header class="top"><a class="brand" href="/world/"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22l12 7 12-7-12-7z" fill="var(--accent)" opacity=".35"/><path d="M4 16l12 7 12-7-12-7z" fill="var(--accent)" opacity=".6"/><path d="M4 10l12 7 12-7L16 3z" fill="var(--accent)"/></svg><b>Tablefolk</b><span>world builder</span></a>
<nav><a href="/app/?play=1">play the world</a>${admin ? '<a href="/admin">admin</a>' : ''}</nav></header>
<section class="create${words || saved ? ' compact' : ''}">
<h1>${words || saved ? 'Build another world' : 'Describe a world, and it is built for you'}</h1>
<form id="f" autocomplete="off">
  <div class="prompt"><textarea name="p" rows="2" placeholder="a small dungeon with a sorceress, goblins and a locked treasure room" required>${esc(words)}</textarea>
  <button class="primary" title="Build (Ctrl+Enter)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 5.3L20 9l-4.5 3.8L17 19l-5-3-5 3 1.5-6.2L4 9l5.8-.7z"/></svg>Build</button></div>
  <div class="opts">
    <div class="field"><span class="lbl">Where the model runs</span><div class="seg" id="where" role="radiogroup" aria-label="where the model runs"><span class="muted">loading…</span></div></div>
    <label class="field"><span class="lbl">Model</span><select name="model" id="model"></select></label>
    <label class="field" id="modeBox"><span class="lbl">Map</span><select name="mode"><option value="auto">any kind</option><option value="generate">generated rooms</option><option value="grid">drawn grid</option><option value="map">layout lines</option></select></label>
  </div>
  <p class="note" id="whereNote"></p>
</form></section>
<div class="card progress" id="card" ${words ? '' : 'hidden'}><div class="row1"><span class="spin" id="spin"></span><span id="stage">${saved ? 'saved world' + (saved.prompt ? ': “' + esc(saved.prompt) + '”' : '') : 'starting…'}</span><span id="clock"></span></div><div id="problems"></div><div id="preview"></div><div id="result"></div></div>
<div id="workspace" hidden>
  <div class="wshead"><div><h2 id="wsTitle"></h2><p class="muted" id="wsSub"></p></div>
    <div class="acts"><button type="button" class="primary" data-act="play"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>Play</button><button type="button" data-act="dev">Play in dev mode</button><button type="button" data-act="table">Print / tabletop</button><button type="button" data-act="copy">Copy link</button><button type="button" data-act="download">Download</button><span id="edmsg" class="muted"></span></div></div>
  <div id="mapEditor"></div>
  <div id="editor" hidden></div>
</div>`;
  const loadingBody = `<div class="load"><h1>Building your world</h1><p class="sub">“${esc(words)}”</p>
<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div id="fill"></div></div>
<div class="row"><span id="chore">Unrolling the map…</span><span id="clock"></span></div>
<div id="result"></div><span id="stage" hidden></span><div id="problems" hidden></div><div id="preview" hidden></div></div>`;
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${view === 'loading' ? 'Building your world' : 'Tablefolk world builder'}</title>
<style>
:root{--bg:#f3eee4;--fg:#2a251f;--muted:#7a6f62;--card:#fffbf3;--line:#e3d9c7;--accent:#7a5426;--accent2:#a8732f;--track:#e6dccb;--ok:#2f7a45;--bad:#b5442e;--shadow:0 1px 2px rgba(60,40,10,.06),0 8px 24px rgba(60,40,10,.08)}
@media (prefers-color-scheme:dark){:root{--bg:#191612;--fg:#ede6d9;--muted:#a39886;--card:#24201b;--line:#3a332b;--accent:#d9ae6f;--accent2:#e7c48e;--track:#3a332b;--ok:#7bc58f;--bad:#e08a66;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(1500px,100%);margin:0 auto;padding:0 20px 60px}
a{color:var(--accent)}button,input,select,textarea{font:inherit;color:inherit}
.top{display:flex;align-items:center;gap:16px;padding:14px 0}.brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--fg);font-size:1.05rem}.brand svg{width:28px;height:28px}.brand span{color:var(--muted)}
.top nav{margin-left:auto;display:flex;gap:16px}.top nav a{text-decoration:none;font-weight:600;font-size:.9rem}.top nav a:hover{text-decoration:underline}
.create{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow);margin:8px 0 18px}
.create h1{font-size:1.5rem;margin:0 0 14px;letter-spacing:-.01em}.create.compact{padding:14px 18px}.create.compact h1{font-size:1rem;color:var(--muted);margin:0 0 8px}
.prompt{display:flex;gap:10px;align-items:stretch}.prompt textarea{flex:1;resize:vertical;min-height:52px;padding:.7rem .9rem;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:1.02rem;line-height:1.4}
.prompt textarea:focus,select:focus,.seg button:focus-visible{outline:2px solid color-mix(in srgb,var(--accent) 60%,transparent);outline-offset:1px}
button.primary{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:var(--bg);border:0;border-radius:12px;padding:.55rem 1.2rem;font-weight:700;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.15)}button.primary:hover{background:var(--accent2)}button.primary svg{width:18px;height:18px;fill:currentColor}
.opts{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;align-items:flex-end}.field{display:flex;flex-direction:column;gap:4px;min-width:0}.lbl{font-size:.74rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.field select{padding:.45rem .6rem;border-radius:10px;border:1px solid var(--line);background:var(--bg);max-width:340px}
.seg{display:inline-flex;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{border:0;background:none;padding:.38rem .8rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:.88rem;color:var(--muted)}.seg button[aria-checked=true]{background:var(--card);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.14)}.seg button:disabled{opacity:.45;cursor:not-allowed}
.note{margin:8px 0 0;color:var(--muted);font-size:.85rem;min-height:1.3em}.muted{color:var(--muted);font-size:.86rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;box-shadow:var(--shadow);margin-bottom:18px}
.progress .row1{display:flex;align-items:center;gap:10px}#stage{font-weight:600}#clock{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--track);border-top-color:var(--accent);animation:sp 1s linear infinite;flex:none}.spin.stop{animation:none;border-color:var(--ok)}.spin.fail{animation:none;border-color:var(--bad)}@keyframes sp{to{transform:rotate(1turn)}}
#preview{font:12px/1.45 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:7.5em;overflow:hidden;margin-top:.5rem;-webkit-mask-image:linear-gradient(transparent,#000 35%);mask-image:linear-gradient(transparent,#000 35%)}#preview:empty{display:none}
#problems{color:var(--bad);font-size:.88rem}#preview.thought{font-style:italic;font-family:inherit;word-break:normal}#result:empty{display:none}
.wshead{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:6px 0 12px}.wshead h2{margin:0;font-size:1.45rem;letter-spacing:-.01em}.wshead p{margin:2px 0 0}
.acts{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center}.acts button{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:.45rem .85rem;cursor:pointer;font-weight:600;font-size:.88rem}.acts button:hover{border-color:var(--accent)}.acts button.primary{border:0;background:var(--accent);color:var(--bg)}.acts button.primary:hover{background:var(--accent2)}.acts svg{width:15px;height:15px;fill:currentColor}
#editor{margin-top:18px;display:grid;gap:14px}#editor .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line)}#editor .tabs button{border:0;background:none;padding:.5rem .9rem;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}#editor .tabs button.on{color:var(--fg);border-bottom-color:var(--accent)}
#editor fieldset{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px 16px;margin:0;box-shadow:var(--shadow)}
#editor legend{font-weight:700;padding:0 6px}#editor .cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 14px}
#editor label{display:flex;flex-direction:column;font-size:.78rem;color:var(--muted);gap:3px}#editor label.wide{grid-column:1/-1}
#editor input,#editor select,#editor textarea{font-size:.92rem;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:.4rem .55rem;width:100%}
#editor textarea{resize:vertical}.mono{font:12.5px/1.35 ui-monospace,monospace!important;white-space:pre}.bad{border-color:var(--bad)!important}
#editor fieldset.agent{background:var(--bg);box-shadow:none;margin-bottom:10px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:.4rem 0}
#editor button{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:.35rem .8rem;cursor:pointer;font-weight:600;font-size:.86rem}#editor button:hover{border-color:var(--accent)}#editor button.go{background:var(--accent);color:var(--bg);border:0}
button.small{padding:.1rem .5rem!important;font-size:.78rem!important}
#editor details summary{cursor:pointer;color:var(--muted);font-weight:600}#editor details textarea{width:100%;margin-top:6px}
#editor fieldset.ask{border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}#editor fieldset.ask textarea{width:100%}
#tableView{position:fixed;inset:0;z-index:11;background:var(--bg);display:flex;flex-direction:column}#tableView[hidden]{display:none}
#tableView .tvbar{display:flex;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--line)}#tableView iframe{flex:1;border:0;width:100%}
#tableView button{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:.35rem .8rem;cursor:pointer;font-weight:600}
.load{margin:22vh auto 0;max-width:620px;text-align:center}.load h1{font-size:1.7rem}.sub{color:var(--muted)}
.load #stage{display:block;margin-top:1rem;font-weight:500;font-size:.85rem;color:var(--muted)}.load #preview{text-align:left;max-height:4.4em;opacity:.8}
.bar{height:14px;border-radius:7px;background:var(--track);overflow:hidden;margin:1.4rem 0 .7rem}#fill{height:100%;width:0;background:var(--accent);border-radius:7px}
.row{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.95rem}#chore{transition:opacity .25s}
@media (max-width:700px){main{padding:0 12px 40px}.prompt{flex-direction:column}.create{padding:16px}.acts{margin-left:0}}
</style></head><body><main>
${view === 'loading' ? loadingBody : builderBody}
</main>${view === 'builder' ? '<script src="/app/procgen.js?v=20261025b"></script><script src="/app/map-editor.js?v=20261025h"></script><script src="/app/builder.js?v=20261025b"></script>' : ''}<script>
const qs=new URLSearchParams(${JSON.stringify(qs.toString())}), f=document.getElementById('f'), view=${JSON.stringify(view)};
const SAVED=${JSON.stringify(saved).replace(/</g, '\\u003c')};
const $=id=>document.getElementById(id);
// where the model runs and which: the choices this visitor has (/api/worldgen/options)
let OPTS=null;
if(f){
  const remembered=(()=>{ try{ return JSON.parse(localStorage.getItem('tablefolk.worldgen')||'{}'); }catch{ return {}; } })();
  const want={ where: qs.get('where')||(qs.get('how')==='browser'?'browser':null)||remembered.where, model: qs.get('model')||remembered.model };
  f.mode.value=qs.get('mode')||'auto';
  const setWhere=id=>{
    const w=OPTS.where.find(x=>x.id===id)||OPTS.where[0]; if(!w) return;
    for(const b of $('where').querySelectorAll('button')) b.setAttribute('aria-checked',String(b.dataset.w===w.id));
    $('model').innerHTML=w.models.map(m=>'<option value="'+m.id+'">'+m.label+'</option>').join('')+(OPTS.custom&&w.id==='cloud'?'<option value="__custom">another model…</option>':'');
    if(want.model && w.models.some(m=>m.id===want.model)) $('model').value=want.model;
    else if(want.model && OPTS.custom && w.id==='cloud'){ $('model').insertAdjacentHTML('afterbegin','<option value="'+want.model+'">'+want.model+'</option>'); $('model').value=want.model; }
    $('whereNote').textContent=w.note+(w.id==='browser'?' · writes the world step by step: plan, map, review, characters':'');
    // the browser's step by step run picks its own kind of map
    $('modeBox').hidden=w.id==='browser';
    f.dataset.where=w.id;
  };
  fetch('/api/worldgen/options').then(r=>r.json()).then(o=>{ OPTS=o;
    if(!o.where.length){ $('where').innerHTML='<span class="muted">No model is open to visitors right now.</span>'; f.querySelector('button.primary').disabled=true; return; }
    $('where').innerHTML=o.where.map(w=>'<button type="button" role="radio" data-w="'+w.id+'" title="'+w.note+'"'+(w.down?' disabled':'')+'>'+w.label+'</button>').join('');
    $('where').onclick=e=>{ const b=e.target.closest('button'); if(b&&!b.disabled){ want.model=null; setWhere(b.dataset.w); } };
    setWhere(want.where&&o.where.some(w=>w.id===want.where&&!w.down)?want.where:o.default);
  }).catch(()=>{ $('where').innerHTML='<span class="muted">could not reach the server</span>'; });
  $('model').onchange=()=>{ if($('model').value==='__custom'){ const m=prompt('Model id (as the provider names it, e.g. vendor/model-name):'); if(m){ $('model').insertAdjacentHTML('afterbegin','<option value="'+m.replace(/"/g,'')+'">'+m.replace(/</g,'')+'</option>'); $('model').value=m.replace(/"/g,''); } else $('model').selectedIndex=0; } };
  f.p.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey||!e.shiftKey)){ e.preventDefault(); f.requestSubmit(); } });
  f.onsubmit=e=>{e.preventDefault(); const p=f.p.value.trim().replace(/\\s+/g,'+'); if(!p) return;
    const where=f.dataset.where||'cloud', model=$('model').value;
    try{ localStorage.setItem('tablefolk.worldgen',JSON.stringify({where,model})); }catch{}
    const q=new URLSearchParams(); for(const k of ['art','brain','llm','view','go']) if(qs.has(k)) q.set(k,qs.get(k));
    q.set('where',where); if(model) q.set('model',model); if(where!=='browser') q.set('mode',f.mode.value);
    location.href='/world/'+encodeURIComponent(p).replace(/%2B/g,'+')+'?'+q;}; }
const words=${JSON.stringify(words)};
// App options pass through: ?art=1 (no model), ?brain=<model key> (the app's ?model=), ?llm=<endpoint URL>.
const appLink=l=>{const a=new URLSearchParams(); a.set('play','1'); if(qs.has('art')) a.set('art','1'); if(qs.get('brain')) a.set('model',qs.get('brain')); if(qs.get('llm')) a.set('llm',qs.get('llm')); const s=a.toString(); return s? l.replace('/app/#','/app/?'+s+'#') : l;};
const reviseWith=()=>{ const w=qs.get('where')||(qs.get('how')==='browser'?'browser':'cloud'); return w==='browser'?{}:{where:w,model:qs.get('model')||''}; };
if(SAVED && window.tfBuilder) window.tfBuilder.show(SAVED,{appLink,revise:reviseWith()});
if(words){
  const q=new URLSearchParams(qs); q.set('prompt',words); q.set('stream','1'); q.delete('view');
  const t0=Date.now();
  // The clock runs on its own: a reasoning model can think for seconds
  // before the first event with text in it.
  const clock=setInterval(()=>{ $('clock').textContent=((Date.now()-t0)/1000).toFixed(1)+'s'; },100);
  // Loading view: the bar never slows down (slowing reads as "this is slow").
  // It creeps at a steady pace (a lap in LAP seconds) and lurches ahead in
  // random fake bumps every fraction of a second (together about 40%/s), plus
  // a jump for every batch of tokens the model streams (thinking or
  // writing); it starts again from zero with a new made-up chore as many
  // times as it takes; when the world is ready it finishes and opens it.
  const LAP=6, PER_CHAR=.05, PER_THOUGHT=.03;
  let ended=false, pos=0, tPrev=performance.now(), seenChars=0, seenThought=0;
  const fakeBump=()=>{ if(ended) return; pos+=3+Math.random()*Math.random()*22; setTimeout(fakeBump,120+Math.random()*480); };
  const CHORES=['Unrolling the map','Laying flagstones','Stacking stones for the walls','Hanging doors on their hinges','Lighting the lanterns',
    'Waking the innkeeper','Counting the gold','Teaching goblins to haggle','Polishing the sorceress’s staff','Hiding a key somewhere',
    'Sweeping the tavern floor','Filling barrels','Writing secret notes','Feeding the ravens','Sharpening swords','Rehearsing villain monologues',
    'Arranging bookshelves','Planting mushrooms','Drawing the dungeon on a napkin','Giving everyone a name'];
  let ci=Math.floor(Math.random()*CHORES.length);
  const nextChore=()=>{ ci=(ci+1+Math.floor(Math.random()*3))%CHORES.length; $('chore').textContent=CHORES[ci]+'…'; };
  if(view==='loading'){
    $('chore').textContent=CHORES[ci]+'…';
    const tick=now=>{ if(ended) return; pos+=Math.min(.1,(now-tPrev)/1000)/LAP*100; tPrev=now;
      if(pos>=100){ pos%=100; nextChore(); }
      $('fill').style.width=pos.toFixed(1)+'%'; requestAnimationFrame(tick); };
    requestAnimationFrame(tick); setTimeout(fakeBump,200); }
  const stageText={waiting:'waiting for the model',thinking:'thinking',writing:'writing',repairing:'fixing problems',problems:'fixing problems'};
  // the same events from the server's stream or from the browser's own run
  const onProgress=d=>{
    // about 4 characters a token
    const tok=n=>' · ~'+Math.round(n/4).toLocaleString()+' tokens';
    $('stage').textContent=(stageText[d.stage]||d.stage)+'…'+(d.model?' ('+d.model+')':'')+(d.chars?tok(d.chars):d.thought?tok(d.thought)+' of thought':'');
    if(view==='loading' && (d.thought||d.chars)){ $('stage').hidden=false; $('preview').hidden=false; }
    $('preview').classList.toggle('thought',d.stage==='thinking');
    if(d.chars>seenChars){ pos+=(d.chars-seenChars)*PER_CHAR; seenChars=d.chars; }
    if(d.thought>seenThought){ pos+=(d.thought-seenThought)*PER_THOUGHT; seenThought=d.thought; }
    if(d.stage==='repairing' && !d.chars) seenChars=0;
    if(d.label) $('stage').textContent=d.label+(d.chars?tok(d.chars):'');
    if(d.preview) $('preview').textContent=d.preview; if(d.problems) $('problems').textContent=d.problems.join(' · ');};
  const onDone=d=>{ ended=true; clearInterval(clock); $('spin')?.classList.add('stop');
    $('stage').textContent='done in '+(d.ms/1000).toFixed(1)+'s: '+(d.scenario.title||'scenario')+' (opening…)'; $('clock').textContent='';
    // the loading view just goes there: nothing to click
    if(view==='loading'){ $('fill').style.transition='width .25s linear'; $('fill').style.width='100%'; $('chore').textContent=(d.scenario.title||'Your world')+' is ready'; setTimeout(()=>location.href=appLink(d.link),500); return; }
    // the builder stays: everything generated is below, to change and play
    $('stage').textContent='Built in '+(d.ms/1000).toFixed(1)+'s with '+d.model; $('preview').textContent='';
    window.tfBuilder?.show(d,{appLink,revise:reviseWith()});
    if(qs.has('go')) setTimeout(()=>location.href=appLink(d.link),700);};
  const fail=msg=>{ ended=true; clearInterval(clock); $('spin')?.classList.add('fail'); $('stage').textContent=msg;
    if(view==='loading'){ $('chore').textContent=msg; const b=new URLSearchParams(qs); b.set('view','builder'); $('result').innerHTML='<p><a href="?'+b+'">open the world builder</a></p>'; } };
  if(qs.get('how')==='browser'||qs.get('where')==='browser'){
    // step by step with the model in this browser (app/worldgen-browser.js)
    try{ if(qs.get('model')) localStorage.setItem('tablefolk_model',qs.get('model')); }catch{}
    const load=src=>new Promise((res,rej)=>{ if(document.querySelector('script[src="'+src+'"]')) return res(); const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('could not load '+src)); document.head.appendChild(s); });
    load('/app/procgen.js?v=20261025b').then(()=>load('/app/worldgen-browser.js?v=20261025h')).then(()=>window.tfWorldgen.run(words,(ev,d)=>{ if(ev==='progress') onProgress(d); else if(ev==='done') onDone(d); else if(ev==='failed') fail('failed: '+d.error); })).catch(e=>fail('failed: '+e.message));
  } else {
  const es=new EventSource('/api/generate?'+q);
  es.addEventListener('progress',e=>onProgress(JSON.parse(e.data)));
  es.addEventListener('done',e=>{es.close(); onDone(JSON.parse(e.data));});
  es.addEventListener('failed',e=>{es.close(); fail('failed: '+JSON.parse(e.data).error);});
  es.onerror=()=>{ if(ended) return; es.close(); fail('connection lost (the server may have stopped)'); };
  }
}
</script></body></html>`;
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
