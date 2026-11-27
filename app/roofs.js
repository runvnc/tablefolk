/* roofs.js -- thatched roofs on the houses of a world that has an outside.
 *
 * Rooms are found from the walls themselves, so every kind of map gets them
 * (generated villages, drawn grids, maps edited by hand): the board is
 * flood-filled from its edge over everything that is not a wall or door; the
 * squares it never reaches are inside, and each connected patch of them is a
 * room. A room that fills its rectangle gets a gable roof over its walls:
 * two thick sloped slabs of thatch (the ridge along the longer side, eaves
 * at the wall tops, a little overhang), a ridge cap, and plaster gable ends.
 *
 * Only where there is an outside to see them from: a world that is all one
 * building (the bakery, the tavern) or underground (dark, a dungeon) gets
 * none. A scenario's "roofs": false or true overrides that.
 *
 * Seeing in: only by going in. The roof of the room the player is in (or
 * whose doorway it stands in) fades away (except in first person, where it is
 * the ceiling); with the follow camera, a roof
 * between the camera and the player goes see-through so the player is never
 * lost behind it. The free camera can't peek: roofs stay on. A building shell
 * opens round its doorway as the player walks up (before the door swings: doorway())
 * and lifts only once the player is through. What the
 * characters inside say still shows above the roof (bubbles).
 * With "reveal": "rooms" a room the player has not seen into keeps its roof
 * (darkness.js roomRevealed), even between the camera and the player.
 * Off in the tabletop view (a map from above wants the rooms).
 *
 * Kit buildings (2026-11-27, buildings.js): with the building kit on, the
 * roofed rooms are drawn as kit houses (walls, frame, pieces and their own
 * roofs) and this file only fades their roofs: one entry per building (rooms
 * sharing a wall), same rule as below, the storey above clipped while the
 * player is inside (not in first person: the upper floor is the ceiling).
 * No shell, no swap. ?kit=0 or "kit": false brings back the shells and code
 * roofs below.
 *
 *   window.tablefolkRoofs.rebuild()  .toggle() (lift all, for tests)  .rooms
 * Loaded after app.js; uses its globals (state, meta, wallH, hasGroundAt).
 */
