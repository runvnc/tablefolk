/* modes.js -- the game modes: how time and the model are shared between the player and the world.
 * The rules are in modes-core.js (Node tests them); this wires them to the game.
 *
 *   living     (the default) the world runs in real time, as before. The player's conversation goes to
 *              the front of the model queue (world-integration.js), replies stream into a bubble while
 *              the player walks on, and only characters within "modeRadius" squares (default 12; 0:
 *              everyone) use the model: the others run on rails, with no model, until they come near.
 *   adventure  the world runs on rails (code only) while the player explores. Engaging a character
 *              (talking to it, giving it something, opening its menu, or being spoken to by it) opens an
 *              encounter: it, and whoever it was talking with nearby, use the model at their autonomy
 *              level; others who speak to them join. The world around goes slower ("encounterWorld":
 *              "slow", a quarter speed, the default), stands still ("pause") or runs on ("run"). The
 *              encounter ends when the player walks away (every member farther than earshot + 2) or the
 *              talk has been idle for 90 s; each member then keeps a memory of it (mind.js) and goes back
 *              to rails, with what it learnt of the player (wants, promises, trust) carried over.
 *   turns      time moves only when the player ends a turn (the End turn button, Space or N). In a turn
 *              the player walks up to "turnMoves" squares (default 6) and may talk, give and use freely;
 *              the one spoken to answers on its turn. Then everyone within "modeRadius" takes exactly
 *              one turn, nearest first (live.js turnOf: its autonomy level decides how), each with a
 *              "thinking…" marker, and the clock jumps "turnMinutes" (default 10). Works in the tabletop
 *              view too (?tabletop=1: click a square to walk there). While the player decides, the
 *              first character's model call starts early only when nothing the player can do this turn
 *              can reach it (modes-core.js independent); at its turn it is used only if its prompt is
 *              still the same, else the model is asked again (world-integration.js).
 * Set by: the scenario's "mode", a section's own "mode", switches ("mode" in a trigger's, menu's or
 * workflow's "do", a director event's "mode", tablefolkModes.set), the situation ("modeWhen": {"fight":
 * "turns", "talk": "adventure", "indoors": "turns"}), the player's choice in Settings ("How the game
 * runs"), and ?mode= in the link (tests). modes-core.js resolve() has the order.
 *
 *   window.tablefolkModes = { mode(), source, set(mode, why), setting(), setSetting(v), mayThink(g),
 *     whyNot(g), inEncounter(g), encounter: { open, members, end(reason) }, engage(id, why), clockRate(), speed, setSpeed(k) (1, 2, 4: the
 *     clock that much faster, turns that much sooner; a God game's fast-forward),
 *     holdLive(), holdReplies(), mayAct(c), paceFactor(c), blockStep(), stepTaken(), endTurn(),
 *     turn: { round, busy, actor, left }, options, diagRow(), noteEarly(g, used) }
 * Events: tablefolk-mode { mode, was, source }; tablefolk-encounter { phase: open|end, members, why,
 *   reason, lines, seconds }; tablefolk-turn { agentId, round } (a character's turn in a round begins);
 *   tablefolk-round { round, order, early } (a round is over)
 * Loaded after agency.js (and live.js, clock.js, play.js); uses app.js globals (state, getBrainConfig).
 */
