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
 * In first person the boxes would stand in the room like black glass, so
 * there they are hidden and the dark is a black distance fog instead (the
 * same squares still hide the characters in them).
 *
 * Torches: anyone with a "torch" in their inventory carries it lit, in the
 * left hand (a warm light and a glow on the floor that follow them). Standing
 * torches can be picked up (E). In dark dungeons the player starts with one.
 *
 *   window.tablefolkDark.start(on)   scenario.js, at each scenario start
 *   window.tablefolkDark.setFog(on)  turn the fog off and on (?nofog=1: off)
 *   window.tablefolkDark.visible(x, z)
 *   window.tablefolkDark.sightFor(g)  squares character g sees (its prompt)
 * Loaded after app.js and uses its helpers (state, meta, canSeeCell,
 * gridKey, charInventory, addLampPool); off in tabletop mode.
 */
(function () {
  const FLAT_H = 2.5, FOG_H = 2.7, DIM_H = .04, VIEW = 13, NEAR = 1.5, TORCH_R = 5;
  // light radius (cells) of objects that light a room, by type
  const LIGHTS = { light: 5.5, lantern: 5, campfire: 5.5, torch: 3.2, lamp: 3, candelabra: 2.5, candles: 1.8 };
  const OPAQUE = new Set(['wall', 'door']);
  let dark = false, fogOn = !new URLSearchParams(location.search).has('nofog');
  let explored = new Set(), seen = new Set(), sig = '', black = null, dim = null, flat = null, timer = setInterval(() => tick(), 250);

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
  function wallCells() {
    const out = new Set();
    for (const m of state.blocks.concat(state.props)) {
      if (!m || m.isDisposed?.()) continue;
      const mm = meta(m); if (!mm || mm.decor || !OPAQUE.has(mm.type)) continue;
      const p = m.getAbsolutePosition?.() || m.position; out.add(gridKey(p.x, p.z));
    }
    return out;
  }
  // The squares g sees: in line of sight within VIEW (all round, not only
  // ahead), and in a dark scenario also lit (or right next to g).
  function sight(g, needLight) {
    const vis = new Set(); if (!g?.root && !g?.logicalPos) return vis;
    const p = posOf(g), [px, pz] = cellOf(p), opaque = opaqueAround(p.x, p.z), lights = needLight ? lightSources() : null, b = board();
    for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) {
      const x = Math.round(b.x0 + i), z = Math.round(b.z0 + j), d = Math.hypot(x - px, z - pz);
      if (d > VIEW) continue;
      if (d > NEAR) {
        if (!canSeeCell(px, pz, x, z, opaque)) continue;
        if (lights && !lights.some(L => Math.hypot(L.x - x, L.z - z) <= L.r && canSeeCell(Math.round(L.x), Math.round(L.z), x, z, opaque))) continue;
      }
      vis.add(x + ',' + z);
    }
    return vis;
  }
  const compute = () => sight(state.playerAvatar, true);
  // What a character sees, for its prompt (senses.js, app.js perception);
  // kept until the current task ends, so one prompt build computes it once.
  let sightCache = null;
  function sightFor(g) {
    if (!g || !(g.logicalPos || g.root)) return null;
    if (!sightCache) { sightCache = new Map(); setTimeout(() => { sightCache = null; }, 0); }
    if (!sightCache.has(g)) sightCache.set(g, sight(g, dark));
    return sightCache.get(g);
  }

  // ---- the fog: black boxes over unexplored squares, dim ones over the rest ----
  function fogMesh(name, alpha, h = FOG_H) {
    const sc = state.scene, m = BABYLON.MeshBuilder.CreateBox(name, { width: 1.003, depth: 1.003, height: h }, sc);
    const mat = new BABYLON.StandardMaterial(name + '_mat', sc);
    mat.diffuseColor = mat.specularColor = mat.emissiveColor = BABYLON.Color3.Black(); mat.disableLighting = true;
    if (alpha < 1) { mat.alpha = alpha; mat.disableDepthWrite = true; }
    // the follow camera cuts the tall boxes to a stub in front of the player
    // (cutaway.js); their insides, drawn too, close the cut top in black
    else if (h === FOG_H) { mat.backFaceCulling = false; window.tablefolkCutaway?.attach(mat); }
    m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.doNotSyncBoundingInfo = true;
    return m;
  }
  function place(mesh, keys, y = (state.terrainTopY ?? 0) - .3 + FOG_H / 2) {
    if (!keys.length) { mesh.thinInstanceCount = 0; mesh.isVisible = false; return; }
    const buf = new Float32Array(keys.length * 16);
    keys.forEach((k, n) => { const [x, z] = k.split(',').map(Number); BABYLON.Matrix.Translation(x, y, z).copyToArray(buf, n * 16); });
    mesh.thinInstanceSetBuffer('matrix', buf, 16, false); mesh.isVisible = true;
  }
  function paint() {
    const b = board(), unknown = [], outside = [], remembered = [], walls = wallCells(), w = window.tablefolk;
    for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) {
      const x = Math.round(b.x0 + i), z = Math.round(b.z0 + j), k = x + ',' + z;
      // nothing stands where there is neither floor nor wall (the sea round a
      // dungeon): a flat lid at floor level, so the outsides of the walls of
      // the rooms you see stay in view
      if (!explored.has(k)) (w.hasGroundAt(x, z) || walls.has(k) ? unknown : outside).push(k);
      else if (!seen.has(k)) remembered.push(k);
    }
    // names start "board_" so scenery.js's local lights leave them alone
    // Remembered squares get a dark film on the floor: as tall see-through
    // boxes they stood in the view like dark glass under an angled camera.
    black ||= fogMesh('board_fog_black', 1); dim ||= fogMesh('board_fog_dim', .62, DIM_H); flat ||= fogMesh('board_fog_flat', 1, FLAT_H);
    place(black, unknown); place(dim, remembered, (state.terrainTopY ?? 0) + DIM_H / 2 + .01); place(flat, outside, (state.terrainTopY ?? 0) - .02 - FLAT_H / 2);
    for (const m of [black, dim, flat]) m.setEnabled(!fpFog);
  }
  function showCharacters(all) {
    for (const g of state.characters) {
      if (!g.root) continue;
      const show = all || seen.has(cellOf(posOf(g)).join(','));
      if (!!g._fogHidden === show) { g._fogHidden = !show; g.root.setEnabled(show); }
    }
  }
  // first person: no boxes, a black fog (the overview's is put back after)
  let fpFog = null;
  function firstPersonFog(want) {
    const sc = state.scene; if (!sc || !!fpFog === want) return;
    if (want) {
      fpFog = { mode: sc.fogMode, density: sc.fogDensity, color: sc.fogColor.clone(), clear: sc.clearColor.clone() };
      sc.fogMode = BABYLON.Scene.FOGMODE_EXP2; sc.fogDensity = .14; sc.fogColor = C3(0, 0, 0); sc.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    } else {
      sc.fogMode = fpFog.mode; sc.fogDensity = fpFog.density; sc.fogColor = fpFog.color; sc.clearColor = fpFog.clear; fpFog = null;
    }
    for (const m of [black, dim, flat]) m?.setEnabled(!want);
  }
  function update(force) {
    firstPersonFog(!!(dark && fogOn && state.firstPerson));
    if (!dark || !fogOn || !state.playerAvatar) return;
    seen = compute();
    for (const k of seen) explored.add(k);
    const s = explored.size + '|' + [...seen].join(';');
    if (force || s !== sig) { sig = s; paint(); }
    showCharacters(false);
  }
  function clearFog() {
    firstPersonFog(false);
    for (const m of [black, dim, flat]) if (m) { m.dispose(false, true); }
    black = dim = flat = null; sig = '';
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
    // a small glowing core; the flame itself is particles rising from it
    const flame = BABYLON.MeshBuilder.CreateSphere('torch_flame', { diameter: .075, segments: 6 }, sc); flame.position.y = .41; flame.scaling.y = 1.4; flame.material = torchMats.fire;
    for (const m of [stick, head, flame]) { m.parent = root; m.isPickable = false; }
    const ps = flameParticles(sc, flame);
    root.onDisposeObservable.add(() => ps.dispose());
    return { root, flame, ps };
  }
  // Flame particles: soft additive blobs that rise, shrink and redden.
  let flameTex = null;
  function flameParticles(sc, emitter) {
    if (!flameTex || flameTex.isDisposed?.()) {
      const size = 64; flameTex = new BABYLON.DynamicTexture('torch_flame_tex', { width: size, height: size }, sc, false);
      const ctx = flameTex.getContext(), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); flameTex.update(); flameTex.hasAlpha = true;
    }
    const ps = new BABYLON.ParticleSystem('torch_flame_ps', 70, sc);
    ps.particleTexture = flameTex; ps.emitter = emitter; ps.isLocal = false;
    ps.createSphereEmitter(.025, 0);
    // dim on their own: additive blobs stack up, and bloom blew the old ones into a ball of light
    ps.color1 = new BABYLON.Color4(.55, .36, .12, .5); ps.color2 = new BABYLON.Color4(.5, .22, .05, .45); ps.colorDead = new BABYLON.Color4(.25, .05, 0, 0);
    ps.minSize = .035; ps.maxSize = .08; ps.minLifeTime = .15; ps.maxLifeTime = .32;
    ps.addSizeGradient(0, 1); ps.addSizeGradient(1, .25);
    ps.emitRate = 70; ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new BABYLON.Vector3(0, 1.4, 0); ps.direction1 = new BABYLON.Vector3(-.08, .5, -.08); ps.direction2 = new BABYLON.Vector3(.08, .9, .08);
    ps.minEmitPower = .25; ps.maxEmitPower = .5; ps.updateSpeed = .016;
    ps.renderingGroupId = emitter.renderingGroupId || 0;
    ps.start();
    return ps;
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
    // in a hand it only follows the hand's position, kept upright (hand bones
    // point every which way: parented, the flame faced the floor)
    if (hand) t.hand = hand;
    else { t.mesh.root.parent = g.root; t.mesh.root.position.set(.24 / (g.root.scaling.x || 1), .55 / (g.root.scaling.y || 1), .08); t.mesh.root.scaling.setAll(1 / (g.root.scaling.y || 1)); }
    // the light and the floor glow follow the character, unscaled
    t.holder = new BABYLON.TransformNode('torch_holder', sc);
    t.light = new BABYLON.PointLight('carried_torch_light', new BABYLON.Vector3(0, 1.25, 0), sc);
    // Linear falloff over a wide range, so it lights the room around you.
    // Not one of scenery.js's local lights: those reach only the meshes they
    // are nearest to (by bounding sphere, once a second), and the big floor
    // mesh always counted the room's own lights as nearer.
    t.light.parent = t.holder; t.light.diffuse = C3(1, .64, .3); t.light.intensity = 1.7; t.light.range = 7.5;
    t.light.falloffType = BABYLON.Light.FALLOFF_STANDARD;
    try { addLampPool(sc, t.holder, { warm: true }); } catch {}
    t.obs = sc.onBeforeRenderObservable.add(() => {
      const p = g.root.position; t.holder.position.set(p.x, state.terrainTopY ?? 0, p.z);
      if (t.hand) {
        // a little ahead of the body, so the flame clears the shoulder
        const yaw = g.root.rotation.y;
        t.hand.computeWorldMatrix(true); t.mesh.root.position.copyFrom(t.hand.getAbsolutePosition());
        t.mesh.root.position.x -= Math.sin(yaw) * .1; t.mesh.root.position.z -= Math.cos(yaw) * .1;
        // leaning a little forward, the way it is held
        t.mesh.root.rotation.set(.22, g.root.rotation.y + Math.PI, 0);
      }
      const f = performance.now() * .006;
      t.light.intensity = 1.7 * (.92 + Math.sin(f) * .05 + Math.sin(f * 2.3) * .04);
      t.mesh.flame.scaling.set(1, 1.4 * (1 + Math.sin(f * 1.7) * .15), 1);
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
      // in first person your own torch is drawn in your hand (fp-hands.js)
      if (g._torch) g._torch.mesh.root.setEnabled(!g._fogHidden && !(g === state.playerAvatar && state.firstPerson));
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
  window.tablefolkDark = { start, setFog, update: () => update(true), visible: (x, z) => !dark || !fogOn || seen.has(Math.round(x) + ',' + Math.round(z)), known: (x, z) => explored.has(Math.round(x) + ',' + Math.round(z)), exploredCount: () => explored.size, get on() { return dark && fogOn; }, carriesTorch, sightFor, torchMesh };
})();
