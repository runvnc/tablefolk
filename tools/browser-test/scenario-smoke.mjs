// Smoke run of living scenarios without a model (?model=none: rails, code runs the
// day): each loads, lives for a while on a fast clock, and reports page errors,
// layout warnings, job cycles, meals, who slept and who ends hungry; also the
// scenario's "autonomy" and what Running now says for it.
//
//   node scenario-smoke.mjs scenarios/free-two-by-the-hearth.json [more.json ...]
//        [--base=http://localhost:8000] [--seconds=90] [--day-minutes=2]
//        [--mode=living|adventure|turns] [--shot=out.png] [--extra=&a=1&b=2]
// --mode: plays it in that game mode (?mode=, modes.js) and checks the mode's rules in the page:
//   turns: nothing moves between turns, End turn runs one round in order and moves the clock;
//   adventure: nobody uses the model until engaged, an encounter opens on talk and closes when the
//   player walks away; living: only characters near the player may use the model.
// --shot: a screenshot at the end. --extra: more to put in the page's address.
// Exits 1 when a page error was seen, a scenario never became ready, or a mode check failed.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const files = args.filter(a => !a.startsWith('--')), base = flag('base', 'http://localhost:8000');
const seconds = +flag('seconds', 90), dayMinutes = +flag('day-minutes', 2), mode = flag('mode', ''), shot = flag('shot', ''), extra = flag('extra', '');
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
let bad = 0;
for (const f of files) {
  const page = await b.contexts()[0].newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
  try {
    await page.goto(`${base}/app/?model=none&play=1&gfx=light&fps=10&intro=0&pace=busy&dayMinutes=${dayMinutes}${mode ? '&mode=' + mode : ''}${extra}&scenario=/${f.replace(/^\/+/, '')}&t=${Date.now()}`);
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
    if (mode) { const r = await modeChecks(page, mode, say); if (!r) bad++; }
    for (let s = 0; s < seconds; s += 15) {
      await page.waitForTimeout(15000);
      const st = await page.evaluate(() => ({ clock: (() => { const n = window.tablefolkClock?.now?.(); return n ? `${window.tablefolkClock.fmt(n.min)} d${n.day}` : '?'; })(), doing: TABLEFOLK_STATE.characters.map(c => `${c.id}: ${window.tablefolkJobs?.doing?.(c) || '-'}`).join('; ') }));
      say(`${st.clock}  ${st.doing}`);
    }
    const end = await page.evaluate(() => ({ jobs: window.tablefolkJobs?.stats?.() || {}, hunger: Object.fromEntries(TABLEFOLK_STATE.characters.map(c => [c.id, +(window.tablefolkMind?.mindOf?.(c)?.hunger || 0).toFixed(2)])), ...window.__smoke }));
    for (const [id, j] of Object.entries(end.jobs)) say(`  ${id}: ${j.job}, cycles ${j.cycles}, did ${JSON.stringify(j.did || {})}, hunger ${end.hunger[id]}, eat-lines ${end.meals[id] || 0}, night-lying ${end.sleep[id] || 0}s${j.stuck ? ', stuck ' + j.stuck : ''}${j.hungerWhy ? ', hungry: ' + j.hungerWhy : ''}`);
    // (headless Chrome's page screenshots leave the WebGPU canvas black: its frame, read from the canvas, is laid
    // over it for the shot, the page's own UI on top)
    if (shot) await page.evaluate(() => { const c = document.getElementById('renderCanvas'); if (!c) return; const r = c.getBoundingClientRect(), i = document.createElement('img'); i.id = '__shot3d'; i.src = c.toDataURL('image/png'); Object.assign(i.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: getComputedStyle(c).zIndex === 'auto' ? 0 : getComputedStyle(c).zIndex, pointerEvents: 'none' }); c.after(i); return new Promise(res => i.onload = res); }).catch(() => {});
    if (shot) { await page.screenshot({ path: shot.replace(/(\.png)?$/, files.length > 1 ? '-' + files.indexOf(f) + '.png' : '.png') }); say('screenshot: ' + shot); }
    if (errs.length) { bad++; say('ERRORS:\n  ' + errs.join('\n  ')); } else say('no page errors');
  } catch (e) { bad++; say('FAILED: ' + e.message); if (errs.length) say(errs.join('\n  ')); }
  await page.close().catch(() => {});
}
process.exit(bad ? 1 : 0);

