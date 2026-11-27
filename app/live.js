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
 *     nothing (PACE.idle of its turns), or its routine with the things
 *     around it (uses.js: a bed at night, its work station by day);
 *   - someone spoken to, or told of an event, goes after a short pause;
 *   - the player's own doing sets the tempo: for 30 s after the player acts
 *     or talks things move faster, and after 3 minutes without, slower.
 * The pace is calm, lively or busy (the select by the live button, kept in
 * this browser; a scenario's "pace" is the default). Mindless monsters come
 * for the player (play.js's fighter, when near and in sight) or wander. The
 * director (director.js) gets a tick after each turn and asks eventGap() for
 * its own spacing.
 *
 * With the clock running (clock.js), characters with a job (jobs.js: every
 * one with a mind, inferred when the scenario names none) are busy in code:
 * their tick is jobs.tick (work, meals, sleep, the evening, threats), on
 * their own timer (no quiet gap: no model call); something that only
 * happened to them is a short pick (jobs.eventPick); speech to them is
 * answered by the model as before. A muted idle turn never calls the model.
 * Raiders (threats.js) take their turns through tablefolkThreats.turn.
 *
 * The player can move, talk and act at any time: the live round waits while
 * the player's own turn round runs (play.js), and the brains take one
 * decision at a time (world.runAgentTurn).
 * A "live" world starts 1.5 s after the loading cover lifts (loading.js
 * whenRevealed) and the characters' brain is ready or not coming
 * (TABLEFOLK_BRAIN_WAKING, 'tablefolk-brain-settled'): until then the clock and
 * everyone stand still while the player looks around.
 * Loaded after play.js; uses app.js globals (state, getBrainConfig,
 * cellPassable, occupantAt, findRoute, startTurnPath, playRig).
 */
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let on = false, loop = null, turns = 0, ticks = 0;
  const W = () => window.tablefolk;
  const P = () => window.tablefolkPlay;
  const me = () => state.playerAvatar;
  const posOf = g => g.logicalPos || g.root.position;
  const alive = c => c && !c.defeated && !getBrainConfig(c.id).defeated && getBrainConfig(c.id).enabled !== false;
  const seenByPlayer = c => !me() || (window.tablefolkDark?.visible?.(posOf(c).x, posOf(c).z) ?? true) && Math.hypot(posOf(c).x - posOf(me()).x, posOf(c).z - posOf(me()).z) <= 12;

  async function wander(c, chance = .35) {
    if (Math.random() > chance) return;
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
  // an animal (play.js ANIMALS, no brain): ambles about, grazes, looks around
  async function animalTurn(c) {
    // fed, or a dog called along (animals.js): it walks after you
    const lead = window.tablefolkAnimals?.following(c);
    if (lead && !lead.defeated) {
      const a = posOf(c), b = posOf(lead);
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1.8) {
        const leg = findRoute(new BABYLON.Vector3(a.x, 0, a.z), new BABYLON.Vector3(Math.round(b.x), 0, Math.round(b.z)));
        if (leg?.length > 1) { const steps = leg.slice(0, Math.min(3, leg.length - 1)); startTurnPath(c, steps); c.anim = 'walk'; playRig(c, 'walk', true); setTimeout(() => { if (c.anim === 'walk' && !c.turnMove) { c.anim = 'idle'; playRig(c, 'idle', true); } }, c.turnMove.dur * 1000 + 120); await sleep(c.turnMove.dur * 1000 + 150); }
      }
      return;
    }
    const r = Math.random();
    // now and then a moo, a bray, a bark (reactions.js voice banks; quiet with distance)
    if (Math.random() < .18) try { window.tablefolkReact?.voice(c, 'call'); } catch {}
    if (r < .45) return wander(c, 1);
    if (r < .7) { try { playRig(c, 'pickup', false); } catch {} return sleep(1200); }
    const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(Math.random() * 4)]; try { setCharacterFacing(c, new BABYLON.Vector3(d[0], 0, d[1])); } catch {}
  }
  async function monsterTurn(c) {
    // a raider with its own way (threats.js: rats go for the stores, bandits for gold, and away at dawn)
    if (c._threat && await window.tablefolkThreats?.turn?.(c)) return;
    const near = P()?.preyFor?.(c);
    if (near) await P()?.fighterTurn?.(c); else await wander(c);
  }
  // a fighter with someone to fight in sight: a monster with prey, or a
  // character pushed too far (mind.js tempers, play.js hostileTarget)
  const fighting = c => !!((P()?.isHostile?.(c) || P()?.hostileTarget?.(c)) && P()?.preyFor?.(c));
  // ---- pace ----
  const PACES = {
    calm: { turn: [20, 36], quiet: 13, idle: .7, event: [100, 160] },
    lively: { turn: [7, 14], quiet: 4, idle: .35, event: [45, 80] },
    busy: { turn: [1, 3], quiet: 0, idle: 0, event: [20, 30] },
  };
  // ?pace=lively (tests): this page only, over the remembered choice and the world's
  const urlPace = PACES[new URLSearchParams(location.search).get('pace')] ? new URLSearchParams(location.search).get('pace') : null;
  let pace = urlPace || (() => { try { return PACES[localStorage.getItem('tablefolk.pace')] ? localStorage.getItem('tablefolk.pace') : 'calm'; } catch { return 'calm'; } })();
  let lastPlayerAt = performance.now(), lastSpeechAt = 0;
  const nextAt = new Map();
  const P0 = () => PACES[pace] || PACES.calm;
  // engaged: faster; left alone for a while: slower
  function tempo() { const idle = (performance.now() - lastPlayerAt) / 1000; return idle < 30 ? .6 : idle > 180 ? 1.7 : 1; }
  const rand = ([a, b]) => a + Math.random() * (b - a);
  function schedule(c, first = false, ms = null) {
    // jobs.js: a busy character's next step comes when this one is done, whatever the pace (no model call)
    if (ms != null && Number.isFinite(ms)) { nextAt.set(c, performance.now() + Math.max(500, ms)); return; }
    // a follower (animals.js) keeps up: a turn every second or two
    if (window.tablefolkAnimals?.following(c)) { nextAt.set(c, performance.now() + 900 + Math.random() * 700); return; }
    // a fight goes at its own speed, whatever the pace: a blow every 1.5-2.5 s
    if (fighting(c)) { nextAt.set(c, performance.now() + 1500 + Math.random() * 1000); return; }
    // (modes.js: beside an open adventure encounter the world around goes slower, "encounterWorld": "slow")
    const k = (seenByPlayer(c) ? 1 : 2) * tempo() * (window.tablefolkModes?.paceFactor?.(c) ?? 1);
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
    if (/You want: (stay safe|get away|tell .* attacked|let .* stand for|eat something|get something to eat|find something to eat|rest:)/.test(card)) return 'urgent';
    return '';
  }
  // nothing said to it: events and approach notices only
  const onlyHappened = c => (getBrainConfig(c.id).pendingChat || []).every(l => /^\s*(\[event\]|\()/.test(String(l)) || /\bcomes up to you\b/i.test(String(l)));
  // a turn without the brain: a step, a look elsewhere, or nothing
  async function idle(c) {
    // routines first: a bed at night, the anvil for a smith by day (uses.js)
    if (window.tablefolkUses?.routine(c)) return;
    const r = Math.random();
    if (r < .35) await wander(c);
    else if (r < .6) { const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(Math.random() * 4)]; try { setCharacterFacing(c, new BABYLON.Vector3(d[0], 0, d[1])); } catch {} }
  }
  // the next one due: someone with something to answer first (after a short
  // pause), then whoever's time has come
  function due() {
    // (a character whose turn runs on its own, above rails, waits for it: agency.js)
    // (nor one with a reply to the player on the way, world-integration.js replyNow; nor one the game mode holds
    // still: modes.js, beside an adventure encounter with "encounterWorld": "pause")
    const now = performance.now(), all = state.characters.filter(alive).filter(c => !c._turnRunning && !c._replying && (window.tablefolkModes?.mayAct?.(c) ?? true));
    for (const c of all) if (!nextAt.has(c)) schedule(c, true);
    const quietOk = now - lastSpeechAt >= P0().quiet * 1000 * tempo();
    // even an answer waits a little after the last line (a third of the quiet gap)
    // (the player's words are answered after a third of the quiet gap; one character's to another after the whole gap and a half:
    // with idle turns gone, characters' talk ran back to back, 6.7 lines a minute in the bakery)
    const pn = (document.getElementById('chatName')?.value || '').trim().toLowerCase();
    const fromPlayer = c => (getBrainConfig(c.id).pendingChat || []).some(l => pn && String(l).toLowerCase().startsWith(pn + ' says'));
    // (in the evening's social window in a gathering, tablefolkTalk.socialHour, a character's words to another wait half the quiet gap, whatever the tempo: the time for talk)
    const eve = c => !!window.tablefolkTalk?.socialHour?.(c.id);
    const pend = all.filter(c => reason(c) === 'pending' && now - lastSpeechAt >= (eve(c) && !fromPlayer(c) ? Math.max(1500, P0().quiet * 500) : Math.max(1500, P0().quiet * (fromPlayer(c) ? 333 : 1500) * tempo())));
    if (pend.length) return pend.sort((a, b) => nextAt.get(a) - nextAt.get(b))[0];
    // fighters don't wait for a quiet moment
    const fight = all.filter(c => nextAt.get(c) <= now && fighting(c)).sort((a, b) => nextAt.get(a) - nextAt.get(b))[0];
    if (fight) return fight;
    // characters busy in code (jobs.js) need no quiet moment either
    const J = window.tablefolkJobs, busy = all.filter(c => nextAt.get(c) <= now && J?.handles?.(c) && !reason(c)).sort((a, b) => nextAt.get(a) - nextAt.get(b))[0];
    if (busy) return busy;
    if (!quietOk) return null;
    const ready = all.filter(c => nextAt.get(c) <= now).sort((a, b) => nextAt.get(a) - nextAt.get(b));
    return ready[0] || null;
  }
  // One character's turn: a monster's, an animal's, its job in code (jobs.js), an idle step, or its model turn.
  // -> the ms until its next step (jobs.js) or null. { wait: true } (turn mode, modes.js): a turn above rails is
  // waited for too, so each character takes exactly one turn in order.
  async function turnOf(c, { wait = false } = {}) {
      const w = W();
      const hostile = P()?.isHostile?.(c), mind = !hostile || P()?.talksToo?.(c), why = reason(c);
      const pendBefore = JSON.stringify(getBrainConfig(c.id).pendingChat || []);
      const J = window.tablefolkJobs, jobbed = !hostile && !P()?.isAnimal?.(c) && !!J?.handles?.(c);
      let next = null, asyncTurn = false;
      try {
        if (hostile && !mind) await monsterTurn(c);
        else if (P()?.isAnimal?.(c)) await animalTurn(c);
        // pushed too far (mind.js tempers): a blow, or a step closer; its model
        // turn when something was said to it (the line before the fight)
        else if (why !== 'pending' && P()?.hostileTarget?.(c)) await monsterTurn(c);
        // jobs.js: busy in code; something that only happened to it is a short pick, not an open turn
        else if (jobbed && why === 'pending' && onlyHappened(c)) next = (await J.eventPick(c))?.ms ?? null;
        else if (jobbed && why !== 'pending') { status(''); next = (await J.tick(c))?.ms ?? null; }
        else if (!why && Math.random() < P0().idle) await idle(c);
        else {
          if (hostile || P()?.hostileTarget?.(c)) await monsterTurn(c);
          // above rails (agency.js guided, free) its turn runs without holding up everyone else's:
          // a 12B's 10-30 s answers froze the whole village while it waited (RTX 3090, 2026-11-21)
          if (!wait && jobbed && (window.tablefolkAgency?.level?.(c) || 'rails') !== 'rails') {
            asyncTurn = true; c._turnRunning = true;
            w.runAgentTurn(c).catch(e => console.warn('[live]', c.id, e)).finally(() => { c._turnRunning = false; });
          } else {
            status(`${c.id} is thinking…`);
            await w.runAgentTurn(c);
          }
        }
      } catch (e) { console.warn('[live]', c.id, e); }
      // A turn that did not take in what was waiting for it (a monster, an
      // animal, a skipped turn) must not leave it "pending" for good: due()
      // serves pending characters first, and nobody else got a turn.
      { const cfg = getBrainConfig(c.id), now = JSON.stringify(cfg.pendingChat || []);
        if (!asyncTurn && now !== '[]' && now === pendBefore) { cfg.pendingChat = []; console.info('[live] cleared what', c.id, 'never took in'); } }
      return next;
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
      // turn mode (modes.js): characters act only in the rounds after the player ends a turn
      if (window.tablefolkModes?.holdLive?.()) { await sleep(200); continue; }
      const c = on && due();
      if (!c) { await sleep(300); continue; }
      turns++; ticks++;
      const next = await turnOf(c);
      status('');
      schedule(c, false, next);
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
  addEventListener('tablefolk-scenario-started', () => { const p = window.tablefolkScenario?.active?.scn?.pace; let mine = null; try { mine = localStorage.getItem('tablefolk.pace'); } catch {} if (!urlPace && !mine && PACES[p]) setPace(p); const sel = document.getElementById('paceSel'); if (sel) sel.value = pace; });
  // a new scenario starts paused (its settings may start it: "live": true).
  // Under the loading cover (loading.js: the world's build, the model waking,
  // a section's travel) nothing lives unseen: the clock, routines, needs and
  // talk all follow `on`, so it starts 1.5 s after the cover lifts and the
  // player sees the day from its first minute. A newer world cancels the wait.
  let startGen = 0;
  addEventListener('tablefolk-scenario-started', e => {
    stop(); turns = 0; if (!e.detail?.sub) ticks = 0;
    const g = ++startGen; if (!e.detail?.live) return;
    const go = () => setTimeout(() => { if (g === startGen) start(); }, 1500);
    // ...and while the characters' brain wakes (world-integration.js: downloading,
    // loading, warming up) they stand still too: the day starts with them awake
    // (at most 10 minutes; a brain that fails or is declined lets it start at once)
    const brain = () => !window.TABLEFOLK_BRAIN_WAKING ? Promise.resolve() : new Promise(r => { const t = setTimeout(r, 600000); addEventListener('tablefolk-brain-settled', () => { clearTimeout(t); r(); }, { once: true }); });
    const L = window.tablefolkLoading; (L?.whenRevealed ? L.whenRevealed() : Promise.resolve()).then(brain).then(go);
  });
  window.tablefolkLive = { start, stop, toggle, setPace, turnOf, get pace() { return pace; }, eventGap: () => rand(P0().event) * tempo(), get on() { return on; }, get ticks() { return ticks; },
    // a moment for a line (jobs.js remarks and evening talk wait for it)
    quiet: () => performance.now() - lastSpeechAt >= P0().quiet * 1000 * tempo(),
    // rounds: as many turns as there are characters (the timed events' "round")
    get round() { return Math.floor(turns / Math.max(1, state.characters.filter(alive).length)); } };
})();
