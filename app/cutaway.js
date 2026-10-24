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
 *   window.tablefolkCutaway.update(x, z)   cut around this square (camera to the south)
 *   window.tablefolkCutaway.clear()        walls back to full height
 *   window.tablefolkCutaway.attach(mat)    cut this material too (darkness.js's fog)
 * Loaded after app.js; uses its globals (state, meta).
 */
(function () {
  // STUB above the floor; rows 1..DEPTH ahead; half width W0 in the first
  // row, SLOPE more per row after
  const STUB = .42, DEPTH = 4, W0 = 2.5, SLOPE = .75;
  const cut = { x: 0, z: 0, on: 0, y: 0 };
  const inArea = (cx, cz) => { const dz = cz - cut.z; return dz >= 1 && dz <= DEPTH && Math.abs(cx - cut.x) <= W0 + (dz - 1) * SLOPE; };

  let Plugin = null;
  function pluginClass() {
    if (Plugin) return Plugin;
    const WGSL = BABYLON.ShaderLanguage?.WGSL;
    Plugin = class extends BABYLON.MaterialPluginBase {
      constructor(mat) { super(mat, 'TablefolkCut', 300, { TFCUT: false }); this._enable(true); }
      getClassName() { return 'TablefolkCutPlugin'; }
      isCompatible() { return true; }
      prepareDefines(defines) { defines.TFCUT = true; }
      getUniforms(lang) {
        const ubo = [{ name: 'tfCut', size: 4, type: 'vec4' }, { name: 'tfCutArea', size: 4, type: 'vec4' }];
        return lang === WGSL ? { ubo } : { ubo, fragment: '#ifdef TFCUT\nuniform vec4 tfCut;\nuniform vec4 tfCutArea;\n#endif\n' };
      }
      bindForSubMesh(ubo) {
        ubo.updateFloat4('tfCut', cut.x, cut.z, cut.on, cut.y);
        ubo.updateFloat4('tfCutArea', W0, DEPTH, SLOPE, 0);
      }
      getCustomCode(type, lang) {
        if (type !== 'fragment') return null;
        if (lang === WGSL) return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFCUT
if (uniforms.tfCut.z > 0.5 && fragmentInputs.vPositionW.y > uniforms.tfCut.w) {
  let tfc = floor(fragmentInputs.vPositionW.xz + vec2f(0.5)) - uniforms.tfCut.xy;
  if (tfc.y >= 1.0 && tfc.y <= uniforms.tfCutArea.y && abs(tfc.x) <= uniforms.tfCutArea.x + (tfc.y - 1.0) * uniforms.tfCutArea.z) { discard; }
}
#endif
` };
        return { CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TFCUT
if (tfCut.z > 0.5 && vPositionW.y > tfCut.w) {
  vec2 tfc = floor(vPositionW.xz + 0.5) - tfCut.xy;
  if (tfc.y >= 1.0 && tfc.y <= tfCutArea.y && abs(tfc.x) <= tfCutArea.x + (tfc.y - 1.0) * tfCutArea.z) discard;
}
#endif
` };
      }
    };
    return Plugin;
  }
  const attached = new WeakSet();
  function attach(mat) {
    if (!mat || attached.has(mat)) return;
    if (mat.subMaterials) { attached.add(mat); for (const m of mat.subMaterials) attach(m); return; }
    attached.add(mat);
    try { new (pluginClass())(mat); } catch (e) { console.warn('[cutaway] plugin', mat.name, e); }
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
        if (mm.type === 'wall' && inArea(x, z) && (!fog || D.known(x, z))) stone.push([x, z]);
      }
      if (fog) for (let dz = 1; dz <= DEPTH; dz++) for (let dx = -Math.ceil(W0 + (dz - 1) * SLOPE); dx <= W0 + (dz - 1) * SLOPE; dx++) {
        const x = cut.x + dx, z = cut.z + dz;
        if (inArea(x, z) && !D.known(x, z) && (walls.has(x + ',' + z) || window.tablefolk?.hasGroundAt?.(x, z))) black.push([x, z]);
      }
    }
    put('stone', stone, cut.y - .018); put('black', black, cut.y - .016);
  }

  function update(x, z) {
    const sc = state.scene; if (!sc) return;
    for (const m of state.wallVisuals || []) if (m?.material) attach(m.material);
    cut.x = Math.round(x); cut.z = Math.round(z); cut.on = 1; cut.y = (state.terrainTopY ?? 0) + STUB;
    // lids again when the player changes square, the walls are rebuilt or more is explored
    const k = cut.x + ',' + cut.z + '|' + (state.wallVisuals?.length || 0) + '|' + (window.tablefolkDark?.exploredCount?.() ?? 0);
    if (k !== key) { key = k; placeLids(); }
  }
  function clear() {
    if (!cut.on) return;
    cut.on = 0; key = '';
    for (const m of Object.values(lids)) if (!m.isDisposed()) m.isVisible = false;
  }
  window.tablefolkCutaway = { update, clear, attach };
})();
