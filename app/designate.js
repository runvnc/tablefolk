/* designate.js -- designations: the player (or code, a package, the director,
 * a demand) marks squares for work, and characters whose job allows take the
 * work by code: walk there, fetch materials, do it, square by square.
 * The rules are orders-core.js (a job board: priorities, claims, cancelling);
 * squares from words or relations come from plan-core.js; this file is the
 * game's side: the kinds, the workers, the ghost overlay, the Mark tool.
 *
 * Kinds (core; a package adds more with "designations"):
 *   wall, fence     ring/line   a wall (a door at the gate) / a fence (an opening at the gate)
 *   dig             rect        through walls and rock, else a pit; "under" a building: a cellar pit
 *   stockpile       rect        the ground cleared; when done, a crate (a store) and a place "stockpile N"
 *   farm            rect        tilled earth, a crop (tall_grass: wheat) on every other square
 *   clear           rect        trees, rocks and clutter removed (firewood and stone to the worker)
 *   guard           posts       standing: a fighter stands watch at the post served longest ago
 *   patrol          path        standing: the watch walks the route's waypoints in turn
 * A kind: { label, shape: ring|line|rect|posts|path|cells, color, jobs: ['*'] | [job ids], fighters,
 *   needs: { stone: 1 } (fetched per square: the job's fallbacks gather or buy it), maxWorkers,
 *   work: { build: type, gate: type | null, dig, clear, paint: material, crop: type, stand: minutes,
 *           anim, time (seconds), say } | run(g, cell, ctx) (code: a job step result),
 *   done(d, ctx) (all squares done), standing,
 *   ground: 'rock' (walls and rocks can be marked, none need be reachable) | 'floor' (any walkable floor:
 *     roads, paved and painted squares, inside walled rooms) | default (open ground, as the core kinds),
 *   accept(x, z) -> true | 'why not' (the Mark tool's test of each square), ready(cell, d) -> bool (workers
 *     pass over a square until it is: rock with no open side yet) }.
 * A designation: orders-core board entries plus "section" (the map it belongs to).
 * Who works: on rails, jobs.js tick asks workFor(g) in the job's hours, before its own steps (the
 * highest priority open designation it may take, the nearest square); above rails, open work shows
 * among the activities (agency.js addOptions) and the character chooses it or not.
 * The Mark tool (the power bar's "Mark"): pick a kind and drag on the ground (ring kinds: the
 * outline; posts and routes: click squares, then Mark it), or type what you want ("a wall around
 * the garden with a gate toward the road"): code reads the words (plan-core parseWords), the loaded
 * brain fills the plan from the list of places when there is one (thinking off; a small brain
 * names only targets and numbers, code keeps the sides, and asks "which side?" when the words
 * say "behind"), the squares show as a ghost, and the player marks it or cancels. Works with no model.
 *
 *   window.tablefolkDesignate = { add(spec), addPlan(plan, opts), cancel(id), list(), get(id), setPriority(id, p),
 *     kinds(), registerKind(id, def, from), resetPackaged(), workFor(g, s, j), options(g, s, j), planWords(text),
 *     gameMap(), ghost(cells, color), openTool(), board }
 *   event 'tablefolk-designation' { id, kind, status, done, total, by }
 * Loaded after jobs.js, agency.js and powers.js; uses app.js globals.
 */
