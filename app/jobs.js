/* jobs.js -- characters are busy by default, in code; the model is for words
 * and for real choices.
 *
 * A job is data: jobs/<id>/job.json (built in; a package's "jobs" section;
 * register(manifest)). An agent names one ("job": "baker", with optional
 * "home" and "workplace": a place id of a generated map, or a thing's type);
 * with none, one is inferred: a job's "match" (a regex on role, style and
 * personality), else uses.js's STATION table (smith: anvil...), else
 * "idler". Fields of a job:
 *   match, hours [start, end], sleep [start, end], gold (start money when
 *   the scenario gives none), fights (goes to threats), prices {item: gold},
 *   workplace [kinds or types], places [place kinds], doing (a label),
 *   steps: each one of
 *     {"gather": kind|type, "n": 2}                    use(thing) n times (stock, uses.js)
 *     {"fetch": {"wheat": 2}}                          own store -> communal store -> another's store (paid) -> a seller
 *     {"make": "bread", "at": kind|type, "needs": {"wheat": 2}, "gives": 2, "verb": "bakes", "time": 5}
 *     {"store": item | "made" | "all", "keep": 1}      put(item, store) into its stockpile
 *     {"sell": item | [items]}                         to someone hungry or wanting it nearby; else minds the stall
 *     {"serve": [items]}                               sell to whoever is in the workplace (an inn)
 *     {"patrol": [place ids or kinds] | "village"}     walk a loop; threats are watched for anyway
 *     {"tend": kind|type}                              a bare field sown (grows back twice as fast); animals patted
 *     {"heal": true}                                   bandage the wounded nearby
 *     {"rest": true} {"wander": true} {"read": true}
 * The day, per character, on the clock (clock.js): threats first (fighters
 * go to them, the rest hide at home), eating when hungry (its own food, its
 * stores, the village store, buying from a seller, asking, foraging),
 * sleeping at night in its bed, work in the job's hours, the evening
 * (18-21) at the tavern or the square: the social window, where talk has a
 * cause (news of the day). Each step is done over several live ticks with
 * the game's own commands (world.runAs: results, clips, sounds and memories
 * as if it chose them); a failing step is tried twice, then skipped for an
 * hour.
 *
 * The model is called only to: answer (live.js, unchanged), speak with a
 * cause (mind.js speechCause + the evening and the job's asks), pick at a
 * decision point (one short numbered pick: no next step, hungry with
 * several ways to eat, an event, a stranger at the workplace; "something
 * else" falls through to an open turn), now and then an open turn for an
 * agent with an agenda, and a one-line remark while working (once per
 * three game hours, only with someone in earshot). Each call fires
 * 'tablefolk-model-call' ({ agentId, kind }).
 *
 *   window.tablefolkJobs = { load, register, jobOf, handles, tick, eventPick, cardLine, speechCause, doing, stats, news }
 * Loaded after live.js and clock.js; uses app.js globals.
 */
