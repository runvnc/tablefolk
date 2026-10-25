/* director.js -- now and then something happens, so the characters have
 * something to react to. A small model is good at reacting and bad at
 * planning: an event next to it ("a rat runs over your foot") gets a better
 * scene out of it than any amount of "you may do as you like".
 *
 * While the characters live on their own (live.js), after every few turns
 * the director picks a character the player can see and makes something
 * happen next to it: told to it and to whoever is near as an [event] line
 * (their next prompt), shown to the player as a narrator's line, and, for
 * some events, made real (a mushroom grows, a coin purse lies on the floor,
 * a note is pushed under the door).
 *
 * The scenario's own events come first: "events": ["A bell rings in the
 * tower.", {"text": "{who} finds a letter addressed to the queen.", "spawn":
 * "note", "note": "Meet me at midnight."}], "{who}" being the character it
 * happens to. Then generic ones, by setting (indoors / outdoors / dungeon).
 * "director": false in a scenario turns it off; "director": 3 makes it
 * every 3 turns (default 5). An event with "round": N happens once when the
 * live rounds reach N, to the character "to" (or the first): turning points
 * ("The candle is out: Morvax must choose now").
 *
 *   window.tablefolkDirector.tick(c)     live.js, after c's turn
 *   window.tablefolkDirector.now(text?)  make something happen now (tests, dev)
 * Loaded after live.js; uses app.js globals.
 */
