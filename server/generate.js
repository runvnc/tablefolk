// Scenario generator: a prompt in, a playable scenario link out.
//
//   GET /world/<prompt words>[?mode=generate|grid|map&model=...&endpoint=local&view=builder|loading]
//       a page that shows progress and then opens the scenario
//   GET /api/generate?prompt=...&mode=...&model=...&endpoint=...[&stream=1]
//       the JSON result ({ scenario, code, link, warnings, ms }), or with
//       stream=1 server-sent events: progress, then a final "done"
//
// One fast pass of the "fast skill" (server/fast-skill.md, a condensed
// tablefolk-scenario skill) on the generator endpoint (GEN_* settings,
// default openai/gpt-6-luna on OpenRouter; endpoint=local uses litert-lm
// serve), checked here (the procedural generator runs too, so a bad "in" is
// caught), with one repair round if it has problems. Results are saved under
// generated/.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { OpenAI, collect } from '../app/llm_js/openai-client.js';
import { config, ROOT, endpoint } from './config.js';
import '../app/procgen.js';

const SKILL = readFileSync(join(ROOT, 'server/fast-skill.md'), 'utf8');
const Procgen = globalThis.TablefolkProcgen;

const COMMANDS = new Set(['say', 'whisper', 'walk', 'face', 'look', 'touch', 'push', 'pull', 'carry', 'drop', 'throw', 'dig', 'build', 'repair',
  'panic', 'emote', 'note', 'give', 'give_quest', 'sell', 'inventory', 'goal', 'spell.push', 'spell.spark', 'spell.fireball', 'attack', 'wield', 'workflow', 'cast', 'steal', 'bandage', 'sing']);