(function () {
  if (window.TABLEFOLK_TABLETOP) return;
  // pass 2: a thicker eave edge (.22) and a little more overhang; the pitch varies per house
  const OVER = .45, THICK = .22, PITCH = .85;
  let roofs = [], sig = '', lifted = false, enabled = false, buildToken = 0;

  const cellKey = (x, z) => x + ',' + z;
  function walls() {
    const out = new Set();
    for (const b of state.blocks || []) {
      if (!b || b.isDisposed?.()) continue;
      const t = meta(b)?.type; if (t !== 'wall' && t !== 'door') continue;
      const p = b.getAbsolutePosition?.() || b.position; out.add(cellKey(Math.round(p.x), Math.round(p.z)));
    }
    return out;
  }
  function doors() {
    const out = new Set();
    for (const b of state.blocks || []) { if (!b || b.isDisposed?.() || meta(b)?.type !== 'door') continue; const p = b.getAbsolutePosition?.() || b.position; out.add(cellKey(Math.round(p.x), Math.round(p.z))); }
    return out;
  }
  // rooms: patches the outside can't reach
  function findRooms(W0, D0) {
    // an open doorway (a gap of one square between two walls) closes the room
    // like a door would
    const W = new Set(W0), D = new Set(D0);
    for (const k of W0) {
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[2, 0], [0, 2]]) {
        const g = cellKey(x + dx / 2, z + dz / 2);
        if (W0.has(cellKey(x + dx, z + dz)) && !W0.has(g)) { W.add(g); D.add(g); }
      }
    }
    const { cols, rows } = window.tablefolk.WORLD, x0 = Math.round(-(cols - 1) / 2), z0 = Math.round(-(rows - 1) / 2);
    const xa = x0 - 1, xb = x0 + cols, za = z0 - 1, zb = z0 + rows;
    const out = new Set(), q = [];
    for (let x = xa; x <= xb; x++) for (const z of [za, zb]) q.push([x, z]);
    for (let z = za; z <= zb; z++) for (const x of [xa, xb]) q.push([x, z]);
    while (q.length) {
      const [x, z] = q.pop(), k = cellKey(x, z);
      if (x < xa || x > xb || z < za || z > zb || out.has(k) || W.has(k)) continue;
      out.add(k); q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    let ground = 0, outside = 0;
    const inside = new Set();
    for (let x = x0; x < x0 + cols; x++) for (let z = z0; z < z0 + rows; z++) {
      const k = cellKey(x, z); if (W.has(k) || !hasGroundAt(x, z)) continue;
      ground++; if (out.has(k)) outside++; else inside.add(k);
    }
    const rooms = [], seen = new Set();
    for (const k of inside) {
      if (seen.has(k)) continue;
      const cells = [], st = [k]; seen.add(k);
      while (st.length) {
        const c = st.pop(); cells.push(c); const [x, z] = c.split(',').map(Number);
        for (const n of [cellKey(x + 1, z), cellKey(x - 1, z), cellKey(x, z + 1), cellKey(x, z - 1)]) if (inside.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
      }
      const xs = cells.map(c => +c.split(',')[0]), zs = cells.map(c => +c.split(',')[1]);
      const r = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), cells: new Set(cells) };
      r.fill = cells.length / ((r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1));
      // standing in its doorway counts as inside
      r.here = new Set(cells);
      r.doors = [];   // its doorways: [x, z, nx, nz] (n: out of the room)
      for (const c of cells) { const [x, z] = c.split(',').map(Number); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cellKey(x + dx, z + dz); if (D.has(n)) { r.here.add(n); if (!r.doors.some(d => d[0] === x + dx && d[1] === z + dz)) r.doors.push([x + dx, z + dz, dx, dz]); } } }
      rooms.push(r);
    }
    return { rooms, outsideShare: ground ? outside / ground : 0, outside: out };
  }
  function wanted() {
    const s = state.envScn || window.tablefolkScenario?.active?.scn || {};
    if (s.roofs === false) return false;
    if (s.roofs === true) return true;
    return !s.dark && s.base !== 'dungeon';
  }

  // ---- materials ----
  // one thatch texture and its normal map for every roof (a cloned
  // DynamicTexture never became ready and the slabs didn't draw); each piece
  // scales its own UVs instead
  let thatchTex = null, thatchNrm = null;
  function thatch(sc) {
    if (thatchTex && !thatchTex.isDisposed?.()) return [thatchTex, thatchNrm];
    const N = 512, t = new BABYLON.DynamicTexture('roof_thatch', { width: N, height: N }, sc, true), c = t.getContext();
    c.fillStyle = '#86683a'; c.fillRect(0, 0, N, N);
    // rows of straw, each row's ends hanging over the next; drawn across
    // (u runs down the slope on a box's top face)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 8; row++) {
      const y0 = row * N / 8;
      for (let i = 0; i < 700; i++) {
        const x = rnd() * N, len = 26 + rnd() * 44, y = y0 + rnd() * N / 8, sh = rnd();
        c.strokeStyle = sh < .33 ? '#5e4622' : sh < .66 ? '#a08245' : '#b39450'; c.lineWidth = 1.2 + rnd() * 2;
        c.beginPath(); c.moveTo(y, x); c.lineTo(y + len, x + (rnd() - .5) * 4); c.stroke();
      }
      c.fillStyle = 'rgba(40,28,10,.22)'; c.fillRect(y0 + N / 8 - 4, 0, 4, N);
    }
    t.update(); t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    // the normal map: the straw's brightness as height
    const src = c.getImageData(0, 0, N, N).data, n = new BABYLON.DynamicTexture('roof_thatch_n', { width: N, height: N }, sc, true), nc = n.getContext();
    const img = nc.createImageData(N, N), h = (x, y) => { const i = (((y + N) % N) * N + ((x + N) % N)) * 4; return (src[i] + src[i + 1] + src[i + 2]) / 765; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3.2, dy = (h(x, y + 1) - h(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (-dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
    }
    nc.putImageData(img, 0, 0); n.update(); n.wrapU = n.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    thatchNrm = n;
    return [(thatchTex = t), n];
  }
  const pbr = (name, sc, col, rough = .92) => { const m = new BABYLON.PBRMaterial(name, sc); m.albedoColor = col; m.metallic = 0; m.roughness = rough; m.maxSimultaneousLights = 8; return m; };
  // The env textures (2026-11-20): thatch, clay tiles or slate by house,
  // plaster gables, dark timber, rubble chimneys. One material set per roof
  // kind and tint, shared by every roof that uses it.
  const ENV = () => (window.tablefolkPacks?.base || '/assets/') + 'textures/env/';
  const TILE = { thatch: 2.0, clay_roof_tiles: 2.5, slate_roof: 1.5, plaster_aged: 4.0, timber_dark: 1.0, stone_wall_rubble: 2.0 };
  const envMats = new Map();
  function envTex(sc, name, kind, srgb, rot) {
    const hi = window.TABLEFOLK_GFX?.quality === 'high';
    const t = new BABYLON.Texture(ENV() + name + '_' + kind + (hi ? '' : '_1k') + '.webp', sc, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.gammaSpace = !!srgb; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8; if (rot) t.wAng = Math.PI / 2;
    return t;
  }
  function envMat(sc, name, env, tint, rot) {
    const key = name + env + tint.map(v => v.toFixed(2)).join();
    if (envMats.has(key) && !envMats.get(key).isDisposed?.()) return envMats.get(key);
    const m = new BABYLON.PBRMaterial(name, sc);
    m.albedoTexture = envTex(sc, env, 'color', true, rot); m.bumpTexture = envTex(sc, env, 'normal', false, rot); m.invertNormalMapX = true; m.invertNormalMapY = false;
    if (!window.TABLEFOLK_GFX?.lite) { m.metallicTexture = envTex(sc, env, 'rough', false, rot); m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false; }
    m.metallic = 0; m.roughness = window.TABLEFOLK_GFX?.lite ? .9 : 1;
    m.albedoColor = new BABYLON.Color3(...tint); m.environmentIntensity = .4; m.maxSimultaneousLights = 8; m._tfMatte = true; m._tfTile = TILE[env] || 2;
    envMats.set(key, m); return m;
  }
  function mats(sc, tint, kind = 'thatch') {
    const roof = envMat(sc, 'roof_' + kind, kind, tint, true);
    return { straw: roof, timber: envMat(sc, 'roof_timber', 'timber_dark', [1, 1, 1]), plaster: envMat(sc, 'roof_plaster', 'plaster_aged', [.95, .92, .86]), stone: envMat(sc, 'roof_stone', 'stone_wall_rubble', [.85, .83, .8]) };
  }
  function oldMats(sc, tint) {
    const [tex, nrm] = thatch(sc);
    const straw = pbr('roof_straw', sc, new BABYLON.Color3(.8 * tint[0], .74 * tint[1], .66 * tint[2]), .95);
    straw.albedoTexture = tex; straw.bumpTexture = nrm; straw.bumpTexture.level = .9; straw.environmentIntensity = .35;
    return { straw, timber: pbr('roof_timber', sc, new BABYLON.Color3(.25, .16, .09)), plaster: pbr('roof_plaster', sc, new BABYLON.Color3(.86, .8, .68), .9),
      stone: pbr('roof_stone', sc, new BABYLON.Color3(.36, .34, .32)) };
  }

  // ---- one roof ----
  // Built along local x (the ridge), then turned to the room. w: from the
  // ridge to the walls' outer face; half: to the overhang's edge. Each slope
  // is courses of thatch, each tipped a little steeper than the one above so
  // their lower edges stand out, a rolled eave, a ridge roll, plaster gables
  // with timber trim, and on some houses a chimney. Merged per material.
  const COURSE = .8, TIP = .06;
  function build(room, sc) {
    const top = state.terrainTopY ?? 0, eave = top + wallH() + .02;
    const xa = room.x0 - 1.5, xb = room.x1 + 1.5, za = room.z0 - 1.5, zb = room.z1 + 1.5;
    const alongX = (xb - xa) >= (zb - za), cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const Lw = alongX ? xb - xa : zb - za, L = Lw + 2 * OVER, w = (alongX ? zb - za : xb - xa) / 2, half = w + OVER;
    // a little different on each house: roofing, pitch, tint (seeded by the room)
    const hsh = Math.abs(Math.sin(room.x0 * 12.9898 + room.z0 * 78.233) * 43758.5453) % 1;
    const pitch = PITCH * (.8 + ((hsh * 11) % 1) * .45);
    const rise = Math.min(2.2, Math.max(.8, w * pitch)), ridgeY = eave + rise, ang = Math.atan2(rise, w);
    const slope = half / Math.cos(ang);
    // thatch on small houses, clay tiles or slate on bigger ones (seeded by the room)
    const kind = hsh < .4 ? 'thatch' : ((hsh * 7) % 1) < .6 ? 'clay_roof_tiles' : 'slate_roof';
    const M = mats(sc, [.94 + ((hsh * 3) % 1) * .1, .94 + ((hsh * 7) % 1) * .08, .94 + ((hsh * 13) % 1) * .08], kind);
    const root = new BABYLON.TransformNode('roof', sc);
    const frame = new BABYLON.TransformNode('roof_frame', sc); frame.parent = root;
    frame.position.set(cx, 0, cz); if (!alongX) frame.rotation.y = Math.PI / 2;
    const by = { straw: [], timber: [], plaster: [], stone: [] };
    const box = (mat, o, at, parent = frame, uv) => {
      const m = BABYLON.MeshBuilder.CreateBox('roof_' + mat, o, sc); m.parent = parent; m.position.set(...at);
      if (uv) { const d = m.getVerticesData(BABYLON.VertexBuffer.UVKind); for (let i = 0; i < d.length; i += 2) { d[i] *= uv[0]; d[i + 1] *= uv[1]; } m.setVerticesData(BABYLON.VertexBuffer.UVKind, d); }
      by[mat].push(m); return m;
    };
    const n = Math.max(2, Math.round(slope / COURSE)), step = slope / n;
    for (const side of [-1, 1]) {
      const sl = new BABYLON.TransformNode('roof_side', sc); sl.parent = frame; sl.position.y = ridgeY; sl.rotation.x = side * ang;
      for (let k = 0; k < n; k++) {
        // its top edge on the roof line; lower courses sit a hair higher so
        // the one above overlaps them, not the other way round
        const c = new BABYLON.TransformNode('roof_course', sc); c.parent = sl; c.position.set(0, k * .012, side * k * step); c.rotation.x = side * TIP;
        const cd = step + .16;
        box('straw', { width: L, height: THICK, depth: cd }, [0, 0, side * cd / 2], c, [cd / M.straw._tfTile, L / M.straw._tfTile]);
      }
      // the rolled eave and the barge boards along the gable edges
      const roll = BABYLON.MeshBuilder.CreateCylinder('roof_straw', { diameter: .24, height: L + .04, tessellation: 10 }, sc);
      roll.parent = sl; roll.rotation.z = Math.PI / 2; roll.position.set(0, (n - 1) * .012 - Math.sin(TIP) * (step + .16) - .02, side * (slope + .02)); by.straw.push(roll);
      for (const end of [-1, 1]) box('timber', { width: .07, height: .14, depth: slope }, [end * (Lw / 2 + .03), -.1, side * slope / 2], sl);
    }
    const ridge = BABYLON.MeshBuilder.CreateCylinder('roof_straw', { diameter: .34, height: L + .12, tessellation: 12 }, sc);
    ridge.parent = frame; ridge.rotation.z = Math.PI / 2; ridge.position.y = ridgeY + .06; by.straw.push(ridge);
    // plaster gables on the end walls, a tie beam and a king post on each
    for (const end of [-1, 1]) {
      const g = new BABYLON.Mesh('roof_plaster', sc), tri = [0, 0, -w, 0, 0, w, 0, rise, 0], vd = new BABYLON.VertexData();
      vd.positions = tri.concat(tri); const tuv = [-w / 4, 0, w / 4, 0, 0, rise / 4]; vd.uvs = tuv.concat(tuv); vd.indices = [0, 1, 2, 5, 4, 3];   // both faces, each lit from its own side
      const nrm = []; BABYLON.VertexData.ComputeNormals(vd.positions, vd.indices, nrm); vd.normals = nrm; vd.applyToMesh(g);
      g.parent = frame; g.position.set(end * Lw / 2, eave, 0); by.plaster.push(g);
      box('timber', { width: .08, height: .12, depth: 2 * w }, [end * (Lw / 2 + .03), eave + .06, 0]);
      box('timber', { width: .08, height: rise - .1, depth: .12 }, [end * (Lw / 2 + .03), eave + (rise - .1) / 2, 0]);
    }
    // a chimney on about half the houses big enough
    if ((room.x1 - room.x0 + 1) * (room.z1 - room.z0 + 1) >= 9 && hsh < .55) {
      const ch = rise + .55, side = hsh < .27 ? -1 : 1, px = (hsh * 4 % 1 - .5) * Lw * .5;
      box('stone', { width: .5, height: ch, depth: .5 }, [px, eave + ch / 2, side * w * .35]);
      box('timber', { width: .62, height: .08, depth: .62 }, [px, eave + ch, side * w * .35]);
    }
    // one mesh per material
    root.computeWorldMatrix(true);
    const parts = [];
    for (const [k, list] of Object.entries(by)) {
      if (!list.length) continue;
      // world matrices from the top down, so each sees its parent's
      for (const m of list) { m.material = M[k]; const chain = []; for (let p = m; p; p = p.parent) chain.unshift(p); for (const p of chain) p.computeWorldMatrix(true); }
      const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
      if (merged) { merged.parent = root; merged.name = 'roof_' + k; parts.push(merged); }
    }
    frame.dispose();
    for (const m of parts) { m.isPickable = true; m.receiveShadows = true; m.metadata = { roof: true }; }
    return { room, root, parts, mats: Object.values(M), alpha: 1, target: 1 };
  }

  // ---- building shells (2026-11-20, look pass 3) ----
  // A roofed room that is someone's home or workplace stays a walk-in room
  // (jobs need its beds and stations on the map); outside it gets the matching
  // building model (assets/models/props/env) as an exterior shell instead of a
  // code-built roof: chosen by the room's role (state.places), seeded so
  // neighbours differ, turned so its front faces the room's door, scaled
  // non-uniformly within +-25% to the room's outer size (a room no model fits
  // keeps its code-built roof). Visual only: walls, door, sight and paths are
  // the room's. It fades like a roof: away while the player is inside (or in
  // its doorway), see-through when it hides the player from the follow camera;
  // while it stands, the characters inside are hidden (they are indoors).
  // "shells": false in a scenario turns them off.
  // the models' footprints (env manifest; rebuilt welded 2026-11-22: fantasy_house's depth now includes its front steps)
  const SHELL_FOOT = { house: [4.68, 5.0], fantasy_house: [5.44, 5.18], tall_house: [3.68, 6.0], stone_house: [3.78, 5.5], inn: [6.67, 8], blacksmith: [6.94, 6.0],
    barracks: [7.5, 4.92], stable: [7.0, 4.58], barn: [6.5, 9], mill_house: [4.7, 5] };
  // where each model's front door is, along its front (model x, metres; read off its front
  // view, look pass 4; also "door_x" in the env manifest): the shell slides to line it up
  const DOOR_X = { house: 1.0, fantasy_house: .45, tall_house: 0, stone_house: 0, inn: 0, barracks: .5, mill_house: -.85, blacksmith: 0, stable: 0, barn: 0 };
  const SHELL_ROLE = { tavern: ['inn', 'fantasy_house'], inn: ['inn', 'fantasy_house'], smithy: ['blacksmith', 'stone_house'], forge: ['blacksmith'], stable: ['stable', 'barn'], barn: ['barn', 'stable'],
    guardhouse: ['barracks', 'stone_house'], barracks: ['barracks'], mill: ['mill_house'], temple: ['stone_house', 'tall_house'], library: ['tall_house', 'stone_house'],
    shop: ['fantasy_house', 'house', 'tall_house'], bakery: ['house', 'fantasy_house'], alchemist: ['tall_house', 'house'] };
  const HOUSES = ['house', 'fantasy_house', 'stone_house', 'tall_house'];
  const ENVM = () => (window.tablefolkPacks?.base || '/assets/') + 'models/props/env/';
  function shellsWanted() { const s = state.envScn || window.tablefolkScenario?.active?.scn || {}; return s.shells !== false && s.generate?.shells !== false && !window.TABLEFOLK_TABLETOP; }
  function roleOf(room) {
    for (const p of state.places || []) {
      if (p.x0 == null) continue;
      if (p.x0 <= room.x1 && p.x1 >= room.x0 && p.z0 <= room.z1 && p.z1 >= room.z0) return String(p.kind || p.id || '').toLowerCase().replace(/\s*\d+$/, '');
    }
    return 'house';
  }
  // the room's door side: 's' (+z), 'n', 'e' (-x), 'w' (+x), and the outer size across / deep
  function doorSide(room, D) {
    for (const k of D) {
      const [x, z] = k.split(',').map(Number);
      if (z === room.z1 + 1 && x >= room.x0 && x <= room.x1) return 's';
      if (z === room.z0 - 1 && x >= room.x0 && x <= room.x1) return 'n';
      if (x === room.x0 - 1 && z >= room.z0 && z <= room.z1) return 'e';
      if (x === room.x1 + 1 && z >= room.z0 && z <= room.z1) return 'w';
    }
    return null;
  }
  let lastShell = null;
  function planShell(room, D) {
    const side = doorSide(room, D); if (!side) return null;
    const ow = room.x1 - room.x0 + 3, od = room.z1 - room.z0 + 3, across = side === 'n' || side === 's' ? ow : od, deep = side === 'n' || side === 's' ? od : ow;
    const role = roleOf(room), list = SHELL_ROLE[role] || HOUSES;
    const hsh = Math.abs(Math.sin(room.x0 * 12.9898 + room.z0 * 78.233) * 43758.5453) % 1;
    const fit = l => l.map(m => ({ m, sx: across / SHELL_FOOT[m][0], sz: deep / SHELL_FOOT[m][1] })).filter(f => f.sx >= .75 && f.sx <= 1.25 && f.sz >= .75 && f.sz <= 1.25);
    // a home or farmhouse too big for the houses: the bigger timber buildings
    // the model procgen sized the room for (places' "shell"), when it fits
    const want = (state.places || []).find(p => p.shell && SHELL_FOOT[p.shell] && p.x0 <= room.x1 && p.x1 >= room.x0 && p.z0 <= room.z1 && p.z1 >= room.z0)?.shell;
    const own = want ? fit([want]) : [];
    if (own.length) { lastShell = want; return { ...own[0], side, cx: (room.x0 + room.x1) / 2, cz: (room.z0 + room.z1) / 2, ...doorFit(room, D, side, own[0], across) }; }
    let fits = fit(list); if (!fits.length && (list === HOUSES || role === 'farmhouse')) fits = fit(['inn', 'mill_house', 'fantasy_house', 'barracks']);
    if (!fits.length) return null;
    const pool = fits.length > 1 ? fits.filter(f => f.m !== lastShell) : fits, pick = pool[Math.floor(hsh * pool.length) % pool.length];
    lastShell = pick.m;
    return { ...pick, side, cx: (room.x0 + room.x1) / 2, cz: (room.z0 + room.z1) / 2, ...doorFit(room, D, side, pick, across) };
  }
  // the model's door over the room's: slide the shell along its front and widen it to still
  // cover the room (at most 1.25 x the model), mirrored when that is nearer; else centred
  function doorFit(room, D, side, pick, across) {
    const dx0 = DOOR_X[pick.m] ?? 0, foot = SHELL_FOOT[pick.m][0], cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
    let door = null;
    for (const k of D) { const [x, z] = k.split(',').map(Number); if ((side === 's' && z === room.z1 + 1 || side === 'n' && z === room.z0 - 1) && x >= room.x0 && x <= room.x1 || (side === 'e' && x === room.x0 - 1 || side === 'w' && x === room.x1 + 1) && z >= room.z0 && z <= room.z1) { door = [x, z]; break; } }
    if (!door) return {};
    // local +x of the turned model in world terms: (cos ry, -sin ry)
    const ry = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[side], ux = Math.cos(ry), uz = -Math.sin(ry);
    const off = (door[0] - cx) * ux + (door[1] - cz) * uz;
    const tryIt = mir => { const sx = (across + 2 * Math.abs(off - mir * dx0 * pick.sx)) / foot; return sx <= 1.25 ? { slide: off - mir * dx0 * (sx), sxDoor: sx, mirror: mir < 0 } : null; };
    const a = tryIt(1), b = dx0 ? tryIt(-1) : null;
    const best = a && b ? (a.sxDoor <= b.sxDoor ? a : b) : a || b;
    return best ? { slide: best.slide, sx: best.sxDoor, mirror: best.mirror } : {};
  }
  // Windows that glow warm at dusk and night: the models have no emissive mask, so
  // their dark, cool texels on upright faces (glass) light up with the night
  // (walls.js setNight -> TABLEFOLK_NIGHT); timber (dark but warm), roofs and
  // bright walls stay as they are.
  // Close-up detail (2026-11-22): the building models' own textures hold 85-140 texels a metre
  // (one 2048 atlas over a whole house; 1k at light and medium), soft at walking distance. A
  // fine tiling grain (plaster_aged's normal and colour, 1k, one copy for all) is laid over them
  // triplanar in world space, fading in from 14 m to full at 4 m: normals perturbed and albedo
  // varied a little, less on dark texels (timber, windows). Medium and high only; off with
  // window.TABLEFOLK_ENV_DETAIL = 0 (before/after shots).
  const DETAIL = { tile: .45, normal: 1.2, albedo: .6, near: 4, far: 14 };
  let detailTex = null;
  function detailTextures(sc) {
    if (detailTex && detailTex.n.getScene() === sc && !detailTex.n.isDisposed?.()) return detailTex;
    const t = (kind, srgb) => { const x = new BABYLON.Texture(ENV() + 'plaster_aged_' + kind + '_1k.webp', sc, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE); x.gammaSpace = srgb; x.wrapU = x.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; x.anisotropicFilteringLevel = 8; return x; };
    return (detailTex = { n: t('normal', false), c: t('color', true) });
  }
  // the building models' 2048 files at medium too (2026-11-22): their 1k copies are mush at walking
  // distance (85-140 texels a metre at 2048); ?env2k=0 keeps medium on the 1k files (memory tests)
  const ENV2K = new URLSearchParams(location.search).get('env2k') !== '0';
  const envFull = () => window.TABLEFOLK_GFX?.quality === 'high' || (ENV2K && !window.TABLEFOLK_GFX?.lite);
  const detailOn = () => !window.TABLEFOLK_GFX?.lite && window.TABLEFOLK_ENV_DETAIL !== 0;
  let Glow = null;
  function windowGlow(m) {
    if (!m || m._tfGlow || !(m instanceof BABYLON.PBRMaterial)) return;
    try {
      const WGSL = BABYLON.ShaderLanguage?.WGSL;
      Glow ||= class extends BABYLON.MaterialPluginBase {
        constructor(mat) { super(mat, 'TfWinGlow', 220, { TFWINGLOW: false }); this._enable(true); this.det = detailTextures(mat.getScene()); }
        getClassName() { return 'TfWinGlowPlugin'; }
        isCompatible() { return true; }
        prepareDefines(d) { d.TFWINGLOW = true; }
        getSamplers(s) { s.push('tfDetNSampler', 'tfDetCSampler'); }
        getUniforms(lang) { const ubo = [{ name: 'tfNight', size: 4, type: 'vec4' }, { name: 'tfHole', size: 4, type: 'vec4' }, { name: 'tfHoleB', size: 4, type: 'vec4' }, { name: 'tfDet', size: 4, type: 'vec4' }, { name: 'tfEye', size: 4, type: 'vec4' }]; return lang === WGSL ? { ubo } : { ubo, fragment: 'uniform vec4 tfNight;\nuniform vec4 tfHole;\nuniform vec4 tfHoleB;\nuniform vec4 tfDet;\nuniform vec4 tfEye;\n' }; }
        bindForSubMesh(ubo) {
          ubo.updateFloat4('tfNight', window.TABLEFOLK_NIGHT || 0, 0, 0, 0); ubo.updateFloat4('tfHole', hole.x, hole.z, hole.alongX, hole.k); ubo.updateFloat4('tfHoleB', HOLE_W, HOLE_D, hole.yTop, 0);
          const on = detailOn(), e = state.scene?.activeCamera?.globalPosition;
          ubo.updateFloat4('tfDet', on ? DETAIL.normal : 0, on ? DETAIL.albedo : 0, 1 / DETAIL.tile, DETAIL.near); ubo.updateFloat4('tfEye', e?.x || 0, e?.y || 0, e?.z || 0, DETAIL.far);
          ubo.setTexture('tfDetNSampler', this.det.n); ubo.setTexture('tfDetCSampler', this.det.c);
        }
        getCustomCode(type, lang) {
          if (type !== 'fragment') return null;
          // the doorway being approached (doorway(), below): the shell dithered away around it
          const holeW = `
if (uniforms.tfHole.w > 0.002) {
  let hp = fragmentInputs.vPositionW.xz - uniforms.tfHole.xy;
  let ha = select(abs(hp.y), abs(hp.x), uniforms.tfHole.z > 0.5); let hd = select(abs(hp.x), abs(hp.y), uniforms.tfHole.z > 0.5);
  let hn = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
  if (ha < uniforms.tfHoleB.x && hd < uniforms.tfHoleB.y && fragmentInputs.vPositionW.y < uniforms.tfHoleB.z && uniforms.tfHole.w > hn) { discard; }
}
`, holeG = `
if (tfHole.w > 0.002) {
  vec2 hp = vPositionW.xz - tfHole.xy;
  float ha = tfHole.z > 0.5 ? abs(hp.x) : abs(hp.y), hd = tfHole.z > 0.5 ? abs(hp.y) : abs(hp.x);
  float hn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ha < tfHoleB.x && hd < tfHoleB.y && vPositionW.y < tfHoleB.z && tfHole.w > hn) discard;
}
`;
          // the close-up grain (DETAIL): sampled outside any branch (WGSL uniformity), weights by the normal
          const detW = `
{
  let dp = fragmentInputs.vPositionW * uniforms.tfDet.z;
  let dk = (1.0 - smoothstep(uniforms.tfDet.w, uniforms.tfEye.w, distance(fragmentInputs.vPositionW, uniforms.tfEye.xyz)));
  var dw = pow(abs(normalW), vec3f(4.0)); dw = dw / max(dw.x + dw.y + dw.z, 1e-4);
  let nx = textureSample(tfDetNSampler, tfDetNSamplerSampler, dp.zy).xy * 2.0 - vec2f(1.0);
  let ny = textureSample(tfDetNSampler, tfDetNSamplerSampler, dp.xz).xy * 2.0 - vec2f(1.0);
  let nz = textureSample(tfDetNSampler, tfDetNSamplerSampler, dp.xy).xy * 2.0 - vec2f(1.0);
  let lw = vec3f(0.3, 0.59, 0.11);
  let cl = dw.x * dot(textureSample(tfDetCSampler, tfDetCSamplerSampler, dp.zy).rgb, lw) + dw.y * dot(textureSample(tfDetCSampler, tfDetCSamplerSampler, dp.xz).rgb, lw) + dw.z * dot(textureSample(tfDetCSampler, tfDetCSamplerSampler, dp.xy).rgb, lw);
  let la = dot(surfaceAlbedo, lw); let lit = smoothstep(0.02, 0.12, la);
  let dn = dw.x * vec3f(0.0, nx.y, nx.x) + dw.y * vec3f(ny.x, 0.0, ny.y) + dw.z * vec3f(nz.x, nz.y, 0.0);
  normalW = normalize(normalW + dn * uniforms.tfDet.x * dk * (0.4 + 0.6 * lit));
  surfaceAlbedo = surfaceAlbedo * mix(1.0, clamp(cl / 0.55, 0.6, 1.4), uniforms.tfDet.y * dk * lit);
}
`, detG = `
{
  vec3 dp = vPositionW * tfDet.z;
  float dk = 1.0 - smoothstep(tfDet.w, tfEye.w, distance(vPositionW, tfEye.xyz));
  vec3 dw = pow(abs(normalW), vec3(4.0)); dw /= max(dw.x + dw.y + dw.z, 1e-4);
  vec2 nx = texture(tfDetNSampler, dp.zy).xy * 2.0 - 1.0, ny = texture(tfDetNSampler, dp.xz).xy * 2.0 - 1.0, nz = texture(tfDetNSampler, dp.xy).xy * 2.0 - 1.0;
  vec3 lw = vec3(0.3, 0.59, 0.11);
  float cl = dw.x * dot(texture(tfDetCSampler, dp.zy).rgb, lw) + dw.y * dot(texture(tfDetCSampler, dp.xz).rgb, lw) + dw.z * dot(texture(tfDetCSampler, dp.xy).rgb, lw);
  float lit = smoothstep(0.02, 0.12, dot(surfaceAlbedo, lw));
  vec3 dn = dw.x * vec3(0.0, nx.y, nx.x) + dw.y * vec3(ny.x, 0.0, ny.y) + dw.z * vec3(nz.x, nz.y, 0.0);
  normalW = normalize(normalW + dn * tfDet.x * dk * (0.4 + 0.6 * lit));
  surfaceAlbedo *= mix(1.0, clamp(cl / 0.55, 0.6, 1.4), tfDet.y * dk * lit);
}
`;
          if (lang === WGSL) return { CUSTOM_FRAGMENT_DEFINITIONS: 'var tfDetNSamplerSampler: sampler; var tfDetNSampler: texture_2d<f32>; var tfDetCSamplerSampler: sampler; var tfDetCSampler: texture_2d<f32>;\n', CUSTOM_FRAGMENT_MAIN_BEGIN: holeW, CUSTOM_FRAGMENT_UPDATE_ALPHA: detW, CUSTOM_FRAGMENT_BEFORE_FOG: `
if (uniforms.tfNight.x > 0.01 && abs(normalW.y) < 0.45) {
  let a = surfaceAlbedo; let l = dot(a, vec3f(0.3, 0.59, 0.11));
  let g = (1.0 - smoothstep(0.035, 0.085, l)) * smoothstep(-0.01, 0.02, a.b - a.r * 0.9);
  finalColor = vec4f(finalColor.rgb + vec3f(1.0, 0.58, 0.24) * g * uniforms.tfNight.x * 2.2, finalColor.a);
}
` };
          return { CUSTOM_FRAGMENT_DEFINITIONS: 'uniform sampler2D tfDetNSampler; uniform sampler2D tfDetCSampler;\n', CUSTOM_FRAGMENT_MAIN_BEGIN: holeG, CUSTOM_FRAGMENT_UPDATE_ALPHA: detG, CUSTOM_FRAGMENT_BEFORE_FOG: `
if (tfNight.x > 0.01 && abs(normalW.y) < 0.45) {
  vec3 a = surfaceAlbedo; float l = dot(a, vec3(0.3, 0.59, 0.11));
  float g = (1.0 - smoothstep(0.035, 0.085, l)) * smoothstep(-0.01, 0.02, a.b - a.r * 0.9);
  finalColor.rgb += vec3(1.0, 0.58, 0.24) * g * tfNight.x * 2.2;
}
` };
        }
      };
      new Glow(m); m._tfGlow = true;
    } catch (e) { console.warn('[roofs] window glow', e); }
  }
  function buildShell(room, plan, sc) {
    const RY = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    const root = new BABYLON.TransformNode('roof_shell_' + plan.m, sc), node = new BABYLON.TransformNode('roof_shell_model', sc);
    node.parent = root; root.position.set(plan.cx, state.terrainTopY ?? 0, plan.cz); root.rotation.y = RY[plan.side];
    node.scaling.set(plan.sx * (plan.mirror ? -1 : 1), Math.sqrt(plan.sx * plan.sz), plan.sz);
    node.position.x = plan.slide || 0;   // the model's door over the room's (doorFit)
    const entry = { room, root, parts: [], mats: [], alpha: 1, target: 1, shell: plan.m, box: null };
    const file = plan.m + (envFull() ? '.glb' : '.1k.glb');
    loadModelInstance(sc, ENVM(), file, c => { for (const m of c.materials) { window.TABLEFOLK_LOOK?.matte?.(m); windowGlow(m); } }).then(res => {
      if (root.isDisposed()) { for (const m of res.meshes) m.dispose(); return; }
      for (const n of res.rootNodes) n.parent = node;
      // the model's footprint is centred on its origin, feet at 0
      root.computeWorldMatrix(true);
      let lo = new BABYLON.Vector3(1e9, 1e9, 1e9), hi = lo.scale(-1);
      for (const m of res.meshes) { if (!(m.getTotalVertices?.() > 0)) continue; m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; lo = BABYLON.Vector3.Minimize(lo, b.minimumWorld); hi = BABYLON.Vector3.Maximize(hi, b.maximumWorld);
        m.isPickable = false; m.receiveShadows = true; m.metadata = { roof: true }; window.addShadow?.(m); entry.parts.push(m);
        // (the container may have been loaded first for a building prop, without this prepare)
        windowGlow(m.material); }
      node.position.y = (state.terrainTopY ?? 0) - lo.y;
      entry.box = { lo, hi: hi.add(new BABYLON.Vector3(0, -lo.y, 0)) };
    }).catch(e => console.warn('[roofs] shell', plan.m, e));
    return entry;
  }

  function clear() {
    for (const g of state.characters || []) if (g._shellHidden) { g._shellHidden = null; if (!g._fogHidden) g.root?.setEnabled(true); }
    for (const r of roofs) { if (r.shell) for (const m of window.tablefolkWalls?.roomMeshes?.(r.room) || []) if (!m.isDisposed?.()) m.setEnabled(true); r.root.dispose(false, false); }
    roofs = [];
  }
  // (a promise: settled when the last roof of this build is up, or the build was replaced)
  function rebuild() { const t0 = performance.now(); try { return rebuild0(); } finally { window.tfMark?.('roofs.rebuild', t0); } }
  function rebuild0() {
    clear(); sig = '';
    enabled = wanted();
    if (!enabled || !state.scene || !window.tablefolk?.WORLD) return;
    const W = walls(); if (!W.size) return;
    const { rooms, outsideShare } = findRooms(W, doors());
    // a world that is all one building has no outside to see a roof from
    const s = state.envScn || window.tablefolkScenario?.active?.scn || {};
    if (s.roofs !== true && outsideShare < .25) return;
    // one roof a frame, nearest the player first (all at once took ~2.5 s of one frame in a big village)
    const p = state.playerAvatar?.logicalPos || state.camera?.target || { x: 0, z: 0 }, my = ++buildToken;
    const todo = rooms.filter(room => { const w = room.x1 - room.x0 + 1, h = room.z1 - room.z0 + 1; return !(room.fill < .8 || w * h < 4 || w > 20 || h > 20); })
      .sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - p.x, (a.z0 + a.z1) / 2 - p.z) - Math.hypot((b.x0 + b.x1) / 2 - p.x, (b.z0 + b.z1) / 2 - p.z));
    const D = doors(), useShells = shellsWanted(); lastShell = null;
    // the building kit (buildings.js) draws these rooms' houses and roofs: one entry per building, its roof fades
    const Kit = window.tablefolkBuildings;
    if (Kit?.enabled()) {
      for (const g of Kit.group(todo)) roofs.push(kitEntry(g));
      sig = signature(W);
      return;
    }
    let finished; const all = new Promise(r => { finished = r; });
    const step = () => { if (my !== buildToken || !todo.length) return finished(); const room = todo.shift(); try { const plan = useShells && planShell(room, D); roofs.push(plan ? buildShell(room, plan, state.scene) : build(room, state.scene)); } catch (e) { console.warn('[roofs]', e); } next(); };
    // the rest wait while the model loads or answers (app.js tablefolkDressGate)
    const next = () => { if (window.TABLEFOLK_MODEL_BUSY || window.TABLEFOLK_PAUSE_RENDER) window.tablefolkDressGate().then(() => requestAnimationFrame(step)); else requestAnimationFrame(step); };
    step();
    sig = signature(W);
    return all;
  }
  const signature = W => W.size + '|' + [...W].slice(0, 400).join(';').length;
  // a kit building's roof entry: its rooms as one (inside = any of them or their doorways); the meshes are
  // looked up each frame (walls rebuilt later make new ones)
  function kitEntry(g) {
    const cells = new Set(), here = new Set(), dr = [];
    for (const r of g.rooms) { for (const c of r.cells) cells.add(c); for (const c of r.here) here.add(c); dr.push(...(r.doors || [])); }
    const room = { x0: Math.min(...g.rooms.map(r => r.x0)), x1: Math.max(...g.rooms.map(r => r.x1)), z0: Math.min(...g.rooms.map(r => r.z0)), z1: Math.max(...g.rooms.map(r => r.z1)), cells, here, doors: dr, rooms: g.rooms };
    const K = window.tablefolkBuildings, key = g.key;
    return { room, kit: key, alpha: 1, target: 1, mats: [], get parts() { return K.roofParts(key); },
      root: { setEnabled: on => K.setRoofEnabled(key, on), dispose() {}, isDisposed: () => false } };
  }

  // ---- seeing in ----
  const posOf = g => g.logicalPos || g.root.position;
  function frame() {
    if (!roofs.length) { if (window.tablefolkBuildings?.clipState?.on) window.tablefolkBuildings.clip(null); return; }
    const sc = state.scene, cam = sc.activeCamera, me = state.playerAvatar, dt = Math.min(.1, (sc.getEngine().getDeltaTime() || 16) / 1000);
    const p = me && posOf(me), myCell = p && cellKey(Math.round(p.x), Math.round(p.z));
    let ray = null;
    if (me && cam && !state.firstPerson && state.cameraMode === 'follow') {
      const head = new BABYLON.Vector3(p.x, (state.terrainTopY ?? 0) + .9, p.z), from = cam.globalPosition || cam.position, dir = head.subtract(from), len = dir.length();
      ray = new BABYLON.Ray(from, dir.normalize(), len);
    }
    const dw = doorway(p, dt);
    let clipKey = null;
    for (const r of roofs) {
      // a shell goes only once you are through its door (in the room); a roof also in its doorway
      const inside = myCell && (r.shell ? r.room.cells.has(myCell) : r.room.here.has(myCell));
      const blocks = ray && (r.shell ? (r.box && ray.intersectsBoxMinMax(r.box.lo, r.box.hi)) : r.parts.some(m => (!r.kit || m.isEnabled(false)) && ray.intersectsMesh(m, false).hit));
      // in first person the roof overhead stays: it is the ceiling (a shell goes: its walls would hide the room)
      // "reveal": "rooms" (darkness.js): a room not yet seen into keeps its roof on, even in the camera's way
      const hidden = !inside && window.tablefolkDark?.roomRevealed && !window.tablefolkDark.roomRevealed(r.room);
      r.target = lifted || (inside && (!state.firstPerson || r.shell)) ? 0 : blocks && !hidden ? .22 : 1;
      if (r.kit) {
        // kit: every frame (its meshes may be new after a wall rebuild); the storey above goes while inside
        r.alpha += (r.target - r.alpha) * Math.min(1, dt * 7); if (Math.abs(r.alpha - r.target) < .005) r.alpha = r.target;
        for (const m of r.parts) m.visibility = r.alpha > .99 ? 1 : r.alpha;
        r.root.setEnabled(r.alpha > .02);
        if (inside && !state.firstPerson && r.target === 0) clipKey = r.kit;
        continue;
      }
      if (Math.abs(r.alpha - r.target) > .005) {
        r.alpha += (r.target - r.alpha) * Math.min(1, dt * 7);
        // per roof (the materials are shared between roofs): the meshes' visibility
        for (const m of r.parts) m.visibility = r.alpha > .99 ? 1 : r.alpha;
        r.root.setEnabled(r.alpha > .02);
      }
      // the room's own walls, door frame and door under a standing shell: hidden, except while its
      // doorway is open (dw) or the shell is fading (cross-fade, nothing pops)
      if (r.shell) shellHide(r, r.alpha > .98 && r.target > .5 && !(dw === r && hole.k > .01), dw === r);
    }
    window.tablefolkBuildings?.clip(lifted ? 'all' : clipKey);
    // the room walls' outer halves are clipped while its shell stands round an open doorway (cutaway.js)
    const clip = dw && dw.alpha > .02 && hole.k > .01;
    window.TABLEFOLK_ROOM_CLIP = clip ? { on: 1, x0: dw.room.x0 - 1, z0: dw.room.z0 - 1, x1: dw.room.x1 + 1, z1: dw.room.z1 + 1, hx: hole.x, hz: hole.z, alongX: hole.alongX, w: HOLE_W, d: HOLE_D } : null;
  }
  // ---- doorways (2026-11-22) ----
  // Walking up to a shelled house's door (within DOOR_NEAR squares outside it, or in the
  // doorway): before the door swings open (app.js opens it within 1.7 m) the shell is dithered
  // away round that doorway (HOLE_W either side along the wall, HOLE_D deep, up to the wall
  // tops) over ~.25 s, and the room's own walls, frame and door show there: the door you
  // open is the one you see. The rest of the shell fades only once you are through (in a room
  // square). While the hole is open the room walls' outer halves are clipped (cutaway.js,
  // TABLEFOLK_ROOM_CLIP) so they never poke through the shell elsewhere; their inner faces
  // still show through the door. Leaving, the same in reverse.
  const DOOR_NEAR = 3, HOLE_W = 1.5, HOLE_D = .95;
  const hole = { x: 0, z: 0, alongX: 1, k: 0, yTop: 0, r: null };
  window.TABLEFOLK_DOORWAY = hole;
  function doorway(p, dt) {
    let best = null, bd = 1e9;
    if (p && !lifted) for (const r of roofs) {
      if (!r.shell || !r.box || !r.room.doors) continue;
      for (const [x, z, nx, nz] of r.room.doors) {
        const rx = p.x - x, rz = p.z - z, out = rx * nx + rz * nz, side = Math.abs(rx * nz - rz * nx);
        if (out < -.55 || out > DOOR_NEAR || side > 1.4) continue;
        const d = Math.hypot(rx, rz); if (d < bd) { bd = d; best = { r, x, z, alongX: nz !== 0 ? 1 : 0 }; }
      }
    }
    const want = best ? 1 : 0;
    if (best && (!hole.r || hole.k < .02 || hole.r === best.r && hole.x === best.x && hole.z === best.z)) { hole.r = best.r; hole.x = best.x; hole.z = best.z; hole.alongX = best.alongX; }
    else if (best) { hole.k = Math.max(0, hole.k - dt * 8); return hole.r; }   // another door: close this one first
    hole.k += (want - hole.k) * Math.min(1, dt * 9); if (hole.k < .005 && !want) { hole.k = 0; hole.r = null; } if (hole.k > .995) hole.k = 1;
    hole.yTop = (state.terrainTopY ?? 0) + wallH() + .06;
    return hole.k > 0 ? hole.r : null;
  }
  // characters inside a standing shell are indoors: hidden (and shown again when it lifts)
  function shellHide(r, hide, open = false) {
    // the room's own walls, frames and door go too while the shell stands (walls.js draws them per room)
    if (r.box) for (const m of window.tablefolkWalls?.roomMeshes?.(r.room) || []) {
      if (m.isDisposed?.()) continue;
      if (!m._tfClip && m.material) { m._tfClip = true; window.tablefolkCutaway?.attach?.(m.material); }   // the doorway clip lives in the walls' cut plugin
      if (m.isEnabled() === hide) m.setEnabled(!hide);
    }
    // the characters inside: hidden while it stands, seen through an open doorway
    const hideFolk = hide || (r.alpha > .98 && r.target > .5 && !open);
    // and the things in it (a bed by the front wall poked out through the model's inset wall),
    // checked when that changes and once a second (things get carried)
    const now = performance.now();
    if (r._objHide !== hideFolk || now - (r._objAt || 0) > 1000) {
      r._objHide = hideFolk; r._objAt = now;
      for (const o of window.tablefolk?.getObjects?.() || []) {
        const m = o.mesh; if (!m || m.isDisposed?.() || o.type === 'light') continue;
        const inRoom = r.room.cells.has(cellKey(Math.round(o.x), Math.round(o.z)));
        if (hideFolk && inRoom && !m._shellHidden) { m._shellHidden = r; if (m.isEnabled()) m.setEnabled(false); }
        else if (m._shellHidden === r && (!hideFolk || !inRoom)) { m._shellHidden = null; if (!m._fogHidden) m.setEnabled(true); }
      }
    }
    for (const g of state.characters || []) {
      const q = posOf(g), inRoom = r.room.cells.has(cellKey(Math.round(q.x), Math.round(q.z)));
      if (hideFolk && inRoom && !g._shellHidden) { g._shellHidden = r; if (!g._fogHidden) g.root.setEnabled(false); }
      else if (g._shellHidden === r && (!hideFolk || !inRoom)) { g._shellHidden = null; if (!g._fogHidden) g.root.setEnabled(true); }
    }
  }
  function toggle() {
    if (!roofs.length) return;
    lifted = !lifted;
  }
  // a new world: build after its walls; walls built or dug later: again
  // (the loading cover waits for the last roof, loading.js)
  addEventListener('tablefolk-scenario-started', () => { lifted = false; const done = window.tablefolkLoading?.begin('roofs'); setTimeout(() => { let p; try { p = rebuild(); } catch {} Promise.resolve(p).finally(() => done?.()); }, 600); });
  setInterval(() => { if (!enabled || !state.scene) return; const s = signature(walls()); if (sig && s !== sig) rebuild(); }, 2500);
  function start() { state.scene.onBeforeRenderObservable.add(frame); }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });
  // walls.js: the rooms that get (or will get) a roof, by the same rule as rebuild()
  function planned() {
    if (!wanted() || !state.scene || !window.tablefolk?.WORLD) return [];
    const W = walls(); if (!W.size) return [];
    const { rooms, outsideShare } = findRooms(W, doors()), s = state.envScn || window.tablefolkScenario?.active?.scn || {};
    if (s.roofs !== true && outsideShare < .25) return [];
    return rooms.filter(room => { const w = room.x1 - room.x0 + 1, h = room.z1 - room.z0 + 1; return !(room.fill < .8 || w * h < 4 || w > 20 || h > 20); });
  }
  // terrain.js and walls.js: the rooms of the current walls (no roofs needed)
  function plan() { const W = walls(); return W.size ? findRooms(W, doors()) : { rooms: [], outsideShare: 1, outside: new Set() }; }
  window.tablefolkRoofs = { detail: DETAIL, envFull, windowGlow, rebuild, toggle, doorway: () => ({ k: hole.k, x: hole.x, z: hole.z, room: hole.r?.room || null }), shells: () => roofs.filter(r => r.shell).map(r => ({ model: r.shell, room: r.room, alpha: r.alpha, target: r.target, walls: (window.tablefolkWalls?.roomMeshes?.(r.room) || []).filter(m => m.isEnabled()).length })), findRooms: plan, planned, roofed: () => roofs.map(r => r.room), get rooms() { return roofs.map(r => r.room); } };
})();
