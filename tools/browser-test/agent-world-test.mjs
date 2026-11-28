// World builder, agent mode with "your own key": builds one world from a prompt
// through the page (the agent calls the builder's tools, server/worldgen-tools.js),
// then asks for one change in the same session, and saves both worlds as JSON
// (for scenario-smoke.mjs). Uses a real model: OPENROUTER_API_KEY in the
// environment (never printed), AGENT_MODEL (default deepseek/deepseek-v4.1-flash).
// ENGINE_LOG=1 prints the in-browser engine's per-call timings.
// WHERE=cloud|server: this server's own model (agent steps through /api/worldgen/step).
// SECTIONS=3 SHAPE=region: a world in sections.
// WHERE=browser: a model in the test Chrome instead (AGENT_MODEL=bonsai2-27b; it is
// downloaded if this profile has not got it: only on a rented GPU box).
//
//   OPENROUTER_API_KEY=... node agent-world-test.mjs [base] [outdir] ["prompt"] ["follow-up"]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8001', out = process.argv[3] || '.';
const prompt = process.argv[4] || 'a small river village where the miller and the baker quarrel over flour, wolves at night';
const follow = process.argv[5] || 'make the tavern bigger and busier: give it a stone and timber look with a sign, and add an innkeeper who sells ale';
const WHERE = process.env.WHERE || 'own';
const model = process.env.AGENT_MODEL || (WHERE === 'browser' ? 'bonsai2-27b' : 'deepseek/deepseek-v4.1-flash');
const key = process.env.OPENROUTER_API_KEY; if (!key && WHERE === 'own') { console.log('OPENROUTER_API_KEY is not set'); process.exit(2); }
const LIMIT = +(process.env.AGENT_TIMEOUT || 420) * 1000;
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
// ENGINE_LOG=1: the in-browser engine's per-call lines (prefix reads, llama.cpp timings, elapsed), for step times
if (process.env.ENGINE_LOG) page.on('console', m => { const t = m.text(); if (/\[tablefolk-wllama3\] (prefix read|llama\.cpp timings|RAW OUTPUT)|\[bonsai2\].*(tok\/s|prefill)/i.test(t)) say(t.replace(/\s+/g, ' ').slice(0, 260)); });
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(base + '/world/?t=' + Date.now());
if (WHERE === 'own') await page.evaluate(([k, m]) => localStorage.setItem('tablefolk_own_model', JSON.stringify({ provider: 'openrouter', apiKey: k, model: m })), [key, model]);
await page.goto(`${base}/world/${encodeURIComponent(prompt).replace(/%20/g, '+')}?where=${WHERE}&agent=1&model=${encodeURIComponent(model)}${process.env.SECTIONS ? '&sections=' + process.env.SECTIONS + '&shape=' + (process.env.SHAPE || 'auto') : ''}`);
// the form's toggle: on for this model by default
await page.waitForTimeout(1500);
say('agent toggle: ' + JSON.stringify(await page.evaluate(() => ({ checked: document.forms.f?.agent?.checked, disabled: document.forms.f?.agent?.disabled, note: document.getElementById('agentNote')?.textContent }))));
let last = '';
const wait = async (doneFn, what) => {
  const end = Date.now() + LIMIT;
  while (Date.now() < end) {
    const st = await page.evaluate(doneFn);
    if (st.line && st.line !== last) { last = st.line; say(st.line); }
    if (st.end) return st;
    await page.waitForTimeout(1000);
  }
  return { end: true, failed: what + ': timed out' };
};
const built = await wait(() => {
  const stage = document.getElementById('stage')?.textContent || '', ws = !document.getElementById('workspace')?.hidden;
  return { line: stage + ' | ' + (document.getElementById('preview')?.textContent || '').split('\n').pop(), end: ws || /^failed|stopped/.test(stage), failed: /^failed/.test(stage) ? stage : null, stage };
}, 'build');
if (built.failed) { say('BUILD FAILED: ' + built.failed); }
const world = await page.evaluate(() => { const t = document.getElementById('rawJson'); return t ? JSON.parse(t.value) : null; });
const session = await page.evaluate(() => { const s = window.tfWorldAgent?.session; return s && { steps: s.steps, tokens: s.tokens, cost: s.cost, log: s.log }; });
if (world) { writeFileSync(out + '/agent-world.json', JSON.stringify(world, null, 1)); say(`built "${world.title}": ${(world.agents || []).map(a => a.id + (a.job ? ' (' + a.job + ')' : '')).join(', ')}; map ${JSON.stringify(world.generate || (world.grid ? 'grid' : world.map ? 'map' : null))}`); }
say('session: ' + JSON.stringify({ steps: session?.steps, tokens: session?.tokens, cost: session?.cost }));
console.log('log:\n  ' + (session?.log || []).join('\n  '));
await page.screenshot({ path: out + '/agent-world-built.png' });
let changed = null, session2 = null;
if (world && !process.env.NO_FOLLOW) {
  await page.fill('#aiReq', follow);
  await page.click('[data-act=ask]');
  last = '';
  const r = await wait(() => { const m = document.getElementById('aiMsg')?.textContent || ''; return { line: m, end: /^changed|^failed/.test(m), failed: /^failed/.test(m) ? m : null }; }, 'follow-up');
  if (r.failed) say('FOLLOW-UP FAILED: ' + r.failed);
  changed = await page.evaluate(() => { const t = document.getElementById('rawJson'); return t ? JSON.parse(t.value) : null; });
  session2 = await page.evaluate(() => { const s = window.tfWorldAgent?.session; return s && { steps: s.steps, tokens: s.tokens, cost: s.cost, log: s.log.slice(-25) }; });
  if (changed) writeFileSync(out + '/agent-world-2.json', JSON.stringify(changed, null, 1));
  say('after the change: ' + (changed?.agents || []).map(a => a.id + (a.job ? ' (' + a.job + ')' : '')).join(', ') + '; houses ' + JSON.stringify(changed?.generate?.houses || null));
  say('session: ' + JSON.stringify({ steps: session2?.steps, tokens: session2?.tokens, cost: session2?.cost }));
  console.log('log:\n  ' + (session2?.log || []).join('\n  '));
  await page.screenshot({ path: out + '/agent-world-changed.png' });
}
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
await page.close(); await b.close().catch(() => {});
process.exit(built.failed || !world ? 1 : 0);
