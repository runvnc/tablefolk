// summary.mjs: spatial-eval results as a table (model x input x style -> pass rate,
// partial score, seconds a task, cost), plus pass rates by task kind.
//   node tools/spatial-eval/summary.mjs [results dir] [--kinds] [--fails=label]
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'work/spatial-eval/results');
const rows = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()) {
  const recs = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const by = new Map(); for (const r of recs) by.set(r.task, r); // the last attempt per task
  const rs = [...by.values()], n = rs.length;
  const kinds = {}; for (const r of rs) { const k = r.task.split('-')[1]; (kinds[k] ||= []).push(r.pass ? 1 : 0); }
  rows.push({ label: f.replace(/\.jsonl$/, ''), n, pass: rs.filter(r => r.pass).length, partial: rs.reduce((s, r) => s + r.partial, 0) / n,
    secs: rs.reduce((s, r) => s + r.secs, 0) / n, cost: rs.reduce((s, r) => s + (r.usage?.cost || 0), 0), errs: rs.filter(r => r.httpError).length, parseFail: rs.filter(r => r.planError).length,
    out: rs.reduce((s, r) => s + (r.usage?.out || r.timings?.predicted_n || 0), 0) / n, kinds, rs });
}
console.log('| run | tasks | pass | partial | s/task | out tok | plan errors | cost $ |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.label} | ${r.n} | ${r.pass}/${r.n} (${Math.round(100 * r.pass / r.n)}%) | ${r.partial.toFixed(2)} | ${r.secs.toFixed(1)} | ${Math.round(r.out)} | ${r.parseFail}${r.errs ? ` (+${r.errs} http)` : ''} | ${r.cost.toFixed(3)} |`);
console.log(`total cost: $${rows.reduce((s, r) => s + r.cost, 0).toFixed(3)}`);
if (process.argv.includes('--kinds')) {
  const K = ['wall', 'pile', 'woodpile', 'field', 'house', 'cellar', 'pit', 'landing', 'guards', 'patrol', 'route', 'path', 'referent'];
  const group = { pile: 'rect', woodpile: 'rect', field: 'rect', landing: 'rect', house: 'house', cellar: 'dig', pit: 'rect', patrol: 'route', route: 'route', path: 'route', wall: 'wall', guards: 'guards', referent: 'referent' };
  const G = ['wall', 'rect', 'house', 'dig', 'guards', 'route', 'referent'];
  console.log('\n| run | ' + G.join(' | ') + ' |'); console.log('|---|' + G.map(() => '---').join('|') + '|');
  for (const r of rows) { const g = {}; for (const [k, v] of Object.entries(r.kinds)) { const gg = group[k] || k; (g[gg] ||= []).push(...v); } console.log(`| ${r.label} | ` + G.map(k => g[k] ? `${g[k].reduce((a, b) => a + b, 0)}/${g[k].length}` : '-').join(' | ') + ' |'); }
}
const fl = process.argv.find(a => a.startsWith('--fails='));
if (fl) { const r = rows.find(r => r.label === fl.slice(8)); for (const x of r.rs.filter(x => !x.pass)) console.log(`\n${x.task}: ${JSON.stringify(x.checks)} ${x.planError || ''}\n  ${x.text.replace(/\s+/g, ' ').slice(0, 400)}`); }
