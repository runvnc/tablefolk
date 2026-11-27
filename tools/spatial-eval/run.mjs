// run.mjs: spatial-eval runner. A model gets a map (text, image or both) and a spoken
// command, answers a JSON plan (explicit squares, or places and relations that code
// resolves), and code scores it (geom.mjs). Results: one JSON line a task.
//   node tools/spatial-eval/run.mjs --gold                       (the resolver on each task's gold relations; all must pass)
//   node tools/spatial-eval/run.mjs --base=https://openrouter.ai/api/v1 --model=google/gemini-3.8-flash \
//        --input=text|image|both --style=squares|relations [--label=x] [--extra='{"reasoning":{"effort":"low"}}'] [--tasks=id,id] [--par=4]
// OpenRouter's key comes from OPENROUTER_API_KEY (.env); any OpenAI-compatible server works (llama-server).
// Writes work/spatial-eval/results/<label>.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { buildMaps, mapText, LEGEND } from './maps.mjs';
import { ctx, fromSquares, fromRelations, score } from './geom.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d); };
const maps = Object.fromEntries(buildMaps().map(m => [m.id, m]));
let tasks = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/spatial-eval/tasks.json'), 'utf8'));
if (arg('tasks')) { const want = new Set(String(arg('tasks')).split(',')); tasks = tasks.filter(t => want.has(t.id)); }

if (arg('gold')) {
  let ok = 0;
  for (const t of tasks) {
    const C = ctx(maps[t.map]), plan = fromRelations(t, t.gold, C), s = score(t, plan, C);
    ok += s.pass ? 1 : 0;
    console.log(s.pass ? 'PASS' : 'FAIL', t.id, JSON.stringify(s.checks), plan.error || '', JSON.stringify(plan.rect || plan.posts || plan.gate || (plan.path && plan.path.length) || ''));
  }
  console.log(`${ok}/${tasks.length}`); process.exit(ok === tasks.length ? 0 : 1);
}

if (arg('rescore')) { // score every saved answer again with the current geom.mjs (the raw text is kept)
  const dir = path.join(ROOT, 'work/spatial-eval/results'), all = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/spatial-eval/tasks.json'), 'utf8'));
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    const out = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(r => {
      const t = all.find(x => x.id === r.task); if (!t || r.httpError) return r;
      const C = ctx(maps[t.map]), a = parseJSON(r.text), plan = r.style === 'relations' ? fromRelations(t, a, C) : fromSquares(t, a, C), s = score(t, plan, C);
      return { ...r, pass: s.pass, partial: s.partial, checks: s.checks, planError: plan.error || null };
    });
    fs.writeFileSync(path.join(dir, f), out.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log('rescored'); process.exit(0);
}

const SYSTEM = 'You help the player of a tile-based village game. The player gives a spoken command; you decide which squares of the map carry it out. Reply with one JSON object only, no other text.';
const COMMON = `Coordinates are [x, y]: x is the column (0 = the west edge), y is the row (0 = the north edge). North is up.
Walls, fields, piles, pits and houses go on open ground: not on buildings, water, trees or roads (a gate may stand on a path). Something dug "under" a building goes inside its walls. Guards stand on open ground or road, not in water or buildings.`;
const SQUARES = `${COMMON}
Answer with explicit squares, in the shape the answer type names:
- wall: {"wall_rect": [x0, y0, x1, y1], "gate": [x, y]} for a rectangular wall (the outline of that rectangle), or {"wall": [[x, y], ...], "gate": [x, y]} listing every wall square. The gate is one square of the wall.
- rect: {"rect": [x0, y0, x1, y1]} (inclusive corners; a 4 by 3 rect has x1 = x0 + 3, y1 = y0 + 2, or turned)
- posts: {"posts": [[x, y], ...]} one square per guard
- path: {"path": [[x, y], ...]} waypoints from start to end; the route runs in straight lines between them, so put a waypoint at every turn
- area: {"rect": [x0, y0, x1, y1]} or {"squares": [[x, y], ...]}`;
const RELATIONS = `${COMMON}
Do not give coordinates. Name places from the list and say how; the game works out the squares. Shapes by answer type:
- wall: {"enclose": "<place>" (or a list of places), "gate": "north" | "south" | "east" | "west" | {"toward": "<place>"}}
- rect: {"near": "<place>", "side": "north" | "south" | "east" | "west" | "northwest" | ... | "any", "w": <width>, "h": <depth>, "touch": "water" (only if it must be at the water's edge)}; for digging under a building: {"under": "<place>", "w": <width>, "h": <depth>}
- posts: {"guard": "<place>", "n": <number of guards>, "side": "north" | "south" | "east" | "west" | "around" | "any", "end": "north" | "south" | "east" | "west" (optional: only that end of a long place such as a road)}
- path: {"from": "<place>", "via": ["<place>", ...], "to": "<place>", "prefer": "road" | "short"}
- area: {"place": "<place>"} for a named place, or {"cluster": "trees" | "water" | "rocks" | "crops", "near": "<place>", "side": "north" | ... | "any"} for an unnamed group of things`;

function messages(t, input, style) {
  const m = maps[t.map];
  let mapPart;
  if (input === 'image') mapPart = `The image is a top-down map "${m.title}", ${m.W} columns (x 0-${m.W - 1}) by ${m.H} rows (y 0-${m.H - 1}); every column and row is numbered on the edges. Colours: green grass, tan road or path, grey paving, dark brown building walls with light floors inside, D a door, deep brown a closed building, blue water, T a tree, o a rock, yellow crops, | a fence, x a small object.\nPlaces labelled on it: ${m.places.map(p => `${p.id} (${p.kind})`).join(', ')}.`;
  else mapPart = mapText(m) + (input === 'both' ? '\n\nThe image shows the same map, drawn with every column and row numbered.' : '');
  const text = `${mapPart}\n\n${style === 'relations' ? RELATIONS : SQUARES}\n\nCommand: "${t.say}"\nAnswer type: ${t.answer}`;
  const content = input === 'text' ? text : [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'work/spatial-eval/maps', m.id + '.png')).toString('base64') } }, { type: 'text', text }];
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content }];
}

