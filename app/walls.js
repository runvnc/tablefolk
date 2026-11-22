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
 *            only a picture: sight and paths are unchanged); and its own floor,
 *            a slab 3 cm above the ground in the room's floor texture (floors())
 * Cracked walls lose their cap and get a broken, uneven top; burned ones are
 * dark (vertex colours). Doors: app.js's plank leaf (now wood_planks_dark,
 * iron straps) in a timber frame (house) or a stone one. "modern" and "block"
 * keep their old looks (app.js).
 *
 *   window.tablefolkWalls = { build(cell, top), setNight(k), roomMeshes(room) }   (app.js rebuildWallVisuals;
 *   roomMeshes: a house room's own wall, frame, door and floor meshes, hidden by roofs.js under a shell)
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
    m.backFaceCulling = false;   // cutaway.js draws the insides seen through a cut as a dark section
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    return m;
  }
  function materials() {
    if (mats && mats.glass.getScene() === state.scene) return mats;
    const glass = new BABYLON.PBRMaterial('wall_window', state.scene);
    glass.albedoColor = new BABYLON.Color3(.05, .05, .06); glass.metallic = 0; glass.roughness = .35; glass.environmentIntensity = .6; glass.maxSimultaneousLights = 8; glass._tfMatte = true;
    // made on first use: a world with only rubble walls loads no plaster or timber textures
    // blocks (dungeons): grey under torchlight (the warmer tint read olive), damp and moss low down (dampPlugin)
    const lazy = { rubble: () => pbr('rubble', 'stone_wall_rubble', [.92, .9, .86]), blocks: () => damp(pbr('blocks', 'stone_blocks_large', [.7, .74, .82])),
      cap: () => pbr('cap', 'stone_blocks_large', [.82, .8, .77]), plaster: () => pbr('plaster', 'plaster_aged', [.95, .92, .86], { bump: .7 }),
      timber: () => pbr('timber', 'timber_dark', [1, 1, 1]), door: () => pbr('door', 'wood_planks_dark', [1.15, 1.1, 1.05]) };
    const made = {};
    mats = { glass };
    for (const [k, f] of Object.entries(lazy)) Object.defineProperty(mats, k, { get: () => (made[k] ||= f()), enumerable: true });
    mats.isMade = k => !!made[k];
    setNight(night);
    return mats;
  }
  // Damp and moss low on dungeon walls: the albedo darkens and greens toward the
  // floor (under ~.7 m), in patches (value noise in world space); cheap, no texture.
  let Damp = null;
  function damp(m) {
    try {
      const WGSL = BABYLON.ShaderLanguage?.WGSL;
      Damp ||= class extends BABYLON.MaterialPluginBase {
        constructor(mat) { super(mat, 'TfDamp', 210, { TFDAMP: false }); this._enable(true); }
        getClassName() { return 'TfDampPlugin'; }
        isCompatible() { return true; }
        prepareDefines(d) { d.TFDAMP = true; }
        getUniforms() { return { ubo: [] }; }
        getCustomCode(type, lang) {
          if (type !== 'fragment') return null;
          if (lang === WGSL) return { CUSTOM_FRAGMENT_UPDATE_ALPHA: `
{ let dp = fragmentInputs.vPositionW; let dq = floor(dp.xz * 1.7 + vec2f(dp.y * .9, 0.0)); let df = fract(dp.xz * 1.7 + vec2f(dp.y * .9, 0.0));
  let dh = fract(sin(dot(dq, vec2f(127.1, 311.7))) * 43758.5453); let dh2 = fract(sin(dot(dq + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
  let dn = mix(dh, dh2, smoothstep(0.0, 1.0, df.x));
  let low = 1.0 - smoothstep(0.05, 0.75, dp.y);
  let k = clamp(low * (0.35 + dn * 0.9), 0.0, 1.0);
  surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3f(0.55, 0.66, 0.48), k * 0.75); }
` };
          return { CUSTOM_FRAGMENT_UPDATE_ALPHA: `
{ vec3 dp = vPositionW; vec2 dq = floor(dp.xz * 1.7 + vec2(dp.y * .9, 0.0)); vec2 df = fract(dp.xz * 1.7 + vec2(dp.y * .9, 0.0));
  float dh = fract(sin(dot(dq, vec2(127.1, 311.7))) * 43758.5453); float dh2 = fract(sin(dot(dq + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float dn = mix(dh, dh2, smoothstep(0.0, 1.0, df.x));
  float low = 1.0 - smoothstep(0.05, 0.75, dp.y);
  float k = clamp(low * (0.35 + dn * 0.9), 0.0, 1.0);
  surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3(0.55, 0.66, 0.48), k * 0.75); }
` };
        }
      };
      new Damp(m);
    } catch (e) { console.warn('[walls] damp', e); }
    return m;
  }
  function setNight(k) {
    night = k; window.TABLEFOLK_NIGHT = k;   // roofs.js: shells' windows glow by it
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
    const out = { walls: new Set(), inside: new Set(), room: new Map(), rooms: [] };
    const R = window.tablefolkRoofs?.planned?.(); if (!R) return out;
    out.rooms = R;
    for (const r of R) for (const c of r.cells) {
      out.inside.add(c); const [x, z] = c.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const k = (x + dx) + ',' + (z + dz); out.walls.add(k); if (!out.room.has(k)) out.room.set(k, roomKey(r)); }
    }
    return out;
  }
  // A house's walls are drawn per room, so roofs.js can hide them while the
  // room's building shell stands over it (the model's walls are often inset
  // from its footprint, and the code walls poked through them).
  const roomKey = r => r.x0 + ',' + r.z0 + ',' + r.x1 + ',' + r.z1;
  let roomMeshes = new Map();

  function build(cell, top) {
    const t0 = performance.now(); try { return build0(cell, top); } finally { window.tfMark?.('walls.build', t0); }
  }
  function build0(cell, top) {
    const M = materials(), H = wallH(), DH = doorHeight(), dark = underground(), houses = dark ? { walls: new Set(), inside: new Set() } : houseCells();
    lastSig = looksSig(dark, houses);
    const B0 = { rubble: batch(), blocks: batch(), cap: batch(), plaster: batch(), timber: batch(), glass: batch() };
    const perRoom = new Map(); let B = B0;
    const out = []; roomMeshes = new Map();
    const isDoor = k => meta(cell.get(k))?.type === 'door';
    const shade = (st, x, z) => { const r = .95 + hash(x, z, 5) * .1; return st === 'burned' ? [.3, .28, .27] : st === 'cracked' ? [.86 * r, .84 * r, .82 * r] : [r, r, r]; };
    for (const [k, w] of cell) {
      const [x, z] = k.split(',').map(Number), st = meta(w).state, col = shade(st, x, z);
      const style = houses.walls.has(k) ? 'house' : dark ? 'blocks' : 'rubble';
      const rk = style === 'house' && houses.room?.get(k);
      B = rk ? (perRoom.get(rk) || perRoom.set(rk, { rubble: batch(), blocks: batch(), cap: batch(), plaster: batch(), timber: batch(), glass: batch() }).get(rk)) : B0;
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
      const m = B0[name].mesh('tt_walls_' + name, () => M[name]); if (m) out.push(m);
    }
    if (!dark) floors(houses.rooms || [], out); else if (state.roomFloor) { const was = state.roomFloor.cells; state.roomFloor = null; relevel(was, new Set()); }
    for (const [rk, Bq] of perRoom) for (const name of ['rubble', 'cap', 'plaster', 'timber', 'glass']) {
      const m = Bq[name].mesh('tt_walls_' + name + '_room', () => M[name]); if (m) { out.push(m); m.metadata = { ...(m.metadata || {}), room: rk }; (roomMeshes.get(rk) || roomMeshes.set(rk, []).get(rk)).push(m); }
    }
    state.wallVisuals.push(...out);
    buildDoors(cell, top, houses);
  }
  // A house room's own floor (2026-11-22; the owner: "the floor of buildings was merging
  // into the ground"): the terrain painted the room's floor at the ground's height and
  // blended grass into it round the doorway. Now a slab FLOOR_UP above the ground over every
  // room square, out to the walls' centre lines, in the room's floor texture (the terrain
  // layer it was painted with: planks by default, a smithy's stone, a barn's earth); with
  // the room's walls (roomMeshes: hidden under a standing shell, shown through its doorway).
  const FLOOR_UP = .03, FLOOR_TEX = { wood_planks_worn: 2.2, stone_floor_rough: 2.5, flagstone: 2.5, dirt_path: 3, cobblestone: 2.5 };
  const floorMats = {};
  function floorMat(env) {
    const m = floorMats[env]; if (m && !m.isDisposed?.() && m.getScene() === state.scene) return m;
    TILE[env] ||= FLOOR_TEX[env] || 2.5;
    const f = pbr('floor_' + env, env, env === 'wood_planks_worn' ? [.95, .88, .8] : [1, 1, 1], { bump: .8 }); f.backFaceCulling = true;
    return (floorMats[env] = f);
  }
  // Things stand on the slab, not 3 cm into it (2026-11-22): state.roomFloor lists the floored
  // squares (app.js floorLiftAt adds FLOOR_UP there: characters, new props, books), each slab
  // gets a static collider (app.js floorCollider) so loose props rest on its top, and props
  // and rugs placed before the floor was known are lifted onto it (relevel).
  function floors(rooms, out) {
    const was = state.roomFloor?.cells || new Set(), cells = new Set();
    for (const r of rooms) for (const c of r.cells) cells.add(c);
    state.roomFloor = cells.size ? { up: FLOOR_UP, cells } : null;
    for (const r of rooms) {
      const rk = roomKey(r), byMat = new Map();
      for (const c of r.cells) {
        const [x, z] = c.split(',').map(Number);
        let env = window.tablefolkTerrain?.layerAt?.(x, z); if (!FLOOR_TEX[env]) env = 'wood_planks_worn';
        const b = byMat.get(env) || byMat.set(env, batch()).get(env);
        // out to the wall's centre line on a side with no room square (no ground between floor and wall)
        const e = (dx, dz) => r.cells.has((x + dx) + ',' + (z + dz)) ? .5 : 1;
        const x0 = x - e(-1, 0), x1 = x + e(1, 0), z0 = z - e(0, -1), z1 = z + e(0, 1), top = state.terrainTopY ?? 0;
        b.add((x0 + x1) / 2, top + FLOOR_UP / 2 - .01, (z0 + z1) / 2, x1 - x0, FLOOR_UP + .02, z1 - z0, [1, 1, 1]);
      }
      for (const [env, b] of byMat) { const m = b.mesh('tt_floor_room', () => floorMat(env)); if (m) { m.metadata = { room: rk }; out.push(m); (roomMeshes.get(rk) || roomMeshes.set(rk, []).get(rk)).push(m); if (typeof floorCollider === 'function') floorCollider(m); } }
    }
    relevel(was, cells);
  }
  function relevel(was, cells) {
    const top = state.terrainTopY ?? 0, key = (x, z) => Math.round(x) + ',' + Math.round(z);
    const delta = k => (cells.has(k) ? FLOOR_UP : 0) - (was.has(k) ? FLOOR_UP : 0);
    // props whose base sat on the old floor height (not ones on tables, held or hung)
    for (const p of state.props || []) {
      if (!p || p.isDisposed?.()) continue;
      const k = key(p.position.x, p.position.z), d = delta(k); if (!d) continue;
      const bb = p.getBoundingInfo?.().boundingBox; if (!bb) continue;
      const base = bb.minimumWorld.y, floor = top + (was.has(k) ? FLOOR_UP : 0);
      if (Math.abs(base - floor) > .02) continue;
      const pos = p.position.clone(); pos.y += d;
      if (typeof forceBodyTransform === 'function' && p.physicsBody?.getMotionType?.() === BABYLON.PhysicsMotionType.STATIC) forceBodyTransform(p, pos);
      else if (p.physicsBody) { p.position.copyFrom(pos); try { p.physicsBody.disablePreStep = false; state.scene.onAfterPhysicsObservable.addOnce(() => { p.physicsBody && (p.physicsBody.disablePreStep = true); }); } catch {} }
      else p.position.copyFrom(pos);
    }
    // rugs (app.js buildRug) stand on the room's floor too: rebuilt when a floored square has one
    const rug = [...state.paint || []].some(([k, v]) => v.mat === 'carpet' && delta(k));
    if (rug && typeof rebuildRugs === 'function') rebuildRugs();
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
    const M = materials(), DH = doorHeight(), timber0 = batch(), stone0 = batch(), rooms = new Map();
    for (const [k, w] of doors) {
      const [x, z] = k.split(',').map(Number), alongX = doorAxisOf(cell, x, z), house = houses.walls.has(k);
      // a house door's frame goes with its room's walls (hidden under a shell)
      const rk0 = house && houses.room?.get(k), fr = rk0 ? (rooms.get(rk0) || rooms.set(rk0, { timber: batch(), stone: batch() }).get(rk0)) : { timber: timber0, stone: stone0 };
      const timber = fr.timber, stone = fr.stone;
      const b = house ? timber : stone, jw = house ? .13 : .16, col = [1, 1, 1];
      const putF = (ac, y, len, hgt, thick) => { alongX ? b.add(ac, y, z, len, hgt, thick, col) : b.add(x, y, ac, thick, hgt, len, col); };
      const c = alongX ? x : z;
      for (const e of [-.5 + jw / 2, .5 - jw / 2]) putF(c + e, top + (DH + .12) / 2, jw, DH + .12, T + .06);   // jambs
      putF(c, top + DH + .06, 1, .14, T + .07);                                                             // lintel
      timber.add(alongX ? x : x, top + (house ? .03 : .015), alongX ? z : z, alongX ? .9 : T + .1, house ? .06 : .03, alongX ? T + .1 : .9, col);   // threshold (a house's a step above its floor)
      // a stone doorstep on the outside of a house door
      if (house) { const side = outsideSide(houses.inside, x, z, alongX); if (side) { const d = T / 2 + .2; alongX ? stone.add(x, top + .06, z + side * d, 1.05, .12, .38, col) : stone.add(x + side * d, top + .06, z, .38, .12, 1.05, col); } }
      const g = buildDoorLeaf(state.scene, x, z, alongX, top, DH); g.door = w;
      const rk = house && houses.room?.get(k);
      for (const m of g.pivot.getChildMeshes(false)) {
        m.metadata = { proxy: w }; m.isPickable = true; state.wallVisuals.push(m);
        if (/wood/.test(m.name)) { m.material = M.door; m.useVertexColors = false; }
        if (rk) (roomMeshes.get(rk) || roomMeshes.set(rk, []).get(rk)).push(m);
      }
      state.wallVisuals.push(g.pivot);
      (state.doorLeaves = state.doorLeaves || []).push(g);
    }
    for (const [bb, mat, name] of [[timber0, () => M.timber, 'door_frames'], [stone0, () => M.cap, 'door_frames_stone']]) { const m = bb.mesh(name, mat); if (m) state.wallVisuals.push(m); }
    for (const [rk, fr] of rooms) for (const [bb, mat, name] of [[fr.timber, () => M.timber, 'door_frames_room'], [fr.stone, () => M.cap, 'door_frames_stone_room']]) { const m = bb.mesh(name, mat); if (m) { state.wallVisuals.push(m); (roomMeshes.get(rk) || roomMeshes.set(rk, []).get(rk)).push(m); } }
    ensureDoorAnimator();
  }

  // which look each wall gets, as a string: a rebuild that would draw the same is skipped
  let lastSig = '';
  const looksSig = (dark, houses) => (dark ? 'u' : 'o') + [...houses.walls].sort().join(';').length + ':' + houses.walls.size + ':' + wallH();
  // the world finished building (rooms, the outside known): draw the walls again if their looks changed
  // (the loading cover waits for it, loading.js: the rebuild is a microtask after this)
  addEventListener('tablefolk-scenario-started', () => { const done = window.tablefolkLoading?.begin('walls'); setTimeout(() => { try { const dark = underground(); if (looksSig(dark, dark ? { walls: new Set() } : houseCells()) !== lastSig) scheduleWallRebuild(); } catch {} setTimeout(() => done?.(), 0); }, 650); });
  window.tablefolkWalls = { build, setNight, timber: () => materials().timber, roomMeshes: r => roomMeshes.get(roomKey(r)) || [] };
})();
