/* darkness.js -- dark dungeons: fog of war and carried torches.
 *
 * A scenario with "dark": true (the default for generated dungeons) starts
 * hidden: unexplored squares are solid black, so the overview camera shows
 * nothing but what the player has found. The player sees a square when it is
 * in line of sight (walls block; a door only while the player is next to it)
 * and lit: by a room light, lantern, campfire or torch within its range, or
 * by a torch the player (or a character near them) carries, or when it is
 * right next to the player. Squares seen before stay on the map, dimmed;
 * characters there are hidden until seen again.
 *
 * Torches: anyone with a "torch" in their inventory carries it lit, in the
 * left hand (a warm light and a glow on the floor that follow them). Standing
 * torches can be picked up (E). In dark dungeons the player starts with one.
 *
 *   window.tablefolkDark.start(on)   scenario.js, at each scenario start
 *   window.tablefolkDark.setFog(on)  turn the fog off and on (?nofog=1: off)
 *   window.tablefolkDark.visible(x, z)
 * Loaded after app.js and uses its helpers (state, meta, canSeeCell,
 * gridKey, charInventory, addLampPool); off in tabletop mode.
 */
(function () {
  const FOG_H = 2.7, VIEW = 13, NEAR = 1.5, TORCH_R = 3.6;
  // light radius (cells) of objects that light a room, by type
  const LIGHTS = { light: 5.5, lantern: 5, campfire: 5.5, torch: 3.2, lamp: 3, candelabra: 2.5, candles: 1.8 };
  const OPAQUE = new Set(['wall', 'door']);
  let dark = false, fogOn = !new URLSearchParams(location.search).has('nofog');
  let explored = new Set(), seen = new Set(), sig = '', black = null, dim = null, timer = setInterval(() => tick(), 250);

  // ---- which squares the player sees ----
  const cellOf = p => [Math.round(p.x), Math.round(p.z)];
  const posOf = g => g.logicalPos || g.root.position;
  function board() {
    const { cols, rows } = window.tablefolk.WORLD;
    return { cols, rows, x0: -(cols - 1) / 2, z0: -(rows - 1) / 2 };
  }
  function carriesTorch(g) {
    if (!g || g.defeated) return false;
    const items = g === state.playerAvatar ? state.player.items : charInventory(g).items;
    return (items || []).some(i => /torch/i.test(i.name || i) && (i.qty ?? 1) > 0);
  }
  function lightSources() {
    const out = [];
    for (const m of state.props) {
      if (!m || m.isDisposed?.()) continue;
      const mm = meta(m), r = mm && (mm.type === 'light' || mm.type === 'lantern' || mm.type === 'campfire' ? +mm.opts?.range || LIGHTS[mm.type] : LIGHTS[mm.type]);
      if (!r) continue;
      const p = m.getAbsolutePosition?.() || m.position;
      out.push({ x: p.x, z: p.z, r });
    }
    for (const g of [state.playerAvatar, ...state.characters]) if (carriesTorch(g)) { const p = posOf(g); out.push({ x: p.x, z: p.z, r: TORCH_R }); }
    return out;
  }
  function opaqueAround(px, pz) {
    const out = new Set();
    for (const m of state.blocks.concat(state.props)) {
      if (!m || m.isDisposed?.()) continue;
      const mm = meta(m); if (!mm || mm.decor || !OPAQUE.has(mm.type)) continue;
      const p = m.getAbsolutePosition?.() || m.position;
      if (mm.type === 'door' && Math.hypot(p.x - px, p.z - pz) < 1.6) continue;
      out.add(gridKey(p.x, p.z));
    }
    return out;
  }
  function compute() {
    const me = state.playerAvatar, vis = new Set(); if (!me) return vis;
    const p = posOf(me), [px, pz] = cellOf(p), opaque = opaqueAround(p.x, p.z), lights = lightSources(), b = board();
    for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) {
      const x = Math.round(b.x0 + i), z = Math.round(b.z0 + j), d = Math.hypot(x - px, z - pz);
      if (d > VIEW) continue;
      if (d > NEAR) {
        if (!canSeeCell(px, pz, x, z, opaque)) continue;
        if (!lights.some(L => Math.hypot(L.x - x, L.z - z) <= L.r && canSeeCell(Math.round(L.x), Math.round(L.z), x, z, opaque))) continue;
      }
      vis.add(x + ',' + z);
    }
    return vis;
  }

  // ---- the fog: black boxes over unexplored squares, dim ones over the rest ----
  function fogMesh(name, alpha) {
    const sc = state.scene, m = BABYLON.MeshBuilder.CreateBox(name, { width: 1.003, depth: 1.003, height: FOG_H }, sc);
    const mat = new BABYLON.StandardMaterial(name + '_mat', sc);
    mat.diffuseColor = mat.specularColor = mat.emissiveColor = BABYLON.Color3.Black(); mat.disableLighting = true;
    if (alpha < 1) { mat.alpha = alpha; mat.disableDepthWrite = true; }
    m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.doNotSyncBoundingInfo = true;
    return m;
  }
  function place(mesh, keys) {
    if (!keys.length) { mesh.thinInstanceCount = 0; mesh.isVisible = false; return; }
    const y = (state.terrainTopY ?? 0) - .3 + FOG_H / 2, buf = new Float32Array(keys.length * 16);
    keys.forEach((k, n) => { const [x, z] = k.split(',').map(Number); BABYLON.Matrix.Translation(x, y, z).copyToArray(buf, n * 16); });
    mesh.thinInstanceSetBuffer('matrix', buf, 16, false); mesh.isVisible = true;
  }
  function paint() {
    const b = board(), unknown = [], remembered = [];
    for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) {
      const k = Math.round(b.x0 + i) + ',' + Math.round(b.z0 + j);
      if (!explored.has(k)) unknown.push(k); else if (!seen.has(k)) remembered.push(k);
    }
    // names start "board_" so scenery.js's local lights leave them alone
    black ||= fogMesh('board_fog_black', 1); dim ||= fogMesh('board_fog_dim', .62);
    place(black, unknown); place(dim, remembered);
  }
  function showCharacters(all) {
    for (const g of state.characters) {
      if (!g.root) continue;
      const show = all || seen.has(cellOf(posOf(g)).join(','));
      if (!!g._fogHidden === show) { g._fogHidden = !show; g.root.setEnabled(show); }
    }
  }
  function update(force) {
    if (!dark || !fogOn || !state.playerAvatar) return;
    seen = compute();
    for (const k of seen) explored.add(k);
    const s = explored.size + '|' + [...seen].join(';');
    if (force || s !== sig) { sig = s; paint(); }
    showCharacters(false);
  }
  function clearFog() {
    for (const m of [black, dim]) if (m) { m.dispose(false, true); }
    black = dim = null; sig = '';
    showCharacters(true);
  }

  // ---- carried torches ----
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  let torchMats = null;
  function torchMesh() {
    const sc = state.scene, root = new BABYLON.TransformNode('carried_torch', sc);
    torchMats ||= (() => {
      const wood = new BABYLON.PBRMaterial('torch_wood', sc); wood.albedoColor = C3(.3, .19, .1); wood.roughness = .9; wood.metallic = 0;
      const wrap = new BABYLON.PBRMaterial('torch_wrap', sc); wrap.albedoColor = C3(.12, .09, .07); wrap.roughness = 1; wrap.metallic = 0;
      const fire = new BABYLON.StandardMaterial('torch_fire', sc); fire.emissiveColor = C3(1, .55, .15); fire.diffuseColor = C3(0, 0, 0); fire.disableLighting = true; fire.alpha = .92;
      for (const m of [wood, wrap]) { m.maxSimultaneousLights = 8; state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m); }
      return { wood, wrap, fire };
    })();
    const stick = BABYLON.MeshBuilder.CreateCylinder('torch_stick', { diameterTop: .045, diameterBottom: .035, height: .42, tessellation: 7 }, sc); stick.position.y = .1; stick.material = torchMats.wood;
    const head = BABYLON.MeshBuilder.CreateCylinder('torch_head', { diameter: .075, height: .1, tessellation: 7 }, sc); head.position.y = .33; head.material = torchMats.wrap;
    const flame = BABYLON.MeshBuilder.CreateCylinder('torch_flame', { diameterTop: 0, diameterBottom: .1, height: .2, tessellation: 7 }, sc); flame.position.y = .47; flame.material = torchMats.fire;
    for (const m of [stick, head, flame]) { m.parent = root; m.isPickable = false; }
    return { root, flame };
  }
  // left hand: the rig's slot or bone, else beside the body
  function leftHand(g) {
    const bones = g.root.getChildMeshes().find(m => m.skeleton)?.skeleton?.bones || [];
    const b = bones.find(b => b.name === 'handslot.l') || bones.find(b => /hand.*(\.l|_l|left)$|left.*hand/i.test(b.name))
      || bones.find(b => /^wrist[._]?l$/i.test(b.name)) || bones.find(b => /^arm[._]l_end$/i.test(b.name));
    return b?.getTransformNode?.() || null;
  }
  function lightTorch(g) {
    const sc = state.scene, t = { mesh: torchMesh() }, hand = leftHand(g);
    if (hand) { t.mesh.root.parent = hand; hand.computeWorldMatrix(true); t.mesh.root.scaling.setAll(1 / (Math.abs(hand.absoluteScaling?.y) || 1)); }
    else { t.mesh.root.parent = g.root; t.mesh.root.position.set(.24 / (g.root.scaling.x || 1), .55 / (g.root.scaling.y || 1), .08); t.mesh.root.scaling.setAll(1 / (g.root.scaling.y || 1)); }
    // the light and the floor glow follow the character, unscaled
    t.holder = new BABYLON.TransformNode('torch_holder', sc);
    t.light = new BABYLON.PointLight('carried_torch_light', new BABYLON.Vector3(0, 1.25, 0), sc);
    t.light.parent = t.holder; t.light.diffuse = C3(1, .62, .28); t.light.intensity = 1.6; t.light.range = 5;
    window.tablefolkScenery?.trackLight(t.light);
    try { addLampPool(sc, t.holder, { warm: true }); } catch {}
    t.obs = sc.onBeforeRenderObservable.add(() => {
      const p = g.root.position; t.holder.position.set(p.x, state.terrainTopY ?? 0, p.z);
      const f = performance.now() * .006;
      t.light.intensity = 1.6 * (.92 + Math.sin(f) * .05 + Math.sin(f * 2.3) * .04);
      t.mesh.flame.scaling.set(1, 1 + Math.sin(f * 1.7) * .15, 1);
    });
    g._torch = t;
  }
  function putOut(g) {
    const t = g._torch; if (!t) return;
    state.scene.onBeforeRenderObservable.remove(t.obs);
    t.mesh.root.dispose(false, false); t.light.dispose(); t.holder.dispose(false, false);
    g._torch = null;
  }
  function torches() {
    for (const g of [state.playerAvatar, ...state.characters]) {
      if (!g?.root || g.root.isDisposed?.()) continue;
      const want = carriesTorch(g);
      if (want && !g._torch) lightTorch(g); else if (!want && g._torch) putOut(g);
      if (g._torch) g._torch.mesh.root.setEnabled(!g._fogHidden);
    }
  }

  function tick() { if (window.TABLEFOLK_TABLETOP || !state.scene) return; try { torches(); update(false); } catch (e) { console.warn('[dark]', e); } }
  function start(on) {
    if (window.TABLEFOLK_TABLETOP) on = false;
    clearFog(); explored = new Set(); seen = new Set();
    dark = !!on;
    clearInterval(timer); timer = setInterval(tick, 250);
    if (dark && fogOn) setTimeout(() => update(true), 50);
  }
  function setFog(on) { fogOn = !!on; if (fogOn) update(true); else clearFog(); }
  window.addEventListener('tablefolk-inventory', () => setTimeout(tick, 0));
  window.tablefolkDark = { start, setFog, update: () => update(true), visible: (x, z) => !dark || !fogOn || seen.has(Math.round(x) + ',' + Math.round(z)), get on() { return dark && fogOn; }, carriesTorch };
})();