(function () {
  const PC = () => window.TablefolkPlanCore, OC = () => window.TablefolkOrdersCore;
  const J = () => window.tablefolkJobs, K = () => J()?.kit;
  const gm = () => J()?.gm?.() ?? (performance.now() / 1000);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = t => String(t || '').replace(/_/g, ' ');
  const posOf = g => g.logicalPos || g.root.position;
  const section = () => window.tablefolkScenario?.section || '';
  const toast = (t, type) => window.tablefolkToast?.(t, { type: type || 'info' });
  const KINDS = new Map();
  const CORE = {
    wall: { label: 'wall', shape: 'ring', color: '#a7b0bb', h: .45, jobs: ['*'], maxWorkers: 3, work: { build: 'wall', gate: 'door', anim: 'hammer', time: 3, verb: 'builds a stretch of wall' } },
    fence: { label: 'fence', shape: 'ring', color: '#c49a5a', h: .3, jobs: ['*'], maxWorkers: 3, work: { build: 'fence', gate: null, anim: 'hammer', time: 2, verb: 'puts up a fence post' } },
    dig: { label: 'dig', shape: 'rect', color: '#8a5a32', jobs: ['*'], maxWorkers: 3, work: { dig: true, anim: 'dig', time: 3, verb: 'digs' } },
    stockpile: { label: 'stockpile', shape: 'rect', color: '#e0b84c', jobs: ['*'], maxWorkers: 2, work: { paint: 'dirt', anim: 'pickup', time: 1, verb: 'clears ground for the stockpile' }, done: 'stockpile' },
    farm: { label: 'farm plot', shape: 'rect', color: '#86c04e', jobs: ['farmer', 'labourer', 'herder', '*'], maxWorkers: 3, work: { paint: 'dirt', crop: 'tall_grass', anim: 'dig', time: 2, verb: 'tills the soil' } },
    clear: { label: 'clear', shape: 'rect', color: '#e2704e', jobs: ['*'], maxWorkers: 3, work: { clear: true, anim: 'chop', time: 3, verb: 'clears away' } },
    guard: { label: 'guard post', shape: 'posts', color: '#5596e6', jobs: ['guard'], fighters: true, standing: true, maxWorkers: 0, work: { stand: 45, verb: 'stands watch' } },
    patrol: { label: 'patrol route', shape: 'path', color: '#4fd2e2', jobs: ['guard'], fighters: true, standing: true, maxWorkers: 2, work: { stand: 2, verb: 'walks the patrol route' } },
  };
  for (const [k, d] of Object.entries(CORE)) KINDS.set(k, { ...d, id: k, from: null });
  function registerKind(id, def = {}, from = null) {
    const k = String(id).toLowerCase().replace(/[^a-z0-9_]/g, '_'); if (!k) throw new Error('a designation kind needs an id');
    const base = CORE[def.like] || {};
    KINDS.set(k, { ...base, ...def, id: k, label: def.label || base.label || nice(k), shape: PC().SHAPES.includes(def.shape) ? def.shape : base.shape || 'rect', color: def.color || base.color || '#d0a0e0', jobs: def.jobs || base.jobs || ['*'], work: def.work || base.work || {}, from });
    return KINDS.get(k);
  }
  const verbsForPlan = () => Object.fromEntries([...KINDS.values()].filter(k => !CORE[k.id]).map(k => [k.id, { label: k.label, shape: k.shape, what: k.description || k.label }]));
  function resetPackaged() { for (const [k, d] of [...KINDS]) if (d.from) KINDS.delete(k); }

  // ---------------------------------------------------------------- the board
  const board = OC().createBoard({ now: gm });
  const emit = (d, extra = {}) => { const p = board.progress(d); dispatchEvent(new CustomEvent('tablefolk-designation', { detail: { id: d.id, kind: d.kind, status: d.status, done: p.done, total: p.total, by: d.by, ...extra } })); };
  function add(spec) {
    const kind = KINDS.get(spec.kind); if (!kind) throw new Error(`no designation kind "${spec.kind}" (${[...KINDS.keys()].join(', ')})`);
    const d = board.add({ maxWorkers: kind.maxWorkers, standing: !!kind.standing, label: kind.label, ...spec });
    d.section = spec.section ?? section();
    if (d.kind === 'patrol') d.cells.forEach((c, i) => { c.served = -1e9 + i; });
    draw(); emit(d, { added: true });
    return d;
  }
  // a plan (plan-core) on this map -> a designation (or the reason it cannot be)
  function addPlan(plan, opts = {}) {
    const map = gameMap(), r = PC().plan(plan, map, verbsForPlan());
    if (r.error || !r.ok) return { error: r.error || r.warnings?.[0] || 'no squares', warnings: r.warnings };
    const kind = KINDS.get(r.verb) ? r.verb : (opts.kind || 'mark');
    if (!KINDS.get(kind)) return { error: `no designation kind "${r.verb}"` };
    const cells = r.cells.map(c => PC().toBoard(map, c)), gate = r.gate ? PC().toBoard(map, r.gate) : null;
    const d = add({ kind, cells, gate, priority: opts.priority, who: opts.who ?? plan.who ?? null, by: opts.by || 'player', text: PC().describe(plan, r), plan, from: opts.from || null });
    return { d, warnings: r.warnings };
  }
  function cancel(id) {
    const d = board.get(id); if (!d) return false;
    for (const w of board.cancel(id)) { const g = state.characters.find(c => c.id === w); if (g?._job) { g._job.dz = null; K()?.setDoing?.(g, g._job, ''); } }
    board.remove(id); draw(); emit(d); return true;
  }

  // ---------------------------------------------------------------- the map as plan-core sees it
  const TREE = /tree|pine|oak|birch|willow|bush|fern/, ROCK = /rock|boulder|crystal|stalag/, CROP = /^(tall_grass|pumpkin|wheat|crop)/;
  const BUILDING = /^(house|fantasy_house|stable|windmill|bell_tower|watch_tower|inn|stone_house|tall_house|mill_house|sawmill|blacksmith|barracks|gazebo|barn|big_barn|small_barn|open_barn|silo|silo_barn|chicken_coop|stone_windmill|tent)$/;
  function gameMap() {
    const W = WORLD.cols, H = WORLD.rows, cx = Math.floor((W - 1) / 2), cz = Math.floor((H - 1) / 2);
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    const at = (x, z) => { const c = cx - Math.round(x), r = Math.round(z) + cz; return g[r] && g[r][c] !== undefined ? [r, c] : null; };
    const put = (x, z, ch, over = '.') => { const p = at(x, z); if (p && (over === '*' || over.includes(g[p[0]][p[1]]))) g[p[0]][p[1]] = ch; };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const x = cx - c, z = r - cz;
      if (!hasGroundAt(x, z)) { g[r][c] = '~'; continue; }
      const pt = paintAt(x, z);
      if (pt) g[r][c] = PAINT_MATERIALS[pt.mat]?.blocks ? '~' : pt.mat === 'dirt' ? ':' : (pt.mat === 'stone' || pt.mat === 'flagstone') ? '=' : '.';
    }
    for (const b of state.blocks) { if (!b || b.isDisposed?.()) continue; const mm = meta(b); if (mm?.type === 'wall') put(b.position.x, b.position.z, '#', '*'); else if (mm?.type === 'door') put(b.position.x, b.position.z, '+', '*'); }
    for (const o of getObjects()) {
      const t = o.type; if (!t || t === 'wall' || t === 'door') continue;
      const mm = meta(o.mesh) || {};
      if (BUILDING.test(t) || (mm.foot && mm.foot[0] >= 1 && mm.foot[1] >= 1 && !TREE.test(t))) { const fx = mm.foot ? mm.foot[0] : 1, fz = mm.foot ? mm.foot[1] : 1; for (let x = Math.ceil(o.x - fx); x <= Math.floor(o.x + fx); x++) for (let z = Math.ceil(o.z - fz); z <= Math.floor(o.z + fz); z++) put(x, z, 'H', '.:=*%rxf'); continue; }
      if (TREE.test(t)) put(o.x, o.z, '%', '.:');
      else if (ROCK.test(t)) put(o.x, o.z, 'r', '.:');
      else if (/fence/.test(t)) put(o.x, o.z, 'f', '.:');
      else if (CROP.test(t)) put(o.x, o.z, '*', '.:');
      else if (isBlocked(o.x, o.z)) put(o.x, o.z, 'x', '.:=');
    }
    const places = [];
    for (const p of state.places || []) {
      if (p.x0 == null || !p.id) continue;
      const [ya, xa] = at(p.x1, p.z0) || [Math.max(0, Math.round(p.z0) + cz), Math.max(0, cx - Math.round(p.x1))], [yb, xb] = at(p.x0, p.z1) || [Math.min(H - 1, Math.round(p.z1) + cz), Math.min(W - 1, cx - Math.round(p.x0))];
      const rect = [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)];
      const ring = PC().outline([rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]), walls = ring.filter(([x, y]) => g[y]?.[x] === '#' || g[y]?.[x] === '+').length;
      const pl = { id: String(p.id), kind: String(p.kind || p.id), rect };
      if (walls >= ring.length * .5) { pl.building = true; pl.outer = [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]; for (let y = rect[1]; y <= rect[3]; y++) for (let x = rect[0]; x <= rect[2]; x++) if (g[y]?.[x] !== undefined && g[y][x] !== '#') g[y][x] = 'o'; const dr = ring.find(([x, y]) => g[y]?.[x] === '+'); if (dr) pl.door = dr; }
      places.push(pl);
    }
    // characters with a name the player may use as a place ("around the elder")
    const map = { W, H, rows: g.map(r => r.join('')), places };
    PC().addRoads(map);   // a village's road arms as places ("the east road")
    return map;
  }

  // ---------------------------------------------------------------- the workers
  const groupsOf = id => window.tablefolkGroups?.of?.(id) || [];
  function mayDo(g, d, j) {
    if (d.status !== 'open' || (d.section || '') !== section()) return false;
    const kind = KINDS.get(d.kind); if (!kind) return false;
    j ||= J()?.jobOf?.(g);
    if (d.who) return [].concat(d.who).some(w => w === g.id || w === j?.id || groupsOf(g.id).includes(w));
    const fights = !!K()?.fighter?.(g, j);
    if (kind.fighters && fights) return true;
    const jobs = [].concat(kind.jobs || ['*']);
    return jobs.includes('*') || jobs.includes(j?.id);
  }
  // the next unit of designation work for g, or null (nothing it may take): { ms }
  async function workFor(g, s, j, { only = null } = {}) {
    if (!board.open().length) return null;
    const k = K(); if (!k) return null;
    s ||= k.S(g); j ||= J().jobOf(g);
    let h = board.claimOf(g.id);
    if (h && only && h.d.id !== only) { board.release(g.id); h = null; }
    if (!h) h = board.claim(g.id, { eligible: d => (!only || d.id === only) && mayDo(g, d, j), ready: readyCell, pos: posOf(g) });
    if (!h) return null;
    draw();
    let r; try { r = await unit(g, s, j, h); } catch (e) { console.warn('[designate]', g.id, e); r = { fail: e.message || String(e) }; }
    if (r.fail) { board.release(g.id, { fail: true, why: r.fail }); s.dz = null; console.info('[designate]', g.id, h.d.kind, h.cell.x, h.cell.z, 'failed:', r.fail); draw(); emit(h.d); return { ms: 1800 }; }
    if (r.done) {
      board.finish(g.id); s.dz = null; draw(); emit(h.d);
      if (h.d.status === 'done') finished(h.d);
      return { ms: r.ms || 1200 };
    }
    return { ms: r.ms || 1500 };
  }
  // a kind's ready(cell, d): a square it cannot work yet is passed over (rock with no open side to dig from)
  const readyCell = (d, c) => { const r = KINDS.get(d.kind)?.ready; if (typeof r !== 'function') return true; try { return !!r(c, d); } catch { return true; } };
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], nb8 = [...nb4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const openCell = (d, x, z) => d.cells.some(c => c.x === x && c.z === z && c.st !== 'done');
  // where to stand to work on a square: beside it (not on another square still to build), reachable
  function standFor(g, d, c, onIt) {
    if (onIt && cellPassable(c.x, c.z) && !occupantAt(c.x, c.z, g)) return { x: c.x, z: c.z };
    const p = posOf(g), from = new BABYLON.Vector3(p.x, 0, p.z);
    const cand = nb8.map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz })).filter(q => cellPassable(q.x, q.z) && !occupantAt(q.x, q.z, g))
      .sort((a, b) => (openCell(d, a.x, a.z) - openCell(d, b.x, b.z)) || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const q of cand) { if (Math.round(p.x) === q.x && Math.round(p.z) === q.z) return q; const r = findRoute(from, new BABYLON.Vector3(q.x, 0, q.z)); if (r?.length) return q; }
    return null;
  }
  async function unit(g, s, j, { d, cell: c }) {
    const k = K(), kind = KINDS.get(d.kind), w = kind.work || {};
    const key = d.id + ':' + c.x + ',' + c.z;
    if (!s.dz || s.dz.key !== key) s.dz = { key, phase: 'go', tries: 0 };
    const u = s.dz;
    if (g.turnMove) return { busy: true, ms: 700 };
    k.setDoing(g, s, `${w.verb || 'working on the ' + kind.label}${d.text ? '' : ''}`.replace(/^./, x => x));
    // materials first (the job's fallbacks gather or buy what is missing)
    if (kind.needs && !u.got) {
      const miss = Object.entries(kind.needs).find(([item, n]) => k.count(g, item) < n);
      if (!miss) u.got = true;
      else {
        const r = await k.doStep(g, s, j, { fetch: { [miss[0]]: miss[1] } });
        if (r?.need || r?.skip || r?.fail) { const fr = await k.fallback(g, s, j, r.need || { item: miss[0], n: miss[1] }); if (fr) { k.setDoing(g, s, `getting ${miss[0]} for the ${kind.label}`); return { busy: true, ms: fr.ms || 2500 }; } return { fail: `out of ${miss[0]}` }; }
        return { busy: true, ms: r?.ms || 2000 };
      }
    }
    // a package's own work in code
    if (typeof kind.run === 'function') {
      const ctx = { d, cell: c, kind, state: s, job: j, setDoing: t => k.setDoing(g, s, t), goTo: (x, z, label) => k.goTo(g, s, x, z, label || 'there'), runLine: line => k.runLine(g, line),
        build: (type, opts) => makeObject(type, c.x, c.z, opts || {}), paint: mat => setPaint([{ x: c.x, z: c.z, mat }]), remove: () => clearAt(g, c.x, c.z), api: window.tablefolkPackages?.api?.() };
      return (await kind.run(g, c, ctx)) || { done: true };
    }
    const isBuild = !!w.build, onIt = !!w.stand || (!isBuild && !w.dig && !w.clear);
    if (u.phase === 'go') {
      const st = u.stand && !occupantAt(u.stand.x, u.stand.z, g) ? u.stand : (u.stand = standFor(g, d, c, onIt));
      if (!st) return { fail: 'no way to get beside it' };
      const p = posOf(g);
      if (Math.round(p.x) !== st.x || Math.round(p.z) !== st.z) {
        if (++u.tries > 6) return { fail: 'could not get there' };
        if (!k.walkTo(g, st.x, st.z)) return { fail: 'no way there' };
        return { busy: true, ms: Math.min(9000, (g.turnMove?.dur || .6) * 1000 + 250) };
      }
      u.phase = 'work';
    }
    if (u.phase === 'work') {
      if (!onIt || w.stand) setCharacterFacing(g, new BABYLON.Vector3(Math.sign(c.x - posOf(g).x) || 0, 0, Math.sign(c.z - posOf(g).z) || (Math.sign(c.x - posOf(g).x) ? 0 : 1)));
      if (isBuild && occupantAt(c.x, c.z, g)) { if (++u.waits > 4) return { fail: 'someone is standing there' }; u.waits ||= 1; return { busy: true, ms: 1500 }; }
      if (w.stand) {
        // a post: face out from what it guards, look about; the watch moves on after "stand" game minutes
        u.since ??= gm(); u.looked ||= 0;
        if (!u.looked++) { try { say(g, `${g.id} ${d.kind === 'patrol' ? 'walks the round' : 'takes up the guard post'}`, false, { kind: 'routine' }); } catch {} }
        if (gm() - u.since >= (w.stand || 30)) return { done: true, ms: 800 };
        if (Math.random() < .3) { const dirs = Object.values(FACING_DIRS); setCharacterFacing(g, new BABYLON.Vector3(...dirs[Math.floor(Math.random() * dirs.length)])); }
        return { busy: true, ms: 4000 };
      }
      if (w.anim) { try { playRig(g, w.anim, true); } catch {} }
      u.phase = 'apply'; u.at = performance.now();
      return { busy: true, ms: (w.time || 2) * 1000 };
    }
    // apply
    try { playRig(g, 'idle', true); } catch {}
    const gate = !!c.gate;
    if (isBuild) {
      const type = gate ? w.gate : w.build;
      // (a yard wall: roofs.js and the building kit never make a house of what it encloses)
      if (type && !isBlocked(c.x, c.z)) { const m = makeObject(type, c.x, c.z, {}); if (m && meta(m)) meta(m).yard = true; }
      sayDid(g, gate ? (type ? `${g.id} hangs a ${nice(type)} in the ${kind.label}` : `${g.id} leaves a gap for the gate`) : `${g.id} ${w.verb || 'builds'}`);
    } else if (w.dig) {
      const t = thingAt(c.x, c.z, m => meta(m)?.type === 'wall' || ROCK.test(meta(m)?.type || ''));
      if (t) { const ty = meta(t)?.type; destroy(t); if (ROCK.test(ty || '')) giveTo(g, 'stone', 1); sayDid(g, `${g.id} digs through the ${nice(ty)}`); }
      else { pit(c.x, c.z); sayDid(g, `${g.id} digs a pit`); }
    } else if (w.clear) { const got = clearAt(g, c.x, c.z); sayDid(g, got ? `${g.id} clears away the ${got}` : `${g.id} clears the ground`); }
    if (w.paint && !w.dig) setPaint([{ x: c.x, z: c.z, mat: w.paint }]);
    if (w.crop && ((c.x + c.z) % 2 === 0) && !isBlocked(c.x, c.z) && !thingAt(c.x, c.z)) makeObject(w.crop, c.x, c.z, {});
    if (w.sound) window.tablefolkSfx?.play(w.sound, posOf(g));
    return { done: true, ms: 1000 };
  }
  let lastSaid = new Map();
  function sayDid(g, text) { const t = performance.now(); if (t - (lastSaid.get(g.id) || 0) < 15000) return; lastSaid.set(g.id, t); try { say(g, text, false, { kind: 'routine' }); } catch {} }
  function thingAt(x, z, test = () => true) { for (const m of state.props.concat(state.blocks)) { if (!m || m.isDisposed?.()) continue; const p = m.getAbsolutePosition?.() || m.position; if (Math.round(p.x) === x && Math.round(p.z) === z && meta(m)?.type && !['tile', 'hole', 'light'].includes(meta(m).type) && test(m)) return m; } return null; }
  function destroy(m) { disposeWorldObject(m); state.props = state.props.filter(x => x !== m); state.blocks = state.blocks.filter(x => x !== m); if (meta(m)?.tabletop || meta(m)?.type === 'wall') try { scheduleWallRebuild(); } catch {} }
  const CLUTTER = /tree|pine|oak|birch|willow|bush|fern|grass|flower|heather|rock|boulder|mushroom|log|stump|crate|barrel|cart|hay|sacks|bone|skull|pot|vase|bucket|broken/;
  function clearAt(g, x, z) {
    let got = null;
    for (let i = 0; i < 4; i++) {
      const t = thingAt(x, z, m => CLUTTER.test(meta(m)?.type || '') && !(meta(m)?.opts?.items?.length)); if (!t) break;
      const ty = meta(t).type; got = nice(ty); destroy(t);
      if (TREE.test(ty)) giveTo(g, 'firewood', 1); else if (ROCK.test(ty)) giveTo(g, 'stone', 1);
    }
    return got;
  }
  function giveTo(g, item, n) { try { window.tablefolkPackages?.api?.().give(g, item, n); } catch {} }
  function pit(x, z) {
    if (thingAt(x, z, m => meta(m)?.type === 'pit')) return;
    const m = BABYLON.MeshBuilder.CreateGround('pit', { width: .92, height: .92 }, state.scene);
    m.position.set(x, (state.terrainTopY ?? 0) + .012, z); m.material = state.materials.hole || null; m.isPickable = false;
    tag(m, 'hole', { interactive: false }); state.props.push(m);
  }
  // all squares done: the kind's finish (a stockpile becomes a store and a place), a package's done(d, ctx)
  let piles = 0;
  function finished(d) {
    const kind = KINDS.get(d.kind);
    try {
      if (kind.done === 'stockpile') {
        const xs = d.cells.map(c => c.x), zs = d.cells.map(c => c.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
        const mid = d.cells.slice().sort((a, b) => Math.hypot(a.x - (x0 + x1) / 2, a.z - (z0 + z1) / 2) - Math.hypot(b.x - (x0 + x1) / 2, b.z - (z0 + z1) / 2)).find(c => !isBlocked(c.x, c.z) && !occupantAt(c.x, c.z, null));
        if (mid) makeObject('crate', mid.x, mid.z, { items: [] });
        const id = 'stockpile' + (++piles > 1 ? ' ' + piles : '');
        (state.places ||= []).push({ id, kind: 'stockpile', x0, x1, z0, z1 });
      } else if (typeof kind.done === 'function') kind.done(d, { api: window.tablefolkPackages?.api?.(), cells: d.cells.map(c => ({ x: c.x, z: c.z })) });
    } catch (e) { console.warn('[designate] done', e); }
    try { window.tablefolkJobs?.addNews?.('player', `the ${d.text || d.label} is finished`, 'news'); } catch {}
    toast(`Finished: ${d.text || d.label}`, 'success');
  }

  // above rails: open work among the activities (agency.js addOptions)
  function options(g, s, j) {
    const out = [];
    for (const d of board.open()) {
      if (!mayDo(g, d, j)) continue;
      const p = board.progress(d), left = p.total - p.done; if (!left) continue;
      if (d.maxWorkers && p.working >= d.maxWorkers && board.claimOf(g.id)?.d !== d) continue;
      out.push({ key: 'mark:' + d.id, kind: 'mark', cmd: `work on the ${d.label}`, label: `work on ${d.text ? d.text.replace(/\s*\(.*$/, '') : 'the ' + d.label} (marked by ${d.by === 'player' ? 'the player' : d.by}; ${d.standing ? 'a standing post' : left + ' square' + (left > 1 ? 's' : '') + ' left'}${d.priority >= 4 ? ', urgent' : ''})`, doing: `working on the ${d.label}`,
        run: async (g2, s2, j2, a) => { a.cap ||= 90; const r = await workFor(g2, s2, j2, { only: d.id }); if (!r) { board.release(g2.id); return { done: true, text: `the ${d.label}` }; } return { busy: true, ms: r.ms }; } });
      if (out.length >= 2) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- the ghost overlay (game and tabletop views)
  const meshes = new Map();   // color|h|alpha -> mesh
  let preview = null, drawQ = false;
  function meshFor(color, h, alpha) {
    const key = color + '|' + h + '|' + alpha; let m = meshes.get(key);
    if (m && !m.isDisposed()) return m;
    m = BABYLON.MeshBuilder.CreateBox('designation_ghost', { width: .9, depth: .9, height: h }, state.scene);
    const mat = new BABYLON.StandardMaterial('designation_ghost_mat', state.scene), c = BABYLON.Color3.FromHexString(color);
    mat.diffuseColor = c; mat.emissiveColor = c.scale(.55); mat.specularColor = BABYLON.Color3.Black(); mat.alpha = alpha; mat.backFaceCulling = false;
    m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.metadata = { ghost: true };
    m.thinInstanceSetBuffer('matrix', new Float32Array(16), 16); m.isVisible = false;
    meshes.set(key, m); return m;
  }
  function draw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; try { drawNow(); } catch (e) { console.warn('[designate] draw', e); } }); }
  function drawNow() {
    if (!state.scene) return;
    const groups = new Map(), top = state.terrainTopY ?? 0;
    const push = (color, h, alpha, x, z) => { const k = color + '|' + h + '|' + alpha; if (!groups.has(k)) groups.set(k, { color, h, alpha, at: [] }); groups.get(k).at.push([x, z]); };
    for (const d of board.list()) {
      if (d.status !== 'open' || (d.section || '') !== section()) continue;
      const kind = KINDS.get(d.kind) || { color: '#cccccc' }, h = kind.h || .06;
      for (const c of d.cells) { if (c.st === 'done' && !d.standing) continue; push(c.st === 'blocked' ? '#d04040' : kind.color, c.gate ? .06 : h, c.st === 'claimed' ? .62 : .36, c.x, c.z); }
    }
    if (preview) for (const c of preview.cells) { const gate = preview.gate && c.x === preview.gate.x && c.z === preview.gate.z; push(gate ? '#f0d060' : preview.color, gate ? .06 : preview.h || .1, .55, c.x, c.z); }
    for (const [k, m] of meshes) if (!groups.has(k)) { m.thinInstanceCount = 0; m.isVisible = false; }
    for (const [, gr] of groups) {
      const m = meshFor(gr.color, gr.h, gr.alpha), buf = new Float32Array(gr.at.length * 16);
      gr.at.forEach(([x, z], i) => BABYLON.Matrix.Translation(x, top + gr.h / 2 + .015, z).copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, false); m.thinInstanceCount = gr.at.length; m.isVisible = gr.at.length > 0;
    }
  }
  function ghost(cells, color = '#ffe08a', h = .1, gate = null) { preview = cells && cells.length ? { cells, color, h, gate } : null; draw(); }

  // ---------------------------------------------------------------- words -> a plan (the brain when there is one, else code)
  const brainUsable = () => { try { return !!window.tablefolk?.brainReady?.() && window.tablefolkBrainInfo?.()?.engine !== 'none' && !new URLSearchParams(location.search).has('art') && !!window.tablefolkLLM; } catch { return false; } };
  async function ask(messages, max) {
    window.dispatchEvent(new CustomEvent('tablefolk-model-call', { detail: { agentId: 'player', kind: 'plan' } }));
    const r = await window.tablefolkLLM.chat.completions.create({ messages, max_tokens: max, temperature: 0, agentId: 'plan', thinking: false, priority: 2 });
    return r?.choices?.[0]?.message?.content || '';
  }
  async function planWords(text, { useBrain = true } = {}) {
    const map = gameMap(), verbs = verbsForPlan(), t0 = performance.now();
    const code = PC().parseWords(text, map.places, { verbs });
    let plan = { ...code.plan }, by = 'code', ask0 = code.ask, raw = null;
    if (useBrain && brainUsable()) {
      const small = (window.tablefolkMind?.tier?.(null) || 'basic') === 'basic';
      try {
        let verb = code.verb;
        if (!verb) { const a = PC().parseAnswer(await ask(PC().modelPrompt(text, map.places, { verbs }), 8)); const v = String(a?.verb || '').toLowerCase(); if (KINDS.has(v)) verb = v; }
        if (verb) {
          raw = await ask(PC().modelPrompt(text, map.places, { verb, small, verbs }), 90);
          const m = PC().parseAnswer(raw);
          if (m) { plan = PC().merge({ ...code.plan, verb }, m, { small, places: map.places }); by = small ? 'model (targets) + code (sides)' : 'model'; if (!small && (m.side || m.near)) ask0 = null; }
          else plan.verb = verb;
        }
      } catch (e) { console.warn('[designate] plan words', e); }
    }
    const missing = []; if (!plan.verb) missing.push('what to do');
    return { plan, by, ask: ask0, missing, raw, ms: Math.round(performance.now() - t0), map };
  }

  // ---------------------------------------------------------------- the Mark tool
  const B = () => window.tablefolkBar;
  let pending = null, priority = 3;
  const rectOf = (a, b) => { const out = []; for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) out.push({ x, z }); return out; };
  const ringOf = (a, b) => rectOf(a, b).filter(c => c.x === Math.min(a.x, b.x) || c.x === Math.max(a.x, b.x) || c.z === Math.min(a.z, b.z) || c.z === Math.max(a.z, b.z));
  function palette() {
    const ks = [...KINDS.values()], list = board.list().filter(d => d.status === 'open' && (d.section || '') === section());
    B().pick(`<span>Mark:</span>` + ks.map(k => `<button type="button" data-pick="k:${esc(k.id)}" title="${esc(k.description || k.label)}" style="border-left:3px solid ${esc(k.color)}">${esc(k.label)}</button>`).join('')
      + `<input id="tfMarkWords" type="text" placeholder="or say it: a wall around the garden, gate toward the road" /><button type="button" data-pick="words">plan it</button>`
      + (list.length ? `<span>marked:</span>` + list.map(d => { const p = board.progress(d); return `<button type="button" data-pick="x:${esc(d.id)}" title="cancel this">✕ ${esc(d.label)} ${d.standing ? '' : p.done + '/' + p.total}</button>`; }).join('') : '')
      + `<button type="button" data-pick="close">close</button>`,
      Object.fromEntries([...ks.map(k => ['k:' + k.id, () => drawTool(k.id)]), ...list.map(d => ['x:' + d.id, () => { cancel(d.id); palette(); }]),
        ['words', () => fromWords(document.getElementById('tfMarkWords')?.value)], ['enter', el => fromWords(el.value)], ['close', () => { B().pick(null); B().useTool(null); ghost(null); }], ['cancel', () => { B().pick(null); B().useTool(null); ghost(null); }]]));
    setTimeout(() => document.getElementById('tfMarkWords')?.focus(), 30);
  }
  function drawTool(kindId) {
    const kind = KINDS.get(kindId), shape = kind.shape, pts = [];
    const how = { ring: 'drag a rectangle to wall it in', line: 'drag a rectangle', rect: 'drag over the area', posts: 'click each post, then Mark it', path: 'click the route’s turns, then Mark it', cells: 'drag over the area' }[shape];
    B().pick(`<span style="color:${esc(kind.color)}">■</span><span>${esc(kind.label)}: ${how}</span><button type="button" data-pick="done" ${shape === 'posts' || shape === 'path' ? '' : 'hidden'}>Mark it</button><button type="button" data-pick="back">back</button>`,
      { done: () => { if (pts.length) confirm({ kind: kindId, cells: shape === 'path' ? routeCells(pts) : pts.slice(), plan: null, text: `${kind.label} (${pts.length} ${shape === 'path' ? 'turns' : 'posts'})` }); }, back: () => { B().useTool(null); ghost(null); palette(); }, cancel: () => { B().useTool(null); ghost(null); B().pick(null); } });
    let start = null;
    const cellsFor = (a, b) => shape === 'ring' ? ringOf(a, b) : rectOf(a, b);
    B().useTool({ mark: kindId,
      down: c => { if (shape !== 'posts' && shape !== 'path') start = c; },
      move: c => { if (start && c) ghost(cellsFor(start, c), kind.color, kind.h || .1); },
      up: c => { if (start && c) { const cells = cellsFor(start, c); start = null; B().useTool(null); confirm({ kind: kindId, cells, text: `${kind.label}, ${cells.length} squares` }); } },
      click: c => { if (!c) return; if (shape === 'posts' || shape === 'path') { pts.push(c); ghost(shape === 'path' ? routeCells(pts) : pts, kind.color, .3); } else { B().useTool(null); confirm({ kind: kindId, cells: [c], text: `${kind.label}, 1 square` }); } },
      cancel: () => { ghost(null); B().pick(null); } });
  }
  const routeCells = pts => { if (pts.length < 2) return pts.slice(); const map = gameMap(), out = []; for (let i = 0; i + 1 < pts.length; i++) { const seg = PC().line4(PC().fromBoard(map, pts[i].x, pts[i].z), PC().fromBoard(map, pts[i + 1].x, pts[i + 1].z)).map(c => PC().toBoard(map, c)); out.push(...(i ? seg.slice(1) : seg)); } return out.filter((c, i) => i % 3 === 0 || i === out.length - 1); };
  // check hand-drawn squares like a plan's (validate) and show them for the player to confirm
  function confirm({ kind, cells, gate = null, plan = null, text, warnings = [], by = 'player' }) {
    const map = gameMap(), k = KINDS.get(kind);
    const v = PC().validate({ verb: kind, shape: k.shape, cells: cells.map(c => PC().fromBoard(map, c.x, c.z)), gate: gate ? PC().fromBoard(map, gate.x, gate.z) : null, plan: plan || {} }, map, { kind, ground: k.ground });
    let keep = v.cells.map(c => PC().toBoard(map, c)); const warn = [...warnings, ...v.warnings];
    // a package kind's own test of each square (accept(x, z) -> true or the reason it cannot be marked)
    if (typeof k.accept === 'function') { const why = {}; keep = keep.filter(c => { let r = true; try { r = k.accept(c.x, c.z); } catch { r = 'not here'; } if (r === true) return true; why[r || 'not here'] = (why[r || 'not here'] || 0) + 1; return false; }); if (Object.keys(why).length) warn.push('left out ' + Object.entries(why).map(([w, n]) => `${n} square${n > 1 ? 's' : ''}: ${w}`).join('; ')); }
    if (!keep.length) { toast(`Nothing to mark there: ${warn[0] || 'no open squares'}`, 'warn'); ghost(null); palette(); return; }
    pending = { kind, cells: keep, gate, plan, text };
    ghost(keep, k.color, k.h || .12, gate);
    B().pick(`<span style="color:${esc(k.color)}">■</span><span>${esc(text || k.label)}</span><small>${keep.length} square${keep.length > 1 ? 's' : ''}${warn.length ? ' · ' + esc(warn.join('; ')) : ''}</small>`
      + `<select data-change="prio" title="priority">${[1, 2, 3, 4, 5].map(p => `<option value="${p}"${p === priority ? ' selected' : ''}>priority ${p}${p === 5 ? ' (urgent)' : p === 1 ? ' (when idle)' : ''}</option>`).join('')}</select>`
      + `<button type="button" class="go" data-pick="ok">Mark it</button><button type="button" data-pick="no">cancel</button>`,
      { prio: el => { priority = +el.value || 3; }, ok: () => { const d = add({ ...pending, priority, by }); pending = null; ghost(null); B().pick(null); toast(`Marked: ${d.text || d.label}. Workers will take it up.`); },
        no: () => { pending = null; ghost(null); palette(); }, cancel: () => { pending = null; ghost(null); B().pick(null); } });
  }
  async function fromWords(text) {
    text = String(text || '').trim(); if (!text) return;
    B().pick(`<span>Planning “${esc(text.slice(0, 60))}”…</span>`, {});
    const r = await planWords(text);
    if (r.ask === 'side') {
      const place = r.plan.near || r.plan.under || 'it';
      B().pick(`<span>Which side of the ${esc(place)}?</span>` + ['north', 'south', 'east', 'west', 'any'].map(s => `<button type="button" data-pick="${s}">${s}</button>`).join('') + `<button type="button" data-pick="back">back</button>`,
        Object.fromEntries([...['north', 'south', 'east', 'west', 'any'].map(s => [s, () => showPlan({ ...r.plan, side: s }, r)]), ['back', palette], ['cancel', () => B().pick(null)]]));
      return;
    }
    showPlan(r.plan, r);
  }
  function showPlan(plan, r) {
    if (!plan.verb) { toast('What should be done there? (a wall, a fence, dig, a stockpile, a farm plot, clear, guards, a patrol)', 'warn'); palette(); return; }
    const map = gameMap(), res = PC().plan(plan, map, verbsForPlan());
    if (res.error || !res.ok) { toast(`Cannot mark that: ${res.error || res.warnings?.[0]}`, 'warn'); palette(); return; }
    const kind = KINDS.has(res.verb) ? res.verb : null; if (!kind) { toast(`No designation kind "${res.verb}"`, 'warn'); palette(); return; }
    confirm({ kind, cells: res.cells.map(c => PC().toBoard(map, c)), gate: res.gate ? PC().toBoard(map, res.gate) : null, plan, text: PC().describe(plan, res) + (r?.by && r.by !== 'code' ? ` · planned by the ${r.by}` : ''), warnings: [] });
  }
  function openTool() { if (B().tool()?.mark || document.getElementById('tfPickBar')?.hidden === false && pending) { B().useTool(null); B().pick(null); ghost(null); return; } palette(); }

  // ---------------------------------------------------------------- the scenario's own marks; saving
  function loadScenario(scn) {
    board.clear(); piles = 0;
    for (const spec of scn?.designations || []) {
      try {
        if (spec.cells) add({ ...spec, by: spec.by || 'scenario' });
        else { const r = addPlan(spec.plan || spec, { priority: spec.priority, who: spec.who, by: spec.by || 'scenario' }); if (r.error) console.warn('[designate] scenario mark:', r.error); }
      } catch (e) { console.warn('[designate] scenario mark', e.message); }
    }
    draw();
  }
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) { draw(); return; }
    for (const [, m] of meshes) try { m.dispose(); } catch {} meshes.clear(); preview = null;
    setTimeout(() => loadScenario(window.tablefolkScenario?.active?.scn), 400);
  });
  addEventListener('tablefolk-section', () => draw());
  (window.tablefolkSaveHooks ||= {}).designations = { save: () => board.data(), restore: x => { if (x) { board.load(x); draw(); } } };
  // the bar's Mark button
  const mount = () => B()?.add({ id: 'mark', label: 'Mark', icon: '▦', title: 'Mark squares for work: walls, fences, digging, stockpiles, farm plots, clearing, guard posts, patrols (M)', order: 10, run: openTool, on: () => !!B().tool()?.mark });
  mount();
  addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && window.tablefolkScenario?.active && !window.TABLEFOLK_TABLETOP) { e.preventDefault(); openTool(); } });
  // above rails: open work among the activities
  window.tablefolkAgency?.addOptions?.(options);
  // on rails: marked work before a worker's own steps, in its hours
  window.tablefolkJobs?.addWork?.((g, s, j) => workFor(g, s, j));

  window.tablefolkDesignate = { add, addPlan, cancel, list: () => board.list(), get: id => board.get(id), setPriority: (id, p) => { const d = board.setPriority(id, p); draw(); return d; }, kinds: () => [...KINDS.values()], registerKind, resetPackaged,
    workFor, options, planWords, showPlan, gameMap, ghost, openTool, mayDo, board, draw };
})();
