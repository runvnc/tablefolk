// Generator eval: what the world builder makes from one-line requests, scored
// for living worlds (a place, people with work, a pressure, a goal tied to it).
//
//   node gen-eval.mjs [--base=http://localhost:8000] [--label=after] [--only=village,mine] [--par=4]
//        server path: GET /api/generate (the server's default cloud model; owner requests from localhost)
//   node gen-eval.mjs --browser [--only=village,forest,talk]
//        the in-browser step-by-step path (app/worldgen-browser.js) in the test Chrome
//        (CDP 9223, the model cached for the origin), through tools/browser-test/worldgen-test.html
//   node gen-eval.mjs --score=<file.json> ...   score saved scenarios (generated/*.json) without generating
//
// Per world: places, talking characters with job / home / workplace set and
// reachable from the player's start, pressure kind, goal predicate kinds,
// live/time set, the checks' repairs. Saves results/gen-<label>-<ts>.json and
// the scenarios, so tools/browser-test/live-eval.mjs can play them.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const args = process.argv.slice(2), flag = n => { const a = args.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const base = flag('base') || 'http://localhost:8000', label = flag('label') || (flag('browser') ? 'browser' : 'server'), par = +(flag('par') || 4);
export const REQUESTS = {
  village: 'a farming village getting ready for winter',
  outpost: 'a frontier outpost at the edge of goblin country',
  dungeon: 'a dungeon under an old keep, full of treasure and monsters',
  forest: 'a hunters\' camp deep in a dark forest',
  mine: 'a mining camp in the mountains',
  market: 'a market town on the trade road',
  farm: 'a lonely farmstead on the moors',
  talk: 'a job interview between a nervous skeleton and a necromancer, just talking',
};
const only = flag('only') ? String(flag('only')).split(',') : Object.keys(REQUESTS);
const { reach, TALK_ONLY } = await import(path.join(root, 'server/worldgen-living.js'));
const MINDLESS = /^(skeleton|skeleton_warrior|skeleton_farmer|zombie|rat|spider|wolf|bat|slime|ghost|giant|demon|dragon|wyrmling|imp|mushroom_warrior|bunny|snake|wasp|frog|minotaur|lizardman|werewolf|mummy|bear|gnoll|gargoyle|dark_knight|red_dragon)$/;
const ANIMAL = /^(cow|bull|horse|white_horse|donkey|deer|stag|fox|dog|husky|alpaca|pig|sheep)$/;

export function score(s, repairs = []) {
  const folk = (s.agents || []).filter(a => !a.hostile && !(a.hostile == null && MINDLESS.test(a.model || '')) && !ANIMAL.test(a.model || ''));
  let places = 1, reached = null;
  if (s.generate) try { const R = reach(JSON.parse(JSON.stringify(s))); places = R.b.r.places.length; reached = R; } catch (e) { places = '?'; }
  const placeOK = (a, k) => { if (!a[k]) return false; if (!reached) return true; const p = reached.b.r.places.find(q => q.id === String(a[k]).toLowerCase()) || reached.b.r.places.find(q => q.id.replace(/\s+\d+$/, '') === String(a[k]).toLowerCase()); return !!p && reached.placeReached(p); };
  const withWork = folk.filter(a => a.job && a.home && a.workplace).length;
  const reachable = folk.filter(a => placeOK(a, 'home') && placeOK(a, 'workplace')).length;
  const kinds = [...(s.threats || []).map(t => 'threat:' + (t.who || t.kind)), ...((s.agents || []).some(a => !folk.includes(a) && !ANIMAL.test(a.model || '')) ? ['monsters'] : [])];
  const scarce = (s.objects || []).some(o => (o.items || []).some(i => /wheat|bread|meat|food|grain/i.test(String(i?.name || i)) && (+i?.qty || 1) <= 3));
  if (scarce) kinds.push('scarcity');
  const goal = [...new Set((JSON.stringify(s.goal?.win || {}) + JSON.stringify(s.goal?.lose || {})).match(/"(\w+)":/g)?.map(k => k.slice(1, -2)).filter(k => !['all', 'any', 'not'].includes(k)) || [])];
  return { title: s.title, kind: s.generate ? (s.generate.kind || 'dungeon') : s.grid ? 'grid' : s.map ? 'map' : '?', talk: !!s.talk, places, people: folk.length, withWork, reachable, pressure: kinds.join(' ') || 'none', goal: goal.join(' ') || 'none', live: !!s.live, time: !!s.time, repairs: repairs.length };
}

