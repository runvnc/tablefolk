/* surroundings.js -- what lies beyond the board's edge in outdoor worlds.
 *
 *   window.tablefolkSurroundings.start(scn)   after a world is built (scenario.js)
 *   window.tablefolkSurroundings.clear()
 *
 * A forest board used to stop at a hard edge over the empty sky. Outdoor
 * worlds now stand in a wide ground plane that runs out to the horizon, with
 * rows of trees beyond the edge (thick woods for a forest, a scattered fringe
 * of trees around fields for a village or farm), fading into the fog.
 * Purely visual: no physics, no picking, nothing a character can reach or
 * see in its prompt. The trees are thin instances (one draw per mesh of each
 * model, however many trees), so a ring of 1500 costs little; light quality
 * gets half as many.
 *
 * The scenario's "surroundings": "forest" | "fields" | "none"; by default a
 * generated forest gets "forest", a generated village, town, hamlet or farm
 * "fields", and anything else (dungeons, caves, dark worlds, hand-made
 * boards that may be islands) none. Loaded after app.js and uses its globals
 * (state, WORLD).
 */
(function () {
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  let built = [], fogWas = null, token = 0;

  function kindFor(scn) {
    const s = scn?.surroundings;
    if (s === 'forest' || s === 'fields' || s === 'none') return s;
    if (scn?.dark || window.TABLEFOLK_TABLETOP) return 'none';
    const k = String(scn?.generate?.kind || '').toLowerCase();
    if (/^(forest|woods|wilds|wilderness)$/.test(k)) return 'forest';
    if (/^(village|town|hamlet|farm|farmstead)$/.test(k)) return 'fields';
    return 'none';
  }

  function clear() {
    token++;
    for (const n of built) try { n.dispose(false, true); } catch {}
    built = [];
    const sc = state.scene;
    if (fogWas && sc) { sc.fogDensity = fogWas.density; fogWas = null; }
  }

  // one tree model, its meshes baked to the model's own space (feet at 0,
  // height 1, centred), ready for thin instances
  async function loadTree(type) {
    const it = window.tablefolkPacks?.items?.[type]; if (!it) return null;
    const url = it.url, dir = url.slice(0, url.lastIndexOf('/') + 1), file = url.slice(dir.length);
    const res = await BABYLON.SceneLoader.ImportMeshAsync(null, dir, file, state.scene);
    const meshes = res.meshes.filter(m => m.getTotalVertices?.() > 0);
    for (const ag of res.animationGroups || []) ag.dispose();
    for (const m of meshes) { m.computeWorldMatrix(true); m.setParent(null); m.bakeCurrentTransformIntoVertices(); }
    for (const m of res.meshes) if (!meshes.includes(m)) m.dispose();
    let lo = new BABYLON.Vector3(Infinity, Infinity, Infinity), hi = lo.scale(-1);
    for (const m of meshes) { m.refreshBoundingInfo(); const b = m.getBoundingInfo().boundingBox; lo = BABYLON.Vector3.Minimize(lo, b.minimumWorld); hi = BABYLON.Vector3.Maximize(hi, b.maximumWorld); }
    const h = hi.y - lo.y || 1, k = 1 / h, cx = (lo.x + hi.x) / 2, cz = (lo.z + hi.z) / 2;
    const norm = BABYLON.Matrix.Translation(-cx, -lo.y, -cz).multiply(BABYLON.Matrix.Scaling(k, k, k));
    for (const m of meshes) {
      m.bakeTransformIntoVertices(norm);
      m.isPickable = false; m.doNotSyncBoundingInfo = true;
      if (m.material) { m.material.maxSimultaneousLights = 4; }
    }
    return { meshes, h: it.h || 3 };
  }

  async function start(scn) {
    clear();
    const kind = kindFor(scn); if (kind === 'none' || !state.scene) return;
    const my = ++token, sc = state.scene, lite = !!window.TABLEFOLK_GFX?.lite;
    const top = state.terrainTopY ?? 0, hw = WORLD.halfW, hh = WORLD.halfH;
    // the ground out to the horizon, just under the board's top
    const R = Math.max(hw, hh) + 140;
    const ground = BABYLON.MeshBuilder.CreateGround('surround_ground', { width: R * 2, height: R * 2, subdivisions: 1 }, sc);
    ground.position.y = top - .035; ground.isPickable = false;
    const gm = new BABYLON.PBRMaterial('surround_ground_mat', sc);
    const src = state.materials?.grassSurf;
    if (src?.albedoTexture) { const t = src.albedoTexture.clone(); t.uScale = t.vScale = R / 1.4; gm.albedoTexture = t; }
    gm.albedoColor = kind === 'forest' ? C3(.55, .62, .5) : C3(.7, .75, .6); gm.metallic = 0; gm.roughness = 1; gm.environmentIntensity = .4;
    ground.material = gm; ground.receiveShadows = true; built.push(ground);
    // a little thicker haze, so the far ground and trees fade out
    if (!fogWas) { fogWas = { density: sc.fogDensity }; sc.fogDensity = Math.max(sc.fogDensity, kind === 'forest' ? .03 : .022); }

    const types = kind === 'forest'
      ? (/spooky/.test(scn?.generate?.style || '') ? ['dead_tree', 'dead_tree', 'pine_tree', 'tall_pine'] : ['pine_tree', 'tall_pine', 'oak_tree', 'tall_tree', 'pine_tree', 'autumn_tree'])
      : ['oak_tree', 'tall_tree', 'pine_tree', 'autumn_tree'];
    const models = {};
    for (const t of new Set(types)) { try { models[t] = await loadTree(t); } catch (e) { console.warn('[surroundings]', t, e); } if (my !== token) { for (const m of Object.values(models)) m?.meshes.forEach(x => x.dispose()); return; } }
    // where the trees stand: a band around the board, thickest near it
    let seed = 1234567 + (scn?.seed | 0) * 97;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const depth = kind === 'forest' ? 22 : 30, step = kind === 'forest' ? 1.25 : 2.2;
    const mats = Object.fromEntries(Object.keys(models).map(t => [t, []]));
    for (let x = -hw - depth; x <= hw + depth; x += step) for (let z = -hh - depth; z <= hh + depth; z += step) {
      const ox = Math.max(0, Math.abs(x) - hw), oz = Math.max(0, Math.abs(z) - hh), out = Math.max(ox, oz);
      if (out < .6) continue;   // on the board
      const u = out / depth;
      const p = kind === 'forest' ? .85 - .45 * u : (out < 3 ? .05 : .12 + .5 * Math.max(0, u - .35));
      if (rnd() > p * (lite ? .5 : 1)) continue;
      const t = types[Math.floor(rnd() * types.length)], M = models[t]; if (!M) continue;
      const h = M.h * (.8 + rnd() * .55) * (1 + u * .25), px = x + (rnd() - .5) * step * .9, pz = z + (rnd() - .5) * step * .9;
      mats[t].push(BABYLON.Matrix.Scaling(h, h, h).multiply(BABYLON.Matrix.RotationY(rnd() * 6.283)).multiply(BABYLON.Matrix.Translation(px, top, pz)));
    }
    let n = 0;
    for (const [t, list] of Object.entries(mats)) {
      const M = models[t]; if (!M) continue;
      if (!list.length) { M.meshes.forEach(m => m.dispose()); continue; }
      const buf = new Float32Array(list.length * 16); list.forEach((m, i) => m.copyToArray(buf, i * 16));
      for (const m of M.meshes) {
        m.thinInstanceSetBuffer('matrix', buf, 16, true);
        m.thinInstanceRefreshBoundingInfo(false);
        m.freezeWorldMatrix(); built.push(m);
      }
      n += list.length;
    }
    window.tablefolkDiag?.note?.('surroundings', `${kind}: ${n} trees beyond the edge`);
  }

  window.addEventListener('tablefolk-scenario-exit', clear);
  window.tablefolkSurroundings = { start, clear, kindFor };
})();