(function () {
  const REG = new Map();          // id -> manifest
  const PACKAGED = new Set();     // ids a package registered (reset with the scenario)
  const BUILTIN = ['farmer', 'baker', 'innkeeper', 'cook', 'smith', 'woodcutter', 'miner', 'hunter', 'fisher', 'herder', 'merchant', 'guard', 'healer', 'ratcatcher', 'scholar', 'child', 'labourer', 'idler'];
  const DEFAULT_PRICES = { bread: 3, pie: 5, stew: 4, ale: 2, meat: 3, wheat: 1, flour: 2, firewood: 1, apple: 1, carrot: 1, pumpkin: 2, fish: 3, horseshoe: 6, nails: 2, knife: 5, 'iron ore': 2, stone: 1, hide: 3, bandage: 2, milk: 2, egg: 1, crystal: 4, note: 1 };
  const STATION_JOB = { anvil: 'smith', workbench: 'labourer', cauldron: 'cook', chop: 'woodcutter', mine: 'miner', read: 'scholar', train: 'guard' };
  const W = () => window.tablefolk, U = () => window.tablefolkUses, M = () => window.tablefolkMind, P = () => window.tablefolkPlay, K = () => window.tablefolkClock;
  const scn = () => window.tablefolkScenario?.active?.scn || {};
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const nice = t => String(t || '').replace(/_/g, ' ');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const event = (g, kind) => { try { window.dispatchEvent(new CustomEvent('tablefolk-model-call', { detail: { agentId: g.id, kind } })); } catch {} };

  // ---------------------------------------------------------------- loading
  let builtins = null;
  function register(m, url = '') {
    if (!m || !m.id || !/^[a-z][a-z0-9_-]{0,31}$/i.test(m.id)) throw new Error(`job: manifest needs an "id" (letters, digits, _ -)`);
    const def = { ...m, id: String(m.id).toLowerCase(), _url: url, steps: Array.isArray(m.steps) ? m.steps : [] };
    try { def._re = m.match ? new RegExp(m.match, 'i') : null; } catch { def._re = null; }
    REG.set(def.id, def);
    if (url && !/\/jobs\/[^/]+\/job\.json$/.test(new URL(url, location.href).pathname)) PACKAGED.add(def.id);
    return def;
  }
  function resetPackaged() { for (const id of PACKAGED) REG.delete(id); PACKAGED.clear(); builtins = null; }
  async function load(s) {
    const warnings = [];
    builtins ||= Promise.all(BUILTIN.filter(id => !REG.has(id)).map(async id => {
      const url = window.tablefolkPackages?.refUrl(id, 'job') || `../jobs/${id}/job.json`;
      try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); register(await r.json(), url); } catch (e) { console.warn('[jobs] load', id, e); warnings.push(`job ${id}: ${e.message || e}`); }
    }));
    await builtins;
    // jobs named by reference (a URL, npm:, gh:) or written inline on the agent
    for (const a of s?.agents || []) {
      const j = a.job;
      if (j && typeof j === 'object') { try { register({ id: a.id + '_job', ...j }); } catch (e) { warnings.push(`agent ${a.id}: ${e.message}`); } continue; }
      if (typeof j !== 'string' || REG.has(j.toLowerCase())) continue;
      if (/^(https?:|npm:|gh:)/.test(j)) { try { const url = window.tablefolkPackages.refUrl(j, 'job'); const r = await fetch(url); if (!r.ok) throw new Error(r.status); const m = register(await r.json(), url); PACKAGED.add(m.id); a.job = m.id; } catch (e) { warnings.push(`agent ${a.id}: job ${j}: ${e.message}`); } }
      else warnings.push(`agent ${a.id}: no job "${j}" (jobs: ${[...REG.keys()].join(', ')})`);
    }
    return warnings;
  }

  // ---------------------------------------------------------------- who does what
  const agentOf = g => (scn().agents || []).find(a => a.id === g.id) || {};
  function jobOf(g) {
    if (!g || g === state.playerAvatar || P()?.isAnimal?.(g) || P()?.isHostile?.(g) || g._threat) return null;
    if (g._jobDef !== undefined) return g._jobDef;
    const a = agentOf(g), cfg = W().getBrainConfig(g.id);
    let def = null;
    if (a.job && typeof a.job === 'object') def = REG.get(a.id + '_job');
    else if (a.job) def = REG.get(String(a.job).toLowerCase()) || null;
    if (!def) {
      // its role, then how it looks, then its personality
      for (const text of [cfg.role, [a.style, g.style].join(' '), cfg.personality]) {
        if (!text) continue;
        def = [...REG.values()].find(j => j._re && j.id !== 'idler' && j._re.test(text)); if (def) break;
      }
    }
    if (!def) {
      const who = [cfg.role, g.style, cfg.personality].filter(Boolean).join(' ');
      const k = (U()?.STATION || []).find(([re]) => re.test(who))?.[1];
      def = k && REG.get(STATION_JOB[k]) || null;
    }
    def ||= REG.get('idler') || null;
    g._jobDef = def;
    return def;
  }
  // jobs run while the clock runs (clock.js); a frozen or absent clock leaves the world as before
  function handles(g) { return !!(K()?.running && jobOf(g) && !W().getBrainConfig(g.id).defeated && W().getBrainConfig(g.id).enabled !== false && state.mind !== false); }

  // ---------------------------------------------------------------- places and things
  const places = () => state.places || [];
  const inPlace = (p, x, z) => p && p.x0 != null && x >= p.x0 - .5 && x <= p.x1 + .5 && z >= p.z0 - .5 && z <= p.z1 + .5;
  const placeAt = (x, z) => places().find(p => inPlace(p, x, z) && !['square', 'pond', 'garden'].includes(p.kind)) || null;
  const placeNamed = n => n ? places().find(p => p.id === String(n).toLowerCase()) || places().find(p => p.kind === String(n).toLowerCase()) || null : null;
  const kindOf = t => U()?.kindOf(t);
  const matches = (o, k) => o.type === k || kindOf(o.type) === k;
  const things = k => getObjects().filter(o => matches(o, k));
  const HOLDS = new Set(['chest', 'store']);
  const stores = () => getObjects().filter(o => HOLDS.has(kindOf(o.type)));
  function S(g) {
    if (g._job) return g._job;
    const a = agentOf(g), p = posOf(g);
    const home = placeNamed(a.home) || (placeNamed(a.in)?.kind === 'house' ? placeNamed(a.in) : null);
    let work = placeNamed(a.workplace) || (a.in && placeNamed(a.in) && !['house', 'square'].includes(placeNamed(a.in).kind) ? placeNamed(a.in) : null);
    g._job = { step: 0, pass: false, fails: {}, blocked: {}, cycles: 0, home, work, workThing: !work && a.workplace ? String(a.workplace) : null, start: { x: p.x, z: p.z },
      did: fresh(), doing: '', ticks: 0, lastRemark: -999, lastOpen: -999, lastSocial: -999, lastPick: -999, lastEventPick: -999, mealPick: -1, sub: {} };
    return g._job;
  }
  const fresh = () => ({ made: {}, gathered: {}, stored: {}, sold: {}, bought: {}, ate: {} });
  const ownerOf = o => state.characters.find(c => { const s = c._job; return s && (inPlace(s.work, o.x, o.z) || inPlace(s.home, o.x, o.z)); }) || null;
  function myStores(g) {
    const s = S(g), list = stores();
    const inWork = list.filter(o => inPlace(s.work, o.x, o.z)), inHome = list.filter(o => inPlace(s.home, o.x, o.z));
    return [...inWork, ...inHome];
  }
  const communal = () => stores().filter(o => !ownerOf(o) && !placeAt(o.x, o.z));
  function contentsOf(o) { try { return U().contents(o.mesh); } catch { return { gold: 0, items: [] }; } }
  const has = (o, item) => (contentsOf(o).items || []).find(i => (i.qty ?? 1) > 0 && i.name.toLowerCase() === String(item).toLowerCase());
  const inv = g => charInventory(g);
  const count = (g, item) => (inv(g).items || []).filter(i => i.name.toLowerCase() === String(item).toLowerCase()).reduce((a, i) => a + (i.qty ?? 1), 0);
  const gold = g => +inv(g).gold || 0;
  function price(item, seller) {
    const n = String(item).toLowerCase(), j = seller && jobOf(seller);
    const own = seller && W().getBrainConfig(seller.id).prices?.[n];
    const v = Array.isArray(own) ? own[0] : own;
    return +(v ?? scn().prices?.[n] ?? j?.prices?.[n] ?? DEFAULT_PRICES[n] ?? 2);
  }
  function nearest(g, list, prefer) {
    const p = posOf(g); let best = null;
    for (const o of list) { const d = dist(p, o) - (prefer && prefer(o) ? 12 : 0); if (!best || d < best.d) best = { ...o, d0: dist(p, o), d }; }
    return best;
  }
  const isFood = n => !!M()?.isFood?.(n);
  const foodIn = g => (inv(g).items || []).find(i => (i.qty ?? 1) > 0 && isFood(i.name) && !/potion|elixir|tonic/i.test(i.name) && !M()?.isDrink?.(i.name));

  // ---------------------------------------------------------------- moving and acting
  const REACH = 1.9;
  // a quiet walk (no "walks toward" line): routed like live.js's wander
  function walkTo(g, x, z) {
    const a = posOf(g);
    if (Math.round(a.x) === Math.round(x) && Math.round(a.z) === Math.round(z)) return true;
    let tx = Math.round(x), tz = Math.round(z);
    if (!cellPassable(tx, tz) || occupantAt(tx, tz, g)) {
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dz]) => [tx + dx, tz + dz]).filter(([cx, cz]) => cellPassable(cx, cz) && !occupantAt(cx, cz, g)).sort((p, q) => Math.hypot(p[0] - a.x, p[1] - a.z) - Math.hypot(q[0] - a.x, q[1] - a.z))[0];
      if (!free) return false; [tx, tz] = free;
    }
    const route = findRoute(new BABYLON.Vector3(a.x, 0, a.z), new BABYLON.Vector3(tx, 0, tz));
    if (!route?.length) return false;
    if (g.pose) U()?.standUp(g, true);
    startTurnPath(g, route);
    if (M()?.weak?.(g) && g.turnMove) g.turnMove.dur *= 2;   // weak from hunger: slow
    g.anim = 'walk'; playRig(g, 'walk', true);
    const ms = (g.turnMove?.dur || 1) * 1000;
    setTimeout(() => { if (g.anim === 'walk' && !g.turnMove) { g.anim = 'idle'; playRig(g, 'idle', true); } }, ms + 120);
    return true;
  }
  const walkMs = g => Math.min(9000, (g.turnMove?.dur || .6) * 1000 + 250);
  const lastEntry = g => { const h = state.globalHistory || []; for (let i = h.length - 1; i >= Math.max(0, h.length - 6); i--) if (h[i].startsWith('T') && h[i].includes(' ' + g.id + ':')) return h[i]; return ''; };
  const FAILY = /\bFAILED\b|\b(failed|cannot|can't|could not|refused|is spent|is empty|no \w+ in sight|there is no|has no|not enough)\b/i;
  // a command line as the character's own (results, history, memories)
  async function runLine(g, line) {
    const before = (state.globalHistory || []).length;
    const ok = await W().runAs(g.id, line, 'job');
    const e = lastEntry(g), res = e.split(' -> ').slice(1).join(' -> ');
    const failed = !ok || W().isFailedEntry?.(e) || ((state.globalHistory || []).length > before && FAILY.test(res));
    return { ok: !failed, text: res };
  }
  // go to a thing (beside it), then run the line; one part per tick
  async function goDo(g, s, o, line) {
    if (g.turnMove) return { busy: true, ms: 700 };
    const p = posOf(g), key = Math.round(o.x) + ',' + Math.round(o.z);
    if (dist(p, o) > REACH) {
      if (s.sub.walkFor === key && s.sub.walkTries >= 2) { s.sub.walkTries = 0; (s.bad ||= {})[key] = gm() + 120; return { fail: `could not get to the ${nice(o.type)}` }; }
      s.sub.walkTries = s.sub.walkFor === key ? (s.sub.walkTries || 0) + 1 : 1; s.sub.walkFor = key;
      const c = reachableBeside(g, o);
      if (!c || !walkTo(g, c.x, c.z)) { s.sub.walkTries = 2; (s.bad ||= {})[key] = gm() + 240; return { fail: `no way to the ${nice(o.type)}` }; }
      return { busy: true, ms: walkMs(g) };
    }
    s.sub.walkTries = 0;
    if (!line) return { done: true };
    const r = await runLine(g, line);
    return r.ok ? { done: true, ms: 3800, text: r.text } : { fail: r.text || 'it did not work' };
  }
  // a free cell beside a thing that a route reaches (a cluttered room can wall a station in)
  function reachableBeside(g, o) {
    const p = posOf(g), ox = Math.round(o.x), oz = Math.round(o.z), from = new BABYLON.Vector3(p.x, 0, p.z);
    const cells = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dz]) => ({ x: ox + dx, z: oz + dz })).filter(c => cellPassable(c.x, c.z) && !occupantAt(c.x, c.z, g)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const c of cells) { if (Math.round(p.x) === c.x && Math.round(p.z) === c.z) return c; const r = findRoute(from, new BABYLON.Vector3(c.x, 0, c.z)); if (r?.length) return c; }
    return null;
  }
  // walk up to a thing without using it (done once beside it)
  async function approach(g, s, o) {
    if (dist(posOf(g), o) <= REACH && !g.turnMove) return { done: true };
    return goDo(g, s, o, null);
  }
  async function goTo(g, s, x, z, label) {
    if (g.turnMove) return { busy: true, ms: 700 };
    if (dist(posOf(g), { x, z }) <= 1.6) return { done: true };
    const key = 'p' + Math.round(x) + ',' + Math.round(z);
    if (s.sub.walkFor === key && s.sub.walkTries >= 3) { s.sub.walkTries = 0; return { fail: `could not get to ${label}` }; }
    s.sub.walkTries = s.sub.walkFor === key ? (s.sub.walkTries || 0) + 1 : 1; s.sub.walkFor = key;
    if (!walkTo(g, x, z)) return { fail: `no way to ${label}` };
    return { busy: true, ms: walkMs(g) };
  }
  // a free spot inside a place (its centre, else any free cell)
  function spotIn(p, g) {
    if (!p) return null;
    const c = Array.isArray(p.center) ? { x: p.center[0], z: p.center[1] } : { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 };
    const cells = [];
    for (let x = Math.ceil(p.x0); x <= p.x1; x++) for (let z = Math.ceil(p.z0); z <= p.z1; z++) if (cellPassable(x, z) && !occupantAt(x, z, g)) cells.push({ x, z, d: Math.hypot(x - c.x, z - c.z) + Math.random() * 1.5 });
    cells.sort((a, b) => a.d - b.d);
    return cells[0] || c;
  }

  // ---------------------------------------------------------------- what it is doing (labels, card)
  function setDoing(g, s, text) {
    if (s.doing === text) return;
    s.doing = text;
    if (text && seenByPlayer(g)) try { emitBadge(g, text); } catch {}
    if (state.selected === g) paneLine(g);
  }
  const seenByPlayer = g => !state.playerAvatar || dist(posOf(g), posOf(state.playerAvatar)) <= 14;
  function paneLine(g) {
    const pane = document.getElementById('pane-character'); if (!pane) return;
    let el = document.getElementById('charDoing');
    if (!el) { el = document.createElement('p'); el.id = 'charDoing'; el.className = 'pane-note'; pane.querySelector('.pane-title')?.after(el); }
    const j = jobOf(g), s = g._job;
    el.textContent = j && s ? `${g.id}: ${j.name || j.id}. Now: ${s.doing || 'idle'}.` : '';
  }
  setInterval(() => { try { if (state.selected) paneLine(state.selected); } catch {} }, 1500);
  const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  function todayLine(s) {
    const bits = [], d = s.did;
    const list = (o, verb) => { const e = Object.entries(o).filter(([, n]) => n > 0); if (e.length) bits.push(verb + ' ' + e.map(([k, n]) => `${n} ${k}`).join(', ')); };
    list(d.made, 'made'); list(d.gathered, 'gathered'); list(d.stored, 'stored'); list(d.sold, 'sold'); list(d.bought, 'bought'); list(d.ate, 'ate');
    return bits.length ? bits.join('; ') : 'nothing yet';
  }
  function cardLine(g) {
    const j = handles(g) && jobOf(g); if (!j) return [];
    const s = S(g), out = [`You are ${j.id === 'idler' ? 'not in any trade' : article(j.name || j.id) + ' ' + (j.name || j.id).toLowerCase()}. Right now: ${s.doing || 'nothing much'}. Today: ${todayLine(s)}.`];
    const h = K()?.hour();
    if (h != null && (h >= 17 || h < 5)) { const n = newsFor(g, 3); if (n.length) out.push('News today in the village: ' + n.join(' | ')); }
    if (M()?.weak?.(g)) out.push('You are weak from hunger: you cannot work until you have eaten.');
    return out;
  }

  // ---------------------------------------------------------------- what happened (counted from the action lines)
  const NEWS = [];   // { id, at: game minute, who, text, kind, about: [character ids named in it] }
  let newsSeq = 0;
  const gm = () => { const k = K()?.now(); return k ? (k.day - 1) * 1440 + k.min : performance.now() / 500; };
  const esc = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idsIn = text => state.characters.filter(c => !c._threat && new RegExp('\\b' + esc(c.id) + '\\b', 'i').test(text)).map(c => c.id);
  // kind: made | sold | bought | short (ran out) | raid | quarrel | insult | event (the director's) | news
  function addNews(who, text, kind = 'news') {
    const t = gm(), same = NEWS.find(n => n.text === text && t - n.at < 180);
    if (same) { same.at = t; return; }
    NEWS.push({ id: ++newsSeq, at: t, who, text, kind, about: idsIn(text) }); if (NEWS.length > 80) NEWS.shift();
  }
  function newsFor(g, n) { const t = gm(); return NEWS.filter(x => t - x.at < 1440 && x.who !== g.id && !x.text.startsWith(g.id + ' ')).slice(-n).map(x => x.text); }
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  addEventListener('tablefolk-say', e => {
    const d = e.detail || {}; if (d.voiced) return;
    const t = String(d.text || ''), g = state.characters.find(c => c.id === d.agentId); if (!g || !g._job) return;
    const s = g._job; let m;
    if ((m = t.match(/^([\w-]+) sells ([\w-]+) (.+?) for (\d+) gold/))) { bump(s.did.sold, m[3]); const b = state.characters.find(c => c.id === m[2]); if (b?._job) bump(b._job.did.bought, m[3]); addNews(g.id, `${m[1]} sold ${m[2]} ${m[3]} for ${m[4]} gold`, 'sold'); return; }
    if ((m = t.match(/^([\w-]+) buys (?:\d+ )?(.+?) from ([\w-]+)/))) { bump(s.did.bought, m[2]); const o = state.characters.find(c => c.id === m[3]); if (o?._job) bump(o._job.did.sold, m[2]); addNews(g.id, `${m[1]} bought ${m[2]} from ${m[3]}`, 'bought'); return; }
    if ((m = t.match(/\(\+(\d+) ([\w ]+)\)/))) { const made = /\b(bakes|forges|brews|cooks|makes|pours|mills|stews)\b/.test(t); bump(made ? s.did.made : s.did.gathered, m[2], +m[1]); if (made) { const v = t.split(' ')[1], past = { bakes: 'baked', forges: 'forged', brews: 'brewed', cooks: 'cooked', makes: 'made', pours: 'poured', mills: 'milled', stews: 'stewed' }[v] || 'made'; addNews(g.id, `${g.id} ${past} ${m[1]} ${m[2]}`, 'made'); } return; }
    if ((m = t.match(/^[\w-]+ takes (?:an? )?([\w ]+?) from the (apple barrel|apple crate|carrot crate)/))) { bump(s.did.gathered, m[1]); return; }
    if ((m = t.match(/ puts (?:an? )?(?!\d+ gold)(.+?) in the /))) { bump(s.did.stored, m[1]); return; }
    if ((m = t.match(/^[\w-]+ eats the (.+)$/))) { bump(s.did.ate, m[1]); return; }
  });
  // a new day: the day's tallies start again
  let lastDay = 0;
  addEventListener('tablefolk-clock', e => {
    const day = e.detail?.day || 1; if (day === lastDay) return;
    if (lastDay) for (const g of state.characters) if (g._job) { g._job.yesterday = todayLine(g._job); g._job.did = fresh(); }
    lastDay = day;
  });
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    NEWS.length = 0; lastDay = 0; TOPIC_USED.clear();
    for (const g of state.characters) { g._job = undefined; g._jobDef = undefined; }
    // a little money by job, when the scenario gives none
    setTimeout(() => { for (const g of state.characters) { const j = jobOf(g), a = agentOf(g); if (j?.gold && a.inventory?.gold == null) { const i = inv(g); if (!i.gold) { i.gold = +j.gold; W().setBrainConfig(g.id, { inventory: i }); } } } }, 0);
  });

  // ---------------------------------------------------------------- the model, narrowly
  const brainOk = () => !!(W()?.brainReady?.() && window.tablefolkLLM && window.tablefolkBrainInfo?.()?.engine !== 'none');
  // one short numbered pick: options [{ label, run }], plus "something else" (an open turn)
  async function pick(g, question, options, why) {
    if (!options.length) return null;
    if (options.length === 1 || !brainOk()) return options[0];
    const cfg = W().getBrainConfig(g.id), s = S(g);
    const list = [...options.map(o => o.label), 'something else'];
    const card = (M()?.cardLines?.(g) || []).filter(l => /^(You feel|Body|You like|You dislike|Current goal|What you are quietly after)/.test(l)).join('\n');
    const prompt = `${card ? card + '\n' : ''}Right now: ${s.doing || 'nothing much'}.${why ? ' ' + why : ''}\n${question}\n${list.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\nWhat do you do? Answer with the number only.`;
    event(g, 'pick');
    try {
      const r = await window.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: `You are ${g.id}${cfg.style ? ', ' + cfg.style : ''}. ${String(cfg.personality || '').slice(0, 260)} Choose what you do next.` }, { role: 'user', content: prompt }], max_tokens: 4, temperature: 0, agentId: 'pick' });
      const n = +(String(r?.choices?.[0]?.message?.content || '').match(/\d+/)?.[0] || 1);
      console.info('[jobs] pick', g.id, JSON.stringify(question), '->', list[n - 1] || n);
      if (n === list.length) return { label: 'something else', open: true };
      return options[Math.max(0, Math.min(options.length - 1, n - 1))];
    } catch (e) { console.warn('[jobs] pick', e); return options[0]; }
  }
  // an open model turn of a known kind (world-integration.js tells the kind on)
  async function modelTurn(g, kind) {
    g._callKind = kind;
    try { await W().runAgentTurn(g); } finally { g._callKind = null; }
  }
  const nearPeople = (g, r = state.earshot || 6) => [...state.characters.filter(c => c !== g && !c.defeated && !P()?.isAnimal?.(c) && !P()?.isHostile?.(c) && dist(posOf(c), posOf(g)) <= r), ...(state.playerAvatar && !state.playerAvatar.defeated && dist(posOf(state.playerAvatar), posOf(g)) <= r ? [state.playerAvatar] : [])];
  const nameOf = c => c === state.playerAvatar ? (document.getElementById('chatName')?.value.trim() || 'a traveller') : c.id;
  // a remark while working: one line, the activity in the prompt
  async function remark(g, s) {
    if (!brainOk() || gm() - s.lastRemark < 180 || Math.random() > .3 || window.tablefolkLive?.quiet?.() === false || window.tablefolkTalk?.mayStart?.(g.id) === false) return false;
    const near = nearPeople(g); if (!near.length) return false;
    s.lastRemark = gm();
    const cfg = W().getBrainConfig(g.id), j = jobOf(g), who = near.map(nameOf).slice(0, 3).join(', ');
    event(g, 'remark');
    try {
      const r = await window.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: `You are ${g.id}${cfg.style ? ', ' + cfg.style : ''}. ${String(cfg.personality || '').slice(0, 260)}` }, { role: 'user', content: `You are the village ${j.name || j.id}, ${s.doing || 'at work'}. Today you have ${todayLine(s)}. ${who} ${near.length > 1 ? 'are' : 'is'} nearby. Say one short thing out loud (under 15 words) about your work or your day, in your own voice. Only the words.` }], max_tokens: 40, temperature: .8, agentId: 'remark' });
      let t = String(r?.choices?.[0]?.message?.content || '').split('\n')[0].replace(/^say\s*\(|\)\s*$/g, '').replace(/^["“']+|["”']+$/g, '').replace(/^[\w-]+:\s*/, '').trim();
      if (t.length < 3 || /[{}<>]/.test(t)) return false;
      t = t.slice(0, 140);
      await runLine(g, `say(${JSON.stringify(t)})`);
      return true;
    } catch (e) { console.warn('[jobs] remark', e); return false; }
  }

  // ---------------------------------------------------------------- the steps
  const stepName = st => Object.keys(st).find(k => ['haul', 'gather', 'fetch', 'make', 'store', 'sell', 'serve', 'patrol', 'tend', 'heal', 'rest', 'wander', 'read', 'tidy', 'lookout', 'pace'].includes(k));
  // a recipe's inputs: one set ({"wheat": 2}) or alternatives ([{"wheat": 2}, {"flour sack": 1}])
  const altSets = v => (Array.isArray(v) ? v : [v || {}]).filter(x => x && typeof x === 'object');
  const missingIn = (g, set) => Object.entries(set).find(([n, q]) => count(g, n) < q) || null;
  // where an item could come from: a store, someone carrying it, or a thing on the map that yields it
  function sourcesOf(g, item, kinds) {
    const s = S(g), t = gm(), it = String(item).toLowerCase();
    const list = getObjects().filter(o => { const st = U()?.stockOf(o); return st && st.left > 0 && String(st.item).toLowerCase() === it && !((s.bad || {})[Math.round(o.x) + ',' + Math.round(o.z)] > t); });
    const hinted = kinds ? list.filter(o => kinds.some(k => matches(o, k))) : [];
    return hinted.length ? hinted : list;
  }
  const inStores = item => stores().some(o => has(o, item));
  const carriedBy = (g, item) => state.characters.filter(c => c !== g && !c.defeated && count(c, item) > 0 && !P()?.isHostile?.(c) && !P()?.isAnimal?.(c));
  const supplied = (g, item) => inStores(item) || carriedBy(g, item).length > 0 || sourcesOf(g, item).length > 0;
  // small loose things worth tidying away, and doors to look out of
  const LOOSE = /^(bucket|bag|pot|vase|frying_pan|rope|broken_pot|backpack|bone|chalice|candles|sacks)$/;
  const doors = () => (state.blocks || []).filter(b => b && !b.isDisposed?.() && meta(b)?.type === 'door').map(b => ({ x: b.position.x, z: b.position.z, type: 'door', mesh: b }));
  const oneOf = a => a[Math.floor(Math.random() * a.length)];
  function stationFor(g, k) {
    const s = S(g), t = gm(), list = things(k).filter(o => { const st = U().stockOf(o); return (!st || st.left > 0) && !((s.bad || {})[Math.round(o.x) + ',' + Math.round(o.z)] > t); });
    if (!list.length) return null;
    return nearest(g, list, o => inPlace(s.work, o.x, o.z) || (s.workThing && o.type === s.workThing));
  }
  // the next unit of a step: { busy, ms } | { done, ms } | { skip } | { fail } | { need }
  async function doStep(g, s, j, st) {
    const kind = stepName(st), arg = st[kind];
    if (kind === 'gather') {
      const o = stationFor(g, arg); if (!o) return { skip: true, why: `nothing left to gather (${nice(arg)})` };
      const st0 = U().stockOf(o), item = st0?.item || st.gives || nice(arg);
      setDoing(g, s, st.doing || `gathering ${item}`);
      const r = await goDo(g, s, o, `use(${o.type})`);
      if (r.done) { s.sub.n = (s.sub.n || 0) + 1; if (s.sub.n < (+st.n || 1)) return { busy: true, ms: r.ms, worked: true }; }
      return r.done ? { ...r, worked: true } : r;
    }
    if (kind === 'fetch') { const r = await fetchStep(g, s, j, arg); return r.need && st.optional ? { skip: true } : r; }
    if (kind === 'haul') return haul(g, s);
    if (kind === 'make') {
      // the first set of inputs it has in full (bread from wheat, or from a flour sack)
      const sets = altSets(st.needs), needs = sets.find(x => !missingIn(g, x));
      if (!needs) {
        if (st.optional) return { skip: true };
        const set = sets.find(x => Object.keys(x).every(n => count(g, n) >= x[n] || supplied(g, n))) || sets[0], [n, q] = missingIn(g, set);
        return { need: { item: n, n: q - count(g, n), for: arg, alts: sets.map(x => missingIn(g, x)?.[0]).filter(Boolean) } };
      }
      const o = stationFor(g, st.at || (j.workplace || [])[0]); if (!o) return { skip: true, why: `no ${nice(st.at)} to work at` };
      setDoing(g, s, st.doing || `making ${arg}`);
      if (dist(posOf(g), o) <= REACH && !g.turnMove) g._make = { item: arg, needs, gives: st.gives || 1, verb: st.verb || 'makes', time: st.time || 4 };
      const r = await goDo(g, s, o, `use(${o.type})`);
      g._make = null;
      return r.done ? { ...r, worked: true, ms: Math.max(r.ms, (st.time || 4) * 1000) } : r;
    }
    if (kind === 'store') {
      const items = arg === 'all' || arg === 'made' ? (inv(g).items || []).filter(i => (i.qty ?? 1) > 0 && (arg === 'all' || (j.steps || []).some(x => x.make === i.name || x.gather && (x.gives === i.name)))).map(i => i.name) : [].concat(arg);
      const keep = +st.keep || 0, todo = items.filter(n => count(g, n) > keep);
      if (!todo.length) return { skip: true };
      const o = nearest(g, myStores(g).length ? myStores(g) : communal()); if (!o) return { skip: true, why: 'no store to put things in' };
      setDoing(g, s, st.doing || `carrying ${todo[0]} to the ${nice(o.type)}`);
      if (g.turnMove) return { busy: true, ms: 700 };
      if (dist(posOf(g), o) > REACH) return approach(g, s, o);
      let n = 0;
      for (const name of todo) for (let k = count(g, name) - keep; k > 0 && n < 8; k--, n++) { const r = await runLine(g, `put(${name}, ${o.type})`); if (!r.ok) break; }
      return n ? { done: true, ms: 2500, worked: true } : { fail: 'could not put it away' };
    }
    if (kind === 'sell' || kind === 'serve') return sellStep(g, s, j, [].concat(arg), kind === 'serve');
    if (kind === 'patrol') return patrol(g, s, arg);
    if (kind === 'tend') {
      const bare = things(arg).filter(o => { const x = U().stockOf(o); return x && x.left <= 0 && !x.mm.opts.tended; });
      if (!bare.length) {
        // animals: a pat and a look
        const beast = state.characters.find(c => P()?.isAnimal?.(c) && !c.defeated && (c.charModel === arg || arg === 'animals'));
        if (!beast) return { skip: true };
        setDoing(g, s, `tending the ${nice(beast.charModel)}`);
        const r = await goTo(g, s, posOf(beast).x, posOf(beast).z, 'the ' + nice(beast.charModel));
        if (r.done) { await runLine(g, `emote(pats the ${nice(beast.charModel)})`); return { done: true, ms: 3000, worked: true }; }
        return r;
      }
      const o = nearest(g, bare); setDoing(g, s, st.doing || `sowing the ${nice(o.type)}`);
      const r = await goDo(g, s, o, `use(${o.type})`);
      return r.done ? { ...r, worked: true } : r;
    }
    if (kind === 'heal') {
      const hurt = state.characters.filter(c => c !== g && !c.defeated && !P()?.isHostile?.(c) && (W().getBrainConfig(c.id).hp ?? 10) < (W().getBrainConfig(c.id).maxHp ?? 10) * .8 && dist(posOf(c), posOf(g)) <= 14);
      const c = hurt.sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)))[0]; if (!c) return { skip: true };
      setDoing(g, s, `seeing to ${c.id}'s wounds`);
      const r = await goTo(g, s, posOf(c).x, posOf(c).z, c.id); if (!r.done) return r;
      const healed = window.tablefolkCombat?.heal?.(c, 3) || 0;
      say(g, `${g.id} bandages ${c.id}'s wounds${healed ? ' (+' + healed + ' health)' : ''}`, false);
      M()?.event?.(c, 'given', { who: g.id, what: 'a bandage' });
      return { done: true, ms: 3500, worked: true };
    }
    if (kind === 'read') {
      const o = stationFor(g, 'read'); if (!o) return { skip: true };
      setDoing(g, s, 'reading');
      const r = await goDo(g, s, o, `use(${o.type})`); return r.done ? { ...r, worked: true } : r;
    }
    if (kind === 'rest') {
      const seat = nearest(g, things('seat').filter(o => inPlace(s.work, o.x, o.z) || dist(posOf(g), o) < 6));
      setDoing(g, s, 'taking a rest');
      if (!seat || g.pose) return { done: true, ms: 6000 };
      const r = await goDo(g, s, seat, `use(${seat.type})`); return r.done ? { done: true, ms: 8000 } : r;
    }
    if (kind === 'wander') {
      setDoing(g, s, st.doing || 'playing');
      if (!s.sub.to) { const ps = places().filter(p => ['square', 'garden', 'pond', 'tavern', 'stable'].includes(p.kind)); const p = ps[Math.floor(Math.random() * ps.length)]; const c = p ? spotIn(p, g) : null; s.sub.to = c || { x: s.start.x + rnd(-4, 4), z: s.start.z + rnd(-4, 4) }; }
      const r = await goTo(g, s, s.sub.to.x, s.sub.to.z, 'there');
      if (r.done || r.fail) { s.sub.to = null; if (r.done && Math.random() < .5) await runLine(g, `emote(${st.emote || 'plays'})`); return { done: true, ms: 4000, worked: true }; }
      return r;
    }
    if (kind === 'tidy') {
      // carrying something: to the store (the nearest), set down there
      const held = state.held?.get(g.id), store = nearest(g, stores().filter(o => dist(posOf(g), o) < 12));
      const may = c => (W().getAllowedCommands?.(g.id) || []).includes(c);
      if (held) {
        setDoing(g, s, 'tidying up');
        if (store && dist(posOf(g), store) > REACH) { const r = await approach(g, s, store); if (!r.done) return r; }
        await runLine(g, 'drop()'); return { done: true, ms: 3000, worked: true };
      }
      const loose = may('carry') && nearest(g, getObjects().filter(o => LOOSE.test(o.type) && dist(posOf(g), o) < 8 && (!store || dist(store, o) > 2.2) && !state.characters.some(c => state.held?.get(c.id) === o.mesh)));
      if (loose && store) { setDoing(g, s, `tidying away the ${nice(loose.type)}`); const r = await goDo(g, s, loose, `carry(${loose.type})`); return r.done ? { busy: true, ms: 2000, worked: true } : r; }
      // nothing out of place: a sweep and a dusting by the store or a table
      const spot = store || nearest(g, things('seat').filter(o => dist(posOf(g), o) < 10));
      if (!spot) return { skip: true };
      setDoing(g, s, 'tidying up');
      const r = await approach(g, s, spot); if (!r.done) return r;
      await runLine(g, `emote(${oneOf(['sweeps the floor', 'tidies the shelves', 'dusts things off', 'straightens things up'])})`);
      return { done: true, ms: 7000, worked: true };
    }
    if (kind === 'lookout') {
      const d = nearest(g, doors().filter(o => dist(posOf(g), o) < 14));
      if (!d) return { skip: true };
      setDoing(g, s, 'looking out of the door');
      const r = await approach(g, s, d); if (!r.done) return r;
      try { setCharacterFacing(g, new BABYLON.Vector3(d.x - posOf(g).x, 0, d.z - posOf(g).z)); } catch {}
      await runLine(g, `emote(${oneOf(['looks out of the door', 'peers outside', 'watches the street for a while'])})`);
      return { done: true, ms: 8000, worked: true };
    }
    if (kind === 'pace') {
      // to a named place, else across the room
      if (!s.sub.to) {
        const here = placeAt(posOf(g).x, posOf(g).z), ps = places().filter(p => p !== here && p.x0 != null);
        const p = Array.isArray(arg) ? arg.map(placeNamed).filter(Boolean)[0] : typeof arg === 'string' ? placeNamed(arg) : ps.length && Math.random() < .5 ? oneOf(ps) : null;
        let c = p ? spotIn(p, g) : null;
        for (let k = 0; !c && k < 8; k++) { const x = Math.round(posOf(g).x + rnd(-5, 5)), z = Math.round(posOf(g).z + rnd(-5, 5)); if (dist(posOf(g), { x, z }) >= 3 && cellPassable(x, z) && !occupantAt(x, z, g)) c = { x, z }; }
        if (!c) return { skip: true };
        s.sub.to = c; s.sub.label = p ? 'to the ' + p.id : 'up and down';
      }
      setDoing(g, s, 'pacing ' + s.sub.label);
      const r = await goTo(g, s, s.sub.to.x, s.sub.to.z, 'there');
      if (r.done || r.fail) { s.sub.to = null; if (r.done && Math.random() < .4) await runLine(g, `emote(${oneOf(['looks around', 'stops and thinks', 'stretches'])})`); return { done: true, ms: 5000, worked: !!r.done }; }
      return r;
    }
    return { skip: true };
  }
  // fetch what a step needs: own store, the village store, another's store (paid), a seller
  // a labourer: goods from the village store to a worker whose own store lacks what its job fetches
  async function haul(g, s) {
    if (!s.sub.haul) {
      for (const w of state.characters) {
        const wj = w !== g && w._job && jobOf(w); if (!wj) continue;
        const wants = (wj.steps || []).flatMap(x => Object.keys(x.fetch || {})), dest = myStores(w)[0]; if (!dest) continue;
        for (const item of wants) { if (has(dest, item)) continue; const src = nearest(g, communal().filter(o => has(o, item))); if (src) { s.sub.haul = { item, src, dest, for: w.id }; break; } }
        if (s.sub.haul) break;
      }
      if (!s.sub.haul) return { skip: true };
    }
    const hl = s.sub.haul;
    if (count(g, hl.item) < 1) {
      setDoing(g, s, `fetching ${hl.item} for ${hl.for}`);
      if (dist(posOf(g), hl.src) > REACH) return approach(g, s, hl.src);
      const r = await runLine(g, `take(${hl.item}, ${hl.src.type})`); if (!r.ok) { s.sub.haul = null; return { fail: r.text }; }
      await runLine(g, `take(${hl.item}, ${hl.src.type})`);
      return { busy: true, ms: 2000 };
    }
    setDoing(g, s, `carrying ${hl.item} to ${hl.for}`);
    if (dist(posOf(g), hl.dest) > REACH) return approach(g, s, hl.dest);
    while (count(g, hl.item) > 0) { const r = await runLine(g, `put(${hl.item}, ${hl.dest.type})`); if (!r.ok) break; }
    s.sub.haul = null;
    return { done: true, ms: 2500, worked: true };
  }
  // alternatives ([{"wheat": 2}, {"flour sack": 1}]): done when one set is in hand; else the first set a store or a seller has
  async function fetchStep(g, s, j, want) {
    const sets = altSets(want);
    if (sets.some(x => !missingIn(g, x))) return { skip: true };
    const avail = sets.find(x => Object.keys(x).every(n => count(g, n) >= x[n] || inStores(n) || carriedBy(g, n).length));
    const r = await fetchSet(g, s, j, avail || sets[0]);
    if (r.need && sets.length > 1) r.need.alts = sets.map(x => missingIn(g, x)?.[0]).filter(Boolean);
    return r;
  }
  async function fetchSet(g, s, j, want) {
    const missing = Object.entries(want || {}).map(([n, q]) => [n, q - count(g, n)]).filter(([, q]) => q > 0);
    if (!missing.length) return { skip: true };
    const [item, n] = missing[0];
    const mine = myStores(g).filter(o => has(o, item)), common = communal().filter(o => has(o, item)), others = stores().filter(o => has(o, item) && !mine.includes(o) && !common.includes(o));
    const src = nearest(g, mine) || nearest(g, common) || nearest(g, others);
    if (src) {
      const owner = !mine.some(o => o.mesh === src.mesh) && !common.some(o => o.mesh === src.mesh) ? ownerOf(src) : null;
      const cost = owner ? price(item, owner) : 0;
      if (owner && gold(g) < cost) return { need: { item, n, why: `${owner.id} keeps ${item} but you cannot afford it` } };
      setDoing(g, s, `fetching ${item} from ${owner ? owner.id + "'s" : 'the'} ${nice(src.type)}`);
      if (g.turnMove) return { busy: true, ms: 700 };
      if (dist(posOf(g), src) > REACH) return approach(g, s, src);
      let got = 0;
      for (let k = 0; k < n; k++) { const r = await runLine(g, `take(${item}, ${src.type})`); if (!r.ok) break; got++; }
      if (got && owner) {
        const i = inv(g), o = inv(owner), pay = Math.min(gold(g), cost * got);
        i.gold = gold(g) - pay; o.gold = gold(owner) + pay; W().setBrainConfig(g.id, { inventory: i }); W().setBrainConfig(owner.id, { inventory: o });
        say(g, `${g.id} buys ${got > 1 ? got + ' ' : ''}${item} from ${owner.id} for ${pay} gold (left in ${owner.id}'s ${nice(src.type)})`, false);
        M()?.addMemory?.(owner, `${g.id} bought ${item} from your ${nice(src.type)} for ${pay} gold.`, 1.5);
      }
      return got ? { busy: got < n, done: got >= n, ms: 2500 } : { fail: `could not take ${item}` };
    }
    // someone carrying it who would sell
    const seller = state.characters.filter(c => c !== g && !c.defeated && count(c, item) > 0 && jobOf(c) && !P()?.isHostile?.(c)).sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)))[0];
    if (seller && gold(g) >= price(item, seller)) return buyFrom(g, s, seller, item);
    return { need: { item, n } };
  }
  async function buyFrom(g, s, seller, item) {
    setDoing(g, s, `going to buy ${item} from ${seller.id}`);
    const r = await goTo(g, s, posOf(seller).x, posOf(seller).z, seller.id);
    if (!r.done) return r;
    g._wants = { item, until: performance.now() + 20000 };
    const res = await runLine(seller, `sell(${item}, ${price(item, seller)}, ${g.id})`);
    g._wants = null;
    return res.ok ? { done: true, ms: 2500 } : { fail: res.text };
  }
  async function sellStep(g, s, j, items, serve) {
    const have = items.filter(n => count(g, n) > 0);
    if (!have.length) return { skip: true };
    const R = serve ? 14 : 10;
    // someone close who is hungry (food) or wants it, has the gold, and does not carry food
    const buyers = state.characters.filter(c => c !== g && !c.defeated && c._job && !P()?.isAnimal?.(c) && !P()?.isHostile?.(c) && dist(posOf(c), posOf(g)) <= R && (!serve || inPlace(s.work, posOf(c).x, posOf(c).z) || dist(posOf(c), posOf(g)) <= 5));
    for (const b of buyers.sort((p, q) => dist(posOf(p), posOf(g)) - dist(posOf(q), posOf(g)))) {
      const bs = S(b), hungry = (M()?.mindOf?.(b)?.hunger || 0) >= .5 && !foodIn(b), item = have.find(n => (isFood(n) && hungry) || bs.wantItem === n || (serve && n === 'ale' && !bs.hadAle && K()?.hour() >= 17));
      if (!item || gold(b) < price(item, g)) continue;
      if (M()?.refuses?.(g, b.id) || M()?.refuses?.(b, g.id)) continue;
      setDoing(g, s, `${serve ? 'serving' : 'selling'} ${item} to ${b.id}`);
      if (dist(posOf(g), posOf(b)) > 2.5) { const r = await goTo(g, s, posOf(b).x, posOf(b).z, b.id); if (!r.done) return r; }
      b._wants = { item, until: performance.now() + 20000 };
      const res = await runLine(g, `sell(${item}, ${price(item, g)}, ${b.id})`);
      b._wants = null;
      if (res.ok && item === 'ale') bs.hadAle = true;
      if (res.ok && bs.wantItem === item) bs.wantItem = null;
      return res.ok ? { done: true, ms: 3000, worked: true } : { done: true, ms: 2000 };
    }
    // nobody: minds the stall a while, at the workplace
    setDoing(g, s, `minding the stall (${have.join(', ')})`);
    const spot = s.work ? spotIn(s.work, g) : null;
    if (spot && !inPlace(s.work, posOf(g).x, posOf(g).z)) { const r = await goTo(g, s, spot.x, spot.z, 'the stall'); if (!r.done) return r; }
    s.sub.waits = (s.sub.waits || 0) + 1;
    return s.sub.waits >= 2 ? { done: true, ms: 4000 } : { busy: true, ms: 5000 };
  }
  async function patrol(g, s, arg) {
    const ids = arg === 'village' || !Array.isArray(arg) ? places().filter(p => ['square', 'tavern', 'smithy', 'shop', 'guardhouse', 'house', 'garden'].includes(p.kind)).map(p => p.id) : arg;
    const route = ids.map(placeNamed).filter(Boolean);
    if (!route.length) { setDoing(g, s, 'keeping watch'); return { done: true, ms: 6000, worked: true }; }
    s.sub.i = (s.sub.i || 0) % route.length;
    const p = route[s.sub.i]; s.sub.to ||= spotIn(p, g) || { x: p.center?.[0] || 0, z: p.center?.[1] || 0 };
    s.patrols = fighter(g, jobOf(g));   // a guard's cycles are places visited (advance() counts none)
    setDoing(g, s, `on patrol (to the ${p.id})`);
    const r = await goTo(g, s, s.sub.to.x, s.sub.to.z, 'the ' + p.id);
    if (r.done && fighter(g, jobOf(g))) {
      // a guard's stop: a look around, and a word for someone by name (each person once a game hour)
      s.cycles++;
      await runLine(g, `emote(${oneOf([`looks around the ${p.id}`, `checks the ${p.id}`, `stops at the ${p.id} and looks about`])})`);
      const t = gm(); s.greeted ||= {};
      const who = nearPeople(g, 4).find(c => (c !== state.playerAvatar || !!document.getElementById('chatName')?.value.trim()) && t - (s.greeted[nameOf(c)] ?? -999) >= 60);
      if (who) { s.greeted[nameOf(who)] = t; const h = K()?.hour() ?? 12; say(g, `${h < 5 || h >= 21 ? 'Quiet night' : h < 12 ? 'Morning' : h < 18 ? 'Good day' : 'Evening'}, ${nameOf(who)}.`, true); }
    }
    if (r.done || r.fail) { s.sub.to = null; s.sub.i++; if (s.sub.i >= route.length) { s.sub.i = 0; return { done: true, ms: 4500, worked: true }; } return { busy: true, ms: 4500, worked: true }; }
    return r;
  }

  // ---------------------------------------------------------------- the job loop
  async function work(g, s, j) {
    const steps = j.steps || []; if (!steps.length) return idleAt(g, s, s.work);
    for (let guard = 0; guard < steps.length + 1; guard++) {
      const i = s.step % steps.length, st = steps[i], t = gm();
      if (s.blocked[i] && t < s.blocked[i]) { advance(s, steps, j); continue; }
      const r = await doStep(g, s, j, st);
      if (r.worked) s.pass = true;
      if (r.skip) { advance(s, steps, j); continue; }
      if (r.fail) { s.fails[i] = (s.fails[i] || 0) + 1; console.info('[jobs]', g.id, stepName(st), 'failed:', r.fail); if (s.fails[i] >= 2) { s.fails[i] = 0; s.blocked[i] = t + 60; advance(s, steps, j); } return { ms: 2500 }; }
      // out of something: the job's fallbacks in code (buy it, gather it); none works: the step waits an hour and the others go on
      if (r.need) {
        const fr = await fallback(g, s, j, r.need);
        if (fr) return fr;
        addNews(g.id, `${g.id} ran out of ${r.need.item}`, 'short');
        s.lastNeed = r.need; s.blocked[i] = t + 60; advance(s, steps, j); continue;
      }
      if (r.done) { s.fails[i] = 0; advance(s, steps, j); }
      if (r.done && r.worked && Math.random() < .35) await remark(g, s);
      return { ms: r.ms || 3000 };
    }
    // no step could go: a declared idle activity, a pick at most once an hour
    return decide(g, s, j, s.lastNeed && t0() - s.lastNeedAt < 120 ? s.lastNeed : null, -1);
  }
  const t0 = () => gm();
  function advance(s, steps, j) {
    s.sub = {}; s.step++;
    if (s.step % steps.length === 0) { if (s.pass && !s.patrols) s.cycles++; s.pass = false; }
    // a job whose steps are a choice (the idler): the next one at random
    if (j?.order === 'random' && steps.length > 1) { let k; do { k = Math.floor(Math.random() * steps.length); } while (k === s.lastRandom); s.lastRandom = k; s.step = s.step - (s.step % steps.length) + k; }
  }
  // job.json "fallback": what it does when out of an input, in order:
  //   {"buy": true}                          buy it from whoever carries it (else ask whoever makes it)
  //   {"gather": true | {"iron ore": ["mine"]}}   get it itself from a thing on the map that yields it
  //   {"idle": "tidy" | "rest" | "pace" | "lookout" | "wander" | "read"}   keep busy that way meanwhile
  const DEFAULT_FALLBACK = [{ buy: true }, { gather: true }];
  async function fallback(g, s, j, need, withIdle = false) {
    s.lastNeedAt = gm();
    const items = [...new Set([need.item, ...(need.alts || [])])];
    for (const f of Array.isArray(j.fallback) ? j.fallback : DEFAULT_FALLBACK) {
      if (f.buy) for (const item of items) {
        // not from someone whose own work needs it (two bakers sold one flour sack back and forth), nor the same thing twice in an hour
        const needsIt = c => (jobOf(c)?.steps || []).some(x => altSets(x.needs).some(set => item in set) || altSets(x.fetch).some(set => item in set));
        const holder = gm() - ((s.bought ||= {})[item] ?? -999) >= 60 && carriedBy(g, item).filter(c => c._job && !needsIt(c) && gold(g) >= price(item, c) && !M()?.refuses?.(c, g.id)).sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)))[0];
        if (holder) { s.bought[item] = gm(); const r = await buyFrom(g, s, holder, item); return { ms: r.ms || 2500 }; }
        // whoever makes or gathers it: asked (a cause to speak, one an hour)
        const maker = state.characters.find(c => c !== g && !c.defeated && c._job && (jobOf(c)?.steps || []).some(x => x.make === item || x.gives === item || (x.gather && U()?.stockOf && sourcesOf(c, item).some(o => matches(o, x.gather)))));
        if (maker && !(s.ask && s.ask.until > gm()) && gm() - (s.lastAsk ?? -999) >= 60) { s.lastAsk = gm(); s.wantItem = item; s.ask = { who: maker.id, item, until: gm() + 60 }; }
      }
      if (f.gather) for (const item of items) {
        const kinds = f.gather && typeof f.gather === 'object' && f.gather[item] ? [].concat(f.gather[item]) : null;
        const o = nearest(g, sourcesOf(g, item, kinds)); if (!o) continue;
        setDoing(g, s, `out of ${item}: getting some from the ${nice(o.type)}`);
        const r = await goDo(g, s, o, `use(${o.type})`);
        if (r.fail) continue;
        if (r.done) s.pass = true;
        return { ms: r.ms || 3500 };
      }
      if (f.idle && withIdle) return idleActivity(g, s, j, f.idle);
    }
    return null;
  }
  // keeping busy while there is nothing to work at: now its declared
  // activity, now a seat, a walk, a look out of the door; seated, it mostly
  // stays put (a sweep every four seconds was the old stir loop again)
  async function idleActivity(g, s, j, kind) {
    if (g.pose && Math.random() < .7) return { ms: rnd(12000, 20000) };
    const k = Math.random() < .5 ? (kind || j.idle || 'tidy') : oneOf(['rest', 'pace', 'lookout', 'tidy']);
    let r = await doStep(g, s, j, { [k]: true });
    if (r.skip) r = await doStep(g, s, j, { rest: true });
    if (r.busy) return { ms: r.ms || 2000 };
    return { ms: Math.max(r.ms || 0, rnd(12000, 18000)) };
  }
  // the job has no valid next step: one pick, then it keeps to that for an hour
  async function decide(g, s, j, need, i) {
    const t = gm();
    // keeping busy while stuck: its declared idle activity ("thistle stirs the cauldron" eight times running was the station)
    if (s.fallback && t < s.fallback.until) return s.fallback.run().then(r => ({ ms: Math.max(r?.ms || 0, 9000) }));
    // nothing to do (all spent, nothing to sell) is a quieter matter than missing materials: a pick every three hours at most
    if (t - s.lastPick < (need ? 60 : 180)) { if (need) setDoing(g, s, `out of ${need.item}`); return idleActivity(g, s, j, (j.fallback || []).find(f => f.idle)?.idle); }
    s.lastPick = t;
    const opts = [], near = nearPeople(g, 10).filter(c => c !== state.playerAvatar);
    if (need) {
      const holder = state.characters.find(c => c !== g && !c.defeated && count(c, need.item) > 0 && !P()?.isHostile?.(c));
      if (holder && gold(g) >= price(need.item, holder)) opts.push({ label: `buy ${need.item} from ${holder.id}`, run: () => buyFrom(g, s, holder, need.item).then(r => ({ ms: r.ms || 2500 })) });
      const asker = holder || near[0];
      if (asker) opts.push({ label: `ask ${asker.id} for ${need.item}`, run: async () => { s.wantItem = need.item; s.ask = { who: asker.id, item: need.item, until: gm() + 60 }; await goTo(g, s, posOf(asker).x, posOf(asker).z, asker.id); return { ms: 3000 }; } });
    }
    const busyWith = (j.fallback || []).find(f => f.idle)?.idle || 'tidy';
    opts.push({ label: `keep busy (${busyWith === 'tidy' ? 'tidy up' : busyWith === 'pace' ? 'walk about' : busyWith === 'lookout' ? 'keep an eye on the street' : busyWith}) for now`, run: () => idleActivity(g, s, j, busyWith), stay: true });
    opts.push({ label: 'take a break', run: () => idleActivity(g, s, j, 'rest'), stay: true });
    setDoing(g, s, need ? `out of ${need.item}` : 'with nothing to do');
    const why = need ? `You need ${need.n || 1} ${need.item}${need.for ? ' to make ' + need.for : ''} and have none.${need.why ? ' ' + need.why + '.' : ''}` : 'Your work is stuck.';
    const ch = await pick(g, 'What now?', opts, why);
    if (!ch) return { ms: 4000 };
    if (ch.open) { await modelTurn(g, 'choice'); return { ms: 4000 }; }
    if (ch.stay) s.fallback = { until: t + 60, run: ch.run };
    if (i >= 0 && !ch.label.startsWith('buy')) { s.blocked[i] = t + 60; }
    return ch.run();
  }
  async function idleAt(g, s, p) {
    if (g.turnMove) return { ms: 800 };
    const spot = p && !inPlace(p, posOf(g).x, posOf(g).z) ? spotIn(p, g) : null;
    if (spot) { walkTo(g, spot.x, spot.z); return { ms: walkMs(g) }; }
    if (Math.random() < .3) { const seat = nearest(g, things('seat').filter(o => dist(posOf(g), o) < 5 && !state.characters.some(c => c !== g && c.pose?.on === o.mesh))); if (seat && !g.pose) { await runLine(g, `use(${seat.type})`); return { ms: 9000 }; } }
    return { ms: rnd(4000, 7000) };
  }

  // ---------------------------------------------------------------- eating
  async function eat(g, s) {
    const f = foodIn(g);
    if (f) { setDoing(g, s, 'eating'); await runLine(g, `eat(${f.name})`); s.meal = null; return { ms: 3500 }; }
    // the ways to get some
    const opts = [], foodStores = list => list.map(o => ({ o, it: (contentsOf(o).items || []).find(i => (i.qty ?? 1) > 0 && isFood(i.name)) })).filter(x => x.it);
    const own = nearest(g, foodStores(myStores(g)).map(x => ({ ...x.o, item: x.it.name })));
    const com = nearest(g, foodStores(communal()).map(x => ({ ...x.o, item: x.it.name })));
    const other = nearest(g, foodStores(stores().filter(o => !myStores(g).some(m => m.mesh === o.mesh) && ownerOf(o) && ownerOf(o) !== g)).map(x => ({ ...x.o, item: x.it.name })));
    const sellers = state.characters.filter(c => c !== g && !c.defeated && c._job && foodIn(c) && !P()?.isHostile?.(c) && gold(g) >= price(foodIn(c).name, c)).sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)));
    const forage = nearest(g, getObjects().filter(o => { const st = U().stockOf(o); return st && st.left > 0 && isFood(st.item) && dist(posOf(g), o) < 18; }));
    if (own) opts.push({ label: `take ${own.item} from your ${nice(own.type)}`, run: () => takeFood(g, s, own, null) });
    if (com) opts.push({ label: `take ${com.item} from the village ${nice(com.type)}`, run: () => takeFood(g, s, com, null) });
    if (sellers[0]) opts.push({ label: `buy ${foodIn(sellers[0]).name} from ${sellers[0].id} (${price(foodIn(sellers[0]).name, sellers[0])} gold)`, run: () => buyFrom(g, s, sellers[0], foodIn(sellers[0]).name).then(r => ({ ms: r.ms || 2500 })) });
    if (other && gold(g) >= price(other.item, ownerOf(other))) opts.push({ label: `buy ${other.item} from ${ownerOf(other).id}'s ${nice(other.type)}`, run: () => takeFood(g, s, other, ownerOf(other)) });
    if (forage) opts.push({ label: `pick ${U().stockOf(forage).item} from the ${nice(forage.type)}`, run: () => goDo(g, s, forage, `use(${forage.type})`).then(r => ({ ms: r.ms || 3000 })) });
    if (!opts.length) {
      // nothing to be had: ask someone (a cause to speak), or wait
      setDoing(g, s, 'hungry, looking for food');
      // (one ask an hour: a new one each tick had it begging every few seconds)
      if (!(s.ask && s.ask.until > gm())) s.ask = { item: 'food', until: gm() + 60, who: nearPeople(g, 8).filter(c => c !== state.playerAvatar)[0]?.id || '' };
      return null;
    }
    setDoing(g, s, 'getting something to eat');
    // several ways and none chosen for this meal yet: a pick
    if (s.meal && s.meal.until > gm()) return s.meal.run();
    let ch = opts[0];
    if (opts.length >= 2 && gm() - s.lastPick > 120) { s.lastPick = gm(); ch = await pick(g, 'You are hungry. How do you get something to eat?', opts.slice(0, 4)); if (ch?.open) { await modelTurn(g, 'choice'); return { ms: 4000 }; } }
    ch ||= opts[0];
    s.meal = { until: gm() + 45, run: ch.run };
    return ch.run();
  }
  async function takeFood(g, s, o, owner) {
    if (g.turnMove) return { ms: 700 };
    if (dist(posOf(g), o) > REACH) { const r = await approach(g, s, o); if (r.fail) { s.meal = null; return { ms: 2500 }; } return { ms: r.ms || 2500 }; }
    const r = await runLine(g, `take(${o.item}, ${o.type})`);
    if (r.ok && owner) { const i = inv(g), w = inv(owner), cost = Math.min(gold(g), price(o.item, owner)); i.gold = gold(g) - cost; w.gold = gold(owner) + cost; W().setBrainConfig(g.id, { inventory: i }); W().setBrainConfig(owner.id, { inventory: w }); say(g, `${g.id} buys ${o.item} from ${owner.id} for ${cost} gold (left in ${owner.id}'s ${nice(o.type)})`, false); }
    s.meal = null;
    return { ms: 2000 };
  }

  // ---------------------------------------------------------------- sleeping
  function bedFor(g, s) {
    const beds = things('bed');
    const mine = beds.filter(o => inPlace(s.home, o.x, o.z));
    const free = o => !state.characters.some(c => c !== g && c.pose?.on === o.mesh);
    return nearest(g, mine.filter(free)) || nearest(g, beds.filter(o => free(o) && dist(posOf(g), o) < 14));
  }
  async function bedtime(g, s) {
    if (g.pose?.mode === 'lie') { setDoing(g, s, 'asleep'); return { ms: rnd(5000, 8000) }; }
    const bed = bedFor(g, s);
    setDoing(g, s, bed ? 'going home to bed' : 'settling down for the night');
    if (!bed) { const h = s.home && spotIn(s.home, g); if (h && !inPlace(s.home, posOf(g).x, posOf(g).z)) { const r = await goTo(g, s, h.x, h.z, 'home'); return { ms: r.ms || 3000 }; } return { ms: 8000 }; }
    const r = await goDo(g, s, bed, `use(${bed.type})`);
    if (r.done) setDoing(g, s, 'asleep');
    return { ms: r.ms || 4000 };
  }
  function wake(g, s) { if (g.pose?.mode === 'lie') { U().standUp(g); say(g, `${g.id} gets up`, false); } }

  // ---------------------------------------------------------------- the evening
  async function evening(g, s) {
    const tav = places().find(p => p.kind === 'tavern') || places().find(p => p.kind === 'square');
    setDoing(g, s, tav ? `spending the evening at the ${tav.id}` : 'resting after work');
    if (tav && !inPlace(tav, posOf(g).x, posOf(g).z)) { if (!s.sub.eve) s.sub.eve = spotIn(tav, g); const r = await goTo(g, s, s.sub.eve.x, s.sub.eve.z, 'the ' + tav.id); if (!r.fail) return { ms: r.ms || 3000 }; }
    s.sub.eve = null;
    // the social window: a word with someone near, now and then, about ONE
    // concrete thing from the day (topicFor), each topic once per pair; not
    // while another pair talks nearby or right after its own talk (tablefolkTalk)
    const near = nearPeople(g, 4).filter(c => c !== state.playerAvatar);
    if (near.length && gm() - s.lastSocial >= 60 && Math.random() < .45 && brainOk() && window.tablefolkLive?.quiet?.() !== false && window.tablefolkTalk?.mayStart?.(g.id) !== false) {
      const x = near[Math.floor(Math.random() * near.length)], tp = topicFor(g, x);
      s.lastSocial = gm();
      if (tp) {
        s.social = true;
        const cfg = W().getBrainConfig(g.id);
        W().setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat([`(Evening at the ${tav?.id || 'square'}, ${x.id} beside you. ${tp} Say it to ${x.id} in one or two sentences of your own.)`]).slice(-5) });
        try { await modelTurn(g, 'social'); } finally { s.social = false; }
        return { ms: 6000 };
      }
    }
    if (!g.pose && Math.random() < .4) { const seat = nearest(g, things('seat').filter(o => dist(posOf(g), o) < 5 && !state.characters.some(c => c.pose?.on === o.mesh))); if (seat) { await runLine(g, `use(${seat.type})`); return { ms: 9000 }; } }
    return { ms: rnd(5000, 9000) };
  }

  // ONE thing to talk about with x, from the day's log: "Tell x about: ..."
  // (its own doings, the village's news) or "Ask x about: ..." (x's own);
  // a topic about x is never told to x as news; each topic once per pair
  const TOPIC_USED = new Set();
  const PREF = { raid: 0, quarrel: 1, insult: 1, short: 2, event: 2, made: 3, sold: 3, bought: 4, news: 4 };
  function topicFor(g, x) {
    const t = gm(), pair = [g.id, x.id].sort().join('|'), fresh = n => t - n.at < 1440 && !TOPIC_USED.has(pair + '|' + n.id);
    const you = text => String(text).replace(new RegExp('\\b' + esc(g.id) + '\\b', 'g'), 'you').replace(/^you\b/, 'You');
    const byPref = l => l.slice().sort((a, b) => (PREF[a.kind] ?? 5) - (PREF[b.kind] ?? 5) || b.at - a.at);
    const pool = NEWS.filter(fresh);
    const tell = byPref(pool.filter(n => !n.about.includes(x.id)))[0];
    const ask = byPref(pool.filter(n => n.about.includes(x.id) && !n.about.includes(g.id) && n.kind !== 'insult'))[0];
    // its own news first, then the village's, then a question about the other's day
    const own = byPref(pool.filter(n => n.about.includes(g.id) && !n.about.includes(x.id)))[0];
    const n = own || tell || ask;
    if (n) { TOPIC_USED.add(pair + '|' + n.id); return n === ask ? `Ask ${x.id} about: ${String(n.text).replace(/[.!]+$/, '')}.` : `Tell ${x.id} about: ${you(n.text).replace(/[.!]+$/, '')}.`; }
    // nothing logged: its own day, once a day per pair
    const k = K()?.now()?.day || 0, key = pair + '|day' + k + '|' + g.id, day = todayLine(s0(g));
    if (day !== 'nothing yet' && !TOPIC_USED.has(key)) { TOPIC_USED.add(key); return `Tell ${x.id} about: today you ${day}.`; }
    return '';
  }
  const s0 = g => g._job || S(g);

  // ---------------------------------------------------------------- threats (threats.js lists the raiders)
  const fighter = (g, j) => !!(j?.fights || /guard|soldier|knight|hunter|warrior/i.test(j?.id || ''));
  async function threatened(g, s, j) {
    const T = window.tablefolkThreats, raiders = T?.active?.() || []; if (!raiders.length) return null;
    const cfg = W().getBrainConfig(g.id);
    if (fighter(g, j)) {
      const near = raiders.slice().sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)))[0];
      if (g.pose) U().standUp(g);
      // go after them: hostility to each raider (lethal: they are monsters); live.js fights from 8 cells
      const h = { ...(cfg.hostileTo || {}) }; for (const r of raiders) h[r.id] ??= Date.now();
      W().setBrainConfig(g.id, { hostileTo: h });
      if (!cfg.wielding) { const w = (inv(g).items || []).map(i => window.tablefolkCombat?.weaponFor?.(i.name) && i.name).find(Boolean); if (w) await runLine(g, `wield(${w})`); }
      setDoing(g, s, `going after the ${T.label?.(near) || near.id}`);
      if (dist(posOf(near), posOf(g)) > 6) { const r = await goTo(g, s, posOf(near).x, posOf(near).z, near.id); return { ms: Math.min(r.ms || 2000, 2500) }; }
      return { ms: 1500 };
    }
    if (!raiders.some(r => T.scares?.(r))) return null;
    // the rest go home and stay in until the all-clear
    const home = s.home || placeAt(s.start.x, s.start.z) || places().find(p => !['square', 'pond', 'garden'].includes(p.kind) && p.x0 != null);
    if (home && inPlace(home, posOf(g).x, posOf(g).z)) { setDoing(g, s, 'hiding indoors'); return { ms: 4000 }; }
    setDoing(g, s, 'running home to hide');
    if (g.pose) U().standUp(g, true);
    const spot = home ? spotIn(home, g) : null;
    if (spot) { const r = await goTo(g, s, spot.x, spot.z, 'home'); return { ms: Math.min(r.ms || 2000, 3000) }; }
    return null;
  }

  // ---------------------------------------------------------------- one tick (live.js)
  const inHours = (h, [a, b]) => a <= b ? h >= a && h < b : h >= a || h < b;
  async function tick(g) {
    const j = jobOf(g); if (!j) return { ms: 5000 };
    const s = S(g); s.ticks++;
    const h = K()?.hour() ?? 10, m = M()?.mindOf?.(g);
    // in danger and no fighter: the game's reflexes (or the model) as before
    const foes = M()?.foes?.(g, 4) || [];
    if (foes.length && !fighter(g, j)) { await modelTurn(g, 'danger'); return { ms: 1800 }; }
    const th = await threatened(g, s, j); if (th) return th;
    // a word to say (mind.js speechCause): an answer to a want, a temper, a warning; at most one an hour
    const cause = M()?.speechCause?.(g);
    if (cause && cause !== 'news' && cause !== 'ask' && gm() - (s.lastCause ?? -999) >= 60 && nearPeople(g).length) { s.lastCause = gm(); await modelTurn(g, 'cause'); return { ms: 5000 }; }
    // its own ask (out of materials, hungry with nothing to buy): one line, at the person
    if (s.ask && s.ask.until > gm() && !s.ask.said && gm() - (s.lastCause ?? -999) >= 60 && nearPeople(g, 5).some(c => c.id === s.ask.who || !s.ask.who)) { s.ask.said = true; s.lastCause = gm(); await modelTurn(g, 'cause'); return { ms: 5000 }; }
    const sleepH = j.sleep || (j.watch === 'night' ? [9, 16] : [21, 5]), workH = j.hours || [7, 17];
    const asleep = inHours(h, sleepH);
    if (!asleep && g.pose?.mode === 'lie') wake(g, s);
    // hungry (or weak): eat first, awake
    if (!asleep && (m?.hunger ?? 0) >= .55) { const r = await eat(g, s); if (r) return r; }
    if (asleep) return bedtime(g, s);
    if (M()?.weak?.(g)) { setDoing(g, s, 'too weak to work'); return idleAt(g, s, s.home); }
    // an agenda from the scenario: an open turn now and then, so its story moves
    const a = agentOf(g), cfg = W().getBrainConfig(g.id);
    if ((cfg.agenda || cfg.quest || a.goal) && s.ticks % 3 === 0 && gm() - s.lastOpen >= 120) { s.lastOpen = gm(); await modelTurn(g, 'agenda'); return { ms: 5000 }; }
    if (inHours(h, workH)) return work(g, s, j);
    if (h >= 17 && h < 21 || (j.watch === 'night' && inHours(h, [17, 21]))) return evening(g, s);
    // before work: about the house
    setDoing(g, s, 'about the house');
    return idleAt(g, s, s.home);
  }

  // something happened to it ([event] in pendingChat, nothing said to it): carry on, or react
  async function eventPick(g) {
    const cfg = W().getBrainConfig(g.id), s = S(g), j = jobOf(g);
    const events = (cfg.pendingChat || []).map(String);
    const approach = events.every(l => /\bcomes up to you\b/i.test(l)), pn = (document.getElementById('chatName')?.value.trim() || '').toLowerCase();
    // someone walking past is nothing to stop for; the player at its workplace is a stranger to greet
    const stranger = approach && !!pn && events.some(l => l.toLowerCase().includes(pn));
    if (approach && !stranger) { clearPending(g, cfg); return { ms: 2000 }; }
    if (gm() - s.lastEventPick < 30) { clearPending(g, cfg); return { ms: 3000 }; }
    s.lastEventPick = gm();
    const near = nearPeople(g, 6), other = near.find(c => c !== state.playerAvatar), pl = near.find(c => c === state.playerAvatar);
    const opts = [{ label: `carry on (${s.doing || 'what you were doing'})`, run: async () => { clearPending(g, cfg); return { ms: 2500 }; } }];
    if (stranger && pl) opts.unshift({ label: `greet ${nameOf(pl)}${j?.steps?.some(x => x.sell || x.serve) ? ' and offer your wares' : ''}`, run: async () => { await modelTurn(g, 'event'); return { ms: 4000 }; } });
    // (only the one it happened to has something to say about it: everyone near reacting filled the room with talk)
    else if (events.some(l => /\byour?\b/i.test(l)) && ((other && window.tablefolkTalk?.mayStart?.(g.id) !== false) || pl)) opts.unshift({ label: `say something about it to ${nameOf(other && window.tablefolkTalk?.mayStart?.(g.id) !== false ? other : pl)}`, run: async () => { await modelTurn(g, 'event'); return { ms: 4000 }; } });
    const what = stranger ? events[0].replace(/^\(|\)$/g, '') : events.map(l => l.replace(/^\s*\[event\]\s*/, '')).join(' ');
    const ch = await pick(g, `${what}\nWhat do you do?`, opts);
    if (ch?.open) { await modelTurn(g, 'event'); return { ms: 4000 }; }
    return (ch || opts[opts.length - 1]).run();
  }
  function clearPending(g, cfg) {
    const lines = (cfg.pendingChat || []).map(l => /^\s*\[event\]/.test(String(l)) ? '[happened] ' + String(l).replace(/^\s*\[event\]\s*/, '') : String(l));
    if (lines.length) W().setBrainConfig(g.id, { pendingChat: [], messages: (cfg.messages || []).concat([{ role: 'user', content: lines.join('\n') }]).slice(-40) });
  }

  // mind.js speechCause: the evening's talk, its own ask
  function speechCause(g) {
    const s = g._job; if (!s || !handles(g)) return '';
    if (s.social) return 'social';
    if (s.ask && s.ask.until > gm()) return 'ask';
    return '';
  }
  // what it asks for, on the card (an ask turn)
  // (worded with no "ask X": E2B wrote ask(grub) as a command)
  function askLine(g) { const s = g._job; return s?.ask && s.ask.until > gm() ? `You need ${s.ask.item} and have none: say so to ${s.ask.who || 'someone nearby'}, in your own words.` : ''; }
  function stats() { const out = {}; for (const g of state.characters) if (g._job) out[g.id] = { job: jobOf(g)?.id, cycles: g._job.cycles, did: g._job.did, doing: g._job.doing }; return out; }
  window.tablefolkJobs = { load, register, resetPackaged, jobOf, handles, tick, eventPick, cardLine, askLine, speechCause, doing: g => g?._job?.doing || '', stats, news: () => NEWS.slice(), addNews, price, registry: REG, places: { placeAt, placeNamed, inPlace, spotIn }, walkTo, gm };
})();