function parseJSON(s) {
  s = String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const i = s.indexOf('{'); if (i < 0) return null;
  for (let j = s.lastIndexOf('}'); j > i; j = s.lastIndexOf('}', j - 1)) { try { return JSON.parse(s.slice(i, j + 1)); } catch { } }
  return null;
}

const base = String(arg('base', 'https://openrouter.ai/api/v1')).replace(/\/$/, ''), model = arg('model'), input = arg('input', 'text'), style = arg('style', 'squares');
const label = arg('label', `${String(model).replace(/[\/:]/g, '_')}-${input}-${style}`), extra = JSON.parse(arg('extra', '{}')), par = +arg('par', 1);
const maxTokens = +arg('max-tokens', 2000), timeoutMs = +arg('timeout', 180) * 1000;
let key = process.env.OPENROUTER_API_KEY;
if (!key && /openrouter/.test(base)) { const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); key = (env.match(/^OPENROUTER_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, ''); }
const outDir = path.join(ROOT, 'work/spatial-eval/results'); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, label + '.jsonl');
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.httpError).map(r => r.task) : []);

// Inkling 2 Mini without thinking (brains.md, "Inkling 2 Mini"): llama-server's /apply-template with
// reasoning_effort 0, the answer message opened in the prompt, a raw /completion (the picture as
// multimodal_data for the template's media marker), stop at the end of the message.
const NOTHINK = arg('inkling-nothink'), ROOT_URL = base.replace(/\/v1$/, '');
async function inklingNoThink(msgs) {
  const post = async (p, b) => { const r = await fetch(ROOT_URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(timeoutMs) }); const j = await r.json(); if (!r.ok || j.error) throw new Error(JSON.stringify(j.error || j).slice(0, 300)); return j; };
  const tpl = await post('/apply-template', { messages: msgs, chat_template_kwargs: { reasoning_effort: 0.0 } });
  const images = msgs.flatMap(m => Array.isArray(m.content) ? m.content.filter(c => c.type === 'image_url').map(c => c.image_url.url.replace(/^data:[^,]+,/, '')) : []);
  const prompt = tpl.prompt + '<|message_model|><|content_text|>';
  const r = await post('/completion', { prompt: images.length ? { prompt_string: prompt, multimodal_data: images } : prompt, n_predict: maxTokens, temperature: 0, cache_prompt: true,
    stop: ['<|end_message|>', '<|content_model_end_sampling|>', '<|message_'] });
  return { choices: [{ message: { content: r.content } }], timings: r.timings };
}

async function one(t) {
  const body = { model, messages: messages(t, input, style), temperature: 0, max_tokens: maxTokens, ...(/openrouter/.test(base) ? { usage: { include: true } } : {}), ...extra };
  const t0 = Date.now(); let r, j, err = null;
  try {
    if (NOTHINK) j = await inklingNoThink(body.messages);
    else {
      r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key && /openrouter/.test(base) ? { Authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      j = await r.json();
      if (!r.ok || j.error) err = JSON.stringify(j.error || j).slice(0, 300);
    }
  } catch (e) { err = String(e.message || e); }
  const secs = (Date.now() - t0) / 1000;
  const text = j?.choices?.[0]?.message?.content ?? '';
  const C = ctx(maps[t.map]), a = parseJSON(text);
  const plan = style === 'relations' ? fromRelations(t, a, C) : fromSquares(t, a, C);
  const s = err ? { pass: false, partial: 0, checks: {} } : score(t, plan, C);
  const rec = { task: t.id, map: t.map, answer: t.answer, model, input, style, label, secs: +secs.toFixed(2), pass: s.pass, partial: s.partial, checks: s.checks, planError: plan.error || null,
    httpError: err, text: String(text).slice(0, 1500), usage: j?.usage ? { in: j.usage.prompt_tokens, out: j.usage.completion_tokens, reasoning: j.usage.completion_tokens_details?.reasoning_tokens, cost: j.usage.cost } : null, timings: j?.timings || null };
  fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
  console.log(`${s.pass ? 'PASS' : 'fail'} ${t.id.padEnd(24)} ${secs.toFixed(1).padStart(6)}s p=${s.partial} ${err ? 'ERR ' + err.slice(0, 120) : plan.error ? 'plan: ' + plan.error : JSON.stringify(s.checks)}`);
  return rec;
}

const todo = tasks.filter(t => !done.has(t.id));
console.log(`${label}: ${todo.length} tasks (${done.size} done before)`);
let i = 0; await Promise.all(Array.from({ length: Math.max(1, par) }, async () => { while (i < todo.length) await one(todo[i++]); }));
