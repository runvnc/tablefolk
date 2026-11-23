// Smoke run of living scenarios without a model (?model=none: rails, code runs the
// day): each loads, lives for a while on a fast clock, and reports page errors,
// layout warnings, job cycles, meals, who slept and who ends hungry; also the
// scenario's "autonomy" and what Running now says for it.
//
//   node scenario-smoke.mjs scenarios/free-two-by-the-hearth.json [more.json ...]
//        [--base=http://localhost:8000] [--seconds=90] [--day-minutes=2]
// Exits 1 when a page error was seen or a scenario never became ready.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const files = args.filter(a => !a.startsWith('--')), base = flag('base', 'http://localhost:8000');
const seconds = +flag('seconds', 90), dayMinutes = +flag('day-minutes', 2);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
let bad = 0;
for (const f of files) {
  const page = await b.contexts()[0].newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
  try {
    await page.goto(`${base}/app/?model=none&play=1&gfx=light&fps=10&intro=0&pace=busy&dayMinutes=${dayMinutes}&scenario=/${f.replace(/^\/+/, '')}&t=${Date.now()}`);
    await page.waitForFunction(() => window.tablefolkScenario?.active && window.TABLEFOLK_STATE?.characters?.length, null, { timeout: 60000 });
    const info = await page.evaluate(() => {
      const a = window.tablefolkScenario.active, scn = a.scn || {};
      const warn = [...(scn.gridWarnings || []), ...(scn.genWarnings || []), ...(a.warnings || [])];
      const diag = window.tablefolkAgency?.diagRow?.();
      return { title: scn.title, autonomy: scn.autonomy, warn, chars: TABLEFOLK_STATE.characters.map(c => c.id), running: diag ? diag.slice(1, 2).concat(diag[4]).join(' | ') : '' };
    });
    say(`${f}: "${info.title}", ${info.chars.join(', ')}; autonomy ${JSON.stringify(info.autonomy)}; Running now: ${info.running}`);
    if (info.warn.length) say('layout warnings: ' + info.warn.join(' / '));
    await page.evaluate(() => {
      const C = window.__smoke = { meals: {}, sleep: {}, acts: 0 };
      addEventListener('tablefolk-say', e => { const d = e.detail || {}; if (/\beats?\b/i.test(d.text || '')) C.meals[d.agentId] = (C.meals[d.agentId] || 0) + 1; });
      addEventListener('tablefolk-activity', () => C.acts++);
      setInterval(() => { const h = window.tablefolkClock?.hour?.() ?? 12; if (h >= 21 || h < 5) for (const c of TABLEFOLK_STATE.characters) if (c.pose?.mode === 'lie') C.sleep[c.id] = (C.sleep[c.id] || 0) + 1; }, 1000);
    });
    for (let s = 0; s < seconds; s += 15) {
      await page.waitForTimeout(15000);
      const st = await page.evaluate(() => ({ clock: (() => { const n = window.tablefolkClock?.now?.(); return n ? `${window.tablefolkClock.fmt(n.min)} d${n.day}` : '?'; })(), doing: TABLEFOLK_STATE.characters.map(c => `${c.id}: ${window.tablefolkJobs?.doing?.(c) || '-'}`).join('; ') }));
      say(`${st.clock}  ${st.doing}`);
    }
    const end = await page.evaluate(() => ({ jobs: window.tablefolkJobs?.stats?.() || {}, hunger: Object.fromEntries(TABLEFOLK_STATE.characters.map(c => [c.id, +(window.tablefolkMind?.mindOf?.(c)?.hunger || 0).toFixed(2)])), ...window.__smoke }));
    for (const [id, j] of Object.entries(end.jobs)) say(`  ${id}: ${j.job}, cycles ${j.cycles}, did ${JSON.stringify(j.did || {})}, hunger ${end.hunger[id]}, eat-lines ${end.meals[id] || 0}, night-lying ${end.sleep[id] || 0}s${j.stuck ? ', stuck ' + j.stuck : ''}${j.hungerWhy ? ', hungry: ' + j.hungerWhy : ''}`);
    if (errs.length) { bad++; say('ERRORS:\n  ' + errs.join('\n  ')); } else say('no page errors');
  } catch (e) { bad++; say('FAILED: ' + e.message); if (errs.length) say(errs.join('\n  ')); }
  await page.close().catch(() => {});
}
process.exit(bad ? 1 : 0);
