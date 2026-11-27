/* cutaway.js -- walls between the camera and the player drop to a low stub,
 * the way Diablo-like games keep the hero in sight under a high, fixed
 * camera. Used by app.js's "follow" camera (the default with an avatar).
 *
 * The cut is made per pixel in the walls' own materials (a material plugin):
 * a wall fragment above the stub height in the cut area is discarded. The
 * area is whole squares: the rows in front of the player (towards the
 * camera, +z), widening with distance. Nothing about the geometry changes
 * (an older version clamped vertices, which bent long wall faces into
 * slopes), so every wall style, door frame and door leaf is cut cleanly.
 * Each cut wall square gets a dark lid at the stub height, so it reads as a
 * solid low wall rather than a hollow one. The fog of war's black boxes
 * (darkness.js) are cut the same way, so they never stand over the player.
 *
 * The free camera (any angle) uses the second mode instead: every wall
 * drops to half height, so characters behind or inside walls stay in
 * sight; the fog of war's boxes stay whole there.
 *
 *   window.tablefolkCutaway.update(x, z)   cut around this square (camera to the south)
 *   window.tablefolkCutaway.half()         every wall at half height (free camera)
 *   window.tablefolkCutaway.clear()        walls back to full height
 *   window.tablefolkCutaway.attach(mat)    cut this material too (darkness.js's fog)
 *   window.tablefolkCutaway.attach(mat, false, true)  cut ahead of the player but never in the free
 *       camera's half mode (buildings.js: kit houses keep their walls under their roofs)
 *   window.tablefolkCutaway.seeThrough(mat) scenery (trees, tall props): fades where it
 *       stands between the follow camera and the player (see the second part below)
 * Loaded after app.js; uses its globals (state, meta).
 */
