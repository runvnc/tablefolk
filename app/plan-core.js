/* plan-core.js -- the plan language: what the player (or a brain, a package,
 * the world builder's agent) wants done on the map, said by RELATION, and the
 * code that turns it into squares. Shared by the game (designate.js), the
 * world builder's agent tools (server/worldgen-tools.js "plan") and the tests
 * (tools/plan-test.mjs). A classic script with no game globals: the browser
 * loads it in order, Bun and Node import it for its side effect
 * (globalThis.TablefolkPlanCore).
 *
 * Why relations: tools/spatial-eval (brains.md, "Spatial commands") measured
 * that every model names places and sides far better than it picks squares
 * (Bonsai 2 9B: 3% squares, 66% relations), and that a picture of the map
 * does not help. So the model sends a small JSON plan naming places from a
 * list, and this file finds the squares, checks them and returns them as
 * designations for the player to confirm.
 *
 * Coordinates here are the benchmark's: a map is { W, H, rows: [one glyph a
 * cell], places: [{ id, kind, rect: [x0, y0, x1, y1] inclusive, outer, door,
 * building, closed }] }, cells [x, y] with x east (column from the west edge)
 * and y south (row from the north edge). The game's board cell is
 *   x_board = floor((W-1)/2) - x,  z_board = y - floor((H-1)/2)
 * (toBoard / fromBoard). Glyphs: . open ground, : road, = paved square,
 * # building wall, + door, o inside a building, H closed building, ~ water,
 * B bridge, % tree, r rock, f fence, * crops, x a small object.
 *
 * A plan (one JSON object; unknown fields are ignored, unknown places fail):
 *   { "verb": "wall" | "fence",  "around": "<place>" | [...], "gate": "north" | {"toward": "<place>" | "road"} | "none" }
 *   { "verb": "wall" | "fence",  "between": ["<place>", "<place>"] }                  a line from one to the other
 *   { "verb": "dig",             "under": "<place>", "w": 2, "h": 2 }                 inside a building
 *   { "verb": "dig" | "stockpile" | "farm" | "clear" | "mark" | <package kind>,
 *                                "near": "<place>", "side": "north" | "northwest" | "any", "w": 4, "h": 3, "touch": "water" }
 *   { "verb": ..., "place": "<place>" }                                                the whole place
 *   { "verb": "clear",           "cluster": "trees" | "rocks", "near": "<place>", "side": "any" }
 *   { "verb": "guard",           "at": "<place>", "n": 2, "side": "east" | "around" | "any", "end": "west" }
 *   { "verb": "patrol",          "from": "<place>", "via": ["<place>"], "to": "<place>", "prefer": "road" | "short" }
 *   aliases: enclose/target = around, guard/cover = at, next_to/by = near, count = n, size: [w, h]
 *
 *   TablefolkPlanCore = {
 *     VERBS, SHAPES, resolve(plan, map) -> { verb, shape, cells, gate, rect, posts, path, error },
 *     validate(result, map, { kind }) -> { cells, dropped: [{ cell, why }], ok, warnings },
 *     plan(plan, map) -> resolve + validate in one, { ...result, cells, dropped, warnings }
 *     parseWords(text, places) -> { plan, verb, missing: [], ask: null | 'side' }   (code only: no model)
 *     modelPrompt(text, places, { verb, small }) -> messages; parseAnswer(text) -> object | null
 *     merge(codePlan, modelPlan, { small }) -> plan  (for small brains code keeps the sides)
 *     describe(plan, result) -> "a wall around the garden (24 squares), gate on the north side"
 *     mapFromScenario(scn, Procgen) -> map; placesText(map) -> "- garden (garden)\n..."
 *     toBoard(map, [x, y]) -> { x, z }; fromBoard(map, x, z) -> [x, y]; ctx(map) }
 */