(function () {
  const C = window.tablefolkModesCore;
  const qs = new URLSearchParams(location.search);
  const urlMode = C.normalize(qs.get('mode'));
  const urlRadius = qs.has('modeRadius') && Number.isFinite(+qs.get('modeRadius')) ? Math.max(0, +qs.get('modeRadius')) : null;
  const KEY = 'tablefolk.mode';
  const P = () => window.tablefolkPlay;
  const scn = () => window.tablefolkScenario?.active?.scn || null;
  const here = () => window.tablefolkScenario?.here?.() || scn();
  const me = () => state.playerAvatar;
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const byId = id => (state.characters || []).find(c => c.id === id);
  const pname = () => document.getElementById('chatName')?.value.trim() || 'the traveller';
  const ear = () => +state.earshot > 0 ? +state.earshot : 6;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await sleep(60); };
  const emit = (name, detail) => { try { dispatchEvent(new CustomEvent(name, { detail })); } catch {} };
  const toast = (t, type = 'info') => window.tablefolkToast?.(t, { type });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LABEL = { living: 'Living world', adventure: 'Adventure', turns: 'Turn by turn' };

  // ---------------------------------------------------------------- which mode
  function setting() { try { return C.normalize(localStorage.getItem(KEY)) || 'world'; } catch { return 'world'; } }
  function setSetting(v) { try { if (C.normalize(v)) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch {} refresh(); renderPick(true); }
  let O = C.options({}), switched = null, situation = {}, current = 'living', source = 'default', lastFightAt = -1e9;
  function readOptions() {
    const h = here() || {}, w = scn() || {}, f = k => h[k] ?? w[k];
    O = C.options({ modeRadius: urlRadius ?? f('modeRadius'), encounterWorld: f('encounterWorld'), turnMoves: f('turnMoves'), turnMinutes: f('turnMinutes') });
  }
  function compute() {
    const h = here(), w = scn();
    return C.resolve({ url: urlMode, setting: setting() === 'world' ? null : setting(), when: h?.modeWhen || w?.modeWhen, situation, switched, section: h && h !== w ? h.mode : null, world: w?.mode });
  }
  function refresh(quiet = false) {
    const r = compute(), was = current;
    current = r.mode; source = r.source;
    if (current !== was) changed(was, quiet);
    hud();
  }
  function set(m, why = 'switched') {
    if (!C.normalize(m)) { console.warn('[modes] not a mode:', m); return false; }
    switched = m; window.tablefolkDiag?.note?.('mode', `switched to ${m} (${why})`);
    refresh(); return true;
  }
  function changed(was, quiet) {
    window.tablefolkDiag?.note?.('mode', `${LABEL[current]} (${describeSource()})`);
    if (was === 'turns' || current === 'turns') { budget.reset(O.turnMoves); turnBar(current === 'turns'); }
    if (current === 'turns') schedulePrefetch();
    if (!quiet) announce();
    emit('tablefolk-mode', { mode: current, was, source });
    renderPick();
  }
  function announce() {
    toast({
      living: 'Living world: everyone lives in real time.',
      adventure: 'Adventure: the world runs by itself while you explore. Talk to someone and they think for themselves until you walk away.',
      turns: `Turn by turn: walk up to ${O.turnMoves} squares, talk, give or use, then End turn (Space or N). Everyone near takes one turn.`,
    }[current]);
  }
  function describeSource() {
    return { link: 'set by the link (?mode=)', setting: 'your choice in Settings', switched: 'switched by the story', section: 'this place\'s own', world: 'this world\'s', default: 'the default' }[source] || (source.startsWith('when ') ? 'while ' + { fight: 'in a fight', talk: 'talking', indoors: 'indoors' }[source.slice(5)] : source);
  }
  // the situation, for "modeWhen" (checked every 400 ms)
  function sense() {
    const when = here()?.modeWhen || scn()?.modeWhen, p = me();
    if (!when || !p || p.defeated) { situation = {}; return; }
    const pp = posOf(p), now = performance.now();
    if (when.fight && state.characters.some(c => !c.defeated && !getBrainConfig(c.id).defeated && (P()?.isHostile?.(c) || P()?.hostileTarget?.(c)) && dist(posOf(c), pp) <= 5 && (window.tablefolkDark?.visible?.(posOf(c).x, posOf(c).z) ?? true))) lastFightAt = now;
    const k = Math.round(pp.x) + ',' + Math.round(pp.z);
    situation = {
      fight: now - lastFightAt < 6000,   // a fight holds for 6 s after the last foe in reach (no flicker)
      talk: enc.open,
      indoors: !!when.indoors && (window.tablefolkRoofs?.rooms || []).some(r => r?.cells?.has?.(k)),
    };
  }
  setInterval(() => { sense(); refresh(); }, 400);

  // ---------------------------------------------------------------- the encounter (adventure mode; "talk" anywhere)
  const enc = C.createEncounter({ now: () => performance.now() });
  let lastWords = '';
  const talks = g => g && !g.defeated && !getBrainConfig(g.id).defeated && !P()?.isAnimal?.(g) && (!P()?.isHostile?.(g) || P()?.talksToo?.(g));
  function engage(id, why = 'talk') {
    const g = byId(id); if (!talks(g)) return false;
    const was = enc.open, pp = me() ? posOf(me()) : posOf(g);
    // the others in its conversation, within earshot of the player
    const others = (window.tablefolkTalk?.activeConvos?.() || []).filter(c => c.a === id || c.b === id).map(c => c.a === id ? c.b : c.a)
      .filter(o => { const x = byId(o); return talks(x) && dist(posOf(x), pp) <= ear(); });
    enc.start(id, others, why);
    if (!was) { lastWords = ''; emit('tablefolk-encounter', { phase: 'open', members: enc.members, why }); window.tablefolkDiag?.note?.('mode', `encounter with ${enc.members.join(', ')} (${why})`); }
    hud(); return true;
  }
  function endEncounter(reason) {
    const s = enc.end(reason); if (!s) return null;
    // each member remembers it (mind.js memories; what it learnt of the player, its wants and promises, is kept
    // there already and goes on into its rails prompts)
    if (s.lines > 0) for (const id of s.members) { const g = byId(id); if (g && !g.defeated) try { window.tablefolkMind?.addMemory?.(g, `You talked with ${pname()}${s.members.length > 1 ? ' (with ' + s.members.filter(x => x !== id).join(', ') + ')' : ''}${lastWords ? `; the last thing they said: "${lastWords.slice(0, 90)}"` : ''}.`, 1.8, 'event'); } catch {} }
    emit('tablefolk-encounter', { phase: 'end', ...s });
    window.tablefolkDiag?.note?.('mode', `encounter ended (${reason}): ${s.members.join(', ')}, ${s.lines} lines, ${s.seconds} s`);
    hud(); return s;
  }
  addEventListener('tablefolk-player-chat', e => { const id = e.detail?.agentId; if (!id) return; engage(id, 'talk'); enc.line('player'); lastWords = String(e.detail?.text || ''); });
  addEventListener('tablefolk-menu', e => { if (e.detail?.agentId) engage(e.detail.agentId, 'menu'); });
  addEventListener('tablefolk-player-turn', e => { if (e.detail?.kind === 'give' && e.detail.to) engage(e.detail.to, 'give'); });
  addEventListener('tablefolk-say', e => {
    const d = e.detail || {}, g = byId(d.agentId); if (!g || !me()) return;
    if (enc.has(g.id)) { enc.line(g.id); return; }
    const to = g._spoke?.to, near = dist(posOf(g), posOf(me())) <= ear();
    // spoken to by a character (code may still have it greet the player): an encounter with it
    if (near && (to === 'player' || to === me() || (to && String(to?.id || to).toLowerCase() === pname().toLowerCase()))) { engage(g.id, 'addressed'); enc.line(g.id); return; }
    // someone who speaks to a member, near the player, joins
    if (enc.open && near && to && enc.has(String(to?.id || to))) { enc.join(g.id); enc.line(g.id); hud(); }
  });
  setInterval(() => {
    if (!enc.open) return;
    const p = me(); if (!p || p.defeated) { endEncounter('the player is gone'); return; }
    const pp = posOf(p), d = {};
    for (const id of enc.members) { const g = byId(id); if (g && !g.defeated) d[id] = dist(posOf(g), pp); }
    const busy = enc.members.some(id => { const g = byId(id); return g && (g._replying || g._turnRunning || (getBrainConfig(id).pendingChat || []).length); });
    const r = enc.check({ dist: d, leave: ear() + 2, idleMs: 90000, busy });
    if (r) endEncounter(r);
  }, 1000);

  // ---------------------------------------------------------------- who may use the model, and the world's speed
  const spokenToBy = g => { const pn = pname().toLowerCase(); return (getBrainConfig(g.id).pendingChat || []).some(l => String(l).toLowerCase().startsWith(pn + ' says')); };
  function mayThink(g) {
    if (!g) return true;
    const p = me(), d = p ? dist(posOf(g), posOf(p)) : 0;
    return C.mayThink(current, { member: enc.has(g.id), d, radius: O.radius, spokenTo: spokenToBy(g) });
  }
  function whyNot(g) { return current === 'adventure' ? 'adventure: on rails until the player talks with it' : `${current === 'turns' ? 'turn by turn' : 'living'}: more than ${O.radius} squares from the player, on rails until it comes near`; }
  const encSlow = () => current === 'adventure' && enc.open;
  // the world's speed (a god's time controls: 1, 2, 4): the clock runs that much faster and turns come that much sooner
  let speed = 1;
  const setSpeed = k => { speed = Math.max(.25, Math.min(8, +k || 1)); try { window.tablefolkDiag?.note?.('mode', `speed x${speed}`); } catch {} return speed; };
  function clockRate() { if (current === 'turns') return 0; if (encSlow()) return (O.encounterWorld === 'pause' ? 0 : O.encounterWorld === 'run' ? 1 : O.slowRate) * speed; return speed; }
  const mayAct = c => !(encSlow() && O.encounterWorld === 'pause' && !enc.has(c.id));
  const paceFactor = c => (encSlow() && O.encounterWorld === 'slow' && !enc.has(c.id) ? 1 / O.slowRate : 1) / speed;

  // ---------------------------------------------------------------- turn by turn
  const budget = C.createBudget(6);
  let roundBusy = false, roundNo = 0, actor = null, noteAt = 0, early = { used: 0, dropped: 0 };
  const note = t => { if (performance.now() - noteAt > 2500) { noteAt = performance.now(); toast(t); } };
  function blockStep() {
    if (current !== 'turns') return false;
    if (roundBusy) { note('Wait: the others are taking their turns.'); return true; }
    if (budget.left <= 0) { note(`No squares left this turn: End turn (Space or N).`); return true; }
    return false;
  }
  function stepTaken() { if (current !== 'turns') return; budget.step(); turnBar(true); }
  const alive = c => !c.defeated && !getBrainConfig(c.id).defeated && getBrainConfig(c.id).enabled !== false;
  // (and whoever the player spoke to this turn, wherever: its answer comes on its turn, after the others)
  function order() {
    const p = me(), pp = p ? posOf(p) : null, list = C.turnOrder(state.characters.filter(alive).map(c => ({ id: c.id, x: posOf(c).x, z: posOf(c).z, c })), pp, O.radius).map(x => x.c);
    return [...list, ...state.characters.filter(c => alive(c) && !list.includes(c) && spokenToBy(c))];
  }
  async function endTurn() {
    if (current !== 'turns' || roundBusy || !state.characters?.length) return;
    roundBusy = true; roundNo++; actor = null; turnBar(true);
    const list = order();
    try {
      await until(() => !me()?.turnMove, 4000);
      for (const c of list) {
        if (current !== 'turns') break;
        if (!alive(c)) continue;
        actor = c; turnBar(true); marker(c, true); emit('tablefolk-turn', { agentId: c.id, round: roundNo });
        try { await Promise.race([window.tablefolkLive?.turnOf?.(c, { wait: true }), sleep(150000)]); } catch (e) { console.warn('[modes] turn', c.id, e); }
        marker(c, false);
        // its walk plays out before the next one goes (at most 3 s)
        await until(() => !c.turnMove, 3000);
        try { window.tablefolkDirector?.tick?.(c); } catch {}
      }
      // the clock and the needs move on by the round's minutes
      if (O.turnMinutes > 0) {
        window.tablefolkClock?.advance?.(O.turnMinutes);
        const dm = window.tablefolkClock?.dayMinutes || 12;
        if (window.tablefolkLive?.on) try { window.tablefolkMind?.passTime?.(O.turnMinutes * dm * 60 / 1440); } catch {}
      }
      emit('tablefolk-round', { round: roundNo, order: list.map(c => c.id), early: { ...early } });
    } finally {
      actor = null; roundBusy = false; budget.reset(O.turnMoves); turnBar(current === 'turns');
      schedulePrefetch();
    }
  }
  // the first character's model call, early: only when nothing the player can still do this turn reaches it
  // (modes-core.js independent; ?prefetch=0 turns it off)
  let prefetchTimer = 0;
  function schedulePrefetch() {
    clearTimeout(prefetchTimer);
    if (qs.get('prefetch') === '0') return;
    prefetchTimer = setTimeout(() => {
      if (current !== 'turns' || roundBusy || !window.tablefolk?.brainReady?.() || !window.tablefolk?.prefetchTurn) return;
      const c = order()[0], p = me(); if (!c || !p) return;
      const pn = pname().toLowerCase(), spokenTo = (getBrainConfig(c.id).pendingChat || []).some(l => String(l).toLowerCase().startsWith(pn + ' says'));
      const ok = C.independent({ d: dist(posOf(c), posOf(p)), moves: budget.left, sight: 12, earshot: ear(), spokenTo, member: enc.has(c.id) });
      // (only a turn that will ask the model: something waiting for it, or a turn above rails)
      const asks = (getBrainConfig(c.id).pendingChat || []).length || (window.tablefolkAgency?.level?.(c) || 'rails') === 'free';
      if (ok && asks && !c._prefetch) { console.info('[modes] early turn for', c.id); window.tablefolk.prefetchTurn(c); }
    }, 300);
  }
  function noteEarly(g, used) { if (used) early.used++; else early.dropped++; }
  // the marker on whose turn it is (a pending thought bubble, and the tabletop's ring)
  function marker(c, on) { try { if (on) window.tablefolk?.showThought?.(c.id, '', true); else window.tablefolk?.clearPendingThought?.(c.id); } catch {} if (window.TABLEFOLK_TABLETOP) window.tablefolkTabletop?.redraw?.(); }

  // ---------------------------------------------------------------- the HUD: the mode line, the turn bar
  const css = document.createElement('style');
  css.textContent = `#modeLine{position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:31;display:flex;gap:8px;align-items:center;padding:3px 6px 3px 12px;border-radius:14px;font:600 12.5px/1.4 system-ui,sans-serif;background:rgba(20,24,30,.66);color:#f3ead7;white-space:nowrap;max-width:94vw;overflow:hidden}
#modeLine[hidden]{display:none}#modeLine .m{opacity:.75;font-weight:500}#modeLine .who{color:#ffd98a}
#modeLine button{font:600 12.5px system-ui,sans-serif;padding:3px 12px;border-radius:10px;border:1px solid #e8c27a;background:#3b2f1a;color:#ffe2a6;cursor:pointer}
#modeLine button:disabled{opacity:.45;cursor:default}#modeLine .dots{letter-spacing:1px}
html.tabletop #modeLine{position:static;transform:none;max-width:none}
html.tf-modeline:not(.tabletop) #narration,html.tf-modeline:not(.tabletop) #npcTurnBanner,html.tf-modeline:not(.tabletop) #npcThinking{top:92px}`;
  document.head.appendChild(css);
  // (written only when it changes: rewritten every 400 ms, the End turn button lost clicks)
  let lineHtml = '';
  const setLine = (el, html) => { if (html !== lineHtml) { el.innerHTML = html; lineHtml = html; } };
  // (the narrator's line and the turn banners move down below it while it shows)
  const shown = (el, on) => { el.hidden = !on; document.documentElement.classList.toggle('tf-modeline', on); };
  function line() {
    let el = document.getElementById('modeLine');
    // (in the tabletop view, in its toolbar: everything else on the page is hidden there)
    const home = window.TABLEFOLK_TABLETOP && document.getElementById('ttBar') || document.body;
    if (el && el.parentNode !== home) home.appendChild(el);
    if (!el) { el = document.createElement('div'); el.id = 'modeLine'; el.setAttribute('aria-live', 'polite'); home.appendChild(el);
      el.addEventListener('click', e => { if (e.target.closest('[data-end-turn]')) endTurn(); }); }
    return el;
  }
  function hud() {
    if (current === 'turns') return turnBar(true);
    const el = line();
    if (current !== 'adventure' || !scn()) { shown(el, false); return; }
    shown(el, true);
    setLine(el, enc.open ? `<span>Adventure</span><span class="m">talking with</span><span class="who">${esc(enc.members.join(', '))}</span>` : `<span>Adventure</span><span class="m">exploring · talk to someone to engage them</span>`);
  }
  function turnBar(on) {
    const el = line();
    if (!on || !scn()) { if (current !== 'adventure') shown(el, false); return; }
    shown(el, true);
    setLine(el, roundBusy
      ? `<span>Round ${roundNo}</span><span class="m">${actor ? `<span class="who">${esc(actor.id)}</span>${(window.tablefolkAgency?.level?.(actor) || 'rails') !== 'rails' || (getBrainConfig(actor.id).pendingChat || []).length ? ' is thinking…' : '’s turn'}` : 'the others act…'}</span><button type="button" disabled>End turn</button>`
      : `<span>Your turn</span><span class="m">${budget.left} of ${budget.moves} squares left · talk, give, use</span><button type="button" data-end-turn title="End your turn: everyone near takes one turn (Space or N)">End turn</button>`);
  }
  addEventListener('keydown', e => {
    if (current !== 'turns' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement; if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a?.tagName || '') || a?.isContentEditable) return;
    if (e.key === ' ' || e.key === 'n' || e.key === 'N') { e.preventDefault(); endTurn(); }
  });

  // ---------------------------------------------------------------- Settings: "How the game runs"
  const CHOICES = [
    ['world', 'As the world says', null],
    ['living', 'Living world', 'Everyone lives in real time; your conversation goes first.'],
    ['adventure', 'Adventure', 'The world runs by itself; whoever you talk to thinks for themselves until you walk away.'],
    ['turns', 'Turn by turn', 'Nothing moves until you end your turn; then everyone near takes one.'],
  ];
  let pickHtml = '';
  function renderPick(force = false) {
    let box = document.getElementById('modePick');
    if (!box) {
      const after = document.getElementById('autonomyPick'); if (!after) return;
      const t = document.createElement('div'); t.className = 'section-subtitle'; t.textContent = 'How the game runs';
      box = document.createElement('div'); box.id = 'modePick'; box.className = 'autonomy-pick';
      after.after(t, box);
    }
    const cur = setting(), w = C.normalize(here()?.mode) || C.normalize(scn()?.mode) || 'living';
    const html = CHOICES.map(([v, label, text]) => `<label class="${v === cur ? 'on' : ''}"><input type="radio" name="tfMode" value="${v}"${v === cur ? ' checked' : ''}${urlMode ? ' disabled' : ''}><b>${label}</b><small>${esc(text || `This world: ${LABEL[w]}. Now: ${LABEL[current]} (${describeSource()}).`)}</small></label>`).join('') + (urlMode ? `<small class="pane-note">Set by this page's link: ?mode=${esc(urlMode)}</small>` : '');
    if (force || html !== pickHtml) { box.innerHTML = html; pickHtml = html; }
  }
  addEventListener('change', e => { if (e.target?.name === 'tfMode') setSetting(e.target.value); });
  setInterval(() => { if (document.getElementById('pane-settings')?.classList.contains('active')) renderPick(); }, 1500);
  setTimeout(() => renderPick(true), 1500);
  function diagRow() {
    if (!scn()) return null;
    const what = { living: `real time; only characters within ${O.radius || 'any'} squares use the model`, adventure: enc.open ? `talking with ${enc.members.join(', ')}; the rest on rails${O.encounterWorld === 'run' ? '' : ', the world ' + (O.encounterWorld === 'pause' ? 'paused' : 'slowed')}` : 'exploring: the world on rails, no model until you talk to someone', turns: `round ${roundNo}; ${O.turnMoves} squares a turn, ${O.turnMinutes} game minutes a round` }[current];
    return ['Game mode', LABEL[current], what, 'ok', describeSource() + (early.used + early.dropped ? ` · early turns used ${early.used}, dropped ${early.dropped}` : '')];
  }

  // ---------------------------------------------------------------- a new world, a new section
  addEventListener('tablefolk-scenario-started', e => {
    if (!e.detail?.sub) { switched = null; roundNo = 0; early = { used: 0, dropped: 0 }; }
    // a section has its own mode; a switch made elsewhere does not follow the player in
    else switched = null;
    if (enc.open) endEncounter('left');
    readOptions(); sense();
    const was = current; refresh(true);
    if (current !== 'living' && (!e.detail?.sub || current !== was)) setTimeout(announce, 1600);
    budget.reset(O.turnMoves); turnBar(current === 'turns'); hud();
  });

  window.tablefolkModes = {
    mode: () => current, get source() { return source; }, set, setting, setSetting, mayThink, whyNot,
    inEncounter: g => !!g && enc.has(g.id), engage, encounter: { get open() { return enc.open; }, get members() { return enc.members; }, end: endEncounter },
    clockRate, holdLive: () => current === 'turns', holdReplies: () => current === 'turns', mayAct, paceFactor, get speed() { return speed; }, setSpeed,
    blockStep, stepTaken, endTurn, noteEarly, diagRow, get options() { return { ...O }; },
    turn: { get round() { return roundNo; }, get busy() { return roundBusy; }, get actor() { return actor?.id || null; }, get left() { return budget.left; }, get early() { return { ...early }; } },
  };
})();
