/* surroundings.js -- trees beyond the board's edge in outdoor worlds.
 *
 *   window.tablefolkSurroundings.start(scn)   after a world is built (scenario.js)
 *   window.tablefolkSurroundings.clear()
 *
 * The ground itself runs on beyond the board as terrain.js's hills (land
 * mode); this puts the trees on it: a forest that thickens into a tree line
 * ("forest"), or open country with scattered trees, clumps and a far tree
 * line ("fields"). Real-size trees (assets/models/props/env-nature, 8-15 m),
 * the light .med models at every quality, each drawn as thin instances (one
 * draw per mesh of each model however many trees), standing on the hills
 * (tablefolkTerrain.heightAt). Half as many at light quality. Purely visual:
 * no physics, no picking, nothing a character can reach or see.
 *
 * The scenario's "surroundings": "forest" | "fields" | "none"; by default
 * every outdoor board (terrain.js mode "land") gets one: "forest" for a
 * generated forest (woods, wilds), "fields" otherwise. Dungeons, caves,
 * islands and lone buildings get none. Loaded after app.js and terrain.js.
 */
(function () {
  const NATURE = () => (window.tablefolkPacks?.base || '/assets/') + 'models/props/env-nature/';
  let built = [], token = 0, manifest = null;
  const models = new Map();

  function kindFor(scn) {
    const s = scn?.surroundings;
    if (s === 'none' || window.TABLEFOLK_TABLETOP) return 'none';
    const mode = window.tablefolkTerrain?.mode?.() || 'land';
    if (mode !== 'land') return s === 'forest' || s === 'fields' ? (mode === 'sea' ? 'none' : s) : 'none';
    if (s === 'forest' || s === 'fields') return s;
    const k = String(scn?.generate?.kind || '').toLowerCase();
    return /forest|wood|wild/.test(k) ? 'forest' : 'fields';
  }
  function clear() { token++; for (const n of built) try { n.dispose(false, false); } catch {} built = []; }

  async function loadManifest() { manifest ||= await fetch(NATURE() + 'manifest.json').then(r => r.json()).then(m => Object.fromEntries(m.trees ? m.trees.map(t => [t.type, t]) : Object.values(m).filter(Array.isArray).flat().map(t => [t.type, t]))).catch(() => ({})); return manifest; }
  // one tree model, its meshes baked to model space (metres, trunk at 0), kept hidden as the source
  function loadTree(type) {
    if (!models.has(type)) models.set(type, BABYLON.SceneLoader.ImportMeshAsync(null, NATURE(), type + '.med.gltf', state.scene).then(res => {
      const meshes = res.meshes.filter(m => m.getTotalVertices?.() > 0);
      for (const ag of res.animationGroups || []) ag.dispose();
      for (const m of meshes) { m.computeWorldMatrix(true); m.setParent(null); m.bakeCurrentTransformIntoVertices(); m.setEnabled(false); m.isPickable = false;
        const mt = m.material; if (mt) { window.TABLEFOLK_LOOK?.matte?.(mt); mt.maxSimultaneousLights = 4;
          // light quality: distant trees need no normal or roughness maps (~100 MiB of the light tier's memory was the surroundings)
          if (window.TABLEFOLK_GFX?.lite) for (const k of ['bumpTexture', 'metallicTexture']) if (mt[k]) { try { mt[k].dispose(); } catch {} mt[k] = null; } } }
      for (const m of res.meshes) if (!meshes.includes(m)) m.dispose();
      window.TABLEFOLK_LOOK?.shareTextures?.(meshes.map(m => m.material).filter(Boolean));
      return meshes;
    }).catch(e => { console.warn('[surroundings]', type, e); models.delete(type); return null; }));
    return models.get(type);
  }

  async function start(scn) {
    clear();
    const sc = state.scene; if (!sc) return;
    // terrain.js decides the mode a moment after the world starts
    await new Promise(r => setTimeout(r, 900));
    const my = ++token, kind = kindFor(scn); if (kind === 'none' || /nosurround/.test(location.search)) return;   // ?envdbg=nosurround (memory tests)
    const lite = !!window.TABLEFOLK_GFX?.lite, T = window.tablefolkTerrain, H = (x, z) => T?.heightAt?.(x, z) ?? 0;
    const M = await loadManifest();
    const types = kind === 'forest'
      ? (/spooky/.test(scn?.generate?.style || '') ? ['dead_tree', 'dead_tree', 'pine_tree_c', 'tall_pine'] : ['pine_tree', 'pine_tree_b', 'pine_tree_c', 'tall_pine', 'oak_tree', 'tall_tree', 'pine_tree_b'])
      : ['oak_tree', 'oak_tree_b', 'oak_tree_c', 'tree', 'tall_tree', 'oak_tree_b', 'pine_tree_b'];
    // light quality: two or three models that share their bark and leaf textures
    if (lite) types.splice(0, types.length, ...(kind === 'forest' ? ['pine_tree', 'pine_tree_b', 'oak_tree'] : ['oak_tree', 'oak_tree_b', 'pine_tree_b']));
    const loaded = {};
    for (const t of new Set(types)) { loaded[t] = await loadTree(t); if (my !== token) return; }
    const hw = WORLD.halfW - .5, hh = WORLD.halfH - .5;
    let seed = 1234567 + (scn?.seed | 0) * 97;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const lists = Object.fromEntries(Object.keys(loaded).map(t => [t, []]));
    const put = (x, z, sc0 = 1) => {
      const t = types[Math.floor(rnd() * types.length)]; if (!loaded[t]) return;
      const k = (.8 + rnd() * .4) * sc0;
      lists[t].push(BABYLON.Matrix.Scaling(k, k, k).multiply(BABYLON.Matrix.RotationY(rnd() * 6.283)).multiply(BABYLON.Matrix.Translation(x, H(x, z) - .1, z)));
    };
    const step = kind === 'forest' ? 3.2 : 5, depth = kind === 'forest' ? 60 : 95;
    for (let x = -hw - depth; x <= hw + depth; x += step) for (let z = -hh - depth; z <= hh + depth; z += step) {
      const px = x + (rnd() - .5) * step * .9, pz = z + (rnd() - .5) * step * .9;
      const out = Math.max(Math.abs(px) - hw, Math.abs(pz) - hh); if (out < 3.5) continue;
      if (T && H(px, pz) < -.3) continue;   // the sea
      const u = out / depth;
      // forest: thickens away from the edge; fields: a few lone trees and clumps, then a tree line
      const clump = window.tablefolkTerrain ? (Math.sin(px * .09 + 1.3) * Math.sin(pz * .07 - .4)) : 0;
      const p = kind === 'forest' ? (out < 7 ? .25 : .55 + .3 * Math.min(1, u * 2))
        : (u > .55 && u < .75 ? .55 : out < 10 ? .02 : .05 + Math.max(0, clump) * .45);
      if (rnd() > p * (lite ? .5 : 1)) continue;
      put(px, pz);
    }
    let n = 0;
    for (const [t, list] of Object.entries(lists)) {
      const src = loaded[t]; if (!src || !list.length) continue;
      const buf = new Float32Array(list.length * 16); list.forEach((m, i) => m.copyToArray(buf, i * 16));
      for (const s of src) {
        const m = s.clone('surround_' + t); m.makeGeometryUnique(); m.setEnabled(true); m.isPickable = false; m.receiveShadows = false;
        m.thinInstanceSetBuffer('matrix', buf, 16, true); m.thinInstanceRefreshBoundingInfo(false); m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true;
        built.push(m);
      }
      n += list.length;
    }
    window.tablefolkDiag?.note?.('surroundings', `${kind}: ${n} trees beyond the edge`);
    void M;
  }

  window.addEventListener('tablefolk-scenario-exit', clear);
  window.tablefolkSurroundings = { start, clear, kindFor };
})();
