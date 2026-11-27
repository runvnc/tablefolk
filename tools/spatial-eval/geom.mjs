// geom.mjs: spatial-eval's geometry: answers to squares, the relation resolver, the scorer.
// A map is maps.mjs's { W, H, rows, places, hidden }; cells are [x, y] (x east, y south).
export const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const SIDES = { n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w' };
export const sideOf = s => SIDES[String(s || '').toLowerCase().trim()] || null;
// 'northwest', 'north-west', 'north west' -> ['n', 'w']; a plain side -> [it]; anything else -> []
export const sidesOf = s => { const t = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); if (SIDES[t]) return [SIDES[t]]; const m = t.match(/^(north|south)(east|west)$/); return m ? [SIDES[m[1]], SIDES[m[2]]] : []; };
const onSide = (r, o, s) => s === 'n' ? r[3] < o[1] : s === 's' ? r[1] > o[3] : s === 'w' ? r[2] < o[0] : r[0] > o[2];

export function ctx(map) {
  const at = (x, y) => (y >= 0 && y < map.H && x >= 0 && x < map.W) ? map.rows[y][x] : null;
  const norm = s => String(s || '').toLowerCase().replace(/^the\s+/, '').trim();
  const place = id => map.places.find(p => norm(p.id) === norm(id)) || null;
  const outer = p => p.outer || p.rect;
  const rectCells = ([x0, y0, x1, y1]) => { const out = []; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]); return out; };
  const placeCells = p => rectCells(outer(p));
  const roadCells = () => { const out = []; for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (':='.includes(at(x, y)) || at(x, y) === 'B') out.push([x, y]); return out; };
  return { map, at, place, outer, rectCells, placeCells, roadCells };
}

// Chebyshev gap between two rects: 1 = touching side by side, 0 = overlapping.
export const gap = (a, b) => Math.max(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const bbox = cells => [Math.min(...cells.map(c => c[0])), Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[0])), Math.max(...cells.map(c => c[1]))];
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const distToCells = (c, cells) => Math.min(...cells.map(d => cheb(c, d)));
function line(a, b) { // Bresenham, 8-connected
  const out = []; let [x0, y0] = a; const [x1, y1] = b; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (let i = 0; i < 400; i++) { out.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return out;
}
const outline = ([x0, y0, x1, y1]) => { const out = []; [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)]; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || y === y0 || y === y1) out.push([x, y]); return out; };
const isPt = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]);
const isRect = r => Array.isArray(r) && r.length === 4 && r.every(v => Number.isFinite(+v));
const asRect = r => isRect(r) ? r.map(Number) : (Array.isArray(r) && r.length === 2 && isPt(r[0]) && isPt(r[1]) ? [+r[0][0], +r[0][1], +r[1][0], +r[1][1]] : (r && typeof r === 'object' && 'x0' in r ? [r.x0, r.y0, r.x1, r.y1].map(Number) : null));

// ---- squares answers -> a plan { cells, gate, posts, path }
export function fromSquares(task, a, C) {
  if (!a || typeof a !== 'object') return { error: 'no JSON object' };
  const t = task.answer;
  if (t === 'wall') {
    let cells = [];
    const wr = asRect(a.wall_rect ?? a.rect);
    if (wr) cells = outline(wr);
    else if (Array.isArray(a.wall)) { if (asRect(a.wall) && !isPt(a.wall[0])) cells = outline(asRect(a.wall)); else cells = a.wall.filter(isPt).map(p => [+p[0], +p[1]]); }
    else return { error: 'no wall' };
    const gate = isPt(a.gate) ? [+a.gate[0], +a.gate[1]] : (Array.isArray(a.gate) && isPt(a.gate[0]) ? [+a.gate[0][0], +a.gate[0][1]] : null);
    return { wall: cells, gate };
  }
  if (t === 'rect' || t === 'area') {
    const r = asRect(a.rect ?? a.area);
    if (r) return { cells: C.rectCells(r), rect: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])] };
    const sq = a.squares || a.cells;
    if (Array.isArray(sq)) { const cells = sq.filter(isPt).map(p => [+p[0], +p[1]]); return cells.length ? { cells, rect: bbox(cells) } : { error: 'no squares' }; }
    return { error: 'no rect' };
  }
  if (t === 'posts') { const p = (a.posts || a.squares || []).filter(isPt).map(p => [+p[0], +p[1]]); return p.length ? { posts: p } : { error: 'no posts' }; }
  if (t === 'path') {
    const pts = (a.path || a.route || []).filter(isPt).map(p => [+p[0], +p[1]]);
    if (pts.length < 2) return { error: 'no path' };
    const cells = []; for (let i = 0; i + 1 < pts.length; i++) { const seg = line(pts[i], pts[i + 1]); cells.push(...(i ? seg.slice(1) : seg)); }
    return { path: cells };
  }
  return { error: 'unknown answer type' };
}