async function viaServer(key) {
  const t0 = Date.now();
  const r = await fetch(`${base}/api/generate?prompt=${encodeURIComponent(REQUESTS[key])}&where=cloud`, { signal: AbortSignal.timeout(900000) });
  const d = await r.json();
  if (!d.scenario) throw new Error(d.error || 'no scenario');
  return { scenario: d.scenario, repairs: d.repairs || [], ms: Date.now() - t0, model: d.model };
}
async function viaBrowser(key) {
  const { chromium } = await import('playwright-core');
  const b = await chromium.connectOverCDP(`http://localhost:${process.env.CDP_PORT || 9223}`);
  const ctx = b.contexts()[0], page = await ctx.newPage();
  const t0 = Date.now();
  try {
    await page.goto(`${base}/tools/browser-test/worldgen-test.html?prompt=${encodeURIComponent(REQUESTS[key])}&t=${Date.now()}`);
    for (let i = 0; i < 180; i++) {
      const r = await page.evaluate(() => window.result || null);
      if (r) { if (!r.ok) throw new Error(r.error); const repairs = await page.evaluate(() => window.repairs || []); return { scenario: r.scenario, repairs, ms: Date.now() - t0, model: 'browser' }; }
      if (i % 6 === 0) console.log(`  [${key}] ${((Date.now() - t0) / 1000).toFixed(0)} s: ${(await page.evaluate(() => document.getElementById('out')?.textContent || '')).split('\n').slice(-1)[0]}`);
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('timed out (15 min)');
  } finally { await page.close().catch(() => {}); await b.close().catch(() => {}); }
}

async function main() {
  const rows = [], out = { label, at: new Date().toISOString(), worlds: {} };
  if (flag('score')) {
    for (const f of args.filter(a => a.startsWith('--score=')).map(a => a.slice(8))) { const s = JSON.parse(fs.readFileSync(f, 'utf8')); rows.push({ key: path.basename(f), ...score(s, s.repairs || []) }); }
  } else {
    const run = flag('browser') ? viaBrowser : viaServer, keys = [...only];
    const one = async key => {
      console.log(`[${key}] ${REQUESTS[key]}`);
      try { const r = await run(key); out.worlds[key] = r; const sc = score(r.scenario, r.repairs); rows.push({ key, ...sc, s: Math.round(r.ms / 1000) }); console.log(`[${key}] done in ${(r.ms / 1000).toFixed(0)} s: ${sc.title}`); }
      catch (e) { console.log(`[${key}] FAILED: ${e.message}`); rows.push({ key, title: 'FAILED: ' + e.message.slice(0, 80) }); }
    };
    const n = flag('browser') ? 1 : par;
    for (let i = 0; i < keys.length; i += n) await Promise.all(keys.slice(i, i + n).map(one));
  }
  rows.sort((a, b) => only.indexOf(a.key) - only.indexOf(b.key));
  console.log('\n| request | world | kind | places | people | job+home+work | reachable | pressure | goal | live+time | repairs |\n|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.key} | ${r.title || ''}${r.talk ? ' (talk)' : ''} | ${r.kind ?? ''} | ${r.places ?? ''} | ${r.people ?? ''} | ${r.withWork ?? ''} | ${r.reachable ?? ''} | ${r.pressure ?? ''} | ${r.goal ?? ''} | ${r.live != null ? (r.live && r.time ? 'yes' : r.live ? 'live only' : 'no') : ''} | ${r.repairs ?? ''} |`);
  out.rows = rows;
  fs.mkdirSync(path.join(here, 'results'), { recursive: true });
  const f = path.join(here, 'results', `gen-${label}-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
  for (const [k, w] of Object.entries(out.worlds)) fs.writeFileSync(path.join(here, 'results', `gen-${label}-${k}.json`), JSON.stringify(w.scenario, null, 1));
  console.log('saved', path.relative(process.cwd(), f));
}
main().catch(e => { console.error(e); process.exit(1); });
