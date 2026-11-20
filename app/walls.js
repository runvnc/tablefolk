/* walls.js -- walls, door frames and windows built by code (2026-11-20).
 *
 * Every wall cell is still one wall object for the logic (sight, paths,
 * breaking, locks); this draws it. A wall is a continuous run 0.32 thick
 * through the middle of its cells (arms from the cell's centre to each wall
 * neighbour, a post where runs meet, as before), textured in world space
 * with the environment textures (assets/textures/env, at their real size),
 * so stone courses and plaster run on across cells and corners. Three looks,
 * by where the wall stands:
 *   rubble   "stone" and "tabletop" walls outdoors: stone_wall_rubble with a
 *            flat cap course of cut stone
 *   blocks   dungeons, caves and dark worlds: stone_blocks_large, capped
 *   house    walls of rooms that get a roof (walk-in buildings, village
 *            houses): aged plaster on a low rubble plinth, dark timber posts
 *            at corners and every 2 cells, a sill and a top plate, braces in
 *            the panels, and a small timber-framed window every 3 cells on
 *            outside runs longer than 3 cells (glowing warm at dusk and night;
 *            only a picture: sight and paths are unchanged)
 * Cracked walls lose their cap and get a broken, uneven top; burned ones are
 * dark (vertex colours). Doors: app.js's plank leaf (now wood_planks_dark,
 * iron straps) in a timber frame (house) or a stone one. "modern" and "block"
 * keep their old looks (app.js).
 *
 *   window.tablefolkWalls = { build(cell, top), setNight(k) }   (app.js rebuildWallVisuals)
 * Loaded after app.js (uses state, meta, wallH, doorHeight, doorAxisOf,
 * buildDoorLeaf, ensureDoorAnimator, addShadow).
 */