// ---- relations -> a plan, resolved by code
const passable = (ch, { trees = false, inside = null } = {}) => '.:=+B*'.includes(ch) || (trees && ch === '%');
function astar(C, starts, goals, { roadCost = 1, offCost = 1, trees = false, allowInside = [] }) {
  const { map, at } = C, G = new Set(goals.map(g => key(...g))), inside = new Set(allowInside.flatMap(p => C.placeCells(p)).map(c => key(...c)));
  const cost = (x, y) => { const ch = at(x, y); if (ch === null) return Infinity; if (inside.has(key(x, y)) && '#'.indexOf(ch) < 0) return 1; if (!passable(ch, { trees })) return Infinity; return ':=B+'.includes(ch) ? roadCost : (ch === '%' ? offCost * 3 : offCost); };
  const dist = new Map(), prev = new Map(), open = [];
  for (const s of starts) { dist.set(key(...s), 0); open.push([0, s]); }
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]); const [d, [x, y]] = open.shift(); const k = key(x, y);
    if (d > (dist.get(k) ?? Infinity)) continue;
    if (G.has(k)) { const out = [[x, y]]; let q = k; while (prev.has(q)) { q = prev.get(q); out.unshift(unkey(q)); } return out; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, c = cost(nx, ny); if (!isFinite(c)) continue;
      if (dx && dy && (!isFinite(cost(x + dx, y)) || !isFinite(cost(x, y + dy)))) continue; // no cutting corners
      const nd = d + c * (dx && dy ? 1.4 : 1), nk = key(nx, ny);
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, k); open.push([nd, [nx, ny]]); }
    }
  }
  return null;
}
const endsOf = (C, p) => p.door ? [p.door] : C.placeCells(p).filter(([x, y]) => passable(C.at(x, y)));