const VOICES = new Set(['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius']);
const MODELS = new Set(['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian']);
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
    if (!a.personality) problems.push(`agent ${a.id}: needs a "personality"`);
    if (a.model && !MODELS.has(a.model)) a.model = 'critter';
    if (a.ttsVoiceId) { const v = String(a.ttsVoiceId).replace(/^builtin:/, '').toLowerCase(); if (VOICES.has(v)) a.ttsVoiceId = 'builtin:' + v; else delete a.ttsVoiceId; }
    for (const c of a.allowed || []) if (!COMMANDS.has(c)) problems.push(`agent ${a.id} "allowed": unknown command ${c}`);
  }
  if (new Set(ids).size !== ids.length) problems.push('agent ids must be unique');
  for (const c of s.allowed || []) if (!COMMANDS.has(c)) problems.push(`"allowed": unknown command ${c}`);
  if (!Array.isArray(s.allowed)) s.allowed = ['say', 'walk', 'face', 'emote'];
  // Person-height doors need the tall walls: twice the tabletop height by default.
  if (s.wallHeight == null) s.wallHeight = 2;
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
  const t0 = Date.now();
  const client = new OpenAI({ baseURL: ep.baseURL, apiKey: ep.apiKey, defaultHeaders: ep.headers || {}, timeout: 240000 });
  const how = MODES[mode] ? `Use map method ${MODES[mode]}.` : 'Choose the map method that fits best.';
  const messages = [
    { role: 'system', content: SKILL },
    { role: 'user', content: `Scenario request: ${prompt}\n\n${how} Reply with the JSON object only.` },
  ];
  let scenario = null, problems = [], raw = '';
  for (let round = 0; round < 2; round++) {
    emit('progress', { stage: round ? 'repairing' : 'waiting', model: ep.model });
    let chars = 0, last = 0, lastT = -1;
    const out = await collect(await client.chat.completions.create({ model: ep.model, messages, stream: true, temperature: 0.7, max_tokens: 6000 }), text => {
      chars = text.length;
      if (chars - last > 120) { last = chars; emit('progress', { stage: round ? 'repairing' : 'writing', chars, preview: text.slice(-160) }); }
    }, thought => {
      if (!chars && (lastT < 0 || thought - lastT > 200)) { lastT = thought; emit('progress', { stage: 'thinking', thought }); }
    });
    raw = out.text;
    try { scenario = parseJSON(raw); problems = checkScenario(scenario); }
    catch (e) { scenario = null; problems = [e.message]; }
    if (!problems.length) break;
    emit('progress', { stage: 'problems', problems });
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Fix these problems and reply with the whole corrected JSON object only:\n- ${problems.join('\n- ')}` });
  }
  if (!scenario) throw new Error('the model did not produce a usable scenario: ' + problems.join('; '));
  const code = encodeScenario(scenario);
  const slug = (scenario.title || prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'scenario';
  try {
    mkdirSync(join(ROOT, 'generated'), { recursive: true });
    writeFileSync(join(ROOT, 'generated', `${slug}-${Date.now()}.json`), JSON.stringify({ prompt, mode, model: ep.model, ...scenario }, null, 2) + '\n');
  } catch {}
  return { scenario, code, warnings: problems, ms: Date.now() - t0, model: ep.model };
}

export async function handleGenerate(req, url) {
  const prompt = (url.searchParams.get('prompt') || '').trim().slice(0, 2000);
  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 });
  const mode = url.searchParams.get('mode') || 'auto', ep = pickEndpoint(url);
  if (url.searchParams.get('stream') !== '1') {
    try { const r = await generateScenario({ prompt, mode, ep }); return Response.json({ ...r, link: '/app/#s=' + r.code }); }
    catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event, data) => { try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try {
        const r = await generateScenario({ prompt, mode, ep, emit: send });
        send('done', { ...r, link: '/app/#s=' + r.code });
      } catch (e) { send('failed', { error: e.message }); }
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
export async function handleWorld(req, url) {
  const words = decodeURIComponent(url.pathname.replace(/^\/world\/?/, '').replace(/\+/g, ' ')).replace(/[/_]+/g, ' ').trim();
  const qs = new URLSearchParams(url.search);
  const view = words && (qs.get('view') || config.worldView) === 'loading' ? 'loading' : 'builder';
  const builderBody = `<h1>Tablefolk world builder</h1><p class="sub">Describe a scene; a scenario is written and opened for you.</p>
<form id="f"><input name="p" value="${esc(words)}" placeholder="a small dungeon with a sorceress and goblins" required>
<select name="mode"><option value="auto">any method</option><option value="generate">generated map</option><option value="grid">ASCII map</option><option value="map">layout lines</option></select>
<button>build</button></form>
<div class="card" id="card" ${words ? '' : 'hidden'}><div><span id="stage">starting…</span> <span id="clock"></span></div><div id="problems"></div><div id="preview"></div><div id="result"></div></div>`;
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
main{width:min(680px,100%)}h1{font-size:1.3rem;margin:0 0 .2rem}p.sub{color:var(--muted);margin:0 0 1.2rem}
form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem}input,select,button{font:inherit;padding:.5rem .7rem;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
input[name=p]{flex:1 1 280px}button{background:var(--accent);color:var(--bg);border:none;cursor:pointer}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
#stage{font-weight:600}#clock{color:var(--muted);font-variant-numeric:tabular-nums}
#preview{font:12px/1.4 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:7.5em;overflow:hidden;margin-top:.5rem}
#problems{color:#b5542e;font-size:.9rem}a{color:var(--accent)}
.load{margin-top:14vh;text-align:center}.load h1{font-size:1.6rem}
.bar{height:14px;border-radius:7px;background:var(--track);overflow:hidden;margin:1.4rem 0 .7rem}
#fill{height:100%;width:0;background:var(--accent);border-radius:7px;transition:width .15s linear}
.row{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.95rem}
#chore{transition:opacity .25s}
</style></head><body><main>
${view === 'loading' ? loadingBody : builderBody}
</main><script>
const qs=new URLSearchParams(${JSON.stringify(qs.toString())}), f=document.getElementById('f'), view=${JSON.stringify(view)};
if(f){ f.mode.value=qs.get('mode')||'auto';
  f.onsubmit=e=>{e.preventDefault(); const p=f.p.value.trim().replace(/\\s+/g,'+'); const q=new URLSearchParams(qs); q.set('mode',f.mode.value); location.href='/world/'+encodeURIComponent(p).replace(/%2B/g,'+')+'?'+q;}; }
const words=${JSON.stringify(words)};
// App options pass through: ?art=1 (no model), ?brain=<model key> (the app's ?model=), ?llm=<endpoint URL>.
const appLink=l=>{const a=new URLSearchParams(); if(qs.has('art')) a.set('art','1'); if(qs.get('brain')) a.set('model',qs.get('brain')); if(qs.get('llm')) a.set('llm',qs.get('llm')); const s=a.toString(); return s? l.replace('/app/#','/app/?'+s+'#') : l;};
if(words){
  const q=new URLSearchParams(qs); q.set('prompt',words); q.set('stream','1'); q.delete('view');
  const t0=Date.now(), $=id=>document.getElementById(id);
  // The clock runs on its own: a reasoning model can think for seconds
  // before the first event with text in it.
  const clock=setInterval(()=>{ $('clock').textContent=((Date.now()-t0)/1000).toFixed(1)+'s'; },100);
  // Loading view: the bar moves fast from the start (a curve over time:
  // half way at ~4s, 80% by ~11s) and the real writing progress can only push
  // it further; captions are made-up chores.
  let target=0, shown=0, ended=false, written=0;
  const CHORES=['Unrolling the map','Laying flagstones','Stacking stones for the walls','Hanging doors on their hinges','Lighting the lanterns',
    'Waking the innkeeper','Counting the gold','Teaching goblins to haggle','Polishing the sorceress’s staff','Hiding a key somewhere',
    'Sweeping the tavern floor','Filling barrels','Writing secret notes','Feeding the ravens','Sharpening swords','Rehearsing villain monologues',
    'Arranging bookshelves','Planting mushrooms','Drawing the dungeon on a napkin','Giving everyone a name'];
  let ci=Math.floor(Math.random()*CHORES.length);
  const nextChore=()=>{ const el=$('chore'); if(!el||ended) return; ci=(ci+1+Math.floor(Math.random()*3))%CHORES.length; el.style.opacity=0; setTimeout(()=>{ el.textContent=CHORES[ci]+'…'; el.style.opacity=1; },250); };
  if(view==='loading'){ $('chore').textContent=CHORES[ci]+'…'; setInterval(nextChore,2400);
    setInterval(()=>{ if(ended) return; const t=(Date.now()-t0)/1000;
      target=Math.max(target,95*(1-Math.exp(-t/6)),written?55+40*Math.min(1,written/3500):0);
      shown+=(Math.min(target,96)-shown)*.3; $('fill').style.width=shown.toFixed(1)+'%'; },120); }
  const bump=t=>{ target=Math.max(target,t); };
  const stageText={waiting:'waiting for the model',thinking:'thinking',writing:'writing',repairing:'fixing problems',problems:'fixing problems'};
  const es=new EventSource('/api/generate?'+q);
  es.addEventListener('progress',e=>{const d=JSON.parse(e.data);
    $('stage').textContent=(stageText[d.stage]||d.stage)+'…'+(d.model?' ('+d.model+')':'')+(d.chars?' '+d.chars+' chars':'');
    if(d.stage==='writing' && d.chars) written=d.chars; else if(d.stage==='repairing'||d.stage==='problems') bump(90);
    if(d.preview) $('preview').textContent=d.preview; if(d.problems) $('problems').textContent=d.problems.join(' · ');});
  es.addEventListener('done',e=>{es.close(); ended=true; clearInterval(clock); const d=JSON.parse(e.data);
    $('stage').textContent='done in '+(d.ms/1000).toFixed(1)+'s: '+(d.scenario.title||'scenario')+' (opening…)'; $('clock').textContent='';
    // the loading view just goes there: nothing to click
    if(view==='loading'){ target=shown=100; $('fill').style.width='100%'; $('chore').textContent=(d.scenario.title||'Your world')+' is ready'; setTimeout(()=>location.href=appLink(d.link),500); return; }
    $('result').innerHTML='<p><a href="'+appLink(d.link)+'">open it</a> · <a href="#" id="again">another one</a></p>';
    $('again').onclick=ev=>{ev.preventDefault(); location.reload();};
    if(!qs.has('stay')) setTimeout(()=>location.href=appLink(d.link),700);});
  const fail=msg=>{ ended=true; clearInterval(clock); $('stage').textContent=msg;
    if(view==='loading'){ $('chore').textContent=msg; const b=new URLSearchParams(qs); b.set('view','builder'); $('result').innerHTML='<p><a href="?'+b+'">open the world builder</a></p>'; } };
  es.addEventListener('failed',e=>{es.close(); fail('failed: '+JSON.parse(e.data).error);});
  es.onerror=()=>{ if(ended) return; es.close(); fail('connection lost (the server may have stopped)'); };
}
</script></body></html>`;
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