(function () {
  // STUB above the floor; rows 1..DEPTH ahead; half width W0 in the first
  // row, SLOPE more per row after
  // on: 0 off, 1 the area ahead, 2 everywhere (HALF of the wall height)
  const STUB = .42, DEPTH = 4, W0 = 2.5, SLOPE = .75, HALF = .5;
  const cut = { x: 0, z: 0, on: 0, y: 0 };
  const inArea = (cx, cz) => { if (cut.on === 2) return true; const dz = cz - cut.z; return dz >= 1 && dz <= DEPTH && Math.abs(cx - cut.x) <= W0 + (dz - 1) * SLOPE; };

  let Plugin = null;
  function pluginClass() {
    if (Plugin) return Plugin;
    const WGSL = BABYLON.ShaderLanguage?.WGSL;
    Plugin = class extends BABYLON.MaterialPluginBase {
      constructor(mat, fog, noHalf) { super(mat, 'TablefolkCut', 300, { TFCUT: false }); this._fog = fog; this._noHalf = noHalf; this._enable(true); }
      getClassName() { return 'TablefolkCutPlugin'; }
      isCompatible() { return true; }
      prepareDefines(defines) { defines.TFCUT = true; }
      getUniforms(lang) {
        const ubo = [{ name: 'tfCut', size: 4, type: 'vec4' }, { name: 'tfCutArea', size: 4, type: 'vec4' }, { name: 'tfClip', size: 4, type: 'vec4' }, { name: 'tfClipB', size: 4, type: 'vec4' }];
        return lang === WGSL ? { ubo } : { ubo, fragment: '#ifdef TFCUT\nuniform vec4 tfCut;\nuniform vec4 tfCutArea;\nuniform vec4 tfClip;\nuniform vec4 tfClipB;\n#endif\n' };
      }
      bindForSubMesh(ubo) {
        ubo.updateFloat4('tfCut', cut.x, cut.z, (this._fog || this._noHalf) && cut.on === 2 ? 0 : cut.on, cut.y);
        ubo.updateFloat4('tfCutArea', W0, DEPTH, SLOPE, this._fog ? 0 : 1);
        // roofs.js: a shelled room whose doorway is open: its walls' outer halves go, but round the doorway
        const c = !this._fog && window.TABLEFOLK_ROOM_CLIP;
        ubo.updateFloat4('tfClip', c ? c.x0 : 0, c ? c.z0 : 0, c ? c.x1 : 0, c ? c.z1 : 0);
        ubo.updateFloat4('tfClipB', c ? c.hx : 0, c ? c.hz : 0, c ? (c.alongX ? -c.w : c.w) : 0, c ? c.d : 0);   // z: the hole's half width, negative when the wall runs along x
      }
      getCustomCode(type, lang) {
        if (type !== 'fragment') return null;
        if (lang === WGSL) return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFCUT
if (abs(uniforms.tfClipB.z) > 0.01) {
  let cq = fragmentInputs.vPositionW.xz; let cb = uniforms.tfClip;
  let cOut = cq.x > cb.x - 0.75 && cq.x < cb.z + 0.75 && cq.y > cb.y - 0.75 && cq.y < cb.w + 0.75;
  let cIn = cq.x > cb.x && cq.x < cb.z && cq.y > cb.y && cq.y < cb.w;
  let ch = cq - uniforms.tfClipB.xy; let cAX = uniforms.tfClipB.z < 0.0;
  let cw = abs(uniforms.tfClipB.z); let cd = uniforms.tfClipB.w;
  let cHole = select(abs(ch.y), abs(ch.x), cAX) < cw && select(abs(ch.x), abs(ch.y), cAX) < cd;
  if (cOut && !cIn && !cHole) { discard; }
}
if (uniforms.tfCut.z > 0.5 && fragmentInputs.vPositionW.y > uniforms.tfCut.w) {
  if (uniforms.tfCut.z > 1.5) { discard; }
  let tfc = floor(fragmentInputs.vPositionW.xz + vec2f(0.5)) - uniforms.tfCut.xy;
  if (tfc.y >= 1.0 && tfc.y <= uniforms.tfCutArea.y && abs(tfc.x) <= uniforms.tfCutArea.x + (tfc.y - 1.0) * uniforms.tfCutArea.z) { discard; }
}
// walls draw their back faces only where a cut exposes them (below the cut, in a cut square); elsewhere as if culled
if (uniforms.tfCutArea.w > 0.5 && !fragmentInputs.frontFacing) {
  let tfb = floor(fragmentInputs.vPositionW.xz + vec2f(0.5)) - uniforms.tfCut.xy;
  let tfIn = uniforms.tfCut.z > 1.5 || (uniforms.tfCut.z > 0.5 && tfb.y >= 1.0 && tfb.y <= uniforms.tfCutArea.y && abs(tfb.x) <= uniforms.tfCutArea.x + (tfb.y - 1.0) * uniforms.tfCutArea.z);
  if (!tfIn || fragmentInputs.vPositionW.y > uniforms.tfCut.w + 0.02) { discard; }
}
#endif
`, CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#ifdef TFCUT
// a cut wall shows its inside faces through the cut: draw them as a flat, dark
// section seen from above (the walls are not back-face culled), so the cut reads solid
if (uniforms.tfCut.z > 0.5 && uniforms.tfCutArea.w > 0.5 && !fragmentInputs.frontFacing) { surfaceAlbedo = vec3f(0.05, 0.048, 0.045); normalW = vec3f(0.0, 1.0, 0.0); }
#endif
` };
        return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFCUT
if (abs(tfClipB.z) > 0.01) {
  vec2 cq = vPositionW.xz;
  bool cOut = cq.x > tfClip.x - 0.75 && cq.x < tfClip.z + 0.75 && cq.y > tfClip.y - 0.75 && cq.y < tfClip.w + 0.75;
  bool cIn = cq.x > tfClip.x && cq.x < tfClip.z && cq.y > tfClip.y && cq.y < tfClip.w;
  vec2 ch = cq - tfClipB.xy; bool cAX = tfClipB.z < 0.0;
  float cw = abs(tfClipB.z), cd = tfClipB.w;
  bool cHole = (cAX ? abs(ch.x) : abs(ch.y)) < cw && (cAX ? abs(ch.y) : abs(ch.x)) < cd;
  if (cOut && !cIn && !cHole) discard;
}
if (tfCut.z > 0.5 && vPositionW.y > tfCut.w) {
  if (tfCut.z > 1.5) discard;
  vec2 tfc = floor(vPositionW.xz + 0.5) - tfCut.xy;
  if (tfc.y >= 1.0 && tfc.y <= tfCutArea.y && abs(tfc.x) <= tfCutArea.x + (tfc.y - 1.0) * tfCutArea.z) discard;
}
if (tfCutArea.w > 0.5 && !gl_FrontFacing) {
  vec2 tfb = floor(vPositionW.xz + 0.5) - tfCut.xy;
  bool tfIn = tfCut.z > 1.5 || (tfCut.z > 0.5 && tfb.y >= 1.0 && tfb.y <= tfCutArea.y && abs(tfb.x) <= tfCutArea.x + (tfb.y - 1.0) * tfCutArea.z);
  if (!tfIn || vPositionW.y > tfCut.w + 0.02) discard;
}
#endif
`, CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#ifdef TFCUT
if (tfCut.z > 0.5 && tfCutArea.w > 0.5 && !gl_FrontFacing) { surfaceAlbedo = vec3(0.05, 0.048, 0.045); normalW = vec3(0.0, 1.0, 0.0); }
#endif
` };
      }
    };
    return Plugin;
  }
  const attached = new WeakSet();
  function attach(mat, fog = false, noHalf = false) {
    if (!mat || attached.has(mat)) return;
    if (mat.subMaterials) { attached.add(mat); for (const m of mat.subMaterials) attach(m, fog, noHalf); return; }
    attached.add(mat);
    try { new (pluginClass())(mat, fog, noHalf); } catch (e) { console.warn('[cutaway] plugin', mat.name, e); }
  }

  // Lids at the stub height: stone over cut wall squares, black over the
  // squares the fog of war still hides (a cut fog box is open at the top,
  // and its floor showed through)
  const lids = {}; let key = '';
  function lidMesh(kind) {
    if (lids[kind] && !lids[kind].isDisposed()) return lids[kind];
    const sc = state.scene, m = BABYLON.MeshBuilder.CreateBox('cutaway_lid_' + kind, { width: 1.003, depth: 1.003, height: .04 }, sc);
    if (kind === 'stone') { const mat = new BABYLON.PBRMaterial('cutaway_lid_stone', sc); mat.albedoColor = new BABYLON.Color3(.13, .125, .12); mat.roughness = .9; mat.metallic = 0; mat.maxSimultaneousLights = 8; m.material = mat; m.receiveShadows = true; }
    else { const mat = new BABYLON.StandardMaterial('cutaway_lid_black', sc); mat.diffuseColor = mat.specularColor = mat.emissiveColor = BABYLON.Color3.Black(); mat.disableLighting = true; m.material = mat; }
    m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.doNotSyncBoundingInfo = true; m.isVisible = false;
    return (lids[kind] = m);
  }
  function put(kind, list, y) {
    const m = lidMesh(kind);
    if (!list.length) { m.isVisible = false; return; }
    const buf = new Float32Array(list.length * 16);
    list.forEach(([x, z], n) => BABYLON.Matrix.Translation(x, y, z).copyToArray(buf, n * 16));
    m.thinInstanceSetBuffer('matrix', buf, 16, false); m.isVisible = true;
  }
  function placeLids() {
    const D = window.tablefolkDark, fog = !!D?.on, stone = [], black = [], walls = new Set();
    if (cut.on) {
      for (const b of state.blocks || []) {
        if (!b || b.isDisposed?.()) continue;
        const mm = meta(b); if (mm?.type !== 'wall' && mm?.type !== 'door') continue;
        const p = b.getAbsolutePosition?.() || b.position, x = Math.round(p.x), z = Math.round(p.z);
        walls.add(x + ',' + z);
        // (a kit house's walls are solid: no lid; it was wider than them, buildings.js)
        if (mm.type === 'wall' && cut.on === 1 && inArea(x, z) && (!fog || D.known(x, z)) && !window.tablefolkBuildings?.claims?.(x, z)) stone.push([x, z]);
      }
      if (fog && cut.on === 1) for (let dz = 1; dz <= DEPTH; dz++) for (let dx = -Math.ceil(W0 + (dz - 1) * SLOPE); dx <= W0 + (dz - 1) * SLOPE; dx++) {
        const x = cut.x + dx, z = cut.z + dz;
        if (inArea(x, z) && !D.known(x, z) && (walls.has(x + ',' + z) || window.tablefolk?.hasGroundAt?.(x, z))) black.push([x, z]);
      }
    }
    put('stone', stone, cut.y - .018); put('black', black, cut.y - .016);
    sconces();
  }
  // wall lamps (scenery.js lanternVisual) on cut walls are hidden; their light stays
  function sconces() {
    const list = window.tablefolkSconces; if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]; if (s.root.isDisposed?.()) { list.splice(i, 1); continue; }
      const hide = cut.on === 2 || (cut.on === 1 && inArea(s.wx, s.wz));
      for (const m of s.meshes) if (!m.isDisposed?.()) m.setEnabled(!hide);
    }
  }

  function update(x, z) {
    const sc = state.scene; if (!sc) return;
    for (const m of state.wallVisuals || []) if (m?.material) attach(m.material);
    cut.x = Math.round(x); cut.z = Math.round(z); cut.on = 1; cut.y = (state.terrainTopY ?? 0) + STUB;
    // lids again when the player changes square, the walls are rebuilt or more is explored
    const k = cut.x + ',' + cut.z + '|' + (state.wallVisuals?.length || 0) + '|' + (window.tablefolkDark?.exploredCount?.() ?? 0) + '|' + (window.tablefolkSconces?.length || 0);
    if (k !== key) { key = k; placeLids(); }
  }
  function half() {
    const sc = state.scene; if (!sc) return;
    for (const m of state.wallVisuals || []) if (m?.material) attach(m.material);
    cut.on = 2; cut.y = (state.terrainTopY ?? 0) + (state.wallHeightScale || 1) * 1.1 * HALF;
    const k = 'half|' + (state.blocks?.length || 0) + '|' + (state.wallVisuals?.length || 0) + '|' + (window.tablefolkDark?.exploredCount?.() ?? 0) + '|' + (window.tablefolkSconces?.length || 0);
    if (k !== key) { key = k; placeLids(); }
  }
  function clear() {
    if (!cut.on) return;
    cut.on = 0; key = '';
    for (const m of Object.values(lids)) if (!m.isDisposed()) m.isVisible = false;
    sconces();
  }
  // a picture from a character's eyes (senses.js): walls whole for a frame;
  // returns the mode that was on (0 none), to put it back with suspend(mode)
  function suspend(on) {
    if (on === true) { const was = cut.on; cut.on = 0; return was; }
    cut.on = on === false ? 1 : on; key = ''; return true;
  }
  // ---- scenery between the follow camera and the player (2026-11-22) ----
  // Trees, tall props and the trees past the board's edge fade where they stand between
  // the follow camera and the player: per pixel, in their own materials (a plugin, like
  // the walls' cut), so instanced and thin-instanced trees need nothing per copy and the
  // draw calls stay as they are. A fragment within SEE_R of the segment from the camera
  // to the player's chest is dithered away (soft edge from .5 R to R; the radius widens
  // by SEE_NEAR toward the camera, so a canopy the camera sits in goes too); above the
  // player's head fully, lower down (trunks) to SEE_TRUNK, so a trunk stays faintly there.
  // The amount eases in and out (seeOn) as the follow camera starts or ends; not in
  // first person or the free camera. Shadows are untouched (the shadow pass has no plugin).
  const SEE_R = 2.4, SEE_NEAR = 1.4, SEE_TRUNK = .72;
  const see = { on: 0, want: 0, cam: [0, 0, 0], head: [0, 0, 0] };
  let SeePlugin = null;
  function seeClass() {
    if (SeePlugin) return SeePlugin;
    const WGSL = BABYLON.ShaderLanguage?.WGSL;
    SeePlugin = class extends BABYLON.MaterialPluginBase {
      constructor(mat) { super(mat, 'TablefolkSee', 310, { TFSEE: false }); this._enable(true); }
      getClassName() { return 'TablefolkSeePlugin'; }
      isCompatible() { return true; }
      prepareDefines(d) { d.TFSEE = true; }
      getUniforms(lang) {
        const ubo = [{ name: 'tfSeeCam', size: 4, type: 'vec4' }, { name: 'tfSeeHead', size: 4, type: 'vec4' }];
        return lang === WGSL ? { ubo } : { ubo, fragment: '#ifdef TFSEE\nuniform vec4 tfSeeCam;\nuniform vec4 tfSeeHead;\n#endif\n' };
      }
      bindForSubMesh(ubo) { ubo.updateFloat4('tfSeeCam', see.cam[0], see.cam[1], see.cam[2], see.on); ubo.updateFloat4('tfSeeHead', see.head[0], see.head[1], see.head[2], SEE_R); }
      getCustomCode(type, lang) {
        if (type !== 'fragment') return null;
        if (lang === WGSL) return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFSEE
if (uniforms.tfSeeCam.w > 0.01) {
  let tfA = uniforms.tfSeeCam.xyz; let tfBA = uniforms.tfSeeHead.xyz - tfA; let tfPA = fragmentInputs.vPositionW - tfA;
  let tfT = clamp(dot(tfPA, tfBA) / max(dot(tfBA, tfBA), 1e-4), 0.0, 1.0);
  let tfR = uniforms.tfSeeHead.w + (1.0 - tfT) * ${SEE_NEAR.toFixed(2)};
  let tfD = length(tfPA - tfBA * tfT);
  if (tfT < 0.99 && tfD < tfR) {
    var tfK = (1.0 - smoothstep(tfR * 0.5, tfR, tfD)) * uniforms.tfSeeCam.w * (1.0 - smoothstep(0.95, 0.99, tfT));
    if (fragmentInputs.vPositionW.y < uniforms.tfSeeHead.y + 0.7) { tfK = tfK * ${SEE_TRUNK.toFixed(2)}; }
    let tfN = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
    if (tfK > tfN) { discard; }
  }
}
#endif
` };
        return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFSEE
if (tfSeeCam.w > 0.01) {
  vec3 tfA = tfSeeCam.xyz, tfBA = tfSeeHead.xyz - tfA, tfPA = vPositionW - tfA;
  float tfT = clamp(dot(tfPA, tfBA) / max(dot(tfBA, tfBA), 1e-4), 0.0, 1.0);
  float tfR = tfSeeHead.w + (1.0 - tfT) * ${SEE_NEAR.toFixed(2)};
  float tfD = length(tfPA - tfBA * tfT);
  if (tfT < 0.99 && tfD < tfR) {
    float tfK = (1.0 - smoothstep(tfR * 0.5, tfR, tfD)) * tfSeeCam.w * (1.0 - smoothstep(0.95, 0.99, tfT));
    if (vPositionW.y < tfSeeHead.y + 0.7) tfK *= ${SEE_TRUNK.toFixed(2)};
    float tfN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (tfK > tfN) discard;
  }
}
#endif
` };
      }
    };
    return SeePlugin;
  }
  const seen = new WeakSet();
  // a material of scenery that may stand in the follow camera's way (app.js importPropAsset
  // for items 1.4 m or taller, surroundings.js's trees); once per material (it compiles anew)
  function seeThrough(mat) {
    if (!mat || seen.has(mat) || window.TABLEFOLK_TABLETOP) return;
    seen.add(mat);
    if (mat.subMaterials) { for (const m of mat.subMaterials) seeThrough(m); return; }
    try { new (seeClass())(mat); } catch (e) { console.warn('[cutaway] see plugin', mat.name, e); }
  }
  function seeFrame() {
    const sc = state.scene, cam = sc?.activeCamera, g = state.playerAvatar;
    see.want = g && cam && !state.firstPerson && state.cameraMode === 'follow' && !window.TABLEFOLK_NOSEE ? 1 : 0;   // TABLEFOLK_NOSEE: off (tests)
    const dt = Math.min(.1, (sc.getEngine().getDeltaTime() || 16) / 1000);
    see.on += (see.want - see.on) * Math.min(1, dt * 5); if (Math.abs(see.on - see.want) < .01) see.on = see.want;
    if (!see.on || !g) return;
    const c = cam.globalPosition || cam.position, p = g.root.position, top = state.terrainTopY ?? 0;
    see.cam[0] = c.x; see.cam[1] = c.y; see.cam[2] = c.z;
    see.head[0] = p.x; see.head[1] = top + (g.height || 1.2) * .7; see.head[2] = p.z;
  }
  function seeStart() { state.scene.onBeforeRenderObservable.add(seeFrame); }
  if (window.TABLEFOLK_SCENE_READY) seeStart(); else addEventListener('tablefolk-scene-ready', seeStart, { once: true });

  window.tablefolkCutaway = { update, half, clear, attach, suspend, seeThrough, get see() { return { on: see.on, cam: see.cam.slice(), head: see.head.slice() }; } };
})();
