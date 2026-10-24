/* live.js -- "let them live": the characters keep acting on their own while
 * the player watches (or joins in). Without it they act only after the
 * player moves (play.js's turn round).
 *
 *   P, or the ▶ button by the view buttons     start / pause
 *   window.tablefolkLive.start() / stop() / toggle(), .on
 *
 * Each round: every character with a mind takes one turn (its LLM brain),
 * those the player can see first and every round; the ones out of sight
 * every third round (they still live, the player just doesn't wait on them).
 * Someone spoken to, or told of an event, goes next. Mindless monsters
 * either come for the player (play.js's fighter, when it is near and in
 * sight) or wander a step now and then. The director (director.js) gets a
 * tick after each turn, to make something happen now and then.
 *
 * The player can move, talk and act at any time: the live round waits while
 * the player's own turn round runs (play.js), and the brains take one
 * decision at a time (world.runAgentTurn).
 * Loaded after play.js; uses app.js globals (state, getBrainConfig,
 * cellPassable, occupantAt, findRoute, startTurnPath, playRig).
 */
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let on = false, loop = null, round = 0;
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
  // who goes next: someone with something to answer first, then the rest in order
  function order() {
    const all = state.characters.filter(alive);
    const visible = all.filter(seenByPlayer), hidden = all.filter(c => !visible.includes(c));
    const list = round % 3 === 0 ? [...visible, ...hidden] : visible.length ? visible : hidden.slice(0, 2);
    return list.sort((a, b) => (getBrainConfig(b.id).pendingChat?.length ? 1 : 0) - (getBrainConfig(a.id).pendingChat?.length ? 1 : 0));
  }
  async function run() {
    const w = W();
    // The page loads the brain itself (asking first when it must download):
    // wait for that rather than start a second load, which cancelled the
    // pending download question
    while (on && !w?.brainReady?.()) { status('waiting for the characters\u2019 brain to load…'); await sleep(1000); }
    if (!on) return;
    status('');
    while (on) {
      round++;
      const list = order();
      if (!list.length) { status('nobody is left to act'); await sleep(1500); continue; }
      for (const c of list) {
        if (!on) break;
        // the player's own turn round goes first
        while (on && (P()?.busy || state.npcBusy)) await sleep(150);
        if (!on || !alive(c)) continue;
        const hostile = P()?.isHostile?.(c), mind = !hostile || P()?.talksToo?.(c);
        try {
          if (hostile && !mind) await monsterTurn(c);
          else {
            if (hostile) await monsterTurn(c);
            status(`${c.id} is thinking…`);
            await w.runAgentTurn(c);
          }
        } catch (e) { console.warn('[live]', c.id, e); }
        status('');
        try { window.tablefolkDirector?.tick?.(c); } catch (e) { console.warn('[director]', e); }
        await sleep(250);
      }
      await sleep(400);
    }
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
  // a new scenario starts paused (its settings may start it: "live": true)
  addEventListener('tablefolk-scenario-started', e => { stop(); round = 0; if (e.detail?.live) setTimeout(start, 1500); });
  window.tablefolkLive = { start, stop, toggle, get on() { return on; }, get round() { return round; } };
})();