(function () {
  'use strict';
  const ENV = () => (window.tablefolkPacks?.base || '/assets/') + 'textures/env/';
  const T = .32, POST = .2, PLINTH = .42;
  let mats = null, night = 0;
  const TILE = { stone_wall_rubble: 2.0, stone_blocks_large: 3.5, plaster_aged: 4.0, timber_dark: 1.0, wood_planks_dark: 2.0 };

  function tex(name, kind, srgb) {
    const hi = window.TABLEFOLK_GFX?.quality === 'high';
    const t = new BABYLON.Texture(ENV() + name + '_' + kind + (hi ? '' : '_1k') + '.webp', state.scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.gammaSpace = !!srgb; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8;
    t.uScale = t.vScale = 1 / (TILE[name] || 2);
    return t;
  }
  function pbr(name, env, tint = [1, 1, 1], o = {}) {
    const m = new BABYLON.PBRMaterial('wall_' + name, state.scene);
    m.albedoTexture = tex(env, 'color', true); m.bumpTexture = tex(env, 'normal'); m.bumpTexture.level = o.bump ?? 1;
    // OpenGL (+Y) normal maps on code-built geometry in Babylon's left-handed scene
    m.invertNormalMapX = true; m.invertNormalMapY = false;
    // light quality: colour and normal only (memory), constant roughness
    if (!window.TABLEFOLK_GFX?.lite) { m.metallicTexture = tex(env, 'rough'); m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false; m.useRoughnessFromMetallicTextureAlpha = false; }
    m.metallic = 0; m.roughness = window.TABLEFOLK_GFX?.lite ? .9 : 1;
    if (!window.TABLEFOLK_GFX?.lite) { m.ambientTexture = tex(env, 'ao'); m.useAmbientInGrayScale = true; }
    m.albedoColor = new BABYLON.Color3(...tint); m.environmentIntensity = .45; m.maxSimultaneousLights = 8; m._tfMatte = true;
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    return m;
  }
  function materials() {
    if (mats && mats.glass.getScene() === state.scene) return mats;
    const glass = new BABYLON.PBRMaterial('wall_window', state.scene);
    glass.albedoColor = new BABYLON.Color3(.05, .05, .06); glass.metallic = 0; glass.roughness = .35; glass.environmentIntensity = .6; glass.maxSimultaneousLights = 8; glass._tfMatte = true;
    // made on first use: a world with only rubble walls loads no plaster or timber textures
    const lazy = { rubble: () => pbr('rubble', 'stone_wall_rubble', [.92, .9, .86]), blocks: () => pbr('blocks', 'stone_blocks_large', [.78, .77, .74]),
      cap: () => pbr('cap', 'stone_blocks_large', [.82, .8, .77]), plaster: () => pbr('plaster', 'plaster_aged', [.95, .92, .86], { bump: .7 }),
      timber: () => pbr('timber', 'timber_dark', [1, 1, 1]), door: () => pbr('door', 'wood_planks_dark', [1.15, 1.1, 1.05]) };
    const made = {};
    mats = { glass };
    for (const [k, f] of Object.entries(lazy)) Object.defineProperty(mats, k, { get: () => (made[k] ||= f()), enumerable: true });
    mats.isMade = k => !!made[k];
    setNight(night);
    return mats;
  }
  function setNight(k) {
    night = k;
    if (mats?.glass) mats.glass.emissiveColor = new BABYLON.Color3(1, .62, .3).scale(k * 1.6);
  }

  // ---- geometry: boxes with world-space UVs (in metres; the textures scale) ----
  function batch() {
    const P = [], N = [], U = [], C = [], I = [];
    const v3 = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
    const uvOf = (p, n) => {
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      if (ay >= ax && ay >= az) return [p[0], -p[2] * Math.sign(n[1] || 1)];
      if (ax >= az) return [p[2] * Math.sign(n[0]), p[1]];
      return [-p[0] * Math.sign(n[2]), p[1]];
    };
    return {
      // centre c, orthonormal axes a (u), b (up), d (n); half sizes; colour
      box(c, A, B, D, ha, hb, hd, col = [1, 1, 1]) {
        const faces = [[D, A, B, hd, ha, hb], [D.map(x => -x), A, B, hd, ha, hb], [A, D, B, ha, hd, hb], [A.map(x => -x), D, B, ha, hd, hb], [B, A, D, hb, ha, hd], [B.map(x => -x), A, D, hb, ha, hd]];
        for (const [n, u, v, hn, hu, hv] of faces) {
          const o = P.length / 3, ctr = v3(c, n, hn), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => v3(v3(ctr, u, a * hu), v, b * hv));
          for (const p of pts) { P.push(...p); N.push(...n); U.push(...uvOf(p, n)); C.push(col[0], col[1], col[2], 1); }
          const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
          const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0) I.push(o, o + 2, o + 1, o, o + 3, o + 2); else I.push(o, o + 1, o + 2, o, o + 2, o + 3);
        }
      },
      // axis-aligned: centre, size
      add(x, y, z, sx, sy, sz, col) { this.box([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1], sx / 2, sy / 2, sz / 2, col); },
      mesh(name, mat) {
        if (!P.length) return null;
        const m = new BABYLON.Mesh(name, state.scene), vd = new BABYLON.VertexData();
        vd.positions = P; vd.normals = N; vd.uvs = U; vd.colors = C; vd.indices = I; vd.applyToMesh(m);
        m.material = typeof mat === 'function' ? mat() : mat; m.isPickable = false; m.receiveShadows = true; window.addShadow?.(m) ?? addShadow(m);
        return m;
      },
    };
  }
  const hash = (a, b, c) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761); h ^= h >>> 15; return ((h >>> 0) % 10000) / 10000; };

  // ---- which look each wall cell gets ----
  function underground() {
    const s = state.envScn || window.tablefolkScenario?.active?.scn || {};
    return window.tablefolkTerrain?.mode?.() === 'rock' || !!s.dark || s.base === 'dungeon';
  }
  function houseCells() {
    const out = { walls: new Set(), inside: new Set() };
    const R = window.tablefolkRoofs?.planned?.(); if (!R) return out;
    for (const r of R) for (const c of r.cells) {
      out.inside.add(c); const [x, z] = c.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.walls.add((x + dx) + ',' + (z + dz));
    }
    return out;
  }

  function build(cell, top) {
    const M = materials(), H = wallH(), DH = doorHeight(), dark = underground(), houses = dark ? { walls: new Set(), inside: new Set() } : houseCells();
    const B = { rubble: batch(), blocks: batch(), cap: batch(), plaster: batch(), timber: batch(), glass: batch() };
    const out = [];
    const isDoor = k => meta(cell.get(k))?.type === 'door';
    const shade = (st, x, z) => { const r = .95 + hash(x, z, 5) * .1; return st === 'burned' ? [.3, .28, .27] : st === 'cracked' ? [.86 * r, .84 * r, .82 * r] : [r, r, r]; };
    for (const [k, w] of cell) {
      const [x, z] = k.split(',').map(Number), st = meta(w).state, col = shade(st, x, z);
      const style = houses.walls.has(k) ? 'house' : dark ? 'blocks' : 'rubble';
      const body = style === 'blocks' ? B.blocks : style === 'house' ? B.plaster : B.rubble;
      if (meta(w).type === 'door') { doorCell(B, M, cell, x, z, top, H, DH, style, col); continue; }
      let arms = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => cell.has((x + dx) + ',' + (z + dz)));
      if (!arms.length) arms = [[1, 0], [-1, 0]]; else if (arms.length === 1) arms.push([-arms[0][0], -arms[0][1]]);
      const straight = arms.length === 2 && arms[0][0] === -arms[1][0] && arms[0][1] === -arms[1][1];
      const ph = straight ? 0 : T / 2;
      const segs = [];   // [alongX, a0, a1, perp]
      for (const [dx, dz] of arms) {
        const alongX = dx !== 0, sign = dx || dz, c0 = alongX ? x : z, perp = alongX ? z : x;
        segs.push([alongX, Math.min(c0 + sign * ph, c0 + sign * .5), Math.max(c0 + sign * ph, c0 + sign * .5), perp]);
      }
      const put = (b, alongX, a0, a1, perp, y0, y1, thick, c = col) => { const ac = (a0 + a1) / 2, len = a1 - a0; if (len <= .001 || y1 <= y0) return; alongX ? b.add(ac, (y0 + y1) / 2, perp, len, y1 - y0, thick, c) : b.add(perp, (y0 + y1) / 2, ac, thick, y1 - y0, len, c); };
      const cracked = st === 'cracked';
      for (const [alongX, a0, a1, perp] of segs) {
        if (style === 'house') {
          put(B.rubble, alongX, a0, a1, perp, top, top + PLINTH, T + .06);
          put(B.plaster, alongX, a0, a1, perp, top + PLINTH, top + H, T);
          put(B.timber, alongX, a0, a1, perp, top + PLINTH, top + PLINTH + .12, T + .04);       // sill
          put(B.timber, alongX, a0, a1, perp, top + H - .14, top + H, T + .04);                 // top plate
          // posts at every second cell edge, braces in between
          const e = (a0 + a1) / 2 > (alongX ? x : z) ? a1 : a0;
          if (Math.abs(((e + .5) % 2 + 2) % 2) < .01 && Math.abs(e - (alongX ? x : z)) > .4) put(B.timber, alongX, e - POST / 2, e + POST / 2, perp, top + PLINTH, top + H, T + .05);
        } else if (cracked) {
          // a broken top: uneven steps, no cap
          const n = 3; for (let i = 0; i < n; i++) { const s0 = a0 + (a1 - a0) * i / n, s1 = a0 + (a1 - a0) * (i + 1) / n, hgt = H * (.5 + hash(Math.round(s0 * 10), perp, 3) * .35); put(body, alongX, s0, s1, perp, top, top + hgt, T); }
        } else {
          put(body, alongX, a0, a1, perp, top, top + H - .09, T);
          put(B.cap, alongX, a0, a1, perp, top + H - .09, top + H + .02, T + .08);
        }
      }
      if (ph) {
        if (style === 'house') {
          B.rubble.add(x, top + PLINTH / 2, z, T + .06, PLINTH, T + .06, col);
          B.timber.add(x, top + PLINTH + (H - PLINTH) / 2, z, T + .05, H - PLINTH, T + .05, col);   // corner post
        } else if (cracked) body.add(x, top + H * .4, z, T, H * .8, T, col);
        else { body.add(x, top + (H - .09) / 2, z, T, H - .09, T, col); B.cap.add(x, top + H - .035, z, T + .08, .11, T + .08, col); }
      }
      // braces and a window on straight house walls
      if (style === 'house' && straight && !cracked) {
        const alongX = arms[0][0] !== 0, c0 = alongX ? x : z, perp = alongX ? z : x;
        const run = runLength(cell, x, z, alongX), outerSign = outsideSide(houses.inside, x, z, alongX);
        const yb = top + PLINTH + .12, yt = top + H - .14, ang = Math.atan2(yt - yb, .9);
        if (run.len > 3 && run.index % 3 === 1 && outerSign) window_(B, alongX, c0, perp, outerSign, top, H);
        else if ((Math.round(c0) & 1) === 0) {
          // one brace across the panel, both faces
          const len = Math.hypot(.9, yt - yb), A = alongX ? [Math.cos(ang), Math.sin(ang), 0] : [0, Math.sin(ang), Math.cos(ang)], Bv = alongX ? [-Math.sin(ang), Math.cos(ang), 0] : [0, Math.cos(ang), -Math.sin(ang)], D = alongX ? [0, 0, 1] : [1, 0, 0];
          const ctr = alongX ? [c0, (yb + yt) / 2, perp] : [perp, (yb + yt) / 2, c0];
          B.timber.box(ctr, A, Bv, D, len / 2 - .02, .055, (T + .03) / 2, col);
        }
      }
    }
    for (const name of ['rubble', 'blocks', 'cap', 'plaster', 'timber', 'glass']) {
      const m = B[name].mesh('tt_walls_' + name, () => M[name]); if (m) out.push(m);
    }
    state.wallVisuals.push(...out);
    buildDoors(cell, top, houses);
  }
  function runLength(cell, x, z, alongX) {
    const has = (a) => { const k = alongX ? a + ',' + z : x + ',' + a, w = cell.get(k); return w && meta(w).type === 'wall'; };
    const c = alongX ? x : z; let lo = c, hi = c;
    while (has(lo - 1)) lo--; while (has(hi + 1)) hi++;
    return { len: hi - lo + 1, index: c - lo };
  }
  // which side of a wall is outdoors: +1 / -1 (perpendicular), 0 if neither
  function outsideSide(inside, x, z, alongX) {
    const a = alongX ? x + ',' + (z + 1) : (x + 1) + ',' + z, b = alongX ? x + ',' + (z - 1) : (x - 1) + ',' + z;
    if (inside.has(b) && !inside.has(a)) return 1;
    if (inside.has(a) && !inside.has(b)) return -1;
    return 0;
  }
  function window_(B, alongX, c0, perp, side, top, H) {
    const w = .5, h = .62, yc = top + H * .52, face = perp + side * (T / 2), col = [1, 1, 1];
    const at = (a, y, d, sa, sy, sd, b) => alongX ? b.add(a, y, face + side * d, sa, sy, sd, col) : b.add(face + side * d, y, a, sd, sy, sa, col);
    at(c0, yc, .004, w, h, .01, B.glass);
    at(c0, yc + h / 2 + .04, .03, w + .16, .08, .06, B.timber);
    at(c0, yc - h / 2 - .05, .04, w + .2, .09, .08, B.timber);
    at(c0 - w / 2 - .04, yc, .03, .08, h, .06, B.timber);
    at(c0 + w / 2 + .04, yc, .03, .08, h, .06, B.timber);
    at(c0, yc, .02, .04, h, .03, B.timber);                 // mullion
    at(c0, yc, .02, w, .04, .03, B.timber);                 // transom
  }
  // a door cell: the wall carried over the doorway
  function doorCell(B, M, cell, x, z, top, H, DH, style, col) {
    const alongX = doorAxisOf(cell, x, z), c = alongX ? x : z, perp = alongX ? z : x;
    const put = (b, a0, a1, y0, y1, thick) => { const ac = (a0 + a1) / 2, len = a1 - a0; alongX ? b.add(ac, (y0 + y1) / 2, perp, len, y1 - y0, thick, col) : b.add(perp, (y0 + y1) / 2, ac, thick, y1 - y0, len, col); };
    const y0 = top + DH + .12;
    if (style === 'house') { put(B.plaster, c - .5, c + .5, y0, top + H - .14, T); put(B.timber, c - .5, c + .5, top + H - .14, top + H, T + .04); }
    else { const b = style === 'blocks' ? B.blocks : B.rubble; put(b, c - .5, c + .5, y0, top + H - .09, T); put(B.cap, c - .5, c + .5, top + H - .09, top + H + .02, T + .08); }
  }
  // frames and leaves (the leaf is app.js buildDoorLeaf, restyled)
  function buildDoors(cell, top, houses) {
    const doors = [...cell.entries()].filter(([, w]) => meta(w).type === 'door');
    if (!doors.length) return;
    const M = materials(), DH = doorHeight(), timber = batch(), stone = batch();
    for (const [k, w] of doors) {
      const [x, z] = k.split(',').map(Number), alongX = doorAxisOf(cell, x, z), house = houses.walls.has(k);
      const b = house ? timber : stone, jw = house ? .13 : .16, col = [1, 1, 1];
      const putF = (ac, y, len, hgt, thick) => { alongX ? b.add(ac, y, z, len, hgt, thick, col) : b.add(x, y, ac, thick, hgt, len, col); };
      const c = alongX ? x : z;
      for (const e of [-.5 + jw / 2, .5 - jw / 2]) putF(c + e, top + (DH + .12) / 2, jw, DH + .12, T + .06);   // jambs
      putF(c, top + DH + .06, 1, .14, T + .07);                                                             // lintel
      timber.add(alongX ? x : x, top + .015, alongX ? z : z, alongX ? .9 : T + .1, .03, alongX ? T + .1 : .9, col);   // threshold
      const g = buildDoorLeaf(state.scene, x, z, alongX, top, DH); g.door = w;
      for (const m of g.pivot.getChildMeshes(false)) {
        m.metadata = { proxy: w }; m.isPickable = true; state.wallVisuals.push(m);
        if (/wood/.test(m.name)) { m.material = M.door; m.useVertexColors = false; }
      }
      state.wallVisuals.push(g.pivot);
      (state.doorLeaves = state.doorLeaves || []).push(g);
    }
    for (const [bb, mat, name] of [[timber, () => M.timber, 'door_frames'], [stone, () => M.cap, 'door_frames_stone']]) { const m = bb.mesh(name, mat); if (m) state.wallVisuals.push(m); }
    ensureDoorAnimator();
  }

  // the world finished building (rooms, the outside known): draw the walls again
  addEventListener('tablefolk-scenario-started', () => setTimeout(() => { try { scheduleWallRebuild(); } catch {} }, 650));
  window.tablefolkWalls = { build, setNight };
})();
