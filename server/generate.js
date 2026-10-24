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
import { config, ROOT, endpoint } from './config.js';
import { voicesText } from './settings.js';

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
  'woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard',
  'skeleton', 'skeleton_warrior', 'skeleton_farmer', 'zombie', 'goblin', 'kobold', 'orc', 'troll', 'demon', 'giant', 'rat', 'spider', 'wolf', 'bat', 'dragon', 'ghost', 'slime']);
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
    if (a.ttsVoiceId) { const v = String(a.ttsVoiceId).replace(/^builtin:/, '').toLowerCase(); if (VOICES.has(v)) a.ttsVoiceId = 'builtin:' + v; else delete a.ttsVoiceId; }
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
  if (s.goal?.win?.player_has && !(s.allowed || []).concat(...(s.agents || []).map(a => a.allowed || [])).some(c => c === 'give' || c === 'sell')) problems.push('a player_has goal needs some character allowed "give" or "sell"');
  return problems;
}

function pickEndpoint(url) {
  const q = url.searchParams;
  const which = q.get('endpoint');
  const base = which === 'local' ? endpoint('local', '', q.get('model') || '', '') : { ...config.generator, model: q.get('model') || config.generator.model };
  return base;
}

// Run the generator; `emit(event, data)` reports progress.
export async function generateScenario({ prompt, mode = 'auto', ep, emit = () => {} }) {
  const how = MODES[mode] ? `Use map method ${MODES[mode]}.` : 'Choose the map method that fits best.';
  return runModel({ label: prompt, mode, ep, emit, maxTokens: 6000,
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
  const maxTokens = Math.min(16000, Math.max(6000, Math.ceil(json.length / 2.5) + 2000));
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
  const client = new OpenAI({ baseURL: ep.baseURL, apiKey: ep.apiKey, defaultHeaders: ep.headers || {}, timeout: 240000 });
  const messages = [
    { role: 'system', content: SKILL + `\n\nVoices (ttsVoiceId "builtin:<name>"; match the character): ${voicesText()}.` },
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
  const ep = pickEndpoint(url), enc = new TextEncoder();
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
  const mode = url.searchParams.get('mode') || 'auto', ep = pickEndpoint(url);
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

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Two views of the same run: "builder" (the prompt form, the stage and a
// preview of the JSON as it streams) and "loading" (just a progress bar with
// little made-up chores, for showing to players). The server's default is
// config.worldView (WORLD_VIEW=loading or --world-loading); ?view= overrides.
export async function handleWorld(req, url, { saved = null } = {}) {
  const words = decodeURIComponent(url.pathname.replace(/^\/world\/?/, '').replace(/\+/g, ' ')).replace(/[/_]+/g, ' ').trim();
  const qs = new URLSearchParams(url.search);
  const view = words && (qs.get('view') || config.worldView) === 'loading' ? 'loading' : 'builder';
  const builderBody = `<h1>Tablefolk world builder</h1><p class="sub">Describe a scene; a scenario is written and opened for you.</p>
<form id="f"><input name="p" value="${esc(words)}" placeholder="a small dungeon with a sorceress and goblins" required>
<select name="mode"><option value="auto">any method</option><option value="generate">generated map</option><option value="grid">ASCII map</option><option value="map">layout lines</option></select>
<button>build</button></form>
<div class="card" id="card" ${words || saved ? '' : 'hidden'}><div><span id="stage">${saved ? 'saved world' + (saved.prompt ? ': “' + esc(saved.prompt) + '”' : '') : 'starting…'}</span> <span id="clock"></span></div><div id="problems"></div><div id="preview"></div><div id="result"></div></div>
<div id="editor" hidden></div>`;
  const loadingBody = `<div class="load"><h1>Building your world</h1><p class="sub">“${esc(words)}”</p>
<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div id="fill"></div></div>
<div class="row"><span id="chore">Unrolling the map…</span><span id="clock"></span></div>
<div id="result"></div><span id="stage" hidden></span><div id="problems" hidden></div><div id="preview" hidden></div></div>`;
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${view === 'loading' ? 'Building your world' : 'Tablefolk world builder'}</title>
<style>
:root{--bg:#f4efe4;--fg:#2b2620;--muted:#7a7064;--card:#fffaf0;--line:#e2d8c6;--accent:#6b4f2a;--track:#e6dccb}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a16;--fg:#ece5d8;--muted:#a59a8a;--card:#272320;--line:#3a342d;--accent:#d7b07a;--track:#3a342d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;display:flex;justify-content:center;padding:6vh 16px}
main{width:min(980px,100%)}h1{font-size:1.3rem;margin:0 0 .2rem}p.sub{color:var(--muted);margin:0 0 1.2rem}
form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem}input,select,button{font:inherit;padding:.5rem .7rem;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
input[name=p]{flex:1 1 280px}button{background:var(--accent);color:var(--bg);border:none;cursor:pointer}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
#stage{font-weight:600}#clock{color:var(--muted);font-variant-numeric:tabular-nums}
#preview{font:12px/1.4 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:7.5em;overflow:hidden;margin-top:.5rem}
#problems{color:#b5542e;font-size:.9rem}a{color:var(--accent)}#preview.thought{font-style:italic;font-family:inherit;word-break:normal}
.load #stage{display:block;margin-top:1rem;font-weight:500;font-size:.85rem;color:var(--muted)}.load #preview{text-align:left;max-height:4.4em;opacity:.8;-webkit-mask-image:linear-gradient(transparent,#000 40%);mask-image:linear-gradient(transparent,#000 40%)}
.load{margin-top:14vh;text-align:center}.load h1{font-size:1.6rem}
.bar{height:14px;border-radius:7px;background:var(--track);overflow:hidden;margin:1.4rem 0 .7rem}
#fill{height:100%;width:0;background:var(--accent);border-radius:7px}
.row{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.95rem}
#chore{transition:opacity .25s}
#editor{margin-top:1rem;display:grid;gap:12px}#editor fieldset{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px 14px;margin:0}
#editor legend{font-weight:600;padding:0 6px}#editor .cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 12px}
#editor label{display:flex;flex-direction:column;font-size:.8rem;color:var(--muted);gap:2px}#editor label.wide{grid-column:1/-1}
#editor input,#editor select,#editor textarea{font:inherit;font-size:.92rem;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:.35rem .5rem;width:100%}
#editor textarea{resize:vertical}.mono{font:12.5px/1.35 ui-monospace,monospace!important;white-space:pre}.bad{border-color:#b5542e!important}
#editor fieldset.agent{background:var(--bg);margin-bottom:10px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:.3rem 0}
button.ghost{background:none;color:var(--accent);border:1px solid var(--line)}button.small{padding:.1rem .5rem;font-size:.8rem}.muted{color:var(--muted);font-size:.85rem}
#editor details summary{cursor:pointer;color:var(--muted)}#editor details textarea{width:100%;margin-top:6px}
#tableView{position:fixed;inset:0;z-index:11;background:var(--bg);display:flex;flex-direction:column}#tableView[hidden]{display:none}
#tableView .tvbar{display:flex;gap:10px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--line)}#tableView iframe{flex:1;border:0;width:100%}
#editor fieldset.ask textarea{width:100%}
#mapView{position:fixed;inset:0;background:rgba(10,8,6,.55);display:flex;align-items:center;justify-content:center;z-index:10;padding:16px}#mapView[hidden]{display:none}
.maptip{position:absolute;pointer-events:none;z-index:5;max-width:280px;background:rgba(20,18,16,.94);color:#f4eee4;border:1px solid #6b5b45;border-radius:8px;padding:6px 9px;font-size:12.5px;line-height:1.35;box-shadow:0 4px 14px rgba(0,0,0,.4)}.maptip hr{border:0;border-top:1px solid #5a4c3a;margin:5px 0}.maptip .muted{color:#b9ab95}
.mapcard{position:relative;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;max-width:100%;max-height:100%;overflow:auto}.mapcard canvas{display:block;margin:8px 0;border-radius:6px}
</style></head><body><main>
${view === 'loading' ? loadingBody : builderBody}
</main>${view === 'builder' ? '<script src="/app/procgen.js?v=20261023n"></script><script src="/app/builder.js?v=20261024i"></script>' : ''}<script>
const qs=new URLSearchParams(${JSON.stringify(qs.toString())}), f=document.getElementById('f'), view=${JSON.stringify(view)};
const SAVED=${JSON.stringify(saved).replace(/</g, '\\u003c')};
if(f){ f.mode.value=qs.get('mode')||'auto';
  f.onsubmit=e=>{e.preventDefault(); const p=f.p.value.trim().replace(/\\s+/g,'+'); const q=new URLSearchParams(qs); q.set('mode',f.mode.value); location.href='/world/'+encodeURIComponent(p).replace(/%2B/g,'+')+'?'+q;}; }
const words=${JSON.stringify(words)};
// App options pass through: ?art=1 (no model), ?brain=<model key> (the app's ?model=), ?llm=<endpoint URL>.
const appLink=l=>{const a=new URLSearchParams(); if(qs.has('art')) a.set('art','1'); if(qs.get('brain')) a.set('model',qs.get('brain')); if(qs.get('llm')) a.set('llm',qs.get('llm')); const s=a.toString(); return s? l.replace('/app/#','/app/?'+s+'#') : l;};
if(SAVED && window.tfBuilder) window.tfBuilder.show(SAVED,{appLink});
if(words){
  const q=new URLSearchParams(qs); q.set('prompt',words); q.set('stream','1'); q.delete('view');
  const t0=Date.now(), $=id=>document.getElementById(id);
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
  const es=new EventSource('/api/generate?'+q);
  es.addEventListener('progress',e=>{const d=JSON.parse(e.data);
    // about 4 characters a token
    const tok=n=>' ~'+Math.round(n/4).toLocaleString()+' tokens';
    $('stage').textContent=(stageText[d.stage]||d.stage)+'…'+(d.model?' ('+d.model+')':'')+(d.chars?tok(d.chars):d.thought?tok(d.thought)+' of thought':'');
    if(view==='loading' && (d.thought||d.chars)){ $('stage').hidden=false; $('preview').hidden=false; }
    $('preview').classList.toggle('thought',d.stage==='thinking');
    if(d.chars>seenChars){ pos+=(d.chars-seenChars)*PER_CHAR; seenChars=d.chars; }
    if(d.thought>seenThought){ pos+=(d.thought-seenThought)*PER_THOUGHT; seenThought=d.thought; }
    if(d.stage==='repairing' && !d.chars) seenChars=0;
    if(d.preview) $('preview').textContent=d.preview; if(d.problems) $('problems').textContent=d.problems.join(' · ');});
  es.addEventListener('done',e=>{es.close(); ended=true; clearInterval(clock); const d=JSON.parse(e.data);
    $('stage').textContent='done in '+(d.ms/1000).toFixed(1)+'s: '+(d.scenario.title||'scenario')+' (opening…)'; $('clock').textContent='';
    // the loading view just goes there: nothing to click
    if(view==='loading'){ $('fill').style.transition='width .25s linear'; $('fill').style.width='100%'; $('chore').textContent=(d.scenario.title||'Your world')+' is ready'; setTimeout(()=>location.href=appLink(d.link),500); return; }
    // the builder stays: everything generated is below, to change and play
    $('stage').textContent='done in '+(d.ms/1000).toFixed(1)+'s with '+d.model+': '+(d.scenario.title||'scenario');
    $('result').innerHTML='<p><a href="'+appLink(d.link)+'">open it as generated</a> · <a href="#" id="again">another one</a></p>';
    $('again').onclick=ev=>{ev.preventDefault(); location.reload();};
    window.tfBuilder?.show(d,{appLink});
    if(qs.has('go')) setTimeout(()=>location.href=appLink(d.link),700);});
  const fail=msg=>{ ended=true; clearInterval(clock); $('stage').textContent=msg;
    if(view==='loading'){ $('chore').textContent=msg; const b=new URLSearchParams(qs); b.set('view','builder'); $('result').innerHTML='<p><a href="?'+b+'">open the world builder</a></p>'; } };
  es.addEventListener('failed',e=>{es.close(); fail('failed: '+JSON.parse(e.data).error);});
  es.onerror=()=>{ if(ended) return; es.close(); fail('connection lost (the server may have stopped)'); };
}
</script></body></html>`;
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
