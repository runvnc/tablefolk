/* tile-render.js -- 2D tiles of the 3D things, for map views that draw
 * pictures instead of 3D (the world builder's map editor, app/map-editor.js).
 *
 *   /app/?tabletop=1&tiles=1[&only=chest,goblin][&ppu=128]
 *
 * renders, one by one in this page's own 3D engine:
 *   objects     every object type (built-in, scenery, the packs' items), seen
 *               from the south and above (ELEV, about the follow camera's
 *               angle), on a transparent background
 *   characters  every body (people, monsters), facing the camera, idle
 *   floors      every floor material, straight down, one square
 * at PPU pixels per world unit, so all tiles share one scale. Each tile
 * records its anchor: where the middle of its square, on the floor, falls in
 * the image (objects and characters stand on it and may rise above it).
 *
 * Results: window.tablefolkTiles.results (when done: .done = true), posted
 * to the opener / parent frame ({type:'tablefolk-tiles', tiles}) as they
 * come, so a page can render tiles it is missing on the fly. Saving them as
 * files: tools/browser-test/render-tiles.mjs (writes assets/tiles/).
 *
 * Uses app.js globals (state, makeObject, spawnAgent, disposeCharacter,
 * paintMaterial, FIGURES, ITEM_CATALOG, PAINT_MATERIALS).
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (!q.has('tiles')) return;
  const PPU = Math.max(16, Math.min(512, +q.get('ppu') || 128));
  const ELEV = 58 * Math.PI / 180;           // the camera's height angle for things that stand
  const LAYER = 0x10000000;
  const only = q.get('only') ? new Set(q.get('only').split(',').map(s => s.trim()).filter(Boolean)) : null;
  const out = window.tablefolkTiles = { results: [], done: false, ppu: PPU, elev: ELEV };
  const tell = tiles => { for (const w of [window.opener, window.parent]) if (w && w !== window) try { w.postMessage({ type: 'tablefolk-tiles', tiles }, '*'); } catch {} };

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const frames = n => new Promise(r => { let k = 0; const o = state.scene.onAfterRenderObservable.add(() => { if (++k >= n) { state.scene.onAfterRenderObservable.remove(o); r(); } }); });

  function nodesOf(root) {
    if (!root) return [];
    const list = root.getChildMeshes ? [root, ...root.getChildMeshes(false)] : [root];
    return list.filter(m => m.getTotalVertices && m.getTotalVertices() > 0 && m.isEnabled() && m.isVisible !== false);
  }
  function boundsOf(meshes) {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
    for (const m of meshes) {
      m.computeWorldMatrix(true); m.refreshBoundingInfo?.(true);
      const b = m.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, b.minimumWorld); max = BABYLON.Vector3.Maximize(max, b.maximumWorld);
    }
    return { min, max };
  }
  // the camera: orthographic, looking from the south (+z) at `elev`; screen
  // right is -x, as on the tabletop map
  let cam = null;
  function camera() {
    if (cam) return cam;
    cam = new BABYLON.FreeCamera('tileCam', new BABYLON.Vector3(0, 10, 10), state.scene);
    cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA; cam.minZ = .05; cam.maxZ = 200; cam.layerMask = LAYER;
    return cam;
  }
  async function shoot(meshes, cell, elev, box = null) {
    const c = camera(), sc = state.scene;
    const dir = new BABYLON.Vector3(0, Math.sin(elev), Math.cos(elev));
    const { min, max } = box || boundsOf(meshes);
    const mid = min.add(max).scale(.5);
    c.position = mid.add(dir.scale(60)); c.setTarget(mid);
    c.computeWorldMatrix(true);
    // the box's corners (and the square) on the camera's right / up axes
    const view = c.getViewMatrix(), pts = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pts.push(new BABYLON.Vector3(x, y, z));
    const top = state.terrainTopY ?? 0;
    for (const [dx, dz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) pts.push(new BABYLON.Vector3(cell[0] + dx, top, cell[1] + dz));
    const v = pts.map(p => BABYLON.Vector3.TransformCoordinates(p, view));
    const pad = 2 / PPU;
    let l = Math.min(...v.map(p => p.x)) - pad, r = Math.max(...v.map(p => p.x)) + pad, b = Math.min(...v.map(p => p.y)) - pad, t = Math.max(...v.map(p => p.y)) + pad;
    const w = Math.max(8, Math.ceil((r - l) * PPU)), h = Math.max(8, Math.ceil((t - b) * PPU));
    r = l + w / PPU; t = b + h / PPU;
    c.orthoLeft = l; c.orthoRight = r; c.orthoBottom = b; c.orthoTop = t;
    const a = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(cell[0], top, cell[1]), view);
    const anchor = [+((a.x - l) * PPU).toFixed(1), +((t - a.y) * PPU).toFixed(1)];
    for (const m of meshes) m.layerMask = LAYER;
    const keep = sc.clearColor; sc.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    let url;
    try { url = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(sc.getEngine(), c, { width: w, height: h }, 'image/png', 4, true, undefined, false, false, true); }
    finally { sc.clearColor = keep; }
    return { url, w, h, anchor };
  }

  function objectTypes() {
    const t = new Set(['crate', 'barrel', 'mushroom', 'lamp', 'note']);
    for (const k of window.tablefolkScenery?.types || []) t.add(k);
    for (const k of Object.keys(ITEM_CATALOG)) t.add(k);
    return [...t].filter(k => !['light'].includes(k));
  }
  async function renderObject(type) {
    const m = makeObject(type, 0, 0, {});
    // models load asynchronously: wait until something with vertices shows
    let meshes = [];
    for (let i = 0; i < 80; i++) { await frames(2); meshes = nodesOf(m); if (meshes.length && meshes.every(x => x.isReady?.(true) !== false)) break; await wait(50); }
    await frames(3);
    if (!meshes.length) throw new Error('nothing to draw');
    const shot = await shoot(meshes, [0, 0], ELEV);
    try { disposeWorldObject(m); } catch { try { m.dispose(false, false); } catch {} }
    return shot;
  }
  async function renderCharacter(model) {
    // "critter": a character with no body set (the generated critter)
    const g = await spawnAgent('tile_' + model, 0, 0, 's', model === 'critter' ? undefined : model);
    await frames(20); await wait(250); await frames(4);
    const meshes = nodesOf(g.root).filter(m => !/ring|shadow|marker|label|bubble/i.test(m.name));
    // A skinned body's bounding box is its bind pose (a wolf's was a sliver):
    // frame it from the body's height instead, wide enough for wings and tails
    const f = FIGURES[model] || {}, h = (f.h || 1.25) + (f.lift || 0), top = state.terrainTopY ?? 0, half = Math.max(.6, (f.h || 1.25) * .8);
    const box = { min: new BABYLON.Vector3(-half, top, -half), max: new BABYLON.Vector3(half, top + h * 1.12, half) };
    const shot = await shoot(meshes, [0, 0], ELEV, box);
    try { disposeCharacter(g); state.characters = state.characters.filter(x => x !== g); refreshAgentSelect?.(); } catch {}
    return shot;
  }
  async function renderFloor(mat) {
    const sc = state.scene, top = state.terrainTopY ?? 0;
    const p = BABYLON.MeshBuilder.CreateGround('tile_floor', { width: 1, height: 1 }, sc);
    p.position.set(0, top + 30, 0); p.material = paintMaterial(mat);
    // straight down, one square exactly; no key light (glossy floors glared white)
    studioKey?.setEnabled(false);
    await frames(6);
    for (let i = 0; i < 40 && !p.material.isReady(p); i++) await wait(50);
    const shot = await shoot([p], [0, 0], Math.PI / 2 - 1e-4);
    p.dispose(); studioKey?.setEnabled(true);
    return { ...shot, anchor: [shot.w / 2, shot.h / 2] };
  }

  // Studio light: the scene's own (the tabletop's bright, with its teal rim)
  // tinted everything; tiles get the same neutral light, whatever the world
  let studioKey = null;
  function studio() {
    const sc = state.scene;
    for (const L of sc.lights) L.setEnabled(false);
    const sky = new BABYLON.HemisphericLight('tile_sky', new BABYLON.Vector3(0, 1, 0), sc);
    sky.intensity = .95; sky.diffuse = new BABYLON.Color3(1, .98, .95); sky.groundColor = new BABYLON.Color3(.42, .4, .38); sky.specular = new BABYLON.Color3(.25, .25, .25);
    // the key from the upper left of the picture (+x is screen left), in front
    const key = studioKey = new BABYLON.DirectionalLight('tile_key', new BABYLON.Vector3(-.45, -.8, -.4), sc);
    key.intensity = 1.6; key.diffuse = new BABYLON.Color3(1, .96, .9);
    sc.environmentIntensity = .7;
  }
  async function run() {
    studio();
    // nothing else in the picture: the tile camera sees only LAYER
    for (const m of state.scene.meshes) if (m.layerMask === LAYER) m.layerMask = 0x0FFFFFFF;
    const jobs = [
      ...objectTypes().map(n => ['objects', n, renderObject]),
      ...[...Object.keys(FIGURES), ...Object.keys(AVATAR_MODELS), 'critter'].map(n => ['characters', n, renderCharacter]),
      ...Object.keys(PAINT_MATERIALS).map(n => ['floors', n, renderFloor]),
    ].filter(([, n]) => !only || only.has(n));
    out.total = jobs.length;
    for (const [kind, name, fn] of jobs) {
      try {
        const r = await fn(name);
        const tile = { kind, name, ppu: PPU, ...r };
        out.results.push(tile); tell([tile]);
      } catch (e) { console.warn('[tiles]', kind, name, e); out.results.push({ kind, name, error: String(e.message || e) }); }
    }
    out.done = true; tell([]);
    console.log('[tiles] done:', out.results.filter(r => r.url).length, 'of', jobs.length);
  }
  function start() { setTimeout(() => run().catch(e => { console.error('[tiles]', e); out.done = true; out.error = String(e); }), 800); }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });
})();
