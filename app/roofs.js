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
 * whose doorway it stands in) fades away; with the follow camera, a roof
 * between the camera and the player goes see-through so the player is never
 * lost behind it. The free camera can't peek: roofs stay on. What the
 * characters inside say still shows above the roof (bubbles).
 * Off in the tabletop view (a map from above wants the rooms).
 *
 *   window.tablefolkRoofs.rebuild()  .toggle() (lift all, for tests)  .rooms
 * Loaded after app.js; uses its globals (state, meta, wallH, hasGroundAt).
 */
(function () {
  if (window.TABLEFOLK_TABLETOP) return;
  const OVER = .35, THICK = .16, PITCH = .85;
  let roofs = [], sig = '', lifted = false, enabled = false;

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
      for (const c of cells) { const [x, z] = c.split(',').map(Number); for (const n of [cellKey(x + 1, z), cellKey(x - 1, z), cellKey(x, z + 1), cellKey(x, z - 1)]) if (D.has(n)) r.here.add(n); }
      rooms.push(r);
    }
    return { rooms, outsideShare: ground ? outside / ground : 0 };
  }
  function wanted() {
    const s = window.tablefolkScenario?.active?.scn || {};
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
  function mats(sc, tint) {
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
    const rise = Math.min(1.8, Math.max(.7, w * PITCH)), ridgeY = eave + rise, ang = Math.atan2(rise, w);
    const slope = half / Math.cos(ang);
    // a little different straw on each house
    const hsh = Math.abs(Math.sin(room.x0 * 12.9898 + room.z0 * 78.233) * 43758.5453) % 1;
    const M = mats(sc, [.92 + hsh * .16, .9 + ((hsh * 7) % 1) * .16, .88 + ((hsh * 13) % 1) * .2]);
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
        box('straw', { width: L, height: THICK, depth: cd }, [0, 0, side * cd / 2], c, [Math.max(.5, cd / 1.8), Math.max(1, L / 2.4)]);
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
      vd.positions = tri.concat(tri); vd.indices = [0, 1, 2, 5, 4, 3];   // both faces, each lit from its own side
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

  function clear() {
    for (const r of roofs) { r.root.dispose(false, true); }
    roofs = [];
  }
  function rebuild() {
    clear(); sig = '';
    enabled = wanted();
    if (!enabled || !state.scene || !window.tablefolk?.WORLD) return;
    const W = walls(); if (!W.size) return;
    const { rooms, outsideShare } = findRooms(W, doors());
    // a world that is all one building has no outside to see a roof from
    const s = window.tablefolkScenario?.active?.scn || {};
    if (s.roofs !== true && outsideShare < .25) return;
    for (const room of rooms) {
      const w = room.x1 - room.x0 + 1, h = room.z1 - room.z0 + 1;
      if (room.fill < .8 || w * h < 4 || w > 20 || h > 20) continue;
      try { roofs.push(build(room, state.scene)); } catch (e) { console.warn('[roofs]', e); }
    }
    sig = signature(W);
  }
  const signature = W => W.size + '|' + [...W].slice(0, 400).join(';').length;

  // ---- seeing in ----
  const posOf = g => g.logicalPos || g.root.position;
  function frame() {
    if (!roofs.length) return;
    const sc = state.scene, cam = sc.activeCamera, me = state.playerAvatar, dt = Math.min(.1, (sc.getEngine().getDeltaTime() || 16) / 1000);
    const p = me && posOf(me), myCell = p && cellKey(Math.round(p.x), Math.round(p.z));
    let ray = null;
    if (me && cam && !state.firstPerson && state.cameraMode === 'follow') {
      const head = new BABYLON.Vector3(p.x, (state.terrainTopY ?? 0) + .9, p.z), from = cam.globalPosition || cam.position, dir = head.subtract(from), len = dir.length();
      ray = new BABYLON.Ray(from, dir.normalize(), len);
    }
    for (const r of roofs) {
      const inside = myCell && r.room.here.has(myCell);
      const blocks = ray && r.parts.some(m => ray.intersectsMesh(m, false).hit);
      r.target = lifted || inside ? 0 : blocks ? .22 : 1;
      if (Math.abs(r.alpha - r.target) > .005) {
        r.alpha += (r.target - r.alpha) * Math.min(1, dt * 7);
        for (const m of r.mats) { m.alpha = r.alpha; if (m instanceof BABYLON.PBRMaterial) m.transparencyMode = r.alpha < .99 ? BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND : BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE; }
        r.root.setEnabled(r.alpha > .02);
      }
    }
  }
  function toggle() {
    if (!roofs.length) return;
    lifted = !lifted;
  }
  // a new world: build after its walls; walls built or dug later: again
  addEventListener('tablefolk-scenario-started', () => { lifted = false; setTimeout(rebuild, 600); });
  setInterval(() => { if (!enabled || !state.scene) return; const s = signature(walls()); if (sig && s !== sig) rebuild(); }, 2500);
  function start() { state.scene.onBeforeRenderObservable.add(frame); }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });
  window.tablefolkRoofs = { rebuild, toggle, get rooms() { return roofs.map(r => r.room); } };
})();