(function () {
  const ANY = [
    { text: '{who} suddenly remembers something embarrassing from long ago.' },
    { text: 'A bird flies in, circles {who} twice and leaves.' },
    { text: '{who} feels a sneeze coming on.' },
    { text: 'Someone nearby hums a tune that gets stuck in {who}’s head.' },
    { text: '{who} finds a few coins on the floor.', spawn: 'coin_pile', gold: 6 },
    { text: 'A note lies at {who}’s feet.', spawn: 'note', notes: ['I know what you did.', 'Meet me by the barrels. Come alone.', 'Whoever reads this owes me 3 gold.', 'Do not trust the one in the hat.', 'The treasure is not where they say.'] },
    { text: 'A mushroom pops up right next to {who}.', spawn: 'mushroom' },
    { text: '{who}’s stomach growls loudly.', hunger: .35 },
    { text: '{who} hears whispering, but cannot tell who it is.' },
    { text: '{who} is sure that someone just moved one of the things nearby.' },
  ];
  const INDOOR = [
    { text: 'The lamp flickers and nearly goes out.' },
    { text: 'There is a loud knock at the door. Nobody is there.' },
    { text: 'A crate slides off a shelf and lands next to {who}.', spawn: 'crate' },
    { text: 'Water drips from the ceiling onto {who}’s head.' },
    { text: 'A rat runs across the floor right past {who}.' },
    { text: 'Somewhere, a dish breaks.' },
  ];
  const DUNGEON = [
    { text: 'A cold draught blows through, and a distant door slams.' },
    { text: 'Bones rattle somewhere in the dark.' },
    { text: 'A stone in the wall next to {who} is loose, and something glints behind it.', spawn: 'coin_pile', gold: 12 },
    { text: 'Far away, someone screams, then laughs.' },
    { text: 'The torches all dim at once, then come back.' },
    { text: 'A spider drops on a thread right in front of {who}’s face.' },
  ];
  const OUTDOOR = [
    { text: 'A gust of wind nearly takes {who}’s hat.' },
    { text: 'It starts to drizzle, just on {who}, it seems.' },
    { text: 'A goat wanders past, looks at {who}, and leaves.' },
    { text: 'Bells ring in the distance.' },
    { text: 'A traveller shouts from the road: "Has anyone seen my cart?"' },
    { text: 'Flowers spring up by {who}’s feet.', spawn: 'flowers' },
  ];
  const posOf = g => g.logicalPos || g.root.position;
  let turns = 0, used = new Set(), scnEvents = [], every = 5, off = false;

  addEventListener('tablefolk-scenario-started', () => {
    const s = window.tablefolkScenario?.active?.scn || {};
    turns = 0; used = new Set();
    scnEvents = (s.events || []).map(e => typeof e === 'string' ? { text: e } : e);
    off = s.director === false; every = Number.isFinite(+s.director) && +s.director > 0 ? Math.max(1, +s.director) : 5;
  });
  function setting() {
    const s = window.tablefolkScenario?.active?.scn || {};
    const walls = (state.blocks || []).filter(b => meta(b)?.type === 'wall').length;
    if (s.dark || s.base === 'dungeon') return DUNGEON;
    return walls > 12 ? INDOOR : OUTDOOR;
  }
  function pick() {
    const fresh = l => l.filter(e => !used.has(e.text));
    const own = fresh(scnEvents.filter(e => !Number.isFinite(+e.round)));
    if (own.length && Math.random() < .7) return own[Math.floor(Math.random() * own.length)];
    let pool = fresh([...setting(), ...ANY]);
    if (!pool.length) { used = new Set(scnEvents.map(e => e.text)); pool = [...setting(), ...ANY]; }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const freeCellNear = (c) => {
    const p = posOf(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz;
      if (cellPassable(x, z) && !occupantAt(x, z, c) && !getObjects().some(o => Math.round(o.x) === x && Math.round(o.z) === z && !['tile', 'light'].includes(o.type))) return [x, z];
    }
    return null;
  };
  function happen(c, ev) {
    const who = c.id, text = String(ev.text || '').replace(/\{who\}/g, who);
    used.add(ev.text);
    // made real
    if (ev.spawn) {
      const cell = freeCellNear(c);
      if (cell) try {
        const opts = {};
        if (ev.spawn === 'note') opts.text = ev.note || (ev.notes ? ev.notes[Math.floor(Math.random() * ev.notes.length)] : '...');
        if (ev.gold) opts.gold = ev.gold;
        makeObject(ev.spawn, cell[0], cell[1], opts);
      } catch (e) { console.warn('[director] spawn', e); }
    }
    if (ev.hunger) try { const m = window.tablefolkMind?.mindOf?.(c); if (m) m.hunger = Math.min(1, (m.hunger || 0) + ev.hunger); } catch {}
    // told to it and to whoever is near enough to notice
    const p = posOf(c);
    for (const o of state.characters) {
      if (o.defeated) continue;
      const q = posOf(o), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (o !== c && d > 4) continue;
      const cfg = getBrainConfig(o.id);
      setBrainConfig(o.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] ${o === c ? toYou(text, who) : text}`]).slice(-5) });
    }
    try { emitBadge(c, '!'); } catch {}
    state.globalHistory = (state.globalHistory || []).concat([`T${state.turn?.index ?? 0} event: ${text}`]).slice(-20);
    narrate(text);
    log('[director] ' + text);
    return text;
  }
  // "grub's stomach growls" -> "your stomach growls", to the one it happens to
  function toYou(text, who) {
    const n = who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('\\b' + n + '[\u2019\']s\\b', 'gi'), 'your').replace(new RegExp('\\b' + n + '\\b', 'gi'), 'you')
      .replace(/^your\b/, 'Your').replace(/^you\b/, 'You');
  }
  function narrate(text) {
    let el = document.getElementById('narration');
    if (!el) { el = document.createElement('div'); el.id = 'narration'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(narrate.t); narrate.t = setTimeout(() => el.classList.remove('show'), 6500);
  }
  // at most one event per eventGap(), however fast turns go
  let lastAt = 0, gap = null;
  // Timed events ("events": [{"text": "...", "round": 8}]): once, when the
  // live rounds reach it, whatever the clock says; the story's turning points
  function timed() {
    const r = window.tablefolkLive?.round || 0;
    const ev = scnEvents.find(e => Number.isFinite(+e.round) && r >= +e.round && !used.has(e.text));
    if (!ev) return false;
    const who = ev.to ? state.characters.find(o => o.id === ev.to && !o.defeated) : null;
    const target = who || state.characters.find(o => !o.defeated);
    if (target) { happen(target, ev); lastAt = performance.now(); }
    return true;
  }
  function tick(c) {
    if (off || !state.characters?.length) return;
    if (timed()) return;
    if (++turns % every) return;
    // spaced by the live pace (live.js eventGap: calm about every two minutes)
    gap ??= window.tablefolkLive?.eventGap?.() ?? 20;
    if (performance.now() - lastAt < gap * 1000) { turns--; return; }
    lastAt = performance.now(); gap = null;
    // to someone the player can see, when there is someone
    const seen = state.characters.filter(o => !o.defeated && (window.tablefolkDark?.visible?.(posOf(o).x, posOf(o).z) ?? true));
    const target = seen.length ? seen[Math.floor(Math.random() * seen.length)] : c;
    if (target) happen(target, pick());
  }
  function now(text) {
    const list = state.characters.filter(o => !o.defeated); if (!list.length) return null;
    const c = list[Math.floor(Math.random() * list.length)];
    return happen(c, text ? { text } : pick());
  }
  window.tablefolkDirector = { tick, now, happen };
})();