export function fromRelations(task, a, C) {
  if (!a || typeof a !== 'object') return { error: 'no JSON object' };
  // {"posts": {...}} / {"path": {...}}: a wrapper named after the answer type (Bonsai 2 9B's habit) is unwrapped
  const ks = Object.keys(a); if (ks.length === 1 && a[ks[0]] && typeof a[ks[0]] === 'object' && !Array.isArray(a[ks[0]]) && !['enclose', 'gate'].includes(ks[0])) a = a[ks[0]];
  const need = id => { const p = C.place(id); if (!p) throw new Error(`unknown place "${id}"`); return p; };
  try {
    const t = task.answer;
    if (t === 'wall') {
      const ids = [].concat(a.enclose ?? a.target ?? []); if (!ids.length) return { error: 'no enclose' };
      const box = bbox(ids.flatMap(id => C.placeCells(need(id))));
      const bad = ([x, y]) => { const ch = C.at(x, y); return ch === null || '#+oH~B:='.includes(ch); };
      let best = null;
      for (let m = 1; m <= 3; m++) { const ring = outline([box[0] - m, box[1] - m, box[2] + m, box[3] + m]); const n = ring.filter(bad).length; if (!best || n < best.n) best = { ring, n, m }; if (!n) break; }
      const ring = best.ring, R = [box[0] - best.m, box[1] - best.m, box[2] + best.m, box[3] + best.m];
      let gate = null; const g = a.gate;
      const s = sideOf(typeof g === 'string' ? g : g?.side);
      const corner = ([x, y]) => (x === R[0] || x === R[2]) && (y === R[1] || y === R[3]);
      const ok = c => C.at(...c) !== null && !'#oH~'.includes(C.at(...c)) && !corner(c);
      const pathFirst = (p, q) => (':+'.includes(C.at(...q)) ? 1 : 0) - (':+'.includes(C.at(...p)) ? 1 : 0);
      if (s) { const onSide = ring.filter(([x, y]) => s === 'n' ? y === R[1] : s === 's' ? y === R[3] : s === 'w' ? x === R[0] : x === R[2]).filter(ok); const mid = s === 'n' || s === 's' ? (R[0] + R[2]) / 2 : (R[1] + R[3]) / 2; onSide.sort((p, q) => pathFirst(p, q) || Math.abs((s === 'n' || s === 's' ? p[0] : p[1]) - mid) - Math.abs((s === 'n' || s === 's' ? q[0] : q[1]) - mid)); gate = onSide[0]; }
      else { const tw = typeof g === 'object' && g ? (g.toward ?? g.towards ?? g.to) : (typeof g === 'string' ? g.replace(/^toward(s)?:?\s*/i, '') : null); if (tw) { const tc = /^roads?$/i.test(tw) ? C.roadCells() : C.placeCells(need(tw)); gate = ring.filter(ok).sort((p, q) => distToCells(p, tc) - distToCells(q, tc) || pathFirst(p, q))[0]; } }
      return { wall: ring, gate: gate || null };
    }
    if (t === 'rect' || t === 'area') {
      if (a.area && typeof a.area === 'object') a = { ...a, ...a.area };
      if (a.place || (a.area && typeof a.area === 'string')) { const p = need(a.place || a.area); return { cells: C.rectCells(p.rect), rect: p.rect }; }
      if (a.cluster) {
        const cls = { tree: '%', trees: '%', water: '~', rock: 'r', rocks: 'r', crops: '*' }[String(a.cluster).toLowerCase()]; if (!cls) return { error: 'unknown cluster' };
        const p = need(a.near), pc = C.placeCells(p), s = sideOf(a.side), seen = new Set(), comps = [];
        for (let y = 0; y < C.map.H; y++) for (let x = 0; x < C.map.W; x++) { if (C.at(x, y) !== cls || seen.has(key(x, y))) continue; const comp = [], st = [[x, y]]; seen.add(key(x, y)); while (st.length) { const [cx, cy] = st.pop(); comp.push([cx, cy]); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, ny = cy + dy; if (C.at(nx, ny) === cls && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); st.push([nx, ny]); } } } comps.push(comp); }
        const o = C.outer(p), side = c => { const b = bbox(c), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return !s || (s === 'n' ? cy < o[1] : s === 's' ? cy > o[3] : s === 'w' ? cx < o[0] : cx > o[2]); };
        const cand = comps.filter(c => c.length >= 3 && side(c)).sort((c1, c2) => Math.min(...c1.map(c => distToCells(c, pc))) - Math.min(...c2.map(c => distToCells(c, pc))));
        if (!cand.length) return { error: 'no cluster' }; return { cells: cand[0], rect: bbox(cand[0]) };
      }
      const w = +a.w || +a.width, h = +a.h || +a.height || +a.depth; if (!(w > 0 && h > 0)) return { error: 'no size' };
      if (a.under || a.inside) { const p = need(a.under || a.inside), r = p.rect; const cw = r[2] - r[0] + 1, ch = r[3] - r[1] + 1; let ww = w, hh = h; if ((ww > cw || hh > ch) && hh <= cw && ww <= ch) [ww, hh] = [hh, ww]; const x0 = r[0] + Math.floor((cw - ww) / 2), y0 = r[1] + Math.floor((ch - hh) / 2); const rr = [x0, y0, x0 + ww - 1, y0 + hh - 1]; return { cells: C.rectCells(rr), rect: rr }; }
      const p = need(a.near ?? a.next_to ?? a.by), o = C.outer(p), ss = sidesOf(a.side), water = /water|river|shore|bank/i.test(String(a.touch || ''));
      const okCell = (x, y) => C.at(x, y) === '.';
      const touches = (r, chs) => { for (let y = r[1] - 1; y <= r[3] + 1; y++) for (let x = r[0] - 1; x <= r[2] + 1; x++) { const edge = (x < r[0] || x > r[2]) !== (y < r[1] || y > r[3]); if (edge && chs.includes(C.at(x, y))) return true; } return false; };
      let best = null;
      for (const [ww, hh] of [[w, h], [h, w]]) for (let y0 = 0; y0 + hh <= C.map.H; y0++) for (let x0 = 0; x0 + ww <= C.map.W; x0++) {
        const r = [x0, y0, x0 + ww - 1, y0 + hh - 1], gp = gap(r, o); if (gp < 1 || gp > 6) continue;
        if (!ss.every(s => onSide(r, o, s))) continue;
        let ok = true; for (let y = r[1]; y <= r[3] && ok; y++) for (let x = r[0]; x <= r[2]; x++) if (!okCell(x, y)) { ok = false; break; }
        if (!ok || (water && !touches(r, '~'))) continue;
        const score = gp * 100 + (touches(r, ':=') ? 250 : 0) + cheb([(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], [(o[0] + o[2]) / 2, (o[1] + o[3]) / 2]);
        if (!best || score < best.score) best = { r, score };
      }
      if (!best) return { error: 'no free rect' }; return { cells: C.rectCells(best.r), rect: best.r };
    }
    if (t === 'posts') {
      const p = need(a.guard ?? a.cover ?? a.target), n = Math.max(1, Math.min(8, +a.n || task.check.n || 2)), s = sideOf(a.side), e = sideOf(a.end);
      let pc = C.placeCells(p), o = C.outer(p);
      if (e) { const b = bbox(pc), lim = e === 'n' ? b[1] + 2 : e === 's' ? b[3] - 2 : e === 'w' ? b[0] + 2 : b[2] - 2; pc = pc.filter(([x, y]) => e === 'n' ? y <= lim : e === 's' ? y >= lim : e === 'w' ? x <= lim : x >= lim); o = bbox(pc); }
      const around = /around|all/i.test(String(a.side || ''));
      const near = (useSide) => { const out = []; for (let y = 0; y < C.map.H; y++) for (let x = 0; x < C.map.W; x++) { if (!'.:=*'.includes(C.at(x, y))) continue; const d = distToCells([x, y], pc); if (d < 1 || d > 3) continue; if (useSide && s && !(s === 'n' ? y < o[1] : s === 's' ? y > o[3] : s === 'w' ? x < o[0] : x > o[2])) continue; out.push([x, y, d]); } return out; };
      let cand = near(true); if (!cand.length) cand = near(false);  // a side that has no room (the map's edge) is dropped
      if (!cand.length) return { error: 'no room for posts' };
      const picks = [];
      const cx = (o[0] + o[2]) / 2, cy = (o[1] + o[3]) / 2;
      if (around) { for (const q of ['n', 'e', 's', 'w', 'n', 'e', 's', 'w'].slice(0, n)) { const c = cand.filter(([x, y]) => (q === 'n' ? y < o[1] : q === 's' ? y > o[3] : q === 'w' ? x < o[0] : x > o[2]) && !picks.some(pk => cheb(pk, [x, y]) < 2)).sort((a1, b1) => a1[2] - b1[2] || Math.abs(a1[0] - cx) + Math.abs(a1[1] - cy) - Math.abs(b1[0] - cx) - Math.abs(b1[1] - cy))[0]; if (c) picks.push([c[0], c[1]]); } }
      while (picks.length < n) { const c = cand.filter(([x, y]) => !picks.some(pk => cheb(pk, [x, y]) < 2)).sort((a1, b1) => (picks.length ? Math.min(...picks.map(pk => cheb(pk, b1))) - Math.min(...picks.map(pk => cheb(pk, a1))) : 0) * 0.5 + (a1[2] - b1[2]))[0]; if (!c) break; picks.push([c[0], c[1]]); }
      return { posts: picks };
    }
    if (t === 'path') {
      const from = need(a.from), to = need(a.to), via = [].concat(a.via || []).map(need), road = /road/i.test(String(a.prefer || 'road'));
      const trees = !!task.check.trees, stops = [from, ...via, to], cells = [];
      let cur = endsOf(C, from);
      for (let i = 1; i < stops.length; i++) {
        const goal = stops[i].door ? [stops[i].door] : C.placeCells(stops[i]).filter(([x, y]) => passable(C.at(x, y), { trees }));
        const seg = astar(C, cur, goal, { roadCost: 1, offCost: road ? 4 : 1, trees, allowInside: [from, to] });
        if (!seg) return { error: 'no route' }; cells.push(...(cells.length ? seg.slice(1) : seg)); cur = [seg[seg.length - 1]];
      }
      return { path: cells };
    }
  } catch (e) { return { error: e.message }; }
  return { error: 'unknown answer type' };
}