// The game mode's rules, checked in the page (modes.js); -> true when they all hold
async function modeChecks(page, mode, say) {
  await page.waitForFunction(() => window.tablefolkModes && window.TABLEFOLK_STATE?.playerAvatar, null, { timeout: 30000 });
  // let the world start (live.js starts a "live" world 1.5 s after the cover lifts)
  await page.waitForFunction(() => window.tablefolkLive?.on || !window.tablefolkScenario?.active?.scn?.live, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async (mode) => {
    const M = window.tablefolkModes, S = window.TABLEFOLK_STATE, out = { mode: M.mode(), source: M.source, checks: [] };
    const ok = (name, pass, info = '') => out.checks.push({ name, pass: !!pass, info });
    const pos = g => g.logicalPos || g.root.position, here = () => S.characters.map(c => [c.id, Math.round(pos(c).x * 10) / 10, Math.round(pos(c).z * 10) / 10].join(':')).join(' ');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    ok('the mode runs', M.mode() === mode, M.mode() + ' (' + M.source + ')');
    if (mode === 'turns') {
      const pl = S.playerAvatar;
      // the player's squares
      const left0 = M.turn.left;
      ok('the player has squares', left0 > 0, left0 + ' squares');
      await sleep(1500); const a = here(), c0 = window.tablefolkClock?.now?.()?.min; await sleep(5000);
      ok('nothing moves while the player decides', a === here() && window.tablefolkClock?.now?.()?.min === c0, a === here() ? '' : 'moved: ' + a + ' -> ' + here());
      const rounds = []; addEventListener('tablefolk-round', e => rounds.push(e.detail));
      const actors = []; addEventListener('tablefolk-turn', e => actors.push(e.detail.agentId));
      M.endTurn(); const t0 = performance.now();
      while (!rounds.length && performance.now() - t0 < 90000) await sleep(200);
      const r0 = rounds[0];
      ok('End turn runs a round', !!r0, r0 ? `round ${r0.round}: ${r0.order.join(', ')} in ${Math.round((performance.now() - t0) / 100) / 10} s` : 'no round in 90 s');
      ok('each in the active area takes one turn, in order', r0 && JSON.stringify(actors) === JSON.stringify(r0.order), 'seen: ' + actors.join(', '));
      const c1 = window.tablefolkClock?.now?.()?.min;
      ok('the clock jumps the round\'s minutes', c0 == null || Math.round(((c1 - c0) + 1440) % 1440) === Math.round(M.options.turnMinutes), `${c0} -> ${c1} (${M.options.turnMinutes} a round)`);
      ok('the squares come back', M.turn.left === M.options.turnMoves, M.turn.left + '');
      // a second round: the jobs go on in code, a turn each
      M.endTurn(); const t1 = performance.now(); while (rounds.length < 2 && performance.now() - t1 < 90000) await sleep(200);
      ok('a second round', rounds.length >= 2, rounds[1] ? `round ${rounds[1].round}: ${rounds[1].order.length} turns; live ${window.tablefolkLive?.on}; doing: ${S.characters.slice(0, 4).map(c => c.id + ' ' + (window.tablefolkJobs?.doing?.(c) || '-')).join('; ')}` : '');
      ok('the End turn button shows', !!document.querySelector('#modeLine [data-end-turn]') && !document.getElementById('modeLine').hidden, document.getElementById('modeLine')?.textContent || '');
    }
    if (mode === 'adventure') {
      const ppl = S.characters.filter(c => !c.defeated && !window.tablefolkPlay?.isAnimal?.(c) && !window.tablefolkPlay?.isHostile?.(c));
      ok('exploring: nobody may use the model', ppl.every(c => !M.mayThink(c)), ppl.filter(c => M.mayThink(c)).map(c => c.id).join(', '));
      ok('... and they run on rails', ppl.every(c => (window.tablefolkAgency?.level?.(c) || 'rails') === 'rails'));
      const g = ppl[0]; if (!g) { ok('someone to talk to', false); return out; }
      // walk up and talk (the chat box's event; no model here, so no answer)
      window.setCharacterLogicalPosition?.(S.playerAvatar, new BABYLON.Vector3(Math.round(pos(g).x) + 1, 0, Math.round(pos(g).z)));
      dispatchEvent(new CustomEvent('tablefolk-player-chat', { detail: { agentId: g.id, text: 'hello there' } }));
      ok('talking opens an encounter with it', M.encounter.open && M.encounter.members.includes(g.id), M.encounter.members.join(', '));
      ok('... and it may use the model', M.mayThink(g));
      ok('... the others still may not', ppl.filter(c => !M.encounter.members.includes(c.id)).every(c => !M.mayThink(c)));
      ok('the world slows beside it', window.tablefolkModes.clockRate() < 1, 'clock rate ' + M.clockRate());
      ok('the mode line says who', /talking with/.test(document.getElementById('modeLine')?.textContent || ''), document.getElementById('modeLine')?.textContent || '');
      const ends = []; addEventListener('tablefolk-encounter', e => { if (e.detail.phase === 'end') ends.push(e.detail); });
      // walk away: the farthest free square from it
      let far = null, fd = 0; for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) { if (!window.cellPassable?.(x, z)) continue; const d = Math.hypot(x - pos(g).x, z - pos(g).z); if (d > fd) { fd = d; far = [x, z]; } }
      // (a small map may have nowhere far enough: the talk then ends when idle, 90 s)
      const leave = (+S.earshot > 0 ? +S.earshot : 6) + 2;
      if (!far || fd <= leave) { ok('walking away ends it (skipped: nowhere on this map is farther than ' + leave + ' squares)', true); return out; }
      window.setCharacterLogicalPosition?.(S.playerAvatar, new BABYLON.Vector3(far[0], 0, far[1]));
      const t0 = performance.now(); while (!ends.length && performance.now() - t0 < 5000) await sleep(200);
      ok('walking away ends it', ends[0]?.reason === 'walked away', ends[0] ? `${ends[0].reason}, ${ends[0].lines} lines` : 'still open');
      ok('... and it is back on rails', !M.mayThink(g) && (window.tablefolkAgency?.level?.(g) || 'rails') === 'rails');
      const mem = (window.tablefolkMind?.mindOf?.(g)?.mem || []).map(e => e.text).filter(t => /You talked with/.test(t));
      ok('... remembering the talk', mem.length > 0, mem.slice(-1)[0] || '');
    }
    if (mode === 'living') {
      const pl = S.playerAvatar, R = M.options.radius;
      const near = S.characters.filter(c => Math.hypot(pos(c).x - pos(pl).x, pos(c).z - pos(pl).z) <= R), far = S.characters.filter(c => !near.includes(c));
      ok('near the player: may use the model', near.every(c => M.mayThink(c)), near.map(c => c.id).join(', '));
      ok('far from the player: on rails', far.every(c => !M.mayThink(c)), far.map(c => c.id).join(', ') || '(nobody far)');
      ok('the model queue is the priority one', !!window.tablefolkModelQueue || !window.tablefolk?.brainReady?.(), window.tablefolkModelQueue ? 'yes' : 'no brain loaded');
    }
    return out;
  }, mode);
  say(`mode ${r.mode} (${r.source})`);
  for (const c of r.checks) say(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.info ? ': ' + c.info : ''}`);
  return r.checks.every(c => c.pass);
}
