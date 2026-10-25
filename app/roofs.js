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
 * Seeing in (characters live in there):
 *   - the roof of the room the player is in fades away;
 *   - a roof between the camera and the player goes see-through, and so does
 *     one under the pointer;
 *   - R lifts every roof, and puts them back;
 *   - what the characters inside say still shows above the roof (bubbles).
 * Off in the tabletop view (a map from above wants the rooms).
 *
 *   window.tablefolkRoofs.rebuild()  .toggle()  .rooms
 * Loaded after app.js; uses its globals (state, meta, wallH, hasGroundAt).
 */
(function () {
  if (window.TABLEFOLK_TABLETOP) return;
  const OVER = .35, THICK = .16, PITCH = .85;
  let roofs = [], sig = '', lifted = false, hover = null, enabled = false;

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
  let thatchTex = null;
  function thatch(sc) {
    if (thatchTex && !thatchTex.isDisposed?.()) return thatchTex;
    const N = 256, t = new BABYLON.DynamicTexture('roof_thatch', { width: N, height: N }, sc, true), c = t.getContext();
    c.fillStyle = '#86683a'; c.fillRect(0, 0, N, N);
    // rows of straw, each row's ends hanging over the next
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 8; row++) {
      const y0 = row * N / 8;
      for (let i = 0; i < 260; i++) {
        const x = rnd() * N, len = 14 + rnd() * 22, y = y0 + rnd() * N / 8, sh = rnd();
        c.strokeStyle = sh < .33 ? '#5e4622' : sh < .66 ? '#a08245' : '#b39450'; c.lineWidth = 1 + rnd() * 1.4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - .5) * 4, y + len); c.stroke();
      }
      c.fillStyle = 'rgba(40,28,10,.35)'; c.fillRect(0, y0 + N / 8 - 3, N, 3);
    }
    t.update(); t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return (thatchTex = t);
  }
  function mats(sc, L, S) {
    const straw = new BABYLON.PBRMaterial('roof_straw', sc);
    // one texture for every roof (a cloned DynamicTexture never became ready
    // and the slabs didn't draw); each slab scales its own UVs instead
    straw.albedoTexture = thatch(sc); straw.metallic = 0; straw.roughness = .95; straw.maxSimultaneousLights = 8; straw.environmentIntensity = .35; straw.albedoColor = new BABYLON.Color3(.8, .74, .66);
    const ridge = new BABYLON.PBRMaterial('roof_ridge', sc); ridge.albedoColor = new BABYLON.Color3(.42, .31, .15); ridge.metallic = 0; ridge.roughness = .95; ridge.maxSimultaneousLights = 8;
    const gable = new BABYLON.PBRMaterial('roof_gable', sc); gable.albedoColor = new BABYLON.Color3(.86, .8, .68); gable.metallic = 0; gable.roughness = .9; gable.maxSimultaneousLights = 8; 
    return [straw, ridge, gable];
  }

  // ---- one roof ----
  // w: from the ridge to the walls' outer face; half: to the overhang's edge
  function build(room, sc) {
    const top = state.terrainTopY ?? 0, eave = top + wallH() + .02;
    const xa = room.x0 - 1.5, xb = room.x1 + 1.5, za = room.z0 - 1.5, zb = room.z1 + 1.5;
    const alongX = (xb - xa) >= (zb - za), cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const L = (alongX ? xb - xa : zb - za) + 2 * OVER, w = (alongX ? zb - za : xb - xa) / 2, half = w + OVER;
    const rise = Math.min(1.8, Math.max(.7, w * PITCH)), ridgeY = eave + rise, ang = Math.atan2(rise, w);
    const slope = half / Math.cos(ang), d = half / 2, midY = ridgeY - d * Math.tan(ang);
    const root = new BABYLON.TransformNode('roof', sc);
    const [straw, ridgeMat, gableMat] = mats(sc, L, slope);
    const parts = [];
    for (const side of [-1, 1]) {
      // a slab from the ridge down past the wall by OVER, tilted down outward
      const sl = alongX
        ? BABYLON.MeshBuilder.CreateBox('roof_slope', { width: L, height: THICK, depth: slope }, sc)
        : BABYLON.MeshBuilder.CreateBox('roof_slope', { width: slope, height: THICK, depth: L }, sc);
      sl.material = straw; sl.parent = root;
      { const uv = sl.getVerticesData(BABYLON.VertexBuffer.UVKind), ku = Math.max(1, L / 2.4), kv = Math.max(1, slope / 1.8);
        for (let i = 0; i < uv.length; i += 2) { uv[i] *= alongX ? ku : kv; uv[i + 1] *= alongX ? kv : ku; }
        sl.setVerticesData(BABYLON.VertexBuffer.UVKind, uv); }
      if (alongX) { sl.position.set(cx, midY, cz + side * d); sl.rotation.x = side * ang; }
      else { sl.position.set(cx + side * d, midY, cz); sl.rotation.z = -side * ang; }
      parts.push(sl);
    }
    const cap = BABYLON.MeshBuilder.CreateCylinder('roof_ridge', { diameter: .26, height: L + .1, tessellation: 10 }, sc);
    cap.material = ridgeMat; cap.parent = root; cap.position.set(cx, ridgeY + .04, cz);
    if (alongX) cap.rotation.z = Math.PI / 2; else cap.rotation.x = Math.PI / 2;
    parts.push(cap);
    // gable triangles on the end walls' outer faces, wall top to ridge
    for (const end of [-1, 1]) {
      const g = new BABYLON.Mesh('roof_gable', sc);
      // both faces, each with its own normal (one face lit from behind drew black)
      const tri = alongX ? [0, 0, -w, 0, 0, w, 0, rise, 0] : [-w, 0, 0, w, 0, 0, 0, rise, 0], pos = tri.concat(tri);
      const vd = new BABYLON.VertexData(); vd.positions = pos; vd.indices = [0, 1, 2, 5, 4, 3];
      const nrm = []; BABYLON.VertexData.ComputeNormals(pos, vd.indices, nrm); vd.normals = nrm; vd.applyToMesh(g);
      g.material = gableMat; g.parent = root;
      if (alongX) g.position.set(end < 0 ? xa : xb, eave, cz); else g.position.set(cx, eave, end < 0 ? za : zb);
      parts.push(g);
    }
    for (const m of parts) { m.isPickable = true; m.receiveShadows = true; m.metadata = { roof: true }; }
    return { room, root, parts, mats: [straw, ridgeMat, gableMat], alpha: 1, target: 1 };
  }

  function clear() {
    for (const r of roofs) { r.root.dispose(false, true); }
    roofs = []; hover = null;
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
    if (me && cam && !state.firstPerson) {
      const head = new BABYLON.Vector3(p.x, (state.terrainTopY ?? 0) + .9, p.z), from = cam.globalPosition || cam.position, dir = head.subtract(from), len = dir.length();
      ray = new BABYLON.Ray(from, dir.normalize(), len);
    }
    for (const r of roofs) {
      const inside = myCell && r.room.here.has(myCell);
      const blocks = ray && r.parts.some(m => ray.intersectsMesh(m, false).hit);
      r.target = lifted || inside ? 0 : (blocks || hover === r) ? .22 : 1;
      if (Math.abs(r.alpha - r.target) > .005) {
        r.alpha += (r.target - r.alpha) * Math.min(1, dt * 7);
        for (const m of r.mats) { m.alpha = r.alpha; if (m instanceof BABYLON.PBRMaterial) m.transparencyMode = r.alpha < .99 ? BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND : BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE; }
        r.root.setEnabled(r.alpha > .02);
      }
    }
  }
  let lastPick = 0;
  addEventListener('pointermove', e => {
    if (!roofs.length || performance.now() - lastPick < 120 || !state.scene) return;
    lastPick = performance.now();
    const pick = state.scene.pick(state.scene.pointerX, state.scene.pointerY, m => !!m.metadata?.roof && m.isEnabled());
    hover = pick?.hit ? roofs.find(r => r.parts.includes(pick.pickedMesh)) || null : null;
  });
  function toggle() {
    if (!roofs.length) return;
    lifted = !lifted;
    window.tablefolkToast?.(lifted ? 'roofs lifted (R puts them back)' : 'roofs back on (R lifts them)', { type: 'info' });
  }
  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') toggle();
  });
  // a new world: build after its walls; walls built or dug later: again
  addEventListener('tablefolk-scenario-started', () => { lifted = false; setTimeout(rebuild, 600); });
  setInterval(() => { if (!enabled || !state.scene) return; const s = signature(walls()); if (sig && s !== sig) rebuild(); }, 2500);
  function start() { state.scene.onBeforeRenderObservable.add(frame); }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });
  window.tablefolkRoofs = { rebuild, toggle, get rooms() { return roofs.map(r => r.room); } };
})();