// ---- scoring: a list of named checks, pass = all true, partial = the share true
export function score(task, plan, C) {
  const ck = task.check, out = {};
  if (!plan || plan.error) return { pass: false, partial: 0, checks: { parsed: false }, error: plan?.error };
  const inMap = ([x, y]) => C.at(x, y) !== null;
  if (task.answer === 'wall') {
    const wall = plan.wall || [], gate = plan.gate, W = new Set(wall.map(c => key(...c))); if (gate) W.add(key(...gate));
    const target = ck.target.flatMap(id => C.placeCells(C.place(id)));
    out.buildable = wall.length > 0 && wall.every(c => inMap(c) && !'#+oH~B'.includes(C.at(...c)) && (!':='.includes(C.at(...c)) || (gate && key(...c) === key(...gate))));
    // closed: from the target, moving 8 ways, never past the wall to the map's edge
    const seen = new Set(), st = []; let leak = false;
    for (const c of target) if (!W.has(key(...c))) { seen.add(key(...c)); st.push(c); }
    out.targetClear = target.every(c => !W.has(key(...c)));
    while (st.length && !leak) { const [x, y] = st.pop(); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (!inMap([nx, ny])) { leak = true; continue; } const k = key(nx, ny); if (W.has(k) || seen.has(k)) continue; if (dx && dy && W.has(key(x + dx, y)) && W.has(key(x, y + dy))) continue; seen.add(k); st.push([nx, ny]); } }
    out.closed = !leak && wall.length > 0;
    const tb = bbox(target), limit = (tb[2] - tb[0] + 7) * (tb[3] - tb[1] + 7);
    out.tight = out.closed && seen.size <= limit;
    if (!gate) out.gate = false;
    else {
      const ring = wall.some(c => key(...c) === key(...gate)) || W.has(key(...gate));
      const touchesIn = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(gate[0] + dx, gate[1] + dy)));
      let side = true;
      if (ck.gate.side) { const b = bbox(wall), s = ck.gate.side; side = s === 'n' ? gate[1] <= b[1] + 1 : s === 's' ? gate[1] >= b[3] - 1 : s === 'w' ? gate[0] <= b[0] + 1 : gate[0] >= b[2] - 1; }
      if (ck.gate.toward) { // the gate must be on the wall's side that faces the nearest square of what it faces
        const tc = ck.gate.toward === 'road' ? C.roadCells() : C.placeCells(C.place(ck.gate.toward)), b = bbox(wall), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        const q = tc.slice().sort((p1, p2) => Math.hypot(p1[0] - cx, p1[1] - cy) - Math.hypot(p2[0] - cx, p2[1] - cy))[0], dx = q[0] - cx, dy = q[1] - cy;
        const s = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
        side = s === 'n' ? gate[1] <= b[1] + 1 : s === 's' ? gate[1] >= b[3] - 1 : s === 'w' ? gate[0] <= b[0] + 1 : gate[0] >= b[2] - 1;
        if (side && (s === 'n' || s === 's')) side = gate[0] > b[0] && gate[0] < b[2]; else if (side) side = gate[1] > b[1] && gate[1] < b[3]; }
      out.gate = ring && touchesIn && side && inMap(gate) && !'#oH~'.includes(C.at(...gate));
    }
  } else if (task.answer === 'rect') {
    const r = plan.rect, w = r[2] - r[0] + 1, h = r[3] - r[1] + 1, [sw, sh] = ck.size;
    out.size = plan.cells.length === w * h && ((w === sw && h === sh) || (w === sh && h === sw));
    if (ck.inside) { const p = C.place(ck.inside).rect; out.inside = r[0] >= p[0] && r[1] >= p[1] && r[2] <= p[2] && r[3] <= p[3]; }
    else {
      out.free = plan.cells.every(c => C.at(...c) === '.');
      const o = C.outer(C.place(ck.near)); const gp = gap(r, o); out.near = gp >= 1 && gp <= (ck.maxGap || 3);
      if (ck.side) { const s = ck.side; out.side = s === 'n' ? r[3] < o[1] : s === 's' ? r[1] > o[3] : s === 'w' ? r[2] < o[0] : r[0] > o[2]; }
      if (ck.roadClear) out.roadClear = plan.cells.every(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !':='.includes(C.at(x + dx, y + dy) || '.')));
      if (ck.westOf != null) out.westOf = r[2] < ck.westOf;
      if (ck.eastOf != null) out.eastOf = r[0] >= ck.eastOf;
      if (ck.water) out.water = plan.cells.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => C.at(x + dx, y + dy) === '~'));
    }
  } else if (task.answer === 'posts') {
    const P = plan.posts, tc = C.placeCells(C.place(ck.target)), o = C.outer(C.place(ck.target));
    out.count = P.length === ck.n;
    out.standable = P.every(c => inMap(c) && '.:=*B'.includes(C.at(...c)));
    out.near = P.every(c => distToCells(c, tc) <= (ck.radius || 3));
    if (ck.n >= 3) out.spread = P.every((a, i) => P.every((b, j) => i === j || cheb(a, b) >= 2));
    if (ck.side) { const s = ck.side; out.side = P.every(([x, y]) => s === 'n' ? y < o[1] : s === 's' ? y > o[3] : s === 'w' ? x < o[0] : x > o[2]); }
    if (ck.westOf != null) out.westOf = P.every(([x]) => x < ck.westOf);
    if (ck.surround) { const q = new Set(P.map(([x, y]) => y < o[1] ? 'n' : y > o[3] ? 's' : x < o[0] ? 'w' : x > o[2] ? 'e' : 'in')); q.delete('in'); out.surround = q.size >= Math.min(3, ck.n); }
  } else if (task.answer === 'path') {
    const path = plan.path, from = C.place(ck.from), to = C.place(ck.to), inside = new Set([from, to].flatMap(p => C.placeCells(p)).map(c => key(...c)));
    const near = (c, p) => distToCells(c, C.placeCells(p)) <= 2;
    out.start = near(path[0], from); out.end = near(path[path.length - 1], to);
    out.via = (ck.via || []).every(v => path.some(c => near(c, C.place(v))));
    out.walkable = path.every(c => inMap(c) && (passable(C.at(...c), { trees: !!ck.trees }) || (inside.has(key(...c)) && C.at(...c) === 'o')));
    if (ck.onRoad) { const n = path.filter(c => ':=B+'.includes(C.at(...c) || '')).length; out.onRoad = n / path.length >= ck.onRoad; }
  } else if (task.answer === 'area') {
    const truth = C.rectCells(ck.hidden ? bbox(C.map.hidden[ck.hidden]) : C.place(ck.place).rect), T = new Set(truth.map(c => key(...c))), A = new Set(plan.cells.map(c => key(...c)));
    const inter = [...A].filter(k => T.has(k)).length, iou = inter / (A.size + T.size - inter);
    out.overlap = inter > 0; out.iou25 = iou >= 0.25; out.iou40 = iou >= 0.4; out.iou = +iou.toFixed(2);
    const vals = [out.overlap, out.iou25, out.iou40]; return { pass: out.iou40, partial: vals.filter(Boolean).length / 3, checks: out };
  }
  const vals = Object.values(out);
  return { pass: vals.every(Boolean), partial: +(vals.filter(Boolean).length / vals.length).toFixed(3), checks: out };
}
