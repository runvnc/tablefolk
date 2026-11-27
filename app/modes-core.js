/* modes-core.js -- the game modes' rules without the game: which mode runs, who may use the
 * model, the turn order, the encounter's open and close, when a turn may be started early, and
 * the model queue's order. A classic script with no game globals (Node imports it for
 * tools/browser-test/modes-test.mjs); modes.js wires it to the world.
 *
 * Modes (a scenario's "mode", a section's own, switched by triggers and events, Settings, ?mode=):
 *   living     the world runs in real time and characters use the model as their autonomy says
 *              (only those within "modeRadius" of the player; the rest run on rails, no model)
 *   adventure  the world runs on rails (code, no model) while the player explores; talking to a
 *              character opens an encounter: it and the others in the conversation use the model
 *              until the player walks away or the talk ends; the world around slows or pauses
 *   turns      time moves only when the player ends their turn; then each character in the
 *              active area takes one turn, in order, and the clock jumps "turnMinutes"
 *
 *   tablefolkModesCore = { MODES, normalize, normalizeWhen, options, situational, resolve, mayThink,
 *     turnOrder, createEncounter, independent, createQueue, createLock, createBudget }
 */
(function (root) {
  const MODES = ['living', 'adventure', 'turns'];
  const normalize = v => MODES.includes(v) ? v : null;
  const WHEN = ['fight', 'talk', 'indoors'];   // the order they win in
  // "modeWhen": { "fight": "turns", "talk": "adventure", "indoors": "turns" }
  function normalizeWhen(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const o = {}; for (const k of WHEN) if (normalize(v[k])) o[k] = v[k];
    return Object.keys(o).length ? o : null;
  }
  const num = (v, lo, hi, d) => Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, +v)) : d;
  // the fields with their defaults (a section's own over the world's: pass them merged)
  function options(s = {}) {
    return {
      radius: num(s.modeRadius, 0, 999, 12),                  // living, turns: who uses the model (0: everyone)
      encounterWorld: ['slow', 'pause', 'run'].includes(s.encounterWorld) ? s.encounterWorld : 'slow',
      slowRate: .25,                                         // the world's speed beside an open encounter, "slow"
      turnMoves: Math.round(num(s.turnMoves, 1, 30, 6)),     // squares the player may walk in a turn
      turnMinutes: num(s.turnMinutes, 0, 240, 10),           // game minutes a round takes
    };
  }
  // the situation's mode: the first of fight, talk, indoors that holds and is named
  function situational(when, sit) {
    if (!when) return null;
    for (const k of WHEN) if (sit?.[k] && normalize(when[k])) return { mode: when[k], why: k };
    return null;
  }
  // highest first: the link, the player's setting, the situation, a switch (trigger, event), the section, the world
  function resolve({ url, setting, when, situation, switched, section, world } = {}) {
    if (normalize(url)) return { mode: url, source: 'link' };
    if (normalize(setting)) return { mode: setting, source: 'setting' };
    const s = situational(when, situation); if (s) return { mode: s.mode, source: 'when ' + s.why };
    if (normalize(switched)) return { mode: switched, source: 'switched' };
    if (normalize(section)) return { mode: section, source: 'section' };
    if (normalize(world)) return { mode: world, source: 'world' };
    return { mode: 'living', source: 'default' };
  }
  // may a character use the model now? d: its distance from the player (Infinity: no player)
  //   adventure: only in the open encounter; living, turns: within the radius (0: everyone), or in the encounter;
  //   always when the player has just spoken to it (spokenTo: its answer, wherever the player is)
  function mayThink(mode, { member = false, d = 0, radius = 12, spokenTo = false } = {}) {
    if (member || spokenTo) return true;
    if (mode === 'adventure') return false;
    return radius <= 0 || !(d > radius);
  }
  // who takes a turn in a round, in order: the characters within the radius (0: all), nearest first, then by name
  // list: [{ id, x, z }], player: { x, z } | null
  function turnOrder(list, player, radius = 12) {
    const d = c => player ? Math.hypot(c.x - player.x, c.z - player.z) : 0;
    return list.filter(c => radius <= 0 || !player || d(c) <= radius).map(c => ({ c, d: d(c) }))
      .sort((a, b) => a.d - b.d || String(a.c.id).localeCompare(String(b.c.id))).map(x => x.c);
  }
  // An encounter: the player and the characters in the conversation.
  //   start(id, others, why)  opens one (or adds to the open one)
  //   join(id), line(id)      a member joins; a line was said (keeps it open)
  //   check({ dist: { id: d }, leave, idleMs, busy }) -> null | 'walked away' | 'the talk ended'
  //   end(reason) -> { members, lines, seconds, reason, why }
  function createEncounter({ now = () => Date.now() } = {}) {
    let cur = null;
    return {
      get open() { return !!cur; },
      get members() { return cur ? [...cur.members] : []; },
      get why() { return cur?.why || ''; },
      has: id => !!cur?.members.has(id),
      start(id, others = [], why = 'talk') {
        if (!cur) cur = { members: new Set(), since: now(), lastAt: now(), lines: 0, why };
        for (const x of [id, ...others]) if (x) cur.members.add(x);
        cur.lastAt = now();
        return cur;
      },
      join(id) { if (cur && id) { cur.members.add(id); cur.lastAt = now(); } },
      line(id) { if (cur && (!id || cur.members.has(id) || id === 'player')) { cur.lines++; cur.lastAt = now(); } },
      // (never while a member's reply is on the way: it ends after it)
      check({ dist = {}, leave = 6, idleMs = 90000, busy = false } = {}) {
        if (!cur || busy) return null;
        const ds = [...cur.members].map(id => dist[id]).filter(d => d != null);
        if (!ds.length || ds.every(d => d > leave)) return 'walked away';
        if (!busy && now() - cur.lastAt > idleMs) return 'the talk ended';
        return null;
      },
      end(reason = '') { const c = cur; cur = null; return c ? { members: [...c.members], lines: c.lines, seconds: Math.round((now() - c.since) / 1000), reason, why: c.why } : null; },
    };
  }
  // A character's turn may start before the player ends theirs only when nothing the player can
  // still do this turn reaches it: not spoken to by the player, not in the encounter, and further
  // than the player can walk this turn plus what it sees and hears. (world-integration.js also
  // checks that its prompt at its turn is the one it was started with, else asks again.)
  function independent({ d, moves = 6, sight = 12, earshot = 6, spokenTo = false, member = false } = {}) {
    return !spokenTo && !member && Number.isFinite(d) && d > moves + Math.max(sight, earshot) + 1;
  }
  // One model call at a time; the highest priority first, then in order of arrival. A call
  // already running is never stopped. push(fn, prio) -> fn's promise; prio(job) may be raised.
  function createQueue() {
    const waiting = []; let running = null, seq = 0;
    function pump() {
      if (running || !waiting.length) return;
      let best = 0; for (let i = 1; i < waiting.length; i++) { const a = waiting[i], b = waiting[best]; if (a.prio > b.prio || (a.prio === b.prio && a.seq < b.seq)) best = i; }
      const job = running = waiting.splice(best, 1)[0];
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { running = null; pump(); });
    }
    return {
      push(fn, prio = 0, tag = null) { return new Promise((resolve, reject) => { waiting.push({ fn, prio, seq: seq++, tag, resolve, reject }); pump(); }); },
      // raise the queued calls whose tag passes (a turn the player is waiting on)
      raise(test, prio) { for (const j of waiting) if (test(j.tag) && j.prio < prio) j.prio = prio; },
      get waiting() { return waiting.length; }, get busy() { return !!running; },
      get order() { return waiting.slice().sort((a, b) => b.prio - a.prio || a.seq - b.seq).map(j => j.tag); },
    };
  }
  // A lock with the same order: acquire(prio) -> release()
  function createLock() {
    const q = createQueue();
    return {
      acquire(prio = 0, tag = null) { let release; const held = new Promise(r => { release = r; }); return new Promise(got => { q.push(() => { got(release); return held; }, prio, tag); }); },
      raise: (test, prio) => q.raise(test, prio),
      get held() { return q.busy; }, get waiting() { return q.waiting; },
    };
  }
  // the player's squares this turn
  function createBudget(moves = 6) {
    let left = moves;
    return { get left() { return left; }, get moves() { return moves; }, step() { if (left <= 0) return false; left--; return true; }, reset(n = moves) { moves = n; left = n; } };
  }
  root.tablefolkModesCore = { MODES, normalize, normalizeWhen, options, situational, resolve, mayThink, turnOrder, createEncounter, independent, createQueue, createLock, createBudget };
})(typeof window !== 'undefined' ? window : globalThis);
