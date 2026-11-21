// judge.mjs -- an LLM judge for living-world transcripts (a development tool,
// not a game feature). For each character of each run it shows a judge model
// that character's stretch of the transcript (its own lines and doings, with
// the lines of those around it for context) and asks for 1-5 scores:
//   coherence       does what it says and does follow from what happened?
//   personality     does it sound and act like its own person, consistently?
//   purposefulness  does it pursue wants of its own (plans, deals, errands)?
//   surprise        does it do things beyond a fixed routine that still make sense?
// with two quoted lines as evidence. Uses OpenRouter (OPENROUTER_API_KEY from
// the repository's .env; never printed) and records every call's cost in
// work/openrouter-spend.json; it refuses to go past JUDGE_BUDGET dollars (2).
//
//   node judge.mjs results/live-hearthvale-free-transcript.txt [...] [--model=deepseek/deepseek-v4.1-flash] [--per=40]
//   (a transcript .txt, or a live-eval .json: its "transcript")
// Prints a table (run x mean scores) and saves results/judge-<ts>.json.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2), flag = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const files = args.filter(a => !a.startsWith('--'));
const MODEL = flag('model') || 'deepseek/deepseek-v4.1-flash', PER = +(flag('per') || 40), BUDGET = +(process.env.JUDGE_BUDGET || 2);
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const KEY = env.OPENROUTER_API_KEY; if (!KEY) { console.log('no OPENROUTER_API_KEY in .env'); process.exit(1); }
const LEDGER = path.join(ROOT, 'work/openrouter-spend.json');
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { total: 0, calls: [] };
const save = () => { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); };

function load(f) {
  if (f.endsWith('.json')) { const R = JSON.parse(fs.readFileSync(f, 'utf8')); return { lines: R.transcript || [], agents: R.agents || Object.keys(R.minds || {}), label: `${R.summary?.name}/${R.summary?.label}` }; }
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  const agents = [...new Set(lines.map(l => (l.replace(/^\[[^\]]*\]\s*(\d\d:\d\d\s+)?/, '').match(/^([\w-]+)[: ]/) || [])[1]).filter(Boolean))];
  return { lines, agents, label: path.basename(f).replace(/^live-|-transcript\.txt$/g, '') };
}
const body = l => l.replace(/^\[[^\]]*\]\s*/, '');
const who = l => (body(l).replace(/^\d\d:\d\d\s+/, '').match(/^([\w-]+)[: ]/) || [])[1];
function excerpt(lines, id) {
  // its own lines (said, done, decided), each with the line before it for context, up to PER lines
  const idx = lines.map((l, i) => who(l) === id ? i : -1).filter(i => i >= 0);
  if (idx.length < 4) return null;
  const pickIdx = idx.length > PER ? Array.from({ length: PER }, (_, k) => idx[Math.floor(k * idx.length / PER)]) : idx;
  const keep = new Set(); for (const i of pickIdx) { keep.add(i); if (i > 0 && who(lines[i - 1]) !== id) keep.add(i - 1); }
  return [...keep].sort((a, b) => a - b).map(i => body(lines[i])).join('\n').slice(0, 9000);
}
async function judge(id, text, label) {
  if (ledger.total >= BUDGET) throw new Error(`budget spent: $${ledger.total.toFixed(3)} of $${BUDGET}`);
  const prompt = `You are judging a non-player character in a small simulated village game, from a transcript excerpt. Lines are "time who: what". Quoted text is speech; "[decides] ..." and "[plans the day] ..." are the character's own choices; other lines are actions and results. Some lines come from code templates; judge the character as a player would experience it.\n\nCharacter: ${id}\n\nExcerpt:\n${text}\n\nScore 1-5 (5 best):\n- coherence: what it says and does follows from what happened and from itself; no non sequiturs or contradictions\n- personality: a distinct, consistent person in voice and choices\n- purposefulness: pursues wants of its own (plans, errands, deals, relationships), not just reacting\n- surprise: does things beyond a fixed work routine that still make sense (initiative, schemes, kindness, conflict)\nThen give exactly two short quotes copied from the excerpt as evidence.\nAnswer as JSON only: {"coherence":n,"personality":n,"purposefulness":n,"surprise":n,"evidence":["...","..."],"note":"one sentence"}`;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 600, reasoning: { enabled: false }, usage: { include: true }, response_format: { type: 'json_object' } }) });
  const j = await r.json();
  const cost = +(j.usage?.cost ?? 0); ledger.total += cost; ledger.calls.push({ at: new Date().toISOString(), tool: 'judge', model: MODEL, label, id, cost, tokens: j.usage?.total_tokens }); save();
  const t = j.choices?.[0]?.message?.content || ''; let out = null;
  try { out = JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); } catch { const m = t.match(/\{[\s\S]*\}/); try { out = m ? JSON.parse(m[0]) : null; } catch {} }
  return out ? { ...out, cost } : { error: t.slice(0, 200) || JSON.stringify(j).slice(0, 200), cost };
}
const all = [];
for (const f of files) {
  const { lines, agents, label } = load(f), rows = [];
  for (const id of agents) { const ex = excerpt(lines, id); if (!ex) continue; const s = await judge(id, ex, label); rows.push({ id, ...s }); console.log(label.padEnd(30), id.padEnd(10), s.error ? 'ERROR ' + s.error : `c${s.coherence} p${s.personality} u${s.purposefulness} s${s.surprise}  ${JSON.stringify(s.evidence || []).slice(0, 220)}`); }
  const ok = rows.filter(r => !r.error), mean = k => ok.length ? +(ok.reduce((a, r) => a + (+r[k] || 0), 0) / ok.length).toFixed(2) : null;
  all.push({ file: f, label, n: ok.length, coherence: mean('coherence'), personality: mean('personality'), purposefulness: mean('purposefulness'), surprise: mean('surprise'), rows });
}
console.log('\nrun'.padEnd(32), 'n  coher pers  purp  surp');
for (const a of all) console.log(a.label.padEnd(31), String(a.n).padEnd(3), [a.coherence, a.personality, a.purposefulness, a.surprise].map(x => String(x).padEnd(5)).join(' '));
console.log(`spent so far (all OpenRouter dev calls in the ledger): $${ledger.total.toFixed(4)}`);
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/judge-${Date.now()}.json`, JSON.stringify(all, null, 1));
