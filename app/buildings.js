/* buildings.js -- houses assembled from the modular building kit (2026-11-27).
 *
 * A walk-in building is built in the browser from the world's own grid: the
 * rooms roofs.js would roof (flood fill from the board's edge; tablefolkRoofs
 * .planned()), grouped into buildings (rooms that share a wall), and the wall
 * and door squares round them. So generated villages, drawn grids and
 * hand-edited maps all get them. A JS port of tools/kit/build_house.py (the
 * reference: work/kit/NOTES.md has every number and lesson), three layers:
 *   structure  wall panels .18 thick through the wall squares' centres, both
 *              faces finished, cut for doors and windows; stone plinth; upper
 *              floors and joists; gable roofs per room rectangle (an L gets a
 *              main roof and a wing running into it) with overhang, eave, pitch
 *   frame      sill and top plates, corner/bay/jamb posts, rails, seeded braces,
 *              a jetty's joist ends, king post and collar in the gables; quoins
 *              and lintels on stone; roofing laid in courses (shingle, clay tile)
 *              or a thatch body, fascia, bargeboards, ridge, a seeded sag;
 *              a chimney stack from a hearth; seeded porch, bench, window boxes,
 *              lean-to
 *   pieces     the Tripo hero pieces (assets/models/kit: door frame, windows,
 *              chimney top, dormer, porch, sign, corbel, stair), loaded once:
 *              wall pieces are thin instances village-wide (one draw call per
 *              piece mesh), roof pieces clones (they fade with their roof); near
 *              and far (_lod) versions switched at LOD_FAR camera distance
 * The structure is merged per material per building (vertex colours carry dirt
 * at the base, the building's tint and per-panel plaster tints), sharing one
 * material set (assets/textures/kit, WebP; 512 at light quality). Logic walls
 * (collision, sight, paths, doors, locks) are unchanged: the kit only draws.
 * The door leaf is the kit's leaf on the game's hinge (app.js door animator).
 *
 *   window.tablefolkBuildings = {
 *     enabled()                 the kit is on for this world (?kit=0 / "kit": false: the old shells)
 *     build(cell, top, rooms)   walls.js build0: draws the kit buildings, returns the wall and door
 *                               squares it drew (walls.js skips them) or null
 *     group(rooms)              rooms -> buildings ([{key, rooms}]), the rule roofs.js uses too
 *     setAlpha(key, a)          roofs.js: the building's roof faded (0..1; dithered per pixel: every roof is
 *                               merged village-wide, a building's index per vertex / per instance picks its alpha)
 *     roofBox(key)              its roof's box ({lo, hi}), for roofs.js's camera ray
 *     clip(key | 'all' | null)  the storey above the ground floor clipped (the player is inside)
 *     list(), stats()           for tests
 *   }
 * Loaded after app.js (state, meta, wallH, doorAxisOf, addShadow, ensureDoorAnimator), before walls.js.
 */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const BASE = () => (window.tablefolkPacks?.base || '/assets/');
  const KIT_V = '20261127a';
  const LOD_FAR = 20, LOD_HYST = 1.5;   // camera distance (game units) where far pieces and slab roofs take over
  const MATS = ['plaster', 'fieldstone', 'quoin', 'timber', 'siding', 'floor', 'shingle', 'thatch', 'tile'];
  const TILE = { plaster: [3, 3], fieldstone: [1.5, 1.5], quoin: [2.4, 2.4], thatch: [2, 2], shingle: [1.6, 1.6], floor: [2, 2], siding: [2, 2], timber: [2, .5], tile: [2.5, 2.5] };
  const tile = m => TILE[m] || [2, 2];
  const PIECES = ['door', 'door_leaf', 'window', 'window_shut', 'chimney', 'dormer', 'porch', 'sign', 'corbel', 'stair'];
  const PMETA = { dormer: { box: [1.104, 1.167, 1.25] }, stair: { box: [2.7, .8, 2.2] } };

  function kitOn() {
    if (Q.get('kit') === '0' || window.TABLEFOLK_TABLETOP) return false;
    const s = state.envScn || window.tablefolkScenario?.active?.scn || {};
    return s.kit !== false;
  }
  // walk-in houses: a storey must take the kit's door (1.62) and windows; low toy walls keep the old look
  function enabled() { return kitOn() && wallH() >= 1.9; }

  // ---------------------------------------------------------------- small maths
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const neg = a => [-a[0], -a[1], -a[2]];
  // o + v1*s1 + v2*s2 ...
  const at = (o, ...t) => { const r = o.slice(); for (let i = 0; i < t.length; i += 2) { r[0] += t[i][0] * t[i + 1]; r[1] += t[i][1] * t[i + 1]; r[2] += t[i][2] * t[i + 1]; } return r; };
  const UPZ = [0, 0, 1];
  function rng(seed) {
    let a = (Math.imul((seed | 0) + 0x9E3779B9, 2654435761) >>> 0) || 1;
    const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.uniform = (lo, hi) => lo + (hi - lo) * f(); f.choice = arr => arr[Math.floor(f() * arr.length) % arr.length];
    return f;
  }
  // value noise in [-1, 1] (the thatch's lumps)
  function noise2(x, y, s) {
    const h = (i, j) => { let n = Math.imul(i * 374761393 + j * 668265263 + s * 982451653, 1274126177); n ^= n >>> 13; n = Math.imul(n, 1103515245); return ((n ^ n >>> 16) >>> 0) / 4294967296 * 2 - 1; };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx, b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  }
  const hash3 = (a, b, c) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761); h ^= h >>> 15; return ((h >>> 0) % 10000) / 10000; };

  // ---------------------------------------------------------------- assembly (pure: a spec in, buckets out)
  // Works in the reference's frame: X = the game's x, Y = the game's z, Z up (metres = squares). Emitted to
  // Babylon as (X, Z + top, Y); the winding is fixed per face from its normal, so the mirror is harmless.
  function assemble(SP0) {
    let SP = SP0;
    const RNG0 = rng(SP.seed);
    let RNG = RNG0;
    const H = SP.H, T = .18, BT = .045, DW = .78, DH = 1.62, WW = .56, WH = .66, WSILL = .82, PLINTH = .42;
    const STYLE = SP.style, STOREYS = SP.storeys, ROOF = SP.roof, PITCH = SP.pitch * Math.PI / 180;
    const OV = ROOF !== 'thatch' ? .38 : .5, VERGE = ROOF !== 'thatch' ? .28 : .36, RT = ROOF !== 'thatch' ? .12 : .46;
    const SAG = SP.sag ?? RNG.uniform(.015, .06);
    const JET = SP.jetty || null, JD = JET ? (JET.d ?? .3) : 0;
    const TINT = SP.tint || [RNG.uniform(.92, 1.04), RNG.uniform(.9, 1.0), RNG.uniform(.84, .96)];
    const LOOK = { plaster_timber: [['plaster', 'plaster', true]], stone_timber: [['fieldstone', 'plaster', false], ['plaster', 'plaster', true]],
      plank_barn: [['siding', 'siding', true]], stone_cottage: [['fieldstone', 'plaster', false]] }[STYLE];
    const look = k => LOOK[Math.min(k, LOOK.length - 1)];
    const GABLE = { plaster_timber: 'plaster', stone_timber: 'plaster', plank_barn: 'siding', stone_cottage: 'fieldstone' }[STYLE];
    const ROOFMAT = ROOF;

    // ---- grid ----
    const K = (x, z) => x + ',' + z;
    const isw = (x, z) => SP.walls.has(K(x, z));
    const out = (x, z) => !SP.walls.has(K(x, z)) && !SP.inside.has(K(x, z));
    const foot = new Set([...SP.inside, ...SP.walls]);
    let XMIN = 1e9, XMAX = -1e9, YMIN = 1e9, YMAX = -1e9;
    for (const k of foot) { const [x, z] = k.split(',').map(Number); XMIN = Math.min(XMIN, x); XMAX = Math.max(XMAX, x); YMIN = Math.min(YMIN, z); YMAX = Math.max(YMAX, z); }
    const runs = [];
    for (const axis of ['x', 'y']) {
      const [lo, hi] = axis === 'x' ? [XMIN, XMAX] : [YMIN, YMAX], [l0, l1] = axis === 'x' ? [YMIN, YMAX] : [XMIN, XMAX];
      for (let L = l0; L <= l1; L++) {
        const rc = i => axis === 'x' ? [i, L] : [L, i];
        let k = lo;
        while (k < hi) {
          if (isw(...rc(k)) && isw(...rc(k + 1))) {
            let j = k; while (j + 1 <= hi && isw(...rc(j + 1))) j++;
            const cells = []; for (let i = k; i <= j; i++) cells.push(rc(i));
            const side = sg => { let o = 0; const mid = cells.length > 2 ? cells.slice(1, -1) : cells; for (const [x, z] of mid) if (axis === 'x' ? out(x, z + sg) : out(x + sg, z)) o++; return o; };
            const po = side(1), no = side(-1);
            runs.push({ axis, fixed: L, s0: k, s1: j, cells, sgn: po >= no ? 1 : -1, kind: po === 0 && no === 0 ? 'inner' : 'outer' });
            k = j;
          } else k++;
        }
      }
    }
    const LIM = { '-y': ['x', YMIN, -1], '+y': ['x', YMAX, 1], '-x': ['y', XMIN, -1], '+x': ['y', XMAX, 1] };
    const jsides = JET ? (JET.sides || ['-y']) : [];
    function jettied(run, k) {
      let f = run.fixed, s0 = run.s0, s1 = run.s1;
      if (k === 0 || !JD) return [f, s0, s1];
      for (const sd of jsides) {
        const [ax, v, sg] = LIM[sd];
        if (run.axis === ax && Math.abs(f - v) < 1e-6 && run.kind === 'outer') f += sg * JD;
        if (run.axis !== ax) { if (Math.abs(s0 - v) < 1e-6 && sg < 0) s0 -= JD; if (Math.abs(s1 - v) < 1e-6 && sg > 0) s1 += JD; }
      }
      return [f, s0, s1];
    }
    const frameOf = (run, f) => run.axis === 'x' ? [[0, f, 0], [1, 0, 0], [0, run.sgn, 0]] : [[f, 0, 0], [0, 1, 0], [run.sgn, 0, 0]];
    const sOf = (run, [x, z]) => run.axis === 'x' ? x : z;
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const doors = [...SP.doors].map(k => k.split(',').map(Number));
    const isDoor = c => SP.doors.has(K(c[0], c[1]));
    const updoors = (SP.upperDoors || []).map(c => [c[0], c[1]]);
    const isUp = c => updoors.some(u => same(u, c));
    let CHIM = null;
    function openings(run, k) {
      const ops = [], cells = run.cells, ends = [cells[0], cells[cells.length - 1]];
      const atEnd = c => ends.some(e => same(e, c));
      if (k === 0) for (const c of cells) if (isDoor(c) && !atEnd(c)) ops.push({ kind: 'door', s: sOf(run, c), w: DW, zb: 0, zt: DH, rc: c });
      for (const c of cells) if (k > 0 && isUp(c) && !atEnd(c)) ops.push({ kind: 'door', s: sOf(run, c), w: DW, zb: 0, zt: DH, rc: c, upper: true });
      if (run.kind !== 'outer') return ops;
      if (STYLE === 'plank_barn' && k === 0 && cells.length < 6) return ops;
      const step = SP.winStep || 2, taken = ops.map(o => o.s);
      let cand = cells.slice(2, -2).filter(c => !isDoor(c) && !isUp(c));
      if (!cand.length) cand = cells.length >= 4 ? cells.slice(1, -1).filter(c => !isDoor(c) && !isUp(c)) : [];
      const mid = (sOf(run, cells[0]) + sOf(run, cells[cells.length - 1])) / 2;
      cand.sort((a, b) => Math.abs(sOf(run, a) - mid) - Math.abs(sOf(run, b) - mid));
      for (const c of cand) {
        const s = sOf(run, c);
        if (CHIM && run.axis === CHIM[0] && Math.abs(run.fixed - CHIM[1]) < .6 && Math.abs(s - CHIM[2]) < 1.1) continue;
        if (taken.every(t => Math.abs(s - t) >= step - 1e-6) && ops.filter(o => o.kind === 'door').every(o => Math.abs(s - o.s) > 1.2)) { taken.push(s); ops.push({ kind: 'window', s, w: WW, zb: WSILL, zt: WSILL + WH, rc: c }); }
      }
      return ops;
    }

    // ---- buckets: per material, flat-shaded faces ----
    const bucket = () => ({});
    const S = bucket(), RF = bucket(), RFF = bucket();   // structure, roof (near), roof (far)
    const dirt = (z, m) => (m === 'timber' || m === 'floor' || m === 'shingle' || m === 'thatch') ? 1 : 1 - .32 * Math.pow(Math.max(0, 1 - z / .75), 1.5);
    const TINTED = new Set(['plaster', 'siding', 'fieldstone', 'thatch', 'shingle', 'tile']);
    function addFace(B, pts, m, uvs, jit = 1) {
      const b = B[m] || (B[m] = { P: [], N: [], U: [], C: [], I: [] });
      let n = [0, 0, 0];   // Newell: the face's normal from its winding (outward, the reference's convention)
      for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; n[0] += (a[1] - c[1]) * (a[2] + c[2]); n[1] += (a[2] - c[2]) * (a[0] + c[0]); n[2] += (a[0] - c[0]) * (a[1] + c[1]); }
      if (len(n) < 1e-9) return;
      n = nrm(n);
      const t = TINTED.has(m) ? TINT : [1, 1, 1], j = Array.isArray(jit) ? jit : [jit, jit, jit];
      const o = b.P.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], d = dirt(p[2], m);
        b.P.push(p[0], p[1], p[2]); b.N.push(n[0], n[1], n[2]); b.U.push(uvs[i][0], uvs[i][1]); b.C.push(t[0] * d * j[0], t[1] * d * j[1], t[2] * d * j[2], 1);
      }
      for (let i = 1; i < pts.length - 1; i++) b.I.push(o, o + i, o + i + 1);
    }
    function uvWorld(p, n, m) {
      const [tu, tv] = tile(m), an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], i = an.indexOf(Math.max(...an));
      let u, v;
      if (i === 0) { u = n[0] > 0 ? p[1] : -p[1]; v = p[2]; } else if (i === 1) { u = n[1] > 0 ? -p[0] : p[0]; v = p[2]; } else { u = p[0]; v = p[1]; }
      return [u / tu, v / tv];
    }
    function box(B, c, ax, ay, az, hx, hy, hz, matf, uv = 'world', jit = 1, zcuts = [], uvoff = [0, 0]) {
      const lv = [-hz, ...zcuts.filter(z => -hz < z && z < hz).sort((a, b) => a - b), hz];
      const ring = t => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => at(c, az, t, ax, sx * hx, ay, sy * hy));
      const rings = lv.map(ring), faces = [];
      for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 4; i++) faces.push([rings[r][i], rings[r][(i + 1) % 4], rings[r + 1][(i + 1) % 4], rings[r + 1][i]]);
      faces.push(rings[0].slice().reverse()); faces.push(rings[rings.length - 1]);
      for (let q of faces) {
        let n = nrm(cross(sub(q[1], q[0]), sub(q[2], q[0])));
        const ctr = mul(add(add(q[0], q[1]), add(q[2], q[3])), .25);
        if (dot(n, sub(ctr, c)) < 0) { q = q.slice().reverse(); n = neg(n); }
        const m = matf(n);
        let uvs;
        if (uv === 'world') uvs = q.map(p => uvWorld(p, n, m));
        else {
          const [tu, tv] = tile(m); let e1, e2;
          if (Math.abs(dot(n, ax)) > .7) { e1 = ay; e2 = az; } else if (Math.abs(dot(n, ay)) > .7) { e1 = ax; e2 = az; } else { e1 = ax; e2 = ay; }
          uvs = q.map(p => [uvoff[0] + dot(sub(p, c), e1) / tu, uvoff[1] + dot(sub(p, c), e2) / tv]);
        }
        addFace(B, q, m, uvs, jit);
      }
    }
    function prism(B, pts2, o, along, nr, th, matFront, matSide) {
      const P = (s, z, d) => at(o, along, s, UPZ, z, nr, d);
      const fr = pts2.map(([s, z]) => P(s, z, th / 2)), bk = pts2.map(([s, z]) => P(s, z, -th / 2));
      for (const [q0, n] of [[fr, nr], [bk.slice().reverse(), neg(nr)]]) {
        let q = q0; if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), n) < 0) q = q.slice().reverse();
        const m = matFront(n); addFace(B, q, m, q.map(p => uvWorld(p, n, m)));
      }
      const k = pts2.length, cen = mul([...fr, ...bk].reduce(add, [0, 0, 0]), 1 / (2 * k));
      for (let i = 0; i < k; i++) {
        let q = [fr[i], fr[(i + 1) % k], bk[(i + 1) % k], bk[i]];
        let n = nrm(cross(sub(q[1], q[0]), sub(q[2], q[0]))); const ctr = mul(q.reduce(add, [0, 0, 0]), .25);
        if (dot(n, sub(ctr, cen)) < 0) { q = q.slice().reverse(); n = neg(n); }
        addFace(B, q, matSide, q.map(p => uvWorld(p, n, matSide)));
      }
    }
    function beam(B, p0, p1, nr, w, d, jit = null, m = 'timber') {
      let ax = sub(p1, p0); const L = len(ax); if (L < 1e-5) return; ax = mul(ax, 1 / L);
      const az = nrm(nr), ay = nrm(cross(az, ax));
      box(B, mul(add(p0, p1), .5), ax, ay, az, L / 2, w / 2, d / 2, () => m, 'local', jit || RNG.uniform(.82, 1.1), [], [RNG(), RNG()]);
    }
    function cyl(B, p0, p1, r, m, sides = 10, squash = 1, jit = 1) {
      let ax = sub(p1, p0); const L = len(ax); ax = mul(ax, 1 / L);
      let e1 = cross(ax, UPZ); e1 = len(e1) > 1e-6 ? nrm(e1) : [1, 0, 0]; const e2 = nrm(cross(e1, ax));
      const [tu, tv] = tile(m);
      const ring = (p, i) => at(p, e1, Math.cos(2 * Math.PI * i / sides) * r, e2, Math.sin(2 * Math.PI * i / sides) * squash * r);
      for (let i = 0; i < sides; i++) {
        let q = [ring(p0, i), ring(p0, i + 1), ring(p1, i + 1), ring(p1, i)];
        const n = cross(sub(q[1], q[0]), sub(q[2], q[0])), a0 = i * r * 2 * Math.PI / sides / tv, a1 = (i + 1) * r * 2 * Math.PI / sides / tv;
        const mid = mul(add(q[0], q[1]), .5), radial = sub(sub(mid, p0), mul(ax, dot(sub(q[0], p0), ax)));
        let uvs = [[0, a0], [0, a1], [L / tu, a1], [L / tu, a0]];
        if (dot(n, radial) < 0) { q = q.slice().reverse(); uvs = uvs.slice().reverse(); }
        addFace(B, q, m, uvs, jit);
      }
      for (const [p, sg] of [[p0, -1], [p1, 1]]) {
        let q = []; for (let i = 0; i < sides; i++) q.push(ring(p, i));
        if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), mul(ax, sg)) < 0) q = q.reverse();
        addFace(B, q, m, q.map(v => [dot(sub(v, p), e1) / tu, dot(sub(v, p), e2) / tv]), jit);
      }
    }

    // ---- pieces placed: [name, origin, normal (outward), scale, part] ----
    const placed = [];
    const place = (name, loc, nr, scale = [1, 1, 1], part = null, off = null) => placed.push({ name, loc, ang: Math.atan2(nr[1], nr[0]) + Math.PI / 2, scale, part, off });

    // ---- rectangles of the footprint (main roof, wings) ----
    function rects(cells) {
      const has = (x, z) => cells.has(K(x, z)), rem = new Set(cells), res = [];
      while (rem.size) {
        let best = null;
        for (const k of [...rem].sort()) {
          const [x, z] = k.split(',').map(Number);
          for (let z1 = z; ; z1++) {
            if (!has(x, z1)) break;
            let x1 = x; const col = xx => { for (let zz = z; zz <= z1; zz++) if (!has(xx, zz)) return false; return true; };
            while (col(x1 + 1)) x1++;
            const a = (z1 - z + 1) * (x1 - x + 1);
            let ok = true; for (let zz = z; zz <= z1 && ok; zz++) for (const xx of [x, x1]) if (!rem.has(K(xx, zz))) ok = false;
            if (ok && (!best || a > best[0])) best = [a, z, x, z1, x1];
          }
        }
        if (!best) break;
        let [, z0, x0, z1, x1] = best;
        if (res.length) {
          const rowAll = zz => { for (let xx = x0; xx <= x1; xx++) if (!has(xx, zz)) return false; return true; };
          const colAll = xx => { for (let zz = z0; zz <= z1; zz++) if (!has(xx, zz)) return false; return true; };
          if (rowAll(z0 - 1)) z0--; if (rowAll(z1 + 1)) z1++; if (colAll(x0 - 1)) x0--; if (colAll(x1 + 1)) x1++;
        }
        res.push([z0, x0, z1, x1]);
        for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) rem.delete(K(xx, zz));
        if (res.length > 6) break;
      }
      return res;
    }
    const RECTS = rects(foot);
    function rectXY([z0, x0, z1, x1], k) {
      let a0 = x0, a1 = x1, b0 = z0, b1 = z1;
      if (k > 0 && JD) for (const sd of jsides) {
        if (sd === '-y' && Math.abs(b0 - YMIN) < 1e-6) b0 -= JD; if (sd === '+y' && Math.abs(b1 - YMAX) < 1e-6) b1 += JD;
        if (sd === '-x' && Math.abs(a0 - XMIN) < 1e-6) a0 -= JD; if (sd === '+x' && Math.abs(a1 - XMAX) < 1e-6) a1 += JD;
      }
      return [a0, a1, b0, b1];
    }
    // upper floors and their joists (the ground floor is the game's own slab: walls.js floors())
    for (let k = 1; k < STOREYS; k++) for (const rc of RECTS) {
      const [x0, x1, y0, y1] = rectXY(rc, k), z = k * H;
      box(S, [(x0 + x1) / 2, (y0 + y1) / 2, z], [1, 0, 0], [0, 1, 0], UPZ, (x1 - x0) / 2, (y1 - y0) / 2, .05, () => 'floor');
      if (x1 - x0 < y1 - y0) for (let y = y0 + .3; y < y1 - .2; y += .6) beam(S, [x0, y, z - .12], [x1, y, z - .12], [0, 1, 0], .14, .12);
      else for (let x = x0 + .3; x < x1 - .2; x += .6) beam(S, [x, y0, z - .12], [x, y1, z - .12], [1, 0, 0], .14, .12);
    }
    // roofs: the biggest rectangle the main roof, the others wings running into it up to its ridge
    const ZT = STOREYS * H, roofInfo = [];
    let main = null;
    RECTS.forEach((rc, i) => {
      let [x0, x1, y0, y1] = rectXY(rc, STOREYS - 1); x0 -= T / 2; x1 += T / 2; y0 -= T / 2; y1 += T / 2;
      if (i === 0) {
        main = [x0, x1, y0, y1];
        let along = (x1 - x0) >= (y1 - y0) ? 'x' : 'y';
        if (RECTS.length > 1) { const w = rectXY(RECTS[1], STOREYS - 1); along = (w[0] >= x1 - T || w[1] <= x0 + T) ? 'y' : 'x'; }
        if (SP.ridge) along = SP.ridge;
        roofInfo.push({ x0, x1, y0, y1, along, ext: {} });
      } else {
        const [mx0, mx1, my0, my1] = main, along = roofInfo[0].along === 'y' ? 'x' : 'y', ext = {};
        if (along === 'x') {
          const mid = (mx0 + mx1) / 2;
          if (x0 >= mx0 + T && x0 > mid) { ext.lo = x0 - mid; x0 = mid; } else if (x1 <= mx1 - T && x1 < mid) { ext.hi = mid - x1; x1 = mid; }
          else if ((x0 + x1) / 2 > mid) { x0 = mid; ext.lo = 1; } else { x1 = mid; ext.hi = 1; }
        } else {
          const mid = (my0 + my1) / 2;
          if ((y0 + y1) / 2 > mid) { y0 = mid; ext.lo = 1; } else { y1 = mid; ext.hi = 1; }
        }
        roofInfo.push({ x0, x1, y0, y1, along, ext });
      }
    });
    // a door on a gable end (a gable-fronted house): the chimney and the lean-to take the other gable, or none
    const doorGable = sg => { const ri = roofInfo[0]; return doors.some(([x, z]) => ri.along === 'x' ? (sg > 0 ? x >= ri.x1 - T : x <= ri.x0 + T) : (sg > 0 ? z >= ri.y1 - T : z <= ri.y0 + T)); };
    if (SP.chimney && doorGable(SP.chimney === 'right' ? 1 : -1)) SP = { ...SP, chimney: doorGable(SP.chimney === 'right' ? -1 : 1) ? false : (SP.chimney === 'right' ? 'left' : 'right') };
    if (SP.chimney) {
      const ri = roofInfo[0], sg = SP.chimney === 'right' ? 1 : -1;
      CHIM = ri.along === 'x' ? ['y', (sg > 0 ? ri.x1 : ri.x0) - sg * T / 2, (ri.y0 + ri.y1) / 2] : ['x', (sg > 0 ? ri.y1 : ri.y0) - sg * T / 2, (ri.x0 + ri.x1) / 2];
    }
    const WINS = [], DOORS = [], doorOps = [];

    // ---- walls by storey (structure and frame) ----
    const PANEL = STYLE === 'plaster_timber' || STYLE === 'stone_timber'
      ? [[1, 1, 1], [1, 1, 1], [1.02, .97, .88], [1.02, .97, .88], [1.05, .91, .7], [.97, .97, .95]] : [[1, 1, 1]];
    for (let k = 0; k < STOREYS; k++) {
      const [outer, inner, framed] = look(k), z0 = k * H;
      for (const run of runs) {
        const [f, s0, s1] = jettied(run, k), [O, A, N] = frameOf(run, f);
        const e0 = s0 - T / 2, e1 = s1 + T / 2;
        const ops = openings(run, k).sort((a, b) => a.s - b.s);
        const mo = run.kind === 'outer' ? outer : inner;
        const matf = n => run.kind === 'inner' ? inner : (dot(n, N) > -.5 ? mo : inner);
        const plaster = mo === 'plaster' || inner === 'plaster';
        const wbox1 = (sa, sb, za, zb, jit) => {
          if (sb - sa < 1e-4 || zb - za < 1e-4) return;
          const c = at(O, A, (sa + sb) / 2, UPZ, z0 + (za + zb) / 2);
          box(S, c, A, N, UPZ, (sb - sa) / 2, T / 2, (zb - za) / 2, matf, 'world', jit, (k === 0 && za < .4 && .4 < zb) ? [.4 - (za + zb) / 2] : []);
        };
        // plaster: split at the square edges (where posts stand), each panel its own tint (the concepts' ochre infill)
        const wbox = (sa, sb, za, zb) => {
          if (!plaster || PANEL.length < 2) return wbox1(sa, sb, za, zb, 1);
          let a = sa;
          while (a < sb - 1e-4) {
            const b = Math.min(sb, Math.floor(a + .5 + 1e-4) + .5);
            const h = hash3(Math.round((a + b) * 2), Math.round(f * 4), k * 7 + (SP.seed & 255));
            wbox1(a, b, za, zb, PANEL[Math.floor(h * PANEL.length)]); a = b;
          }
        };
        let cur = e0;
        for (const o of ops) {
          const a0 = o.s - o.w / 2, a1 = o.s + o.w / 2;
          wbox(cur, a0, 0, H); wbox(a0, a1, 0, o.zb); wbox(a0, a1, o.zt, H); cur = a1;
        }
        wbox(cur, e1, 0, H);
        if (k === 0 && run.kind === 'outer' && outer !== 'fieldstone') {   // plinth, broken at doors
          const pd = T / 2 + .07; let c0 = e0 - .05;
          for (const o of [...ops.filter(o => o.kind === 'door'), { s: e1 + 10, w: 0 }]) {
            const end = Math.min(o.s - o.w / 2, e1 + .05);
            if (end > c0) box(S, at(O, A, (c0 + end) / 2, N, pd / 2, UPZ, PLINTH / 2), A, N, UPZ, (end - c0) / 2, pd / 2, PLINTH / 2, () => 'fieldstone');
            c0 = o.s + o.w / 2;
          }
        }
        for (const o of ops) {
          const loc = at(O, A, o.s, UPZ, z0 + o.zb);
          if (o.kind === 'door') {
            place('door', loc, N); doorOps.push({ loc, N, A, run, o, k });
            if (SP.closedDoor) place('door_leaf', loc, N, [1, 1, 1], null, [-.3, .045, 0]);   // a closed building's door: the leaf shut, on its hinge (pieces.json offset)
            if (run.kind === 'outer') DOORS.push({ loc, N, A, k, o });
            if (k === 0 && run.kind === 'outer' && SP.porch && !o.upper) place('porch', at(O, A, o.s, N, T / 2 + BT, UPZ, z0 + DH + .55), N);
          } else {
            let kind = (RNG() < (SP.leaded ?? .6) || k > 0) ? 'window' : 'window_shut';
            if (k === 0 && (STYLE === 'stone_cottage' || STYLE === 'plank_barn')) kind = 'window_shut';
            place(kind, at(loc, UPZ, -.06), N); WINS.push({ loc, N, A, k, kind });
          }
        }
        if (framed) {
          const dpt = T + 2 * BT, zb0 = z0 + (k === 0 && outer !== 'siding' ? PLINTH : 0), PW = .17, PL = .15;
          const P = (s, z) => at(O, A, s, UPZ, z);
          let c0 = e0;
          for (const o of [...ops.filter(o => o.kind === 'door' && !o.upper), { s: e1 + 10, w: 0 }]) {
            const end = Math.min(o.s - o.w / 2 - .09, e1);
            if (end > c0) beam(S, P(c0, zb0 + PL / 2), P(end, zb0 + PL / 2), N, PL, dpt);
            c0 = o.s + o.w / 2 + .09;
          }
          beam(S, P(e0, z0 + H - PL / 2), P(e1, z0 + H - PL / 2), N, PL, dpt);
          const posts = [[e0 + PW / 2, .2], [e1 - PW / 2, .2]];
          for (const o of ops) posts.push([o.s - o.w / 2 - .075, .15], [o.s + o.w / 2 + .075, .15]);
          const bay = STYLE !== 'plank_barn' ? (SP.bay || 2) : 1;
          for (let s = Math.round(s0) + .5; s < s1; s += 1) if (((s - Math.round(s0) - .5) % bay) < 1e-6 && posts.every(([p]) => Math.abs(s - p) > .45)) posts.push([s, .16]);
          posts.sort((a, b) => a[0] - b[0]);
          for (const [p, w] of posts) beam(S, P(p, zb0 + PL), P(p, z0 + H - PL), N, w, dpt + .01);
          const mid = z0 + H * .5;
          for (const o of ops) {
            const a0 = o.s - o.w / 2 - .15, a1 = o.s + o.w / 2 + .15;
            if (o.kind === 'window') beam(S, P(a0, z0 + o.zb - .05), P(a1, z0 + o.zb - .05), N, .1, dpt);
            beam(S, P(a0, z0 + o.zt + .06), P(a1, z0 + o.zt + .06), N, .12, dpt);
          }
          const pat = SP.braces || 'corner';
          for (let i = 0; i < posts.length - 1; i++) {
            const [pa, wa] = posts[i], [pb, wb] = posts[i + 1], sa = pa + wa / 2, sb = pb - wb / 2;
            if (sb - sa < .45) continue;
            if (ops.some(o => sa - .05 < o.s && o.s < sb + .05)) continue;
            const lo = zb0 + PL, hi = z0 + H - PL, first = Math.abs(pa - (e0 + PW / 2)) < 1e-6, last = Math.abs(pb - (e1 - PW / 2)) < 1e-6;
            if (pat === 'corner' || (pat === 'chevron' && (first || last))) {
              if (first) beam(S, P(sa + .05, hi - .05), P(sb - .05, lo + .05), N, .13, dpt);
              else if (last) beam(S, P(sa + .05, lo + .05), P(sb - .05, hi - .05), N, .13, dpt);
              else beam(S, P(sa, mid), P(sb, mid), N, .11, dpt);
            } else if (pat === 'chevron') {
              const m_ = (sa + sb) / 2; beam(S, P(sa + .05, lo + .05), P(m_, hi - .05), N, .12, dpt); beam(S, P(m_, hi - .05), P(sb - .05, lo + .05), N, .12, dpt);
            } else if (pat === 'cross') {
              beam(S, P(sa, mid), P(sb, mid), N, .11, dpt);
              beam(S, P(sa + .04, lo + .04), P(sb - .04, mid - .04), N, .1, dpt); beam(S, P(sa + .04, mid - .04), P(sb - .04, lo + .04), N, .1, dpt + .005);
            } else if (pat === 'herringbone') {
              beam(S, P(sa, mid), P(sb, mid), N, .11, dpt);
              beam(S, P(sa + .04, lo + .04), P(sb - .04, mid - .04), N, .1, dpt); beam(S, P(sa + .04, mid + .04), P(sb - .04, hi - .04), N, .1, dpt);
            }
          }
          if (k > 0 && Math.abs(f - run.fixed) > 1e-6) {   // jetty: joist ends under the moved line, corbels
            const [Ol] = frameOf(run, run.fixed);
            for (let s = s0; s <= s1 + 1e-6; s += .5) { const p0 = at(Ol, A, s, UPZ, z0 - .07); beam(S, at(p0, N, -T / 2), at(p0, N, JD + T / 2 + .06), UPZ, .12, .12); }
            beam(S, at(Ol, A, e0, N, JD + T / 2 + .06, UPZ, z0 - .07), at(Ol, A, e1, N, JD + T / 2 + .06, UPZ, z0 - .07), N, .14, .1);
            const cps = [s0 + .1, s1 - .1];
            for (let i = 0; i < Math.floor(s1 - s0); i++) { const x = Math.round(s0) + .5 + i; if (((x - Math.round(s0) - .5) % 2) < 1e-6 && s0 + .5 < x && x < s1 - .5) cps.push(x); }
            for (const p of cps) place('corbel', at(Ol, A, p, N, T / 2, UPZ, z0 - .13), N);
          }
        }
        if (outer === 'fieldstone' && run.kind === 'outer') {   // stone: timber lintels, quoins at the corners
          for (const o of ops) beam(S, at(O, A, o.s - o.w / 2 - .14, UPZ, z0 + o.zt + .08), at(O, A, o.s + o.w / 2 + .14, UPZ, z0 + o.zt + .08), N, .16, T + .03);
          for (const [e, sg] of [[e0, 1], [e1, -1]]) {
            let z = z0, i = 0;
            while (z < z0 + H - .05) {
              const hq = Math.min(.26, z0 + H - z), lq = i % 2 === 0 ? .42 : .26;
              // on the outer face only (through the wall they showed inside the room)
              box(S, at(O, A, e + sg * lq / 2, N, T / 4 + .011, UPZ, z + hq / 2), A, N, UPZ, lq / 2 + .012, T / 4 + .011, hq / 2 - .006, () => 'quoin', 'world', RNG.uniform(.85, 1.08));
              z += hq; i++;
            }
          }
        }
      }
    }

    // ---- roofs ----
    let CRNG = rng(SP.seed * 7919 + 1);
    const NOFF = [CRNG.uniform(0, 100), CRNG.uniform(0, 100)];
    const SHADE = ROOF === 'shingle' ? [.62, 1.16] : [.82, 1.12];   // grey shingle: more contrast between shingles (round 2)
    function courses(B, pe, up, U, nr, ul, uh, L, mat, firstOver = .05) {
      const cs = mat === 'tile' ? .24 : .2, ct = mat === 'shingle' ? .035 : .045, tv = tile(mat)[1], rowsInTex = Math.round(tv / cs) || 1;
      let k = 0, s = -firstOver;
      while (s < L - .04) {
        const lo = s, hi = Math.min(s + cs * 1.65, L + .06);
        let u = ul;
        while (u < uh - 1e-3) {
          let ln = Math.min(uh - u, CRNG.uniform(.7, 2.2)); if (uh - u - ln < .35) ln = uh - u;
          const tilt = CRNG.uniform(3, 6) * Math.PI / 180, lift = CRNG.uniform(-.006, .01);
          const sdir = nrm(sub(mul(up, Math.cos(tilt)), mul(nr, Math.sin(tilt))));
          let nn = nrm(cross(U, sdir)); if (dot(nn, nr) < 0) nn = neg(nn);
          const c = at(pe, U, u + ln / 2, up, (lo + hi) / 2, nr, .05 + ct / 2 + lift + (hi - lo) / 2 * Math.sin(tilt));
          const jit = CRNG.uniform(SHADE[0], SHADE[1]);
          box(B, c, U, neg(sdir), nn, ln / 2, (hi - lo) / 2, ct / 2, n => dot(n, nr) > .3 ? mat : (dot(n, nr) < -.3 ? 'floor' : mat), 'local', jit, [], [CRNG(), (k % rowsInTex + .5) / rowsInTex]);
          u += ln;
        }
        s += cs; k++;
      }
    }
    function thatchBody(B, pe, up, U, nr, ul, uh, L, coarse) {
      const du = .35 * (coarse ? 3 : 1), ds = .3 * (coarse ? 3 : 1);
      const nu = Math.max(2, Math.floor((uh - ul) / du) + 1), ns = Math.max(2, Math.floor(L / ds) + 1);
      const rnd = x => { x = Math.max(0, Math.min(1, x)); return Math.sqrt(1 - (1 - x) ** 2); };
      const P = (i, j, top) => {
        const u = ul + (uh - ul) * i / nu, sv = L * j / ns, p = at(pe, U, u, up, sv);
        if (!top) return p;
        let th = RT * Math.max(.18, rnd(Math.min(u - ul, uh - u) / .5) * rnd(sv / .6));
        th += .05 * noise2(u * 1.1 + NOFF[0], sv * 1.1 + NOFF[1], SP.seed | 0) * rnd(Math.min(u - ul, uh - u) / .5);
        return at(p, nr, th);
      };
      const [tu, tv] = tile('thatch');
      for (const top of [true, false]) for (let i = 0; i < nu; i++) for (let j = 0; j < ns; j++) {
        let q = [P(i, j, top), P(i + 1, j, top), P(i + 1, j + 1, top), P(i, j + 1, top)];
        if ((dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), nr) < 0) === top) q = q.reverse();
        addFace(B, q, top ? 'thatch' : 'floor', q.map(p => [dot(sub(p, pe), U) / tu, dot(sub(p, pe), up) / tv]));
      }
      const edges = [], ctr = at(pe, U, (ul + uh) / 2, up, L / 2);
      { const e = []; for (let i = 0; i <= nu; i++) e.push([i, 0]); edges.push(e); }
      { const e = []; for (let i = 0; i <= nu; i++) e.push([i, ns]); edges.push(e); }
      { const e = []; for (let j = 0; j <= ns; j++) e.push([0, j]); edges.push(e); }
      { const e = []; for (let j = 0; j <= ns; j++) e.push([nu, j]); edges.push(e); }
      for (const e of edges) for (let t = 0; t < e.length - 1; t++) {
        const [a0, b0] = e[t], [a1, b1] = e[t + 1];
        let q = [P(a0, b0, false), P(a1, b1, false), P(a1, b1, true), P(a0, b0, true)];
        const mid = mul(q.reduce(add, [0, 0, 0]), .25);
        if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), sub(mid, ctr)) < 0) q = q.reverse();
        addFace(B, q, 'thatch', q.map(p => [dot(sub(p, pe), U) / tu, (dot(sub(p, pe), up) + dot(sub(p, pe), nr)) / tv]));
      }
    }
    function roof(ri, B, FAR, first) {
      const { x0, x1, y0, y1, along: al } = ri;
      let u0, u1, v0, v1, U, V;
      if (al === 'x') { u0 = x0; u1 = x1; v0 = y0; v1 = y1; U = [1, 0, 0]; V = [0, 1, 0]; } else { u0 = y0; u1 = y1; v0 = x0; v1 = x1; U = [0, 1, 0]; V = [1, 0, 0]; }
      const W = (u, v, z) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v, z];
      const half = (v1 - v0) / 2, vc = (v0 + v1) / 2, tn = Math.tan(PITCH), zr = ZT + half * tn;
      const loExt = 'lo' in ri.ext ? 0 : VERGE, hiExt = 'hi' in ri.ext ? 0 : VERGE, ul = u0 - loExt, uh = u1 + hiExt;
      const start = {}; for (const m in B) start[m] = B[m].P.length;
      const BOARD = .05;
      for (const sg of [-1, 1]) {
        const ve = vc + sg * (half + OV), ze = ZT - OV * tn, pe = W(0, ve, ze);
        const up = nrm(sub(W(0, vc, zr), pe)), nr = nrm(add(mul(V, sg * Math.sin(PITCH)), [0, 0, Math.cos(PITCH)]));
        const L = len(sub(W(0, vc, zr), pe)) + (ROOF === 'thatch' ? RT : .02) * tn;
        if (ROOF === 'thatch') { thatchBody(B, pe, up, U, nr, ul, uh, L, FAR); continue; }
        const c = at(pe, up, L / 2, nr, BOARD / 2, U, (ul + uh) / 2);
        box(B, c, U, neg(up), nr, (uh - ul) / 2, L / 2, BOARD / 2, n => dot(n, nr) < -.3 ? 'floor' : (Math.abs(dot(n, nr)) < .3 ? 'timber' : (FAR ? ROOFMAT : 'floor')), 'local');
        if (!FAR) courses(B, pe, up, U, nr, ul, uh, L, ROOFMAT);
        const outv = mul(V, sg);
        // (the reference's houses stood at the origin: the fascia's centre is the roof's middle, not u = 0)
        box(B, at(W((ul + uh) / 2, ve, ze), outv, .02, UPZ, -.04), U, outv, UPZ, (uh - ul) / 2 + .03, .025, .13, () => 'timber', 'local', .8);
        for (const [uu, ex] of [[ul, loExt], [uh, hiExt]]) if (ex) beam(B, at(W(uu, ve, ze), nr, .03, up, -.02), at(W(uu, vc, zr), nr, .03), U, .3, .07, .8);
      }
      const zc = zr + (ROOF === 'thatch' ? RT : .12) / Math.cos(PITCH);
      if (ROOF === 'thatch') {
        cyl(B, W(ul + .1, vc, zc - .2), W(uh - .1, vc, zc - .2), .34, 'thatch', 12, .62);
        if (!FAR) {
          const n_ = Math.floor((uh - ul - .6) / .7);
          for (let i = 0; i <= n_; i++) { const uu = ul + .3 + i * (uh - ul - .6) / Math.max(1, n_); for (const sg of [-1, 1]) cyl(B, W(uu, vc + sg * .32, zc - .3), W(uu, vc - sg * .1, zc + .18), .025, 'timber', 5); }
        }
      } else if (ROOF === 'tile') cyl(B, W(ul - .02, vc, zc - .04), W(uh + .02, vc, zc - .04), .11, 'tile', 8, .8, .85);
      else for (const sg of [-1, 1]) {
        const sl = nrm(sub(mul(V, sg * Math.cos(PITCH)), [0, 0, Math.sin(PITCH)])), nn = nrm(add(mul(V, sg * Math.sin(PITCH)), [0, 0, Math.cos(PITCH)]));
        box(B, at(W((ul + uh) / 2, vc, zc - .01), sl, .1, nn, .02), U, sl, nn, (uh - ul) / 2 + .03, .11, .02, () => 'timber', 'local', .75);
      }
      // sag: zero at the gable ends, so the gables still meet the roof
      for (const m in B) {
        const P = B[m].P;
        for (let i = start[m] || 0; i < P.length; i += 3) {
          const t = ((P[i] * U[0] + P[i + 1] * U[1]) - ul) / Math.max(1e-3, uh - ul); if (t < 0 || t > 1) continue;
          const h = Math.max(0, Math.min(1, (P[i + 2] - (ZT - OV * tn)) / Math.max(1e-3, zr - ZT + OV * tn)));
          P[i + 2] -= SAG * Math.sin(Math.PI * t) * (.35 + .65 * h);
        }
      }
      for (const [uu, key, sg] of [[u0, 'lo', -1], [u1, 'hi', 1]]) {   // gables, not where it runs into another roof
        if (key in ri.ext) continue;
        const uw = uu - sg * T / 2, o = W(uw, 0, 0);
        const alongV = al === 'x' ? [0, 1, 0] : [1, 0, 0], nG = al === 'x' ? [sg, 0, 0] : [0, sg, 0];
        prism(B, [[v0, ZT], [v1, ZT], [vc, zr]], o, alongV, nG, T, n => dot(n, nG) > 0 ? GABLE : (GABLE !== 'siding' ? 'plaster' : 'siding'), GABLE);
        if (look(STOREYS - 1)[2] || STYLE === 'stone_timber') {
          const dpt = T + 2 * BT, P = (v, z) => at(o, alongV, v, UPZ, z);
          beam(B, P(v0, ZT + .07), P(v1, ZT + .07), nG, .14, dpt);
          beam(B, P(vc, ZT + .14), P(vc, zr - .05), nG, .16, dpt);
          const zcol = ZT + (zr - ZT) * .55, hw = half * .45;
          beam(B, P(vc - hw, zcol), P(vc + hw, zcol), nG, .12, dpt);
          if (STYLE !== 'plank_barn') { beam(B, P(vc - .08, ZT + (zcol - ZT) * .25), P(vc - hw * .8, ZT + .14), nG, .1, dpt); beam(B, P(vc + .08, ZT + (zcol - ZT) * .25), P(vc + hw * .8, ZT + .14), nG, .1, dpt); }
          if (first && half > 1.6 && SP.gableWindow !== false && !(SP.chimney && (sg > 0) === (SP.chimney === 'right')))
            place(STYLE === 'plank_barn' ? 'window_shut' : 'window', P(vc, ZT + .3), nG, [.85, 1, .85], 'roof');
        }
      }
      Object.assign(ri, { zr, vc, U, V, u0, u1, v0, v1, ul, uh });
    }
    for (const ri of roofInfo) roof(ri, RF, false, true);
    const m0 = roofInfo[0];

    // ---- chimney: a full stack from a hearth (inside on timber houses, outside the gable on stone ones) ----
    if (SP.chimney) {
      const sg = SP.chimney === 'right' ? 1 : -1, { U, V, vc: vcen } = m0;
      const uo = sg > 0 ? m0.u1 : m0.u0, ui = uo - sg * T;
      const WP = (u, v, z) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v, z];
      const ext = SP.chimneyOutside ?? (STYLE === 'stone_cottage' || STYLE === 'stone_timber');
      const ztop = m0.zr + .9, zj = ztop - 2.6;
      const column = (uc, hu, hv, za, zb, outd = null, quoins = true) => {
        box(S, WP(uc, vcen, (za + zb) / 2), U, V, UPZ, hu, hv, (zb - za) / 2, () => 'fieldstone', 'world', .92);
        if (!quoins || outd == null) return;
        for (const sv of [-1, 1]) {
          let z = za, i = 0;
          while (z < zb - .05) {
            const hq = Math.min(.24, zb - z), lq = i % 2 === 0 ? .32 : .2;
            const cu = i % 2 === 0 ? uc + outd * (hu - lq / 2 + .012) : uc + outd * (hu - .1), cv = vcen + sv * (hv - (i % 2 === 0 ? .1 : lq / 2) + .012);
            box(S, WP(cu, cv, z + hq / 2), U, V, UPZ, (i % 2 === 0 ? lq / 2 : .1) + .01, (i % 2 === 0 ? .1 : lq / 2) + .01, hq / 2 - .006, () => 'quoin', 'world', RNG.uniform(.85, 1.05));
            z += hq; i++;
          }
        }
      };
      const hearth = (uFace, inward, depth, top) => {
        const ow = .78, oh = .82, hw = .66, uc = uFace + inward * depth / 2;
        for (const sv of [-1, 1]) box(S, WP(uc, vcen + sv * (ow / 2 + (hw - ow / 2) / 2), oh / 2), U, V, UPZ, depth / 2, (hw - ow / 2) / 2, oh / 2, () => 'fieldstone');
        box(S, WP(uc, vcen, (oh + top) / 2), U, V, UPZ, depth / 2, hw, (top - oh) / 2, () => 'fieldstone');
        box(S, WP(uFace + inward * .04, vcen, oh / 2), U, V, UPZ, .04, ow / 2, oh / 2, () => 'fieldstone', 'world', [.22, .2, .19]);
        box(S, WP(uFace + inward * (depth + .18), vcen, .05), U, V, UPZ, .2, hw + .1, .02, () => 'quoin');
        beam(S, WP(uFace + inward * (depth + .05), vcen - hw - .06, oh + .06), WP(uFace + inward * (depth + .05), vcen + hw + .06, oh + .06), mul(U, inward), .14, .14);
      };
      if (ext) {
        column(uo + sg * .36, .36, .62, 0, ZT - .55, sg);
        box(S, WP(uo + sg * .3, vcen, ZT - .45), U, V, UPZ, .3, .5, .1, () => 'quoin');
        column(uo + sg * .3, .27, .34, ZT - .55, zj + .4, sg, false);
        hearth(ui, -sg, .32, 1.55);
        place('chimney', WP(uo + sg * .3, vcen, zj), neg(V), [1, 1, 1], 'roof');
      } else {
        const inn = -sg;
        hearth(ui, inn, .6, H);
        column(ui + inn * .3, .27, .34, H, zj + .4);
        place('chimney', WP(ui + inn * .3, vcen, zj), neg(V), [1, 1, 1], 'roof');
      }
    }
    // ---- life: seeded porch, bench, window boxes, lean-to ----
    const LIFE = SP.life || {}, want = (k, p) => k in LIFE ? !!LIFE[k] : RNG() < p;
    if (DOORS.length) {
      const { loc: dloc, N: dN, A: dA } = DOORS[0];
      if (want('porch', .5) && !SP.porch && STYLE !== 'stone_cottage') place('porch', at(dloc, dN, T / 2 + BT, UPZ, DH + .55), dN);
      if (want('bench', .6)) {
        const sd = RNG.choice([-1, 1]), bc = at(dloc, dA, sd * 1.05, dN, T / 2 + .2);
        box(S, at(bc, UPZ, .42), dA, dN, UPZ, .45, .14, .03, () => 'timber', 'local', .9);
        for (const e of [-1, 1]) box(S, at(bc, dA, e * .36, UPZ, .2), dA, dN, UPZ, .03, .12, .2, () => 'timber', 'local', .8);
      }
    }
    if (WINS.length && (STYLE === 'plaster_timber' || STYLE === 'stone_timber') && want('windowBoxes', .6)) {
      for (const { loc, N: N_, A: A_, k } of WINS) {
        if (k === 0 && STYLE === 'stone_timber') continue;
        if (RNG() < .55) continue;
        const c = at(loc, N_, T / 2 + .12, UPZ, -.12);
        box(S, c, A_, N_, UPZ, .33, .09, .07, () => 'timber', 'local', .85);
        box(S, at(c, UPZ, .1), A_, N_, UPZ, .3, .08, .05, () => 'thatch', 'world', [.28, .5, .2]);
        for (let i = 0; i < 5; i++) box(S, at(c, A_, RNG.uniform(-.27, .27), N_, RNG.uniform(-.05, .05), UPZ, .15), A_, N_, UPZ, .03, .03, .03, () => 'plaster', 'world', RNG.choice([[.85, .2, .15], [.95, .8, .3], [.8, .4, .6]]));
      }
    }
    let leanto = null;
    const leanOn = 'leanto' in LIFE ? LIFE.leanto : ((STYLE === 'plank_barn' || STYLE === 'stone_cottage') && RNG() < .8);
    if (leanOn && !doorGable(SP.chimney === 'right' ? -1 : 1) && SP.room4lean?.(SP.chimney === 'right' ? -1 : 1, m0)) {
      const sg = SP.chimney === 'right' ? -1 : 1, { U, V, vc: vcen } = m0, uo = sg > 0 ? m0.u1 : m0.u0;
      const WP = (u, v, z) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v, z];
      const span = Math.min(3.2, (m0.v1 - m0.v0) * .7), dep = 1.5, zh = Math.min(ZT - .15, 2.15), zl = zh - .55;
      for (const sv of [-1, 1]) beam(S, WP(uo + sg * dep, vcen + sv * span / 2, 0), WP(uo + sg * dep, vcen + sv * span / 2, zl), U, .14, .14);
      beam(S, WP(uo + sg * dep, vcen - span / 2 - .1, zl - .07), WP(uo + sg * dep, vcen + span / 2 + .1, zl - .07), mul(U, sg), .14, .14);
      const pe = WP(uo + sg * (dep + .25), vcen, zl - .02 - .25 * (zh - zl) / dep), top = WP(uo, vcen, zh);
      const up = nrm(sub(top, pe)); let nr = cross(V, up); if (nr[2] <= 0) nr = cross(up, V); nr = nrm(nr);
      leanto = { pe, up, nr, V, vcen, span, L: len(sub(top, pe)), lm: ROOF === 'thatch' ? 'shingle' : ROOFMAT };
      if (STYLE === 'plank_barn') {
        box(S, WP(uo + sg * .45, vcen, .8), U, V, UPZ, .3, span * .3, .04, () => 'timber', 'local');
        for (const sv of [-1, 1]) box(S, WP(uo + sg * .45, vcen + sv * (span * .3 - .06), .4), U, V, UPZ, .25, .04, .4, () => 'timber', 'local', .8);
      } else for (let row = 0; row < 4; row++) for (let i = 0; i < 8 - row; i++) {
        const vv = vcen - .75 + (i + row * .5) * .2, zz = .1 + row * .17;
        cyl(S, WP(uo + sg * .2, vv, zz), WP(uo + sg * .85, vv, zz), .09, 'timber', 7, 1, RNG.uniform(.7, 1.1));
      }
    }
    const leanRoof = (B, FAR) => {
      if (!leanto) return;
      const { pe, up, nr, V, vcen, span, L, lm } = leanto;
      box(B, at(pe, up, L / 2, nr, .025), V, neg(up), nr, span / 2 + .2, L / 2, .025, n => FAR && dot(n, nr) > .3 ? lm : 'floor', 'local');
      if (!FAR) courses(B, pe, up, V, nr, vcen - span / 2 - .2, vcen + span / 2 + .2, L, lm);
    };
    leanRoof(RF, false);
    for (let i = 0; i < (SP.dormers || 0); i++) {
      const { U, V } = m0, L = m0.u1 - m0.u0, uu = m0.u0 + L * (i + 1) / (SP.dormers + 1), tn = Math.tan(PITCH);
      const dd = PMETA.dormer.box[1], vv = m0.v0 + .05 + dd, zz = ZT + .05 * tn - .05;
      place('dormer', [U[0] * uu + V[0] * vv, U[1] * uu + V[1] * vv, zz], neg(V), [1, 1, 1], 'roof');
    }
    if (SP.sign) {
      const run = runs.find(r => r.kind === 'outer' && r.cells.some(c => same(c, SP.sign)));
      if (run) { const [f] = jettied(run, 0), [O, A, N] = frameOf(run, f); place('sign', at(O, A, sOf(run, SP.sign), N, T / 2 + BT, UPZ, H - .25), N); }
    }
    if (SP.stair) {
      const rc = SP.stair.cell, run = runs.find(r => r.kind === 'outer' && r.cells.some(c => same(c, rc)));
      if (run) { const [f] = jettied(run, 0), [O, A, N] = frameOf(run, f); place('stair', at(O, A, sOf(run, rc) - .5 - PMETA.stair.box[0], N, T / 2 + .01), N); }
    }
    // the far roof: slabs instead of courses, coarse thatch; its own random streams (the near one is untouched)
    // (not built in the game: the roof's courses are 2-6k triangles a house, drawn whatever the distance; the
    // pieces' LOD is what counts. SP.farRoof builds it, as build_house.py --far)
    if (SP.farRoof) {
      RNG = rng(SP.seed + 4099); CRNG = rng(SP.seed * 7919 + 1);
      const ri2 = roofInfo.map(r => ({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, along: r.along, ext: r.ext }));
      for (const ri of ri2) roof(ri, RFF, true, false);
      leanRoof(RFF, true);
    }
    return { S, RF, RFF, placed, doorOps, ZT, H, STOREYS, zr: Math.max(...roofInfo.map(r => r.zr)), bbox: [XMIN - 1, YMIN - 1, XMAX + 1, YMAX + 1] };
  }

  // ---------------------------------------------------------------- what each building is (defaults by its role)
  const ROLE = s => String(s || '').toLowerCase().replace(/\s*\d+$/, '');
  function placeOf(rooms) {
    for (const p of state.places || []) {
      if (p.x0 == null) continue;
      for (const r of rooms) if (p.x0 <= r.x1 && p.x1 >= r.x0 && p.z0 <= r.z1 && p.z1 >= r.z0) return p;
    }
    return null;
  }
  const STYLES = ['plaster_timber', 'stone_timber', 'plank_barn', 'stone_cottage'], ROOFS = ['shingle', 'tile', 'thatch'];
  function specFor(b, seed, roleOverride) {
    const p = roleOverride ? {} : (placeOf(b.rooms) || {}), role = roleOverride || ROLE(p.kind || p.id), R = rng(seed), o = {};
    const pick = arr => { let t = R() * arr.reduce((n, a) => n + a[0], 0); for (const a of arr) if ((t -= a[0]) <= 0) return a[1]; return arr[0][1]; };
    if (/tavern|inn/.test(role)) Object.assign(o, { style: 'stone_timber', storeys: 2, roof: 'tile', pitch: 44, chimney: 'right', sign: true, braces: 'herringbone', dormers: 1 });
    else if (/smith|forge/.test(role)) Object.assign(o, { style: 'stone_cottage', storeys: 1, roof: 'shingle', pitch: 40, chimney: R() < .5 ? 'left' : 'right' });
    else if (/stable|barn|mill/.test(role)) Object.assign(o, { style: 'plank_barn', storeys: 1, roof: 'shingle', pitch: 45 });
    else if (/temple|library|guard|barrack|hall|keep/.test(role)) Object.assign(o, { style: 'stone_timber', storeys: 2, roof: R() < .5 ? 'tile' : 'shingle', pitch: 46, braces: 'cross', chimney: R() < .5 ? 'left' : false });
    else if (/shop|bak|alchem|store|market|tailor|apothec/.test(role)) Object.assign(o, { style: 'plaster_timber', storeys: 2, roof: R() < .5 ? 'shingle' : 'tile', pitch: 48, jetty: { d: .3 }, sign: true, chimney: R() < .6 ? 'left' : 'right', braces: 'chevron' });
    else if (role === 'tallhouse') Object.assign(o, { style: 'plaster_timber', storeys: 2, roof: R() < .6 ? 'shingle' : 'tile', pitch: 52, jetty: { d: .3 }, chimney: R() < .5 ? 'left' : 'right', braces: R() < .5 ? 'chevron' : 'cross' });
    else if (role === 'stonehouse') Object.assign(o, R() < .55 ? { style: 'stone_cottage', storeys: 1, roof: R() < .5 ? 'thatch' : 'shingle', pitch: 50, chimney: 'left' } : { style: 'stone_timber', storeys: 2, roof: 'tile', pitch: 46, chimney: 'right', braces: 'herringbone' });
    else Object.assign(o, pick([
      [.35, { style: 'plaster_timber', storeys: 2, roof: 'shingle', pitch: 48, jetty: { d: .3 }, chimney: 'right', braces: 'corner' }],
      [.15, { style: 'plaster_timber', storeys: 1, roof: 'thatch', pitch: 50, chimney: 'left', braces: 'chevron' }],
      [.3, { style: 'stone_cottage', storeys: 1, roof: 'thatch', pitch: 52, chimney: R() < .5 ? 'left' : 'right' }],
      [.2, { style: 'stone_timber', storeys: 2, roof: 'tile', pitch: 46, chimney: 'left', braces: 'herringbone' }]]));
    // the place's own fields (scenario places: style, storeys, jetty, roof, pitch, chimney, porch, sign, dormers, seed)
    if (STYLES.includes(p.style)) o.style = p.style;
    if (p.storeys === 1 || p.storeys === 2) o.storeys = p.storeys;
    if (ROOFS.includes(p.roof)) o.roof = p.roof;
    if (Number.isFinite(+p.pitch) && p.pitch) o.pitch = Math.max(30, Math.min(60, +p.pitch));
    if (p.jetty === false) o.jetty = null; else if (p.jetty === true) o.jetty = { d: .3 }; else if (Number.isFinite(+p.jetty) && p.jetty) o.jetty = { d: Math.max(.1, Math.min(.5, +p.jetty)) };
    if (p.chimney === false || p.chimney === 'left' || p.chimney === 'right') o.chimney = p.chimney;
    if (typeof p.porch === 'boolean') o.porch = p.porch;
    if (typeof p.sign === 'boolean') o.sign = p.sign;
    if (Number.isFinite(+p.dormers)) o.dormers = Math.max(0, Math.min(3, +p.dormers | 0));
    if (o.style === 'stone_cottage' || o.style === 'plank_barn') o.storeys = Math.min(o.storeys || 1, o.style === 'plank_barn' ? 1 : 2);
    if (o.roof === 'thatch' && o.storeys > 1 && !p.roof) o.roof = 'shingle';
    if (o.storeys < 2) o.jetty = null;
    if (o.dormers && o.storeys < 2) o.dormers = 0;
    o.seed = Number.isFinite(+p.seed) ? +p.seed | 0 : seed;
    o.role = role || 'house'; o.place = p.id || null;
    return o;
  }

  // ---------------------------------------------------------------- rooms -> buildings
  const roomKey = r => r.x0 + ',' + r.z0 + ',' + r.x1 + ',' + r.z1;
  function group(rooms) {
    // rooms whose rings of wall squares touch are one building
    const ring = r => { const s = new Set(); for (const c of r.cells) { const [x, z] = c.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) s.add((x + dx) + ',' + (z + dz)); } return s; };
    const rs = rooms.map(r => ({ r, ring: ring(r) })), parent = rs.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      let touch = false; for (const c of rs[i].ring) if (rs[j].ring.has(c)) { touch = true; break; }
      if (touch) parent[find(j)] = find(i);
    }
    const out = new Map();
    rs.forEach((x, i) => { const k = find(i); (out.get(k) || out.set(k, []).get(k)).push(x.r); });
    return [...out.values()].map(rooms => ({ key: rooms.map(roomKey).sort().join('|'), rooms }));
  }

  // ---------------------------------------------------------------- materials
  const q = () => window.TABLEFOLK_GFX?.quality || 'medium';
  const lite = () => !!window.TABLEFOLK_GFX?.lite || q() === 'light';
  let mats = null;
  function texture(name, kind, srgb, small) {
    const t = new BABYLON.Texture(BASE() + 'textures/kit/' + name + '_' + kind + (small ? '_512' : '') + '.webp?v=' + KIT_V, state.scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.gammaSpace = !!srgb; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8;
    return t;
  }
  function material(name, roofSet) {
    const sc = state.scene, lt = lite(), small = lt || name === 'quoin' || name === 'floor';
    const m = new BABYLON.PBRMaterial('kit_' + (roofSet ? 'roof_' : '') + name, sc);
    const shared = roofSet && mats?.wall[name];   // the roof set shares the wall set's textures
    m.albedoTexture = shared ? shared.albedoTexture : texture(name, 'color', true, small);
    m.bumpTexture = shared ? shared.bumpTexture : texture(name, 'normal', false, small);
    m.bumpTexture.level = name === 'plaster' ? .7 : 1;
    m.invertNormalMapX = true; m.invertNormalMapY = false;   // OpenGL normal maps on code-built geometry (as walls.js)
    if (!lt) { m.metallicTexture = shared ? shared.metallicTexture : texture(name, 'rough', false, q() !== 'high'); m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false; m.useRoughnessFromMetallicTextureAlpha = false; }
    m.metallic = 0; m.roughness = lt ? .9 : 1;
    m.albedoColor = new BABYLON.Color3(...({ shingle: [.86, .84, .82], thatch: [.95, .92, .88], plaster: [.97, .95, .9] }[name] || [1, 1, 1]));
    m.environmentIntensity = .45; m.maxSimultaneousLights = 8; m._tfMatte = true;
    m.backFaceCulling = false;   // the cutaway draws a back face seen through a cut as a dark section
    if (!roofSet) { storeyPlugin(m); window.tablefolkCutaway?.attach?.(m, false, true); }
    else { fadePlugin(m); window.tablefolkCutaway?.seeThrough?.(m); }   // (see-through: a closed building's roof between the follow camera and the player)
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    return m;
  }
  function materials() {
    if (mats && mats.scene === state.scene && !mats.wall.plaster?.isDisposed?.()) return mats;
    mats = { scene: state.scene, wall: {}, roof: {} };
    for (const n of MATS) Object.defineProperty(mats.wall, n, { configurable: true, enumerable: true, get() { const v = material(n, false); Object.defineProperty(mats.wall, n, { value: v, enumerable: true }); return v; } });
    for (const n of MATS) Object.defineProperty(mats.roof, n, { configurable: true, enumerable: true, get() { const v = material(n, true); Object.defineProperty(mats.roof, n, { value: v, enumerable: true }); return v; } });
    return mats;
  }

  // ---- the storey above clipped while the player is inside (a box in xz, everything above y) ----
  const clipU = { on: 0, x0: 0, z0: 0, x1: 0, z1: 0, y: 0 };
  let Storey = null;
  function storeyPlugin(m) {
    try {
      const WGSL = BABYLON.ShaderLanguage?.WGSL;
      Storey ||= class extends BABYLON.MaterialPluginBase {
        constructor(mat) { super(mat, 'TfStorey', 305, { TFSTOREY: false }); this._enable(true); }
        getClassName() { return 'TfStoreyPlugin'; }
        isCompatible() { return true; }
        prepareDefines(d) { d.TFSTOREY = true; }
        getUniforms(lang) { const ubo = [{ name: 'tfStorey', size: 4, type: 'vec4' }, { name: 'tfStoreyY', size: 4, type: 'vec4' }]; return lang === WGSL ? { ubo } : { ubo, fragment: '#ifdef TFSTOREY\nuniform vec4 tfStorey;\nuniform vec4 tfStoreyY;\n#endif\n' }; }
        bindForSubMesh(ubo) { ubo.updateFloat4('tfStorey', clipU.x0, clipU.z0, clipU.x1, clipU.z1); ubo.updateFloat4('tfStoreyY', clipU.y, clipU.on, 0, 0); }
        getCustomCode(type, lang) {
          if (type !== 'fragment') return null;
          if (lang === WGSL) return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFSTOREY
if (uniforms.tfStoreyY.y > 0.5) { let sp = fragmentInputs.vPositionW;
  if (sp.y > uniforms.tfStoreyY.x && sp.x > uniforms.tfStorey.x && sp.x < uniforms.tfStorey.z && sp.z > uniforms.tfStorey.y && sp.z < uniforms.tfStorey.w) { discard; } }
#endif
` };
          return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFSTOREY
if (tfStoreyY.y > 0.5) { vec3 sp = vPositionW;
  if (sp.y > tfStoreyY.x && sp.x > tfStorey.x && sp.x < tfStorey.z && sp.z > tfStorey.y && sp.z < tfStorey.w) discard; }
#endif
` };
        }
      };
      new Storey(m);
    } catch (e) { console.warn('[buildings] storey plugin', e); }
  }

  // ---- the roof fade: a building's index (vertex or instance attribute tfRid, 0 = never fades) looks up its alpha
  // in a 256 x 1 texture; below it the fragment is dithered away (screen-door: no blending, no sorting)
  const fadeData = new Uint8Array(256 * 4).fill(255);
  let fadeTex = null, fadeDirty = true;
  function fadeTexture() {
    if (fadeTex && fadeTex.getScene() === state.scene && !fadeTex.isDisposed?.()) return fadeTex;
    fadeTex = new BABYLON.RawTexture(fadeData, 256, 1, BABYLON.Engine.TEXTUREFORMAT_RGBA, state.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    fadeTex.wrapU = fadeTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; fadeDirty = false;
    return fadeTex;
  }
  const hasRid = mesh => !!mesh?.isVerticesDataPresent?.('tfRid');
  let Fade = null;
  function fadePlugin(m) {
    try {
      const WGSL = BABYLON.ShaderLanguage?.WGSL;
      Fade ||= class extends BABYLON.MaterialPluginBase {
        constructor(mat) { super(mat, 'TfRoofFade', 306, { TFROOF: false }); this._enable(true); }
        getClassName() { return 'TfRoofFadePlugin'; }
        isCompatible() { return true; }
        prepareDefines(d, scene, mesh) { d.TFROOF = hasRid(mesh); }
        getAttributes(attrs, scene, mesh) { if (hasRid(mesh)) attrs.push('tfRid'); }
        getSamplers(s) { s.push('tfRoofSampler'); }
        getUniforms(lang) { return lang === WGSL ? { ubo: [] } : { ubo: [], fragment: '' }; }
        bindForSubMesh(ubo) { ubo.setTexture('tfRoofSampler', fadeTexture()); }
        getCustomCode(type, lang) {
          if (lang === WGSL) {
            if (type === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: '#ifdef TFROOF\nattribute tfRid: f32;\nvarying vTfRid: f32;\n#endif\n', CUSTOM_VERTEX_MAIN_END: '#ifdef TFROOF\nvertexOutputs.vTfRid = vertexInputs.tfRid;\n#endif\n' };
            return { CUSTOM_FRAGMENT_DEFINITIONS: 'var tfRoofSamplerSampler: sampler; var tfRoofSampler: texture_2d<f32>;\n#ifdef TFROOF\nvarying vTfRid: f32;\n#endif\n', CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFROOF
{ let ra = textureSample(tfRoofSampler, tfRoofSamplerSampler, vec2f((floor(fragmentInputs.vTfRid + 0.5) + 0.5) / 256.0, 0.5)).r;
  let rn = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
  if (ra < 0.998 && ra < rn) { discard; } }
#endif
` };
          }
          if (type === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: '#ifdef TFROOF\nattribute float tfRid;\nvarying float vTfRid;\n#endif\n', CUSTOM_VERTEX_MAIN_END: '#ifdef TFROOF\nvTfRid = tfRid;\n#endif\n' };
          return { CUSTOM_FRAGMENT_DEFINITIONS: 'uniform sampler2D tfRoofSampler;\n#ifdef TFROOF\nvarying float vTfRid;\n#endif\n', CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFROOF
{ float ra = texture(tfRoofSampler, vec2((floor(vTfRid + 0.5) + 0.5) / 256.0, 0.5)).r;
  float rn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ra < 0.998 && ra < rn) discard; }
#endif
` };
        }
      };
      new Fade(m);
    } catch (e) { console.warn('[buildings] fade plugin', e); }
  }

  // ---------------------------------------------------------------- pieces (loaded once, thin instances)
  let pieces = null;   // Promise<{ name: { near: [{mesh, mat}], far: [...] } }>
  function pieceFile(name, far) { return name + (far ? '_lod' : (lite() && /^(door|door_leaf|window)$/.test(name) ? '_512' : '')) + '.glb'; }
  function loadPieces() {
    if (pieces && pieces.scene === state.scene && (!pieces.ready || pieces.ready.alive())) return pieces.p;
    const sc = state.scene, dir = BASE() + 'models/kit/';
    const one = async (name, far) => {
      const c = await BABYLON.SceneLoader.LoadAssetContainerAsync(dir, pieceFile(name, far) + '?v=' + KIT_V, sc);
      const outp = [];
      for (const m of c.meshes) {
        if (!(m.getTotalVertices?.() > 0)) continue;
        m.computeWorldMatrix(true);
        // bake the node's transform (the loader's handedness flip included) into a plain mesh, front faces by
        // the normals (thin instances take no mirrored matrices)
        const W = m.getWorldMatrix(), P = m.getVerticesData('position'), Nn = m.getVerticesData('normal'), UV = m.getVerticesData('uv'), I = m.getIndices();
        const p = new Float32Array(P.length), n = new Float32Array(P.length), v = BABYLON.Vector3.Zero(), w = BABYLON.Vector3.Zero();
        for (let i = 0; i < P.length; i += 3) {
          BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(P[i], P[i + 1], P[i + 2], W, v); p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z;
          BABYLON.Vector3.TransformNormalFromFloatsToRef(Nn[i], Nn[i + 1], Nn[i + 2], W, w); w.normalize(); n[i] = w.x; n[i + 1] = w.y; n[i + 2] = w.z;
        }
        const idx = orient(p, n, I);
        // the template (cloned for roof pieces and door leaves) and its thin-instance twin (own geometry: a
        // shared one leaks instance buffers between meshes, rendering.md "Instances and lights")
        const tpl = new BABYLON.Mesh('wall_kitpiece_tpl_' + name + (far ? '_far' : ''), sc), vd = new BABYLON.VertexData();
        vd.positions = p; vd.normals = n; vd.uvs = UV; vd.indices = idx; vd.applyToMesh(tpl);
        // shared by wall and roof pieces; transparencyMode null so a fading roof's chimney blends (the loader pins OPAQUE)
        const mat = m.material; if (mat) { mat.sideOrientation = null; mat.backFaceCulling = false; mat.maxSimultaneousLights = 8; mat.environmentIntensity = .5; mat.transparencyMode = null; window.TABLEFOLK_LOOK?.matte?.(mat); }
        tpl.material = mat; tpl.isPickable = false; tpl.receiveShadows = true; tpl.isVisible = false;
        const inst = tpl.clone('wall_kitpiece_' + name + (far ? '_far' : '')); inst.makeGeometryUnique(); inst.isVisible = false; inst.isPickable = false;
        tpl.setVerticesData('tfRid', new Float32Array(p.length / 3), false, 1);   // (after the twin took its own geometry: its tfRid is per instance)
        outp.push({ tpl, inst, material: mat });
      }
      // the materials and textures stay (in the scene: tablefolkGfxGB counts them); the loaded nodes go
      c.addAllToScene();
      for (const m of c.meshes) m.dispose(false, false);
      for (const t of c.transformNodes || []) t.dispose(false, false);
      return outp;
    };
    const p = Promise.all(PIECES.flatMap(n => [one(n, false), one(n, true)])).then(list => {
      const o = {}; PIECES.forEach((n, i) => { o[n] = { near: list[2 * i], far: list[2 * i + 1] }; });
      // glass glows warm at night (roofs.js windowGlow: dark, cool texels on upright faces)
      for (const n of ['window', 'window_shut', 'dormer']) for (const m of [...o[n].near, ...o[n].far]) window.tablefolkRoofs?.windowGlow?.(m.material);
      for (const n of PIECES) for (const m of [...o[n].near, ...o[n].far]) { window.tablefolkCutaway?.attach?.(m.material, false, true); if (m.material && !m.material._tfStorey) { m.material._tfStorey = true; storeyPlugin(m.material); fadePlugin(m.material); } }
      o.alive = () => !o.window.near[0].tpl.isDisposed();
      return o;
    });
    pieces = { scene: sc, p };
    p.catch(e => { console.warn('[buildings] pieces', e); pieces = null; });
    return p;
  }
  // a triangle is front-facing in Babylon when ((b - a) x (c - a)) . n < 0 (walls.js's boxes)
  function orient(p, n, I) {
    const out = new Uint32Array(I.length);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      const s = cx * (n[a] + n[b] + n[c]) + cy * (n[a + 1] + n[b + 1] + n[c + 1]) + cz * (n[a + 2] + n[b + 2] + n[c + 2]);
      if (s > 0) { out[t] = I[t]; out[t + 1] = I[t + 2]; out[t + 2] = I[t + 1]; } else { out[t] = I[t]; out[t + 1] = I[t + 1]; out[t + 2] = I[t + 2]; }
    }
    return out;
  }
  // a placement (reference frame) -> a Babylon matrix for a baked piece (Babylon-local: front +z, the reference's +x is -x)
  function pieceMatrix(pl, top) {
    const c = Math.cos(pl.ang), s = Math.sin(pl.ang), [sx, sy, sz] = pl.scale;
    // Babylon-local basis -> reference-local (-a, -c, b) -> scale -> rotate about Z -> Babylon (X, Z, Y)
    const img = v => { const x = v[0] * sx, y = v[1] * sy, z = v[2] * sz, X = c * x - s * y, Y = s * x + c * y; return [X, z, Y]; };
    const ex = img([-1, 0, 0]), ey = img([0, 0, 1]), ez = img([0, -1, 0]);
    let t = [pl.loc[0], pl.loc[2] + top, pl.loc[1]];
    if (pl.off) { const o = img(pl.off); t = [t[0] + o[0], t[1] + o[1], t[2] + o[2]]; }
    return BABYLON.Matrix.FromValues(ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, t[0], t[1], t[2], 1);
  }

  // ---------------------------------------------------------------- the scene side
  let list = [];               // the built buildings
  const byKey = new Map();
  let builtTok = 0, lastStats = null, claimedCells = new Set();
  function meshOf(name, bk, mat, top, rid = null) {
    if (!bk || !bk.I.length) return null;
    const m = new BABYLON.Mesh(name, state.scene), vd = new BABYLON.VertexData(), P = bk.P, N = bk.N, n = P.length;
    const pos = new Float32Array(n), nor = new Float32Array(n);
    for (let i = 0; i < n; i += 3) { pos[i] = P[i]; pos[i + 1] = P[i + 2] + top; pos[i + 2] = P[i + 1]; nor[i] = N[i]; nor[i + 1] = N[i + 2]; nor[i + 2] = N[i + 1]; }
    vd.positions = pos; vd.normals = nor; vd.uvs = bk.U; vd.colors = bk.C; vd.indices = orient(pos, nor, bk.I); vd.applyToMesh(m);
    if (rid) m.setVerticesData('tfRid', rid instanceof Float32Array ? rid : new Float32Array(n / 3).fill(rid), false, 1);   // the roof fade's building index
    m.material = mat; m.isPickable = false; m.receiveShadows = true; addShadow(m);
    return m;
  }
  // structure: walls (cut by the cutaway, clipped above the ground storey; a walk-in building's go with the
  // walls, state.wallVisuals), roofs (fade), near and far roofs
  // Draw calls (measured 2026-11-27, hearthvale: one mesh per material per building nearly doubled the scene's):
  // the structure of every walk-in building is merged village-wide per material (the storey clip is per pixel, by
  // box, so nothing needs a mesh of its own); a walk-in building keeps its own roof meshes (they fade one by one);
  // closed buildings are merged whole, roofs too (they never fade: the see-through dither is per pixel).
  function mergeInto(acc, B, rid = 0) {
    for (const [mn, b] of Object.entries(B)) {
      const t = acc[mn] || (acc[mn] = { P: [], N: [], U: [], C: [], I: [], R: [] }), o = t.P.length / 3;
      for (let i = 0; i < b.P.length / 3; i++) t.R.push(rid);
      for (let i = 0; i < b.P.length; i++) { t.P.push(b.P[i]); t.N.push(b.N[i]); }
      for (let i = 0; i < b.U.length; i++) t.U.push(b.U[i]);
      for (let i = 0; i < b.C.length; i++) t.C.push(b.C[i]);
      for (let i = 0; i < b.I.length; i++) t.I.push(b.I[i] + o);
    }
    return acc;
  }
  function makeBuilding(b, A, top, walkIn) {
    const M = materials();
    Object.assign(b, { A, top, far: false, center: [(A.bbox[0] + A.bbox[2]) / 2, (A.bbox[1] + A.bbox[3]) / 2], rid: walkIn ? list.length + 1 : 0 });
    // the roof's box (the camera ray test in roofs.js): the footprint with its overhang, from the eaves to the ridge
    const [x0, z0, x1, z1] = A.bbox;
    b.roofBox = { lo: new BABYLON.Vector3(x0 + .3, top + A.ZT - .5, z0 + .3), hi: new BABYLON.Vector3(x1 - .3, top + A.zr + .5, z1 - .3) };
    return b;
  }
  let walkStruct = [], walkRoof = [];
  function mergeWalkIn(top) {
    const M = materials(), acc = {}, racc = {};
    for (const b of list) { mergeInto(acc, b.A.S); mergeInto(racc, b.A.RF, b.rid); }
    walkStruct = [];
    for (const [mn, bk] of Object.entries(acc)) { const m = meshOf('wall_kit_' + mn, bk, M.wall[mn], top); if (m) { walkStruct.push(m); state.wallVisuals.push(m); } }
    for (const m of walkRoof) try { m.dispose(false, false); } catch {}
    walkRoof = [];
    for (const [mn, bk] of Object.entries(racc)) { const m = meshOf('roof_kit_' + mn, bk, M.roof[mn], top, new Float32Array(bk.R)); if (m) { m.metadata = { roof: true }; walkRoof.push(m); } }
  }
  let closedMeshes = [], closedQueued = false;
  function mergeClosed() {
    if (closedQueued) return; closedQueued = true;
    queueMicrotask(() => {
      closedQueued = false;
      for (const m of closedMeshes) try { m.dispose(false, false); } catch {}
      closedMeshes = [];
      if (!closedList.length || !state.scene) return;
      const M = materials(), S = {}, R = {}, top = closedList[0].top;
      for (const b of closedList) { mergeInto(S, b.A.S); mergeInto(R, b.A.RF); }
      for (const [mn, bk] of Object.entries(S)) { const m = meshOf('wall_kit_closed_' + mn, bk, M.wall[mn], top); if (m) closedMeshes.push(m); }
      for (const [mn, bk] of Object.entries(R)) { const m = meshOf('roof_kit_closed_' + mn, bk, M.roof[mn], top, 0); if (m) closedMeshes.push(m); }
    });
  }
  function disposeAll() {
    for (const m of walkRoof) try { m.dispose(false, false); } catch {}
    claimedCells = new Set(); walkStruct = []; walkRoof = [];   // (the structure is in state.wallVisuals: disposed with the walls)
    fadeData.fill(255); fadeDirty = true;
    list = []; byKey.clear();
    if (instanced.length) refreshInstances();
  }
  // the squares beyond a gable (a lean-to wants two free squares of ground there)
  function freeBeyond(spec) {
    return (sg, m0) => {
      const ax = m0.U[0] ? 'x' : 'z', edge = sg > 0 ? m0.u1 : m0.u0;
      for (let d = 1; d <= 2; d++) for (let v = Math.ceil(m0.v0); v <= Math.floor(m0.v1); v++) {
        const u = Math.round(edge + sg * d), x = ax === 'x' ? u : v, z = ax === 'x' ? v : u;
        if (spec.blocked(x, z)) return false;
      }
      return true;
    };
  }
  function build(cell, top, rooms) {
    const t0 = performance.now();
    disposeAll();
    if (!enabled() || !rooms?.length || !state.scene) return null;
    const M = materials(), H = wallH(), claimed = new Set(), tok = ++builtTok;
    const scnSeed = (state.envScn || window.tablefolkScenario?.active?.scn || {}).seed | 0;
    const isW = k => { const w = cell.get(k); return w && (meta(w).type === 'wall' || meta(w).type === 'door'); };
    const allInside = new Set(); for (const r of rooms) for (const c of r.cells) allInside.add(c);
    const timing = [];
    for (const g of group(rooms)) {
      const t1 = performance.now();
      const inside = new Set(), walls = new Set(), doors = new Set();
      for (const r of g.rooms) for (const c of r.cells) inside.add(c);
      for (const c of inside) { const [x, z] = c.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const k = (x + dx) + ',' + (z + dz); if (!inside.has(k) && isW(k)) { walls.add(k); if (meta(cell.get(k)).type === 'door') doors.add(k); } } }
      if (walls.size < 8) continue;
      const r0 = g.rooms[0], seed = (Math.imul(r0.x0 * 92821 ^ r0.z0 * 68917, 2654435761) ^ scnSeed * 7919) >>> 0 & 0x7fffffff;
      const o = specFor(g, seed);
      // the door: front (jetty side, sign), the chimney on a gable, a sign beside the door
      const d0 = [...doors].map(k => k.split(',').map(Number))[0];
      let front = '-y';
      if (d0) { const [x, z] = d0; front = !inside.has(x + ',' + (z + 1)) && inside.has(x + ',' + (z - 1)) ? '+y' : !inside.has(x + ',' + (z - 1)) && inside.has(x + ',' + (z + 1)) ? '-y' : !inside.has((x + 1) + ',' + z) && inside.has((x - 1) + ',' + z) ? '+x' : '-x'; }
      let sign = null;
      if (o.sign && d0) { const along = front.endsWith('y') ? [1, 0] : [0, 1]; for (const s of [1, -1]) { const c = [d0[0] + along[0] * s, d0[1] + along[1] * s]; if (walls.has(c.join(',')) && !doors.has(c.join(',')) && walls.has([c[0] + along[0] * s, c[1] + along[1] * s].join(','))) { sign = c; break; } } }
      const blocked = (x, z) => { const k = x + ',' + z; return isW(k) || allInside.has(k) || !window.tablefolk?.hasGroundAt?.(x, z); };
      const SP = { ...o, H, walls, doors, inside, jetty: o.jetty ? { d: o.jetty.d, sides: [front] } : null, sign, seed: o.seed, blocked };
      SP.room4lean = freeBeyond(SP);
      let A;
      try { A = assemble(SP); } catch (e) { console.warn('[buildings] assemble', g.key, e); continue; }
      const b = makeBuilding({ key: g.key, rooms: g.rooms, spec: o, sp: SP }, A, top, true);
      for (const k of walls) claimed.add(k);
      // a door square the kit did not open (at a run's end) keeps walls.js's door
      for (const k of doors) if (!A.doorOps.some(d => d.o.rc[0] + ',' + d.o.rc[1] === k)) claimed.delete(k);
      list.push(b); byKey.set(b.key, b);
      timing.push(+(performance.now() - t1).toFixed(1));
    }
    if (!list.length) return null;
    mergeWalkIn(top);
    // the pieces: now if loaded, else when they are (under the loading cover)
    const place = P => { if (tok !== builtTok) return; placePieces(P, cell, top); };
    const loaded = loadPieces();
    if (pieces?.ready) place(pieces.ready);
    else { const done = window.tablefolkLoading?.begin('buildings', { step: 'Raising the houses' }); loaded.then(P => { pieces.ready = P; place(P); }).catch(() => {}).finally(() => done?.()); }
    claimedCells = claimed;
    lastStats = { buildings: list.length, ms: +(performance.now() - t0).toFixed(1), perBuilding: timing };
    window.tfMark?.('buildings.build', t0);
    return { cells: claimed };
  }
  // wall pieces: thin instances village-wide (near and far sets); roof pieces: clones (they fade); door leaves on hinges
  let instanced = [];   // [{ mesh, near: bool, name }]
  function placePieces(P, cell, top) {
    for (const b of list) placeBuilding(P, b, cell, top);
    ensureDoorAnimator();
    setInstanced(P);
    refreshInstances();
    lod(true);
  }
  function setInstanced(P) {
    if (instanced.length && instanced[0].mesh === P[PIECES[0]].near[0]?.inst && !instanced[0].mesh.isDisposed()) return;
    instanced = [];
    for (const n of PIECES) for (const far of [false, true]) for (const src of P[n][far ? 'far' : 'near']) instanced.push({ mesh: src.inst, name: n, far });
  }
  function placeBuilding(P, b, cell, top) {
    {
      b.pl = { wall: [], roof: [] };
      // roof pieces (chimney top, dormer, gable windows) are thin instances like the rest, carrying the building's
      // index so they fade with its roof
      for (const pl of b.A.placed) b.pl.wall.push({ name: pl.name, M: pieceMatrix(pl, top), rid: pl.part === 'roof' ? b.rid : 0 });
      // door leaves: the game's hinge and animator (app.js ensureDoorAnimator), the kit's leaf
      if (cell) for (const d of b.A.doorOps) {
        const [x, z] = d.o.rc, w = cell.get(x + ',' + z); if (!w || d.o.upper) continue;
        const alongX = doorAxisOf(cell, x, z), W = .6;
        const pivot = new BABYLON.TransformNode('door_pivot', state.scene), base = alongX ? 0 : -Math.PI / 2;
        pivot.position.set(alongX ? x - W / 2 : x, top, alongX ? z : z - W / 2); pivot.rotation.y = base;
        for (const src of P.door_leaf.near) {
          const m = src.tpl.clone('door_leaf_kit', pivot, true, false); m.isVisible = true;
          // the leaf baked with its hinge at the origin running -x: turned to run +x from the hinge
          m.rotation.y = Math.PI; m.metadata = { proxy: w }; m.isPickable = true; addShadow(m); state.wallVisuals.push(m);
        }
        state.wallVisuals.push(pivot);
        (state.doorLeaves = state.doorLeaves || []).push({ pivot, x, z, alongX, base, angle: 0, door: w });
      }
    }
  }
  function refreshInstances() {
    for (const it of instanced) {
      const mats = [], rids = [];
      for (const b of all()) if (b.pl && b.far === it.far) for (const w of b.pl.wall) if (w.name === it.name) { mats.push(w.M); rids.push(w.rid || 0); }
      if (!mats.length) { it.mesh.thinInstanceCount = 0; it.mesh.isVisible = false; continue; }
      const buf = new Float32Array(mats.length * 16); mats.forEach((M, i) => M.copyToArray(buf, i * 16));
      it.mesh.thinInstanceSetBuffer('matrix', buf, 16, true); it.mesh.thinInstanceSetBuffer('tfRid', new Float32Array(rids), 1, true);
      it.mesh.thinInstanceRefreshBoundingInfo(false); it.mesh.isVisible = true;
      if (!it.shadow) { it.shadow = true; addShadow(it.mesh); }
    }
  }
  // near / far by camera distance (checked four times a second)
  let lodAt = 0;
  function lod(force) {
    const now = performance.now(); if (!force && now - lodAt < 250) return; lodAt = now;
    const cam = state.scene?.activeCamera; if (!cam || !(list.length + closedList.length)) return;
    const e = cam.globalPosition || cam.position; let changed = false;
    for (const b of all()) {
      const d = Math.hypot(b.center[0] - e.x, b.center[1] - e.z, (b.top + b.A.ZT / 2) - e.y);
      const far = b.far ? d > LOD_FAR - LOD_HYST : d > LOD_FAR + LOD_HYST;
      if (far === b.far && !force) continue;
      b.far = far; changed = true;
    }
    if (changed || force) refreshInstances();
  }
  function frame() {
    if (fadeDirty && fadeTex && !fadeTex.isDisposed?.()) { fadeTex.update(fadeData); fadeDirty = false; }
    if (list.length || closedList.length) lod(false);
  }
  function start() { state.scene.onBeforeRenderObservable.add(frame); }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });

  // ---- closed buildings (2026-11-27): the env building models placed as things (a village's inn, stone and tall
  // houses, mill, barracks...: app.js makeCatalogItem) are kit houses too on the default path. Their footprint is
  // the model's (env manifest, odd squares, at least 5), the door in the middle of the front (+z at ry 0), shut;
  // the thing's own collider is unchanged. Not on the wall grid: storeys 2.2 whatever the walls.
  const CLOSED = { inn: ['tavern', [6.67, 8]], blacksmith: ['smithy', [6.95, 6]], barracks: ['guardhouse', [7.5, 4.92]], stable: ['stable', [7, 4.58]], barn: ['barn', [6.5, 9]],
    mill_house: ['mill', [4.7, 5]], sawmill: ['mill', [5, 5]], stone_house: ['stonehouse', [3.78, 5.5]], tall_house: ['tallhouse', [3.68, 6]], house: ['house', [4.68, 5]], fantasy_house: ['house', [5.44, 5.18]] };
  let closedList = [];
  const all = () => closedList.length ? list.concat(closedList) : list;
  function closedWanted(type) { return kitOn() && !!CLOSED[type] && Q.get('kitclosed') !== '0'; }
  function closed(proxy, type) {
    const [role, f] = CLOSED[type], odd = v => Math.max(5, 2 * Math.round((v - .8) / 2) + 1), W = odd(f[0]), D = odd(f[1]);
    const cx = Math.round(proxy.position.x), cz = Math.round(proxy.position.z), q = ((Math.round((proxy.rotation.y || 0) / (Math.PI / 2)) % 4) + 4) % 4;
    const [wx, wz] = q % 2 ? [D, W] : [W, D], hx = (wx - 1) / 2, hz = (wz - 1) / 2, walls = new Set(), inside = new Set(), doors = new Set();
    for (let i = -hx; i <= hx; i++) for (let j = -hz; j <= hz; j++) (Math.abs(i) === hx || Math.abs(j) === hz ? walls : inside).add((cx + i) + ',' + (cz + j));
    const door = [[cx, cz + hz], [cx + hx, cz], [cx, cz - hz], [cx - hx, cz]][q]; doors.add(door.join(','));
    const front = ['+y', '+x', '-y', '-x'][q], scnSeed = (state.envScn || window.tablefolkScenario?.active?.scn || {}).seed | 0;
    const seed = (Math.imul(cx * 92821 ^ cz * 68917 ^ type.length * 7, 2654435761) ^ scnSeed * 7919) >>> 0 & 0x7fffffff;
    const o = specFor({ rooms: [] }, seed, role), along = front.endsWith('y') ? [1, 0] : [0, 1];
    const sign = o.sign ? [door[0] + along[0], door[1] + along[1]] : null;
    const SP = { ...o, H: 2.2, walls, doors, inside, jetty: o.jetty ? { d: o.jetty.d, sides: [front] } : null, sign, seed: o.seed, closedDoor: true, blocked: () => true, room4lean: () => false };
    const top = state.terrainTopY ?? 0, A = assemble(SP);
    const b = makeBuilding({ key: 'closed:' + type + ':' + cx + ',' + cz, rooms: [], spec: { ...o, role }, sp: SP, closed: true }, A, top, false);
    closedList.push(b); mergeClosed();
    const pm = meta(proxy);
    if (pm) { const prev = pm.cleanup; pm.cleanup = () => { try { prev?.(); } catch {} disposeBuilding(b); closedList = closedList.filter(x => x !== b); mergeClosed(); refreshInstances(); }; }
    const go = P => { if (!closedList.includes(b)) return; placeBuilding(P, b, null, top); setInstanced(P); refreshInstances(); lod(true); };
    const loaded = loadPieces();
    if (pieces?.ready) go(pieces.ready);
    else { const done = window.tablefolkLoading?.begin('buildings', { step: 'Raising the houses' }); loaded.then(P => { pieces.ready = P; go(P); }).catch(() => {}).finally(() => done?.()); }
    return b;
  }
  function disposeBuilding(b) {
    b.pl = null;
  }
  function roomBuilding(room) { const k = roomKey(room); return list.find(b => b.rooms.some(r => roomKey(r) === k)) || null; }
  function clip(key) {
    if (!key) { clipU.on = 0; return; }
    if (key === 'all') { Object.assign(clipU, { on: 1, x0: -1e6, z0: -1e6, x1: 1e6, z1: 1e6, y: (state.terrainTopY ?? 0) + wallH() - .2 }); return; }
    const b = byKey.get(key); if (!b || b.A.STOREYS < 2) { clipU.on = 0; return; }
    const [x0, z0, x1, z1] = b.A.bbox;
    Object.assign(clipU, { on: 1, x0: x0 - .5, z0: z0 - .5, x1: x1 + .5, z1: z1 + .5, y: b.top + b.A.H - .2 });
  }
  function stats() {
    const tris = ms => ms.reduce((n, m) => n + (m.isDisposed?.() ? 0 : (m.getTotalIndices?.() || 0) / 3), 0);
    let inst = 0; for (const it of instanced) if (it.mesh.isVisible) inst += (it.mesh.getTotalIndices() / 3) * (it.mesh.thinInstanceCount || 0);
    return { ...lastStats, closed: closedList.length, struct: tris(walkStruct), closedTris: tris(closedMeshes), roof: tris(walkRoof), meshes: walkStruct.length + walkRoof.length + closedMeshes.length,
      pieceTris: inst, far: list.filter(b => b.far).length, list: list.map(b => ({ key: b.key, role: b.spec.role, style: b.spec.style, storeys: b.spec.storeys, roof: b.spec.roof, far: b.far, center: b.center })) };
  }
  window.tablefolkBuildings = {
    enabled, kitOn, build, group, assemble, specFor, closedWanted, closed, closedList: () => closedList,
    setAlpha: (key, a) => { const b = byKey.get(key); if (!b || !b.rid || b.rid > 255) return; const v = Math.round(Math.max(0, Math.min(1, a)) * 255); if (fadeData[b.rid * 4] !== v) { fadeData[b.rid * 4] = v; fadeDirty = true; } },
    roofBox: key => byKey.get(key)?.roofBox || null,
    claims: (x, z) => claimedCells.has(x + ',' + z),
    has: key => byKey.has(key), roomBuilding, clip, list: () => list, stats, lod: () => lod(true), get clipState() { return { ...clipU }; },
  };
})();
