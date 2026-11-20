// A trip to another section in the middle of a living day, beside a running
// live-eval (it plays the day; this walks the player away and back):
//
//   node live-eval.mjs scenarios/hearthvale.json --day --day-minutes=8 --label=sections &
//   node sections-day.mjs [--at=12] [--hours=1.5] [--match=hearthvale]
//
// Waits for the game clock to reach --at (12:00), takes the first edge link
// (or the first link) to its section, stays --hours game hours, comes back the
// way it came, and reports: the model calls and the action lines by
// character while away (none should come from the section left behind), who
// was where on return (the catch-up), and the clock. CDP_PORT as usual.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const at = +flag('at', 12), hours = +flag('hours', 1.5), match = flag('match', 'hearthvale');
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
let page = null;
for (let i = 0; i < 240 && !page; i++) { page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes(match)) || null; if (!page) await new Promise(r => setTimeout(r, 1000)); }
if (!page) { console.log('no page with', match); process.exit(1); }
say('page: ' + page.url().slice(0, 100));
await page.waitForFunction(() => window.tablefolkScenario?.active && window.tablefolk?.state?.clock, null, { timeout: 300000 });
await page.evaluate(() => {
  window.__trip = { calls: [], says: [], phase: 'before' };
  addEventListener('tablefolk-model-call', e => window.__trip.calls.push({ phase: window.__trip.phase, id: e.detail?.agentId, kind: e.detail?.kind, section: window.tablefolkScenario.section }));
  addEventListener('tablefolk-say', e => window.__trip.says.push({ phase: window.__trip.phase, id: e.detail?.agentId, section: window.tablefolkScenario.section }));
});
const hour = () => page.evaluate(() => { const c = window.tablefolk.state.clock; return c.min / 60 + (c.day - 1) * 24; });
say('waiting for ' + at + ':00 (game)');
while ((await hour()) < at) await new Promise(r => setTimeout(r, 1000));
const villagers = await page.evaluate(() => window.tablefolk.getAgents().map(g => g.id));
const before = await page.evaluate(() => ({ clock: { ...window.tablefolk.state.clock }, jobs: window.tablefolkJobs?.stats?.() || {} }));
say(`${at}:00: going (${villagers.length} characters here)`);
await page.evaluate(() => { window.__trip.phase = 'away'; const l = window.tablefolkScenario.links().find(l => l.edge) || window.tablefolkScenario.links()[0]; window.tablefolkScenario.travel(l); });
await page.waitForFunction(() => window.tablefolkScenario.section !== '', null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
const away = await page.evaluate(() => ({ section: window.tablefolkScenario.section, here: window.tablefolk.getAgents().map(g => g.id) }));
say(`in ${away.section}: ${away.here.join(', ')}`);
const leaveAt = (await hour()) + hours;
while ((await hour()) < leaveAt) await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.__trip.phase = 'back'; window.tablefolkScenario.travel({ to: 'back' }); });
await page.waitForFunction(() => window.tablefolkScenario.section === '', null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
const back = await page.evaluate(() => ({ clock: { ...window.tablefolk.state.clock }, catchUp: window.tablefolkSections?.lastCatchUp || null, jobs: window.tablefolkJobs?.stats?.() || {},
  where: window.tablefolk.getAgents().map(g => { const p = g.logicalPos || g.root.position, pl = (window.tablefolk.state.places || []).find(q => p.x >= q.x0 - .5 && p.x <= q.x1 + .5 && p.z >= q.z0 - .5 && p.z <= q.z1 + .5); return `${g.id}@${pl?.id || Math.round(p.x) + ',' + Math.round(p.z)}${g.pose?.mode ? ' (' + g.pose.mode + ')' : ''}`; }) }));
const trip = await page.evaluate(() => window.__trip);
const away0 = trip.calls.filter(c => c.phase === 'away'), leftBehind = away0.filter(c => villagers.includes(c.id) && !away.here.includes(c.id));
const saysAway = trip.says.filter(s => s.phase === 'away' && villagers.includes(s.id) && !away.here.includes(s.id));
say(`back at ${Math.floor(back.clock.min / 60)}:${String(Math.floor(back.clock.min % 60)).padStart(2, '0')}`);
console.log(JSON.stringify({ away: away.section, hereThere: away.here, modelCallsAway: away0.length, byLeftBehind: leftBehind.length, linesByLeftBehindAway: saysAway.length,
  catchUp: back.catchUp && { minutes: Math.round(back.catchUp.minutes), regrew: back.catchUp.regrew, ate: back.catchUp.ate, moved: back.catchUp.moved, asleep: back.catchUp.asleep, gone: back.catchUp.gone },
  whereOnReturn: back.where, cyclesBefore: Object.fromEntries(Object.entries(before.jobs).map(([k, v]) => [k, v.cycles])), cyclesAfter: Object.fromEntries(Object.entries(back.jobs).map(([k, v]) => [k, v.cycles])) }, null, 1));
await b.close().catch(() => {});
