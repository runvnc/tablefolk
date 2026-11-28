// World builder agent mode end to end without a browser: the page's loop (app/worldgen-agent.js)
// in node against a running server, each step on the server's own model (POST /api/worldgen/step,
// where=cloud|server) and the tools at /api/worldgen/tool. Builds one world, asks one change,
// runs one review round, and saves the worlds (for tools/browser-test/scenario-smoke.mjs).
//   node tools/agent-node-e2e.mjs [base] [outdir] ["prompt"] ["follow-up"]
//   SECTIONS=3 SHAPE=region WHERE=cloud MODEL=deepseek/deepseek-v4.1-flash-1017 AGENT_TIMEOUT=420 NO_FOLLOW=1 NO_REVIEW=1
import { writeFileSync } from 'node:fs';
import '../app/worldgen-agent.js';
const A = globalThis.TablefolkWorldAgent;
const base = process.argv[2] || 'http://localhost:8001', out = process.argv[3] || '.';
const prompt = process.argv[4] || 'a river village, the old wood beyond it where wolves gather, and a wolf cave under the hill: the miller and the baker quarrel over flour while the wolves grow bold';
const follow = process.argv[5] || 'add a hunter in the old wood who trades pelts, and put a chest with a silver key in the wolf cave';
const where = process.env.WHERE || 'cloud', model = process.env.MODEL || '';
const LIMIT = +(process.env.AGENT_TIMEOUT || 420) * 1000;
const f0 = globalThis.fetch; globalThis.fetch = (u, o) => f0(String(u).startsWith('/') ? base + u : u, o);
const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const run = fn => new Promise(res => {
  const timer = setTimeout(() => { A.stop(); res({ ev: 'failed', d: { error: 'timed out' } }); }, LIMIT);
  let last = '';
  fn((ev, d) => { if (ev === 'progress') { if (d.label !== last && !/writing|thinking|waiting/.test(d.label || '')) { last = d.label; say(d.label); } return; } clearTimeout(timer); res({ ev, d }); });
});
const opts = await f0(base + '/api/worldgen/options').then(r => r.json());
const m = (opts.where.find(w => w.id === where)?.models || []).find(x => !model || x.id === model) || {};
say(`model ${m.id} (tools ${m.tools}, context ${m.context}); canAgent ${JSON.stringify(A.canAgent(where, m))}`);
const backend = A.serverBackend({ where, model: m.id }, { context: m.context });
const sum = (name, r) => {
  const s = r.d.scenario;
  say(`${name}: ${r.ev} ${r.ev === 'failed' ? r.d.error : `"${s.title}" ${r.d.model}; ${r.d.summary}`}`);
  if (!s) return;
  say(`  top ${s.generate?.kind}: ${(s.agents || []).map(a => a.id).join(', ')}; top links ${JSON.stringify(s.links || [])}`);
  for (const [k, v] of Object.entries(s.subworlds || {})) say(`  ${k} (${v.generate?.kind}): ${(v.agents || []).map(a => a.id).join(', ')}; links ${JSON.stringify(v.links || [])}`);
  writeFileSync(`${out}/${name}.json`, JSON.stringify(s, null, 1));
};
const cost = [];
let r = await run(emit => A.build(prompt, backend, emit, { sections: +process.env.SECTIONS || 0, shape: process.env.SHAPE || 'auto' }));
sum('agent-world', r); cost.push(A.session?.cost || 0);
console.log('log:\n  ' + (A.session?.log || []).join('\n  '));
if (r.ev === 'done' && !process.env.NO_FOLLOW) {
  r = await run(emit => A.change(r.d.scenario, follow, emit)); sum('agent-world-change', r); cost.push(A.session?.cost || 0);
  console.log('log:\n  ' + (A.session?.log || []).slice(-14).join('\n  '));
  if (r.ev === 'done' && !process.env.NO_REVIEW) {
    r = await run(emit => A.change(r.d.scenario, '', emit, null, { review: { round: 1, rounds: 1, history: [] } })); sum('agent-world-review', r); cost.push(A.session?.cost || 0);
    console.log('log:\n  ' + (A.session?.log || []).slice(-10).join('\n  '));
  }
}
say(`cost $${cost.map(c => c.toFixed(4)).join(' + ')} = $${cost.reduce((a, b) => a + b, 0).toFixed(4)}`);