(function (root) {
  const key = (x, y) => x + ',' + y;
  const SIDES = { n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w' };
  const SIDE_NAME = { n: 'north', s: 'south', e: 'east', w: 'west' };
  const sideOf = s => SIDES[String(s || '').toLowerCase().trim()] || null;
  const sidesOf = s => { const t = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); if (SIDES[t]) return [SIDES[t]]; const m = t.match(/^(north|south)(east|west)$/); return m ? [SIDES[m[1]], SIDES[m[2]]] : []; };
  const onSide = (r, o, s) => s === 'n' ? r[3] < o[1] : s === 's' ? r[1] > o[3] : s === 'w' ? r[2] < o[0] : r[0] > o[2];
  const gap = (a, b) => Math.max(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
  const bbox = cells => [Math.min(...cells.map(c => c[0])), Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[0])), Math.max(...cells.map(c => c[1]))];
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const distToCells = (c, cells) => cells.length ? Math.min(...cells.map(d => cheb(c, d))) : Infinity;
  const norm = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/_/g, ' ').trim();
  function line(a, b) { // Bresenham, 8-connected
    const out = []; let [x0, y0] = a; const [x1, y1] = b; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (let i = 0; i < 600; i++) { out.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return out;
  }
  // a 4-connected line (a wall must close: no diagonal gaps)
  function line4(a, b) { const out = []; let prev = null; for (const c of line(a, b)) { if (prev && prev[0] !== c[0] && prev[1] !== c[1]) out.push([c[0], prev[1]]); out.push(c); prev = c; } return out; }
  const outline = ([x0, y0, x1, y1]) => { const out = []; [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)]; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || y === y0 || y === y1) out.push([x, y]); return out; };

  function ctx(map) {
    const at = (x, y) => (y >= 0 && y < map.H && x >= 0 && x < map.W) ? map.rows[y][x] : null;
    const place = id => { const n = norm(id); if (!n) return null; return map.places.find(p => norm(p.id) === n) || map.places.find(p => norm(p.kind) === n) || map.places.find(p => norm(p.id).replace(/\s*\d+$/, '') === n) || null; };
    const outer = p => p.outer || p.rect;
    const rectCells = ([x0, y0, x1, y1]) => { const out = []; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]); return out; };
    const placeCells = p => rectCells(outer(p));
    const roadCells = () => { const out = []; for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (':='.includes(at(x, y)) || at(x, y) === 'B') out.push([x, y]); return out; };
    return { map, at, place, outer, rectCells, placeCells, roadCells };
  }

  // ---- what each verb is (a package kind names its shape: designate.js registerKind)
  const SHAPES = ['ring', 'line', 'rect', 'posts', 'path', 'cells'];
  const VERBS = {
    wall: { shape: 'ring', label: 'wall', what: 'build a stone wall' },
    fence: { shape: 'ring', label: 'fence', what: 'put up a fence' },
    dig: { shape: 'rect', label: 'dig', what: 'dig out (a pit, a cellar, through rock)' },
    stockpile: { shape: 'rect', label: 'stockpile', what: 'mark a stockpile where goods are stored' },
    farm: { shape: 'rect', label: 'farm plot', what: 'mark a farm plot to till and sow' },
    clear: { shape: 'rect', label: 'clear', what: 'clear trees, rocks and clutter' },
    guard: { shape: 'posts', label: 'guard post', what: 'post guards' },
    patrol: { shape: 'path', label: 'patrol route', what: 'a route for the watch' },
    mark: { shape: 'rect', label: 'mark', what: 'mark an area' },
  };
  const verbShape = (verb, extra) => (extra && extra[verb]?.shape) || VERBS[verb]?.shape || 'rect';

  // ---- relations -> squares (tools/spatial-eval/geom.mjs fromRelations, generalised)
  const passable = (ch, { trees = false } = {}) => '.:=+B*'.includes(ch) || (trees && ch === '%');
  function astar(C, starts, goals, { roadCost = 1, offCost = 1, trees = false, allowInside = [] }) {
    const { at } = C, G = new Set(goals.map(g => key(...g))), inside = new Set(allowInside.flatMap(p => C.placeCells(p)).map(c => key(...c)));
    const cost = (x, y) => { const ch = at(x, y); if (ch === null) return Infinity; if (inside.has(key(x, y)) && ch !== '#') return 1; if (!passable(ch, { trees })) return Infinity; return ':=B+'.includes(ch) ? roadCost : (ch === '%' ? offCost * 3 : offCost); };
    const dist = new Map(), prev = new Map(), open = [];
    for (const s of starts) { dist.set(key(...s), 0); open.push([0, s]); }
    let guard = 0;
    while (open.length && guard++ < 200000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, [x, y]] = open.splice(bi, 1)[0]; const k = key(x, y);
      if (d > (dist.get(k) ?? Infinity)) continue;
      if (G.has(k)) { const out = [[x, y]]; let q = k; while (prev.has(q)) { q = prev.get(q); out.unshift(q.split(',').map(Number)); } return out; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy, c = cost(nx, ny); if (!isFinite(c)) continue;
        if (dx && dy && (!isFinite(cost(x + dx, y)) || !isFinite(cost(x, y + dy)))) continue;
        const nd = d + c * (dx && dy ? 1.4 : 1), nk = key(nx, ny);
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, k); open.push([nd, [nx, ny]]); }
      }
    }
    return null;
  }
  const endsOf = (C, p) => p.door ? [p.door] : C.placeCells(p).filter(([x, y]) => passable(C.at(x, y)));
  const BLOCKS = '#+oH~B:=';   // a ring avoids these (buildings, water, roads)

  function ring(C, ids, gateSpec) {
    const need = id => { const p = C.place(id); if (!p) throw new Error(`unknown place "${id}"`); return p; };
    const box = bbox(ids.flatMap(id => C.placeCells(need(id))));
    const bad = ([x, y]) => { const ch = C.at(x, y); return ch === null || BLOCKS.includes(ch); };
    let best = null;
    // (a ring over a fence, trees or clutter costs half: it is left out or must be cleared first)
    const soft = ([x, y]) => 'f%rx'.includes(C.at(x, y));
    for (let m = 1; m <= 3; m++) { const r = outline([box[0] - m, box[1] - m, box[2] + m, box[3] + m]); const n = r.filter(bad).length + r.filter(soft).length * .5; if (!best || n < best.n) best = { r, n, m }; if (!n) break; }
    const cells = best.r, R = [box[0] - best.m, box[1] - best.m, box[2] + best.m, box[3] + best.m];
    let gate = null; const g = gateSpec;
    if (g === 'none' || g === false) return { cells, gate: null, rect: R };
    const corner = ([x, y]) => (x === R[0] || x === R[2]) && (y === R[1] || y === R[3]);
    const ok = c => C.at(...c) !== null && !'#oH~'.includes(C.at(...c)) && !corner(c);
    const pathFirst = (p, q) => (':+'.includes(C.at(...q)) ? 1 : 0) - (':+'.includes(C.at(...p)) ? 1 : 0);
    const s = sideOf(typeof g === 'string' ? g : g?.side);
    if (s) {
      const on = cells.filter(([x, y]) => s === 'n' ? y === R[1] : s === 's' ? y === R[3] : s === 'w' ? x === R[0] : x === R[2]).filter(ok);
      const mid = s === 'n' || s === 's' ? (R[0] + R[2]) / 2 : (R[1] + R[3]) / 2;
      on.sort((p, q) => pathFirst(p, q) || Math.abs((s === 'n' || s === 's' ? p[0] : p[1]) - mid) - Math.abs((s === 'n' || s === 's' ? q[0] : q[1]) - mid)); gate = on[0] || null;
    } else {
      // "toward" a place or the road; no gate named: toward the nearest road (code picks the side)
      let tw = typeof g === 'object' && g ? (g.toward ?? g.towards ?? g.to) : (typeof g === 'string' ? g.replace(/^toward(s)?:?\s*/i, '') : null);
      if (!tw) tw = 'road';
      const tc = /^(the )?roads?$/i.test(tw) ? C.roadCells() : C.placeCells(need(tw));
      if (tc.length) gate = cells.filter(ok).sort((p, q) => distToCells(p, tc) - distToCells(q, tc) || pathFirst(p, q))[0] || null;
      else { const on = cells.filter(ok); gate = on[Math.floor(on.length / 2)] || null; }
    }
    return { cells, gate, rect: R };
  }
  function between(C, a, b) {
    const pa = C.place(a), pb = C.place(b); if (!pa) throw new Error(`unknown place "${a}"`); if (!pb) throw new Error(`unknown place "${b}"`);
    const ca = C.placeCells(pa), cb = C.placeCells(pb);
    let best = null; for (const p of ca) for (const q of cb) { const d = cheb(p, q); if (!best || d < best.d) best = { p, q, d }; }
    const inside = new Set([...ca, ...cb].map(c => key(...c)));
    return { cells: line4(best.p, best.q).filter(c => !inside.has(key(...c))) };
  }
  function rect(C, a) {
    const need = id => { const p = C.place(id); if (!p) throw new Error(`unknown place "${id}"`); return p; };
    if (a.place) { const p = need(a.place); return { cells: C.rectCells(p.rect), rect: p.rect }; }
    if (a.cluster) {
      const cls = { tree: '%', trees: '%', wood: '%', woods: '%', water: '~', rock: 'r', rocks: 'r', crops: '*' }[String(a.cluster).toLowerCase()]; if (!cls) return { error: 'unknown cluster' };
      const p = a.near ? need(a.near) : null, pc = p ? C.placeCells(p) : [], s = sideOf(a.side), seen = new Set(), comps = [];
      for (let y = 0; y < C.map.H; y++) for (let x = 0; x < C.map.W; x++) { if (C.at(x, y) !== cls || seen.has(key(x, y))) continue; const comp = [], st = [[x, y]]; seen.add(key(x, y)); while (st.length) { const [cx, cy] = st.pop(); comp.push([cx, cy]); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, ny = cy + dy; if (C.at(nx, ny) === cls && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); st.push([nx, ny]); } } } comps.push(comp); }
      const o = p ? C.outer(p) : null, side = c => { if (!s || !o) return true; const b = bbox(c), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return s === 'n' ? cy < o[1] : s === 's' ? cy > o[3] : s === 'w' ? cx < o[0] : cx > o[2]; };
      const cand = comps.filter(c => c.length >= 2 && side(c)).sort((c1, c2) => Math.min(...c1.map(c => distToCells(c, pc))) - Math.min(...c2.map(c => distToCells(c, pc))));
      if (!cand.length) return { error: 'no ' + a.cluster + ' there' };
      return { cells: cand[0], rect: bbox(cand[0]) };
    }
    let w = +a.w || +a.width || (Array.isArray(a.size) ? +a.size[0] : 0), h = +a.h || +a.height || +a.depth || (Array.isArray(a.size) ? +a.size[1] : 0);
    if (!(w > 0) && !(h > 0)) { w = 3; h = 3; } else if (!(w > 0)) w = h; else if (!(h > 0)) h = w;
    w = Math.max(1, Math.min(30, Math.round(w))); h = Math.max(1, Math.min(30, Math.round(h)));
    const under = a.under || a.inside;
    if (under) { const p = need(under), r = p.rect; const cw = r[2] - r[0] + 1, ch = r[3] - r[1] + 1; let ww = Math.min(w, Math.max(cw, ch)), hh = h; if ((ww > cw || hh > ch) && hh <= cw && ww <= ch) [ww, hh] = [hh, ww]; ww = Math.min(ww, cw); hh = Math.min(hh, ch); const x0 = r[0] + Math.floor((cw - ww) / 2), y0 = r[1] + Math.floor((ch - hh) / 2); const rr = [x0, y0, x0 + ww - 1, y0 + hh - 1]; return { cells: C.rectCells(rr), rect: rr }; }
    const nearId = a.near ?? a.next_to ?? a.by ?? a.at;
    if (!nearId) return { error: 'no place named: say near which place' };
    const p = need(nearId), o = C.outer(p), ss = String(a.side || '').toLowerCase() === 'any' ? [] : sidesOf(a.side), water = /water|river|shore|bank/i.test(String(a.touch || ''));
    const okCell = (x, y) => C.at(x, y) === '.' || (a.verb === 'clear' && '.%rx'.includes(C.at(x, y)));
    const touches = (r, chs) => { for (let y = r[1] - 1; y <= r[3] + 1; y++) for (let x = r[0] - 1; x <= r[2] + 1; x++) { const edge = (x < r[0] || x > r[2]) !== (y < r[1] || y > r[3]); if (edge && chs.includes(C.at(x, y))) return true; } return false; };
    let best = null;
    for (const [ww, hh] of w === h ? [[w, h]] : [[w, h], [h, w]]) for (let y0 = 0; y0 + hh <= C.map.H; y0++) for (let x0 = 0; x0 + ww <= C.map.W; x0++) {
      const r = [x0, y0, x0 + ww - 1, y0 + hh - 1], gp = gap(r, o); if (gp < 1 || gp > 6) continue;
      if (!ss.every(s => onSide(r, o, s))) continue;
      let ok = true; for (let y = r[1]; y <= r[3] && ok; y++) for (let x = r[0]; x <= r[2]; x++) if (!okCell(x, y)) { ok = false; break; }
      if (!ok || (water && !touches(r, '~'))) continue;
      const score = gp * 100 + (touches(r, ':=') ? 250 : 0) + cheb([(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], [(o[0] + o[2]) / 2, (o[1] + o[3]) / 2]);
      if (!best || score < best.score) best = { r, score };
    }
    if (!best) return { error: `no free ${w} by ${h} space ${ss.length ? ss.map(s => SIDE_NAME[s]).join('-') + ' of' : 'near'} the ${p.id}` };
    return { cells: C.rectCells(best.r), rect: best.r };
  }
  function posts(C, a) {
    const id = a.at ?? a.guard ?? a.cover ?? a.target ?? a.near; const p = C.place(id); if (!p) throw new Error(`unknown place "${id}"`);
    const n = Math.max(1, Math.min(8, +a.n || +a.count || 2)), s = sideOf(a.side), e = sideOf(a.end);
    let pc = C.placeCells(p), o = C.outer(p);
    if (e) { const b = bbox(pc), lim = e === 'n' ? b[1] + 2 : e === 's' ? b[3] - 2 : e === 'w' ? b[0] + 2 : b[2] - 2; pc = pc.filter(([x, y]) => e === 'n' ? y <= lim : e === 's' ? y >= lim : e === 'w' ? x <= lim : x >= lim); o = bbox(pc); }
    const around = /around|all/i.test(String(a.side || ''));
    const near = useSide => { const out = []; for (let y = 0; y < C.map.H; y++) for (let x = 0; x < C.map.W; x++) { if (!'.:=*'.includes(C.at(x, y))) continue; const d = distToCells([x, y], pc); if (d < 1 || d > 3) continue; if (useSide && s && !(s === 'n' ? y < o[1] : s === 's' ? y > o[3] : s === 'w' ? x < o[0] : x > o[2])) continue; out.push([x, y, d]); } return out; };
    let cand = near(true); if (!cand.length) cand = near(false);
    if (!cand.length) return { error: 'no room for posts' };
    const picks = [], cx = (o[0] + o[2]) / 2, cy = (o[1] + o[3]) / 2;
    if (around) for (const q of ['n', 'e', 's', 'w', 'n', 'e', 's', 'w'].slice(0, n)) { const c = cand.filter(([x, y]) => (q === 'n' ? y < o[1] : q === 's' ? y > o[3] : q === 'w' ? x < o[0] : x > o[2]) && !picks.some(pk => cheb(pk, [x, y]) < 2)).sort((a1, b1) => a1[2] - b1[2] || Math.abs(a1[0] - cx) + Math.abs(a1[1] - cy) - Math.abs(b1[0] - cx) - Math.abs(b1[1] - cy))[0]; if (c) picks.push([c[0], c[1]]); }
    while (picks.length < n) { const c = cand.filter(([x, y]) => !picks.some(pk => cheb(pk, [x, y]) < 2)).sort((a1, b1) => (picks.length ? Math.min(...picks.map(pk => cheb(pk, b1))) - Math.min(...picks.map(pk => cheb(pk, a1))) : 0) * 0.5 + (a1[2] - b1[2]))[0]; if (!c) break; picks.push([c[0], c[1]]); }
    return { posts: picks, cells: picks };
  }
  function path(C, a) {
    const need = id => { const p = C.place(id); if (!p) throw new Error(`unknown place "${id}"`); return p; };
    const from = need(a.from), to = need(a.to ?? a.from), via = [].concat(a.via || []).filter(Boolean).map(need), road = !/short/i.test(String(a.prefer || 'road'));
    const stops = [from, ...via, to], cells = []; if (stops.length < 2 || (stops.length === 2 && from === to)) return { error: 'a route needs two places' };
    let cur = endsOf(C, from);
    for (let i = 1; i < stops.length; i++) {
      const goal = stops[i].door ? [stops[i].door] : C.placeCells(stops[i]).filter(([x, y]) => passable(C.at(x, y)));
      const seg = astar(C, cur, goal, { roadCost: 1, offCost: road ? 4 : 1, allowInside: [from, to] });
      if (!seg) return { error: `no way from the ${stops[i - 1].id} to the ${stops[i].id}` };
      cells.push(...(cells.length ? seg.slice(1) : seg)); cur = [seg[seg.length - 1]];
    }
    return { path: cells, cells };
  }

  // the plan's fields under their usual names (aliases from the benchmark and from what models write)
  function canon(plan0) {
    let a = plan0 && typeof plan0 === 'object' ? { ...plan0 } : {};
    // {"wall": {...}} / {"posts": {...}}: a wrapper named after the answer (Bonsai 2 9B's habit)
    const ks = Object.keys(a); if (ks.length === 1 && a[ks[0]] && typeof a[ks[0]] === 'object' && !Array.isArray(a[ks[0]])) a = { verb: ks[0], ...a[ks[0]] };
    if (a.area && typeof a.area === 'object') a = { ...a, ...a.area };
    let v = String(a.verb || a.kind || a.action || '').toLowerCase().trim();
    v = { walls: 'wall', 'wall in': 'wall', enclose: 'wall', fences: 'fence', pit: 'dig', cellar: 'dig', hole: 'dig', mine: 'dig', pile: 'stockpile', store: 'stockpile', field: 'farm', plot: 'farm', farm_plot: 'farm', 'farm plot': 'farm', guards: 'guard', post: 'guard', posts: 'guard', route: 'patrol', path: 'patrol', rect: 'mark', area: 'mark', chop: 'clear' }[v] || v;
    a.verb = v;
    if (a.enclose != null && a.around == null) a.around = a.enclose;
    if (a.target != null && a.around == null && (v === 'wall' || v === 'fence')) a.around = a.target;
    if (a.guard != null && a.at == null && typeof a.guard === 'string') a.at = a.guard;
    if (a.count != null && a.n == null) a.n = a.count;
    if (Array.isArray(a.size) && a.w == null) { a.w = a.size[0]; a.h = a.size[1]; }
    if (a.next_to != null && a.near == null) a.near = a.next_to;
    if (typeof a.gate === 'string' && /^toward/i.test(a.gate)) a.gate = { toward: a.gate.replace(/^toward(s)?:?\s*(the\s+)?/i, '') };
    return a;
  }

  function resolve(plan0, map, extra = {}) {
    const a = canon(plan0), C = ctx(map), verb = a.verb;
    if (!verb) return { error: 'no verb (what to do: ' + Object.keys(VERBS).join(', ') + ')' };
    const shape = a.shape && SHAPES.includes(a.shape) ? a.shape : verbShape(verb, extra);
    try {
      let r;
      if ((shape === 'ring' || shape === 'line') && Array.isArray(a.between) && a.between.length >= 2) r = { ...between(C, a.between[0], a.between[1]), shape: 'line' };
      else if (shape === 'ring') { const ids = [].concat(a.around ?? []).filter(Boolean); if (!ids.length) return { verb, shape, error: 'say what to put it around' }; r = { ...ring(C, ids, a.gate), shape }; }
      else if (shape === 'line') return { verb, shape, error: 'a line needs "between": [a, b]' };
      else if (shape === 'posts') r = { ...posts(C, a), shape };
      else if (shape === 'path') r = { ...path(C, a), shape };
      else if (shape === 'cells' && Array.isArray(a.cells)) r = { cells: a.cells.filter(c => Array.isArray(c) && c.length >= 2).map(c => [+c[0], +c[1]]), shape };
      else r = { ...rect(C, a), shape: 'rect' };
      return { verb, ...r, plan: a };
    } catch (e) { return { verb, shape, error: e.message || String(e), plan: a }; }
  }

  // ---- validation: in bounds, not on buildings or water, reachable by someone on foot
  const WHY = { '#': 'a building’s wall', '+': 'a door', o: 'inside a building', H: 'a building', '~': 'water', B: 'the bridge', '%': 'a tree (clear it first)', r: 'a rock (clear it first)', x: 'something stands there', f: 'a fence' };
  function mainland(C) {   // the largest walkable region (8-way)
    const seen = new Map(); let best = null, id = 0;
    for (let y = 0; y < C.map.H; y++) for (let x = 0; x < C.map.W; x++) {
      if (seen.has(key(x, y)) || !passable(C.at(x, y))) continue;
      const comp = new Set(), st = [[x, y]]; seen.set(key(x, y), ++id); comp.add(key(x, y));
      while (st.length) { const [cx, cy] = st.pop(); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy, k = key(nx, ny); if (seen.has(k) || !passable(C.at(nx, ny))) continue; seen.set(k, id); comp.add(k); st.push([nx, ny]); } }
      if (!best || comp.size > best.size) best = comp;
    }
    return best || new Set();
  }
  function validate(res, map, { kind } = {}) {
    if (!res || res.error) return { ok: false, cells: [], dropped: [], warnings: [res?.error || 'nothing to check'] };
    const C = ctx(map), verb = kind || res.verb, land = mainland(C), out = [], dropped = [];
    const allowed = verb === 'dig' && res.plan?.under ? '.:=*o' : verb === 'clear' ? '.:=*%rx' : verb === 'patrol' || verb === 'guard' ? '.:=*B+' : res.shape === 'ring' || res.shape === 'line' ? '.:=*' : '.*';
    const gateK = res.gate ? key(...res.gate) : null;
    for (const c of res.cells || []) {
      const ch = C.at(c[0], c[1]);
      if (ch === null) { dropped.push({ cell: c, why: 'off the map' }); continue; }
      if (!allowed.includes(ch) && key(...c) !== gateK) { dropped.push({ cell: c, why: WHY[ch] || (ch === ':' || ch === '=' ? 'a road' : 'not open ground') }); continue; }
      const reach = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => land.has(key(c[0] + dx, c[1] + dy)));
      if (!reach && !(verb === 'dig' && res.plan?.under)) { dropped.push({ cell: c, why: 'nobody can get there' }); continue; }
      out.push(c);
    }
    const warnings = [];
    if (dropped.length) { const by = {}; for (const d of dropped) by[d.why] = (by[d.why] || 0) + 1; warnings.push('left out ' + Object.entries(by).map(([w, n]) => `${n} square${n > 1 ? 's' : ''}: ${w}`).join('; ')); }
    return { ok: out.length > 0, cells: out, dropped, warnings };
  }
  function plan(p, map, extra) { const r = resolve(p, map, extra); if (r.error) return { ...r, cells: [], dropped: [], warnings: [r.error] }; const v = validate(r, map, { kind: r.verb }); return { ...r, cells: v.cells, dropped: v.dropped, warnings: v.warnings, ok: v.ok }; }

  // ---- words -> a plan, by code (no model; the floor for every brain and the side-picker for small ones)
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1, couple: 2, pair: 2, few: 3 };
  const num = w => /^\d+$/.test(w) ? +w : NUM[w] ?? null;
  const VERB_WORDS = [
    ['patrol', /\b(patrol|route|rounds|beat)\b/], ['guard', /\b(guards?|sentr(y|ies)|post|posts|station|watchmen|lookouts?)\b/],
    ['fence', /\bfenc(e|es|ed|ing)\b/], ['wall', /\b(walls?|wall in|palisade|rampart)\b/],
    ['dig', /\b(dig|digs|dug|cellar|pit|ditch|tunnel|mine out|excavate|hole)\b/], ['stockpile', /\b(stockpiles?|woodpile|store ?room|storage|pile)\b/],
    ['farm', /\b(farm|field|plot|garden bed|sow|plant|till|crops?)\b/], ['clear', /\b(clear|cut down|fell|chop down|remove the (trees|rocks))\b/],
  ];
  function findPlaces(text, places) {
    const t = ' ' + String(text).toLowerCase().replace(/_/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const names = [];
    // a kind names a place only when one place has it ("the tavern"; not "road" when there are four)
    const kinds = {}; for (const p of places) kinds[norm(p.kind)] = (kinds[norm(p.kind)] || 0) + 1;
    for (const p of places) for (const n of [norm(p.id), kinds[norm(p.kind)] === 1 ? norm(p.kind) : '']) if (n && n.length > 1) names.push({ n, p });
    names.sort((a, b) => b.n.length - a.n.length);
    const hits = [], used = [];
    for (const { n, p } of names) {
      let i = t.indexOf(' ' + n + ' ');
      while (i >= 0) { const s = i + 1, e = s + n.length; if (!used.some(([a, b]) => s < b && e > a)) { used.push([s, e]); if (!hits.some(h => h.p === p)) hits.push({ p, at: s, name: n }); } i = t.indexOf(' ' + n + ' ', i + 1); }
      // plural ("the houses") and "-s" names
      if (!hits.some(h => h.p === p)) { const j = t.indexOf(' ' + n + 's '); if (j >= 0 && !used.some(([a, b]) => j + 1 < b && j + 1 + n.length > a)) { used.push([j + 1, j + 2 + n.length]); hits.push({ p, at: j + 1, name: n }); } }
    }
    return hits.sort((a, b) => a.at - b.at);
  }
  function parseWords(text, places, { verbs = null } = {}) {
    let t = String(text || '').toLowerCase(), verb = null;
    const missing = [];
    // a package's kinds first (their label or id named in the words; the label's words are not places)
    for (const [id, d] of Object.entries(verbs || {})) { const n = norm(d.label || id); const re = n && new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b'); if (re && re.test(t)) { verb = id; t = t.replace(re, ' '); break; } }
    if (!verb) for (const [v, re] of VERB_WORDS) if (re.test(t)) { verb = v; break; }
    const hits = findPlaces(t, places || []), ids = hits.map(h => h.p.id);
    const plan = { verb };
    const sideWord = m => m && m[1].replace(/[- ]/g, '');
    const dirRe = '(north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|north|south|east|west)';
    const dims = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:by|x|×)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/);
    if (dims) { plan.w = num(dims[1]); plan.h = num(dims[2]); }
    const count = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|a couple of|a pair of|a few)\s+(guards?|sentr(?:y|ies)|men|watchmen|posts?|lookouts?)\b/);
    if (count) plan.n = num(count[1].replace(/^a (couple|pair|few) of$/, '$1').replace(/^a /, ''));
    const shape = verbShape(verb, verbs);
    const after = (re) => { const m = t.match(re); if (!m) return null; const h = hits.find(x => x.at >= m.index); return h ? h.p.id : null; };
    if (verb && shape === 'ring') {
      const btw = t.match(/\bbetween\b/);
      if (btw && ids.length >= 2) plan.between = ids.slice(0, 2);
      else {
        const target = after(/\b(around|round|enclos\w*|in|surround\w*)\b/) || ids[0];
        if (target) plan.around = target; else missing.push('around');
        const GATE = '(?:gate|opening|entrance|way in|door)';
        const g = t.match(new RegExp('\\b' + GATE + '\\b[^.]*?\\b' + dirRe + '\\b')) || t.match(new RegExp('\\b' + dirRe + '\\b[^.]*?\\b' + GATE + '\\b'));
        const tw = t.match(new RegExp('\\b' + GATE + '\\b[^.]*?\\b(toward|towards|facing|to|on the side of|by|near)\\s+(the\\s+)?(.+)'));
        const twp = tw && (findPlaces(tw[3], places || [])[0] || (/road|path|street/.test(tw[3]) ? { p: { id: 'road' } } : null));
        if (twp && /\b(toward|towards|facing)\b/.test(tw[1])) plan.gate = { toward: twp.p.id };
        else if (g) plan.gate = sideWord(g);
        else if (twp) plan.gate = { toward: twp.p.id };
        if (/\bno gate\b|\bwithout a gate\b/.test(t)) plan.gate = 'none';
      }
    } else if (verb && shape === 'posts') {
      const at = after(/\b(at|by|near|around|cover\w*|guard\w*|along|on)\b/) || ids[0]; if (at) plan.at = at; else missing.push('at');
      const s = t.match(new RegExp('\\b' + dirRe + '\\s+(side|bank|end)\\b')) || t.match(new RegExp('\\bon the\\s+' + dirRe + '\\b'));
      if (s) { if (s[2] === 'end') plan.end = sideWord(s); else plan.side = sideWord(s); }
      if (/\baround\b|\ball sides\b/.test(t)) plan.side = 'around';
      if (!plan.n) plan.n = 2;
    } else if (verb && shape === 'path') {
      const f = t.match(/\bfrom\b/), to = t.match(/\bto\b(?!\s+(?:the\s+)?(?:north|south|east|west)\b)/);
      plan.from = f ? after(/\bfrom\b/) : ids[0];
      plan.to = to ? (hits.find(h => h.at > to.index)?.p.id) : ids[ids.length - 1];
      plan.via = ids.filter(id => id !== plan.from && id !== plan.to);
      if (!plan.from) missing.push('from'); if (!plan.to) missing.push('to');
      plan.prefer = /\bshort(est)?\b|\bdirect\b|\bstraight\b/.test(t) ? 'short' : 'road';
    } else if (verb) {
      const under = t.match(/\b(under|beneath|below|inside|in)\s+(the\s+)?/);
      if (verb === 'dig' && under) { plan.under = after(/\b(under|beneath|below|inside|in)\b/) || ids[0]; if (!plan.under) missing.push('under'); }
      else if (/\btrees\b|\bwoods?\b|\brocks\b/.test(t) && verb === 'clear' && !dims) { plan.cluster = /rock/.test(t) ? 'rocks' : 'trees'; if (ids[0]) plan.near = ids[0]; }
      else if (ids.length && /\b(the whole|all of|all the)\b/.test(t)) plan.place = ids[0];
      else {
        plan.near = ids[0]; if (!plan.near) missing.push('near');
        const s = t.match(new RegExp('\\b' + dirRe + '\\s+(of|side)\\b')) || t.match(new RegExp('\\bto the\\s+' + dirRe + '\\b')) || t.match(new RegExp('\\bon the\\s+' + dirRe + '\\b'));
        if (s) plan.side = sideWord(s);
        else if (/\b(behind|in front of|beside|by the side of|at the back of)\b/.test(t)) { plan.side = null; return { plan, verb, missing, ask: 'side', places: ids }; }
        else plan.side = 'any';
        if (/\b(water|river|shore|bank|pond)\b/.test(t) && !findPlaces(t, places || []).some(h => /water|river|pond/.test(h.p.kind))) plan.touch = 'water';
      }
    }
    if (!verb) missing.unshift('verb');
    return { plan, verb, missing, ask: null, places: ids };
  }

  // ---- words -> a plan with a model: the list of places (never the grid), a fixed answer shape per verb, thinking off
  const SHAPE_TEXT = {
    ring: v => `{"verb": "${v}", "around": "<place>", "gate": "north" | "south" | "east" | "west" | {"toward": "<place>" | "road"} | "none"}  (or {"verb": "${v}", "between": ["<place>", "<place>"]} for a straight line from one place to another)`,
    line: v => `{"verb": "${v}", "between": ["<place>", "<place>"]}`,
    rect: v => `{"verb": "${v}", "near": "<place>", "side": "north" | "south" | "east" | "west" | "northwest" | ... | "any", "w": <width>, "h": <depth>}` + (v === 'dig' ? `  or, under a building: {"verb": "dig", "under": "<place>", "w": <width>, "h": <depth>}` : '') + (v === 'clear' ? `  or {"verb": "clear", "cluster": "trees" | "rocks", "near": "<place>"}` : ''),
    posts: v => `{"verb": "${v}", "at": "<place>", "n": <how many>, "side": "north" | "south" | "east" | "west" | "around" | "any", "end": "north" | "south" | "east" | "west" (optional: one end of a long place such as a road)}`,
    path: v => `{"verb": "${v}", "from": "<place>", "via": ["<place>", ...], "to": "<place>", "prefer": "road" | "short"}`,
    cells: v => `{"verb": "${v}", "near": "<place>", "w": <width>, "h": <depth>}`,
  };
  const SMALL_TEXT = {   // small brains: only the target and the numbers; code reads the sides from the words
    ring: v => `{"verb": "${v}", "around": "<place>"}`, line: v => `{"verb": "${v}", "between": ["<place>", "<place>"]}`,
    rect: v => `{"verb": "${v}", "near": "<place>", "w": <width>, "h": <depth>}` + (v === 'dig' ? ` or {"verb": "dig", "under": "<place>", "w": <width>, "h": <depth>}` : ''),
    posts: v => `{"verb": "${v}", "at": "<place>", "n": <how many>}`, path: v => `{"verb": "${v}", "from": "<place>", "to": "<place>"}`, cells: v => `{"verb": "${v}", "near": "<place>"}`,
  };
  function placesText(mapOrPlaces) { const ps = Array.isArray(mapOrPlaces) ? mapOrPlaces : mapOrPlaces.places; return ps.map(p => `- ${norm(p.id)}${p.kind && norm(p.kind) !== norm(p.id) ? ` (${norm(p.kind)})` : ''}`).join('\n'); }
  function modelPrompt(text, places, { verb = null, small = false, verbs = null } = {}) {
    const all = { ...VERBS, ...(verbs || {}) };
    const sys = 'You turn a player’s command in a tile-based village game into a small JSON plan. Name places only from the list; the game works out the squares. Reply with one JSON object only, no other text.';
    if (!verb) return [{ role: 'system', content: sys }, { role: 'user', content: `What does the player want done? Answer with one word from: ${Object.keys(all).join(', ')}.\n\nThe player says: "${text}"` }];
    const shape = verbShape(verb, verbs), form = (small ? SMALL_TEXT : SHAPE_TEXT)[shape] || SHAPE_TEXT.rect;
    return [{ role: 'system', content: sys }, { role: 'user', content: `Places on the map:\n${placesText(places)}\n\nThe player says: "${text}"\n\nAnswer in this shape (${all[verb]?.what || verb}):\n${form(verb)}\nNorth is up. Leave out what the player did not say.` }];
  }
  function parseAnswer(text) {
    const s = String(text || '').replace(/```(?:json)?/g, '').trim();
    const i = s.indexOf('{'); if (i < 0) { const w = s.toLowerCase().match(/[a-z_]+/); return w ? { verb: w[0] } : null; }
    let depth = 0; for (let j = i; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) { try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; } } }
    return null;
  }
  // the model's plan with code's: a small brain's sides are never trusted over the words; unknown places dropped
  function merge(codePlan, modelPlan, { small = false, places = [] } = {}) {
    const m = canon(modelPlan || {}), c = codePlan || {}, out = { ...c };
    const known = id => typeof id === 'string' && places.some(p => norm(p.id) === norm(id) || norm(p.kind) === norm(id)) ? id : null;
    for (const k of ['around', 'at', 'near', 'under', 'place', 'from', 'to']) { const v = known(m[k]); if (v) out[k] = v; }
    if (Array.isArray(m.between)) { const b = m.between.map(known).filter(Boolean); if (b.length >= 2) out.between = b; }
    if (Array.isArray(m.via)) out.via = m.via.map(known).filter(Boolean);
    for (const k of ['w', 'h', 'n']) if (Number.isFinite(+m[k]) && +m[k] > 0 && c[k] == null) out[k] = +m[k];
    if (m.cluster && !c.cluster) out.cluster = m.cluster;
    if (!small) { if (m.side && c.side == null || (m.side && c.side === 'any')) out.side = m.side; if (m.gate && c.gate == null) out.gate = m.gate; if (m.end && !c.end) out.end = m.end; if (m.prefer) out.prefer = m.prefer; if (m.touch && !c.touch) out.touch = m.touch; }
    if (!out.verb && m.verb) out.verb = m.verb;
    if (out.around && out.between) delete (c.between ? out.around : out.between);
    return out;
  }
  function describe(p, r) {
    const a = canon(p), v = a.verb, label = VERBS[v]?.label || String(v || 'mark').replace(/_/g, ' ');
    const n = r?.cells?.length ?? 0, sq = `${n} square${n === 1 ? '' : 's'}`;
    const gate = r?.gate ? (a.gate && typeof a.gate === 'string' && a.gate !== 'none' ? `, gate on the ${SIDE_NAME[sideOf(a.gate)] || a.gate} side` : a.gate?.toward ? `, gate toward the ${a.gate.toward}` : ', gate toward the road') : '';
    if (r?.shape === 'line') return `a ${label} between the ${a.between?.[0]} and the ${a.between?.[1]} (${sq})`;
    if (r?.shape === 'ring') return `a ${label} around the ${[].concat(a.around).join(' and the ')} (${sq})${gate}`;
    if (r?.shape === 'posts') return `${n} ${label}${n === 1 ? '' : 's'} at the ${a.at}${a.side && a.side !== 'any' ? ', ' + a.side + ' side' : ''}`;
    if (r?.shape === 'path') return `a ${label} from the ${a.from}${a.via?.length ? ' by the ' + a.via.join(' and the ') : ''} to the ${a.to} (${sq})`;
    if (a.under) return `${label} under the ${a.under} (${sq})`;
    if (a.place) return `${label}: the whole ${a.place} (${sq})`;
    if (a.cluster) return `${label} the ${a.cluster} near the ${a.near} (${sq})`;
    return `${label} ${r?.rect ? `${r.rect[2] - r.rect[0] + 1} by ${r.rect[3] - r.rect[1] + 1}` : ''} ${a.side && a.side !== 'any' ? a.side + ' of' : 'by'} the ${a.near} (${sq})`.replace(/\s+/g, ' ');
  }

  // ---- a scenario as a cell map (the world builder's agent; tools/spatial-eval/maps.mjs fromScenario)
  const CLASS = { ',': '.', ';': '.', ':': ':', U: '=', '#': '#', '+': '+', '~': '~', y: '~', '-': '~', '%': '%', r: 'r', f: 'f', g: '*', '*': '.', '^': '.', '=': '.', _: '.', '.': '.', ' ': '.' };
  const TREES = /tree|pine|oak|birch|willow/, SOFT = /flower|heather|grass|fern|bush|light|bear_trap|tuft/;
  const HALF = { inn: 4, barracks: 4, barn: 4, big_barn: 4, blacksmith: 3, open_barn: 3, stone_house: 3, tall_house: 3, fantasy_house: 3, mill_house: 2, sawmill: 2, small_barn: 2, gazebo: 1, silo_barn: 2, silo: 1, chicken_coop: 1, windmill: 2, stone_windmill: 2 };
  function mapFromScenario(scn, Procgen) {
    let sc = scn, places0 = Array.isArray(scn.places) ? scn.places : [];
    if (scn.generate && Procgen?.applyToScenario) { const out = Procgen.applyToScenario(scn); sc = out.scenario; places0 = out.places || []; }
    const size = Array.isArray(sc.size) ? sc.size : [sc.grid?.[0]?.length || 21, sc.grid?.length || 15];
    const [W, H] = size, x0 = Math.floor((W - 1) / 2), z0 = Math.floor((H - 1) / 2);
    const toXY = (bx, bz) => [x0 - bx, bz + z0];
    const g = (sc.grid || []).map(row => [...String(row)].map(ch => CLASS[ch] ?? 'x'));
    while (g.length < H) g.push(Array(W).fill('.')); for (const row of g) while (row.length < W) row.push('.');
    const places = [];
    for (const p of places0) {
      if (p.x0 == null) continue;
      const [xa, ya] = toXY(p.x1, p.z0), [xb, yb] = toXY(p.x0, p.z1);
      const rect = [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)];
      const walled = g[rect[1] - 1]?.[rect[0]] === '#' || g[rect[1] - 1]?.[rect[0]] === '+';
      const pl = { id: p.id, kind: p.kind, rect };
      if (walled) { pl.building = true; pl.outer = [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]; for (let y = rect[1]; y <= rect[3]; y++) for (let x = rect[0]; x <= rect[2]; x++) if (g[y]?.[x] !== undefined) g[y][x] = 'o'; for (let y = pl.outer[1]; y <= pl.outer[3]; y++) for (let x = pl.outer[0]; x <= pl.outer[2]; x++) if (g[y]?.[x] === '+') pl.door = [x, y]; }
      places.push(pl);
    }
    const n = {};
    for (const o of sc.objects || []) {
      if (!Number.isFinite(+o.x) || o.x === '') continue;
      const [x, y] = toXY(Math.round(+o.x), Math.round(+o.z)); if (!g[y] || g[y][x] === undefined) continue;
      if (HALF[o.type] != null) { const h = HALF[o.type]; for (let yy = y - h; yy <= y + h; yy++) for (let xx = x - h; xx <= x + h; xx++) if (g[yy]?.[xx] !== undefined) g[yy][xx] = 'H'; n[o.type] = (n[o.type] || 0) + 1; const name = o.type.replace(/_/g, ' '); places.push({ id: places.some(p => p.id === name) ? `${name} ${n[o.type]}` : name, kind: 'closed building', rect: [x - h, y - h, x + h, y + h], closed: true }); }
      else if (TREES.test(o.type)) { if (g[y][x] === '.') g[y][x] = '%'; }
      else if (/fence/.test(o.type)) { if (g[y][x] === '.') g[y][x] = 'f'; }
      else if (o.type === 'wall') g[y][x] = '#';
      else if (!SOFT.test(o.type)) { if (g[y][x] === '.') g[y][x] = 'x'; }
    }
    const map = { W, H, rows: g.map(r => r.join('')), places };
    addRoads(map);
    return map;
  }
  // a village's road arms as places ("the north road") when the generator crossed two roads at the square
  function addRoads(map) {
    const sq = map.places.find(p => p.kind === 'square' || p.id === 'square'); if (!sq || map.places.some(p => /road/.test(p.id))) return;
    const g = map.rows, roadRows = [], roadCols = [];
    for (let y = 0; y < map.H; y++) if ([...g[y]].filter(c => c === ':' || c === '=').length > map.W * 0.8) roadRows.push(y);
    for (let x = 0; x < map.W; x++) { let k = 0; for (let y = 0; y < map.H; y++) if (g[y][x] === ':' || g[y][x] === '=') k++; if (k > map.H * 0.8) roadCols.push(x); }
    if (!roadRows.length || !roadCols.length) return;
    const [ry0, ry1] = [Math.min(...roadRows), Math.max(...roadRows)], [rx0, rx1] = [Math.min(...roadCols), Math.max(...roadCols)], [sx0, sy0, sx1, sy1] = sq.rect;
    map.places.push({ id: 'north road', kind: 'road', rect: [rx0, 0, rx1, sy0 - 1] }, { id: 'south road', kind: 'road', rect: [rx0, sy1 + 1, rx1, map.H - 1] },
      { id: 'west road', kind: 'road', rect: [0, ry0, sx0 - 1, ry1] }, { id: 'east road', kind: 'road', rect: [sx1 + 1, ry0, map.W - 1, ry1] });
  }
  const toBoard = (map, c) => ({ x: Math.floor((map.W - 1) / 2) - c[0], z: c[1] - Math.floor((map.H - 1) / 2) });
  const fromBoard = (map, x, z) => [Math.floor((map.W - 1) / 2) - Math.round(x), Math.round(z) + Math.floor((map.H - 1) / 2)];

  root.TablefolkPlanCore = { VERBS, SHAPES, SIDE_NAME, ctx, canon, resolve, validate, plan, parseWords, findPlaces, modelPrompt, parseAnswer, merge, describe, mapFromScenario, addRoads, placesText, toBoard, fromBoard, sideOf, line4, outline };
})(typeof window !== 'undefined' ? window : globalThis);
