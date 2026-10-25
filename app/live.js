/* live.js -- "let them live": the characters keep acting on their own while
 * the player watches (or joins in). Without it they act only after the
 * player moves (play.js's turn round).
 *
 *   P, or the ▶ button by the view buttons     start / pause
 *   window.tablefolkLive.start() / stop() / toggle(), .on
 *
 * Pacing, by real time (back to back, everyone talked without pause):
 *   - each character has its own next-turn time, PACE.turn seconds apart
 *     (out of the player's sight, twice as long);
 *   - a line spoken holds the next one back PACE.quiet seconds;
 *   - a character with nothing to react to (nothing said or happened to it,
 *     nothing urgent) mostly idles without its brain: a step, a turn, or
 *     nothing (PACE.idle of its turns);
 *   - someone spoken to, or told of an event, goes after a short pause;
 *   - the player's own doing sets the tempo: for 30 s after the player acts
 *     or talks things move faster, and after 3 minutes without, slower.
 * The pace is calm, lively or busy (the select by the live button, kept in
 * this browser; a scenario's "pace" is the default). Mindless monsters come
 * for the player (play.js's fighter, when near and in sight) or wander. The
 * director (director.js) gets a tick after each turn and asks eventGap() for
 * its own spacing.
 *
 * The player can move, talk and act at any time: the live round waits while
 * the player's own turn round runs (play.js), and the brains take one
 * decision at a time (world.runAgentTurn).
 * Loaded after play.js; uses app.js globals (state, getBrainConfig,
 * cellPassable, occupantAt, findRoute, startTurnPath, playRig).
 */
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let on = false, loop = null, turns = 0;
  const W = () => window.tablefolk;
  const P = () => window.tablefolkPlay;
  const me = () => state.playerAvatar;
  const posOf = g => g.logicalPos || g.root.position;
  const alive = c => c && !c.defeated && !getBrainConfig(c.id).defeated && getBrainConfig(c.id).enabled !== false;
  const seenByPlayer = c => !me() || (window.tablefolkDark?.visible?.(posOf(c).x, posOf(c).z) ?? true) && Math.hypot(posOf(c).x - posOf(me()).x, posOf(c).z - posOf(me()).z) <= 12;

  async function wander(c) {
    if (Math.random() > .35) return;
    const p = posOf(c), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - .5);
    for (const [dx, dz] of dirs) {
      const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz;
      if (!cellPassable(x, z) || occupantAt(x, z, c)) continue;
      const leg = findRoute(new BABYLON.Vector3(p.x, 0, p.z), new BABYLON.Vector3(x, 0, z)); if (!leg?.length) continue;
      startTurnPath(c, leg); c.anim = 'walk'; playRig(c, 'walk', true);
      setTimeout(() => { if (c.anim === 'walk') { c.anim = 'idle'; playRig(c, 'idle', true); } }, c.turnMove.dur * 1000 + 80);
      await sleep(c.turnMove.dur * 1000 + 100);
      return;
    }
  }
  async function monsterTurn(c) {
    const pl = me();
    const near = pl && !pl.defeated && Math.hypot(posOf(c).x - posOf(pl).x, posOf(c).z - posOf(pl).z) <= 8 && (W()?.canSeeEachOther?.(c, pl) ?? true);
    if (near) await P()?.fighterTurn?.(c); else await wander(c);
  }
  // ---- pace ----
  const PACES = {
    calm: { turn: [20, 36], quiet: 13, idle: .7, event: [100, 160] },
    lively: { turn: [7, 14], quiet: 4, idle: .35, event: [45, 80] },
    busy: { turn: [1, 3], quiet: 0, idle: 0, event: [20, 30] },
  };
  let pace = (() => { try { return PACES[localStorage.getItem('tablefolk.pace')] ? localStorage.getItem('tablefolk.pace') : 'calm'; } catch { return 'calm'; } })();
  let lastPlayerAt = performance.now(), lastSpeechAt = 0;
  const nextAt = new Map();
  const P0 = () => PACES[pace] || PACES.calm;
  // engaged: faster; left alone for a while: slower
  function tempo() { const idle = (performance.now() - lastPlayerAt) / 1000; return idle < 30 ? .6 : idle > 180 ? 1.7 : 1; }
  const rand = ([a, b]) => a + Math.random() * (b - a);
  function schedule(c, first = false) {
    const k = (seenByPlayer(c) ? 1 : 2) * tempo();
    nextAt.set(c, performance.now() + rand(P0().turn) * 1000 * k * (first ? Math.random() : 1));
  }
  addEventListener('tablefolk-player-turn', () => { lastPlayerAt = performance.now(); });
  addEventListener('tablefolk-player-chat', () => { lastPlayerAt = performance.now(); });
  addEventListener('tablefolk-agent-turn', e => { if (/\b(say|whisper)\s*\(|^[^(]*$/m.test(String(e.detail?.line || ''))) lastSpeechAt = performance.now(); });
  // has it something to react to?
  function reason(c) {
    const cfg = getBrainConfig(c.id);
    if (cfg.pendingChat?.length) return 'pending';
    const card = (window.tablefolkMind?.cardLines?.(c) || []).join(' ');
    if (/You want: (stay safe|get away|tell .* attacked|let .* stand for|eat something)/.test(card)) return 'urgent';
    return '';
  }
  // a turn without the brain: a step, a look elsewhere, or nothing
  async function idle(c) {
    const r = Math.random();
    if (r < .35) await wander(c);
    else if (r < .6) { const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(Math.random() * 4)]; try { setCharacterFacing(c, new BABYLON.Vector3(d[0], 0, d[1])); } catch {} }
  }
  // the next one due: someone with something to answer first (after a short
  // pause), then whoever's time has come
  function due() {
    const now = performance.now(), all = state.characters.filter(alive);
    for (const c of all) if (!nextAt.has(c)) schedule(c, true);
    const quietOk = now - lastSpeechAt >= P0().quiet * 1000 * tempo();
    // even an answer waits a little after the last line (a third of the quiet gap)
    const pend = all.filter(c => reason(c) === 'pending' && now - lastSpeechAt >= Math.max(1500, P0().quiet * 333 * tempo()));
    if (pend.length) return pend.sort((a, b) => nextAt.get(a) - nextAt.get(b))[0];
    if (!quietOk) return null;
    const ready = all.filter(c => nextAt.get(c) <= now).sort((a, b) => nextAt.get(a) - nextAt.get(b));
    return ready[0] || null;
  }
  async function run() {
    const w = W();
    // The page loads the brain itself (asking first when it must download):
    // wait for that rather than start a second load, which cancelled the
    // pending download question
    while (on && !w?.brainReady?.()) { status('waiting for the characters\u2019 brain to load…'); await sleep(1000); }
    if (!on) return;
    status('');
    nextAt.clear();
    while (on) {
      // the player's own turn round goes first
      while (on && (P()?.busy || state.npcBusy)) await sleep(150);
      const c = on && due();
      if (!c) { await sleep(300); continue; }
      turns++;
      const hostile = P()?.isHostile?.(c), mind = !hostile || P()?.talksToo?.(c), why = reason(c);
      try {
        if (hostile && !mind) await monsterTurn(c);
        else if (!why && Math.random() < P0().idle) await idle(c);
        else {
          if (hostile) await monsterTurn(c);
          status(`${c.id} is thinking…`);
          await w.runAgentTurn(c);
        }
      } catch (e) { console.warn('[live]', c.id, e); }
      status('');
      schedule(c);
      try { window.tablefolkDirector?.tick?.(c); } catch (e) { console.warn('[director]', e); }
      await sleep(250);
    }
  }
  function setPace(p) {
    if (!PACES[p]) return; pace = p; try { localStorage.setItem('tablefolk.pace', p); } catch {}
    nextAt.clear(); const sel = document.getElementById('paceSel'); if (sel) sel.value = p;
  }
  function status(t) {
    const el = document.getElementById('liveStatus'); if (el) el.textContent = t || (on ? 'they are living their lives' : '');
  }
  function button() {
    const b = document.getElementById('liveBtn'); if (!b) return;
    b.classList.toggle('active', on);
    b.querySelector('span').textContent = on ? 'pause' : 'let them live';
    b.title = on ? 'pause: characters act only after you do (P)' : 'let them live: everyone keeps acting on their own (P)';
    b.querySelector('svg').innerHTML = on ? '<path d="M8 5v14M16 5v14"/>' : '<path d="M7 4l13 8-13 8z"/>';
  }
  function start() {
    if (on || !state.characters?.length) return;
    lastPlayerAt = performance.now();
    on = true; button(); status('');
    window.tablefolkToast?.('Let them live: everyone acts on their own. P pauses.', { type: 'info' });
    loop = run().catch(e => console.error('[live]', e)).finally(() => { loop = null; });
  }
  function stop() { if (!on) return; on = false; button(); status(''); }
  function toggle() { on ? stop() : start(); }
  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggle(); }
  });
  addEventListener('click', e => { if (e.target.closest?.('#liveBtn')) toggle(); });
  addEventListener('change', e => { if (e.target.id === 'paceSel') setPace(e.target.value); });
  addEventListener('tablefolk-scenario-started', () => { const p = window.tablefolkScenario?.active?.scn?.pace; let mine = null; try { mine = localStorage.getItem('tablefolk.pace'); } catch {} if (!mine && PACES[p]) setPace(p); const sel = document.getElementById('paceSel'); if (sel) sel.value = pace; });
  // a new scenario starts paused (its settings may start it: "live": true)
  addEventListener('tablefolk-scenario-started', e => { stop(); turns = 0; if (e.detail?.live) setTimeout(start, 1500); });
  window.tablefolkLive = { start, stop, toggle, setPace, get pace() { return pace; }, eventGap: () => rand(P0().event) * tempo(), get on() { return on; },
    // rounds: as many turns as there are characters (the timed events' "round")
    get round() { return Math.floor(turns / Math.max(1, state.characters.filter(alive).length)); } };
})();
