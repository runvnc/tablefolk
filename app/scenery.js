/* scenery.js -- the old island's pieces as ordinary scenario objects.
 *
 *   campfire  logs, ring stones, a flickering flame and its light
 *   lantern   post with a hanging lantern and a warm light
 *   light     an invisible point light: "color" (#rrggbb), "intensity",
 *             "range", "y" (height)
 *   fence     one 1-cell fence section along x ("ry" turns it)
 *   signpost  a post with two arms
 *   lily_pad  a pad floating on the sea (or a pond)
 *
 * Trees, houses, boulders, flowers and grass tufts are models in the core
 * pack (assets/pack.json). Loaded after app.js and uses its helpers (state,
 * tag, meta, addShadow, addLampPool). makeObject() calls
 * window.tablefolkScenery.make(type, x, z, opts).
 */
(function () {
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);
  const mats = new Map();
  function mat(name, color, { emissive = null, rough = .8, metallic = 0 } = {}) {
    if (mats.has(name)) return mats.get(name);
    const m = new BABYLON.PBRMaterial('scenery_' + name, state.scene);
    m.albedoColor = color; m.metallic = metallic; m.roughness = rough; m.environmentIntensity = .5; m.maxSimultaneousLights = 8;
    if (emissive) m.emissiveColor = emissive;
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    mats.set(name, m);
    return m;
  }
  function rootAt(type, x, z, opts, y = state.terrainTopY ?? 0) {
    const r = new BABYLON.TransformNode(type + '_root', state.scene);
    r.position.set(x, y, z); r.rotation.y = +opts.ry || 0;
    return r;
  }
  function own(r, meshes, { shadow = true } = {}) {
    for (const m of meshes) {
      m.parent = r; m.metadata = { proxy: r }; m.isPickable = true; m.receiveShadows = true;
      if (shadow) addShadow(m);
    }
  }
  // Per-frame animation, removed with the object.
  function animate(r, fn) {
    const sc = state.scene, obs = sc.onBeforeRenderObservable.add(fn);
    const mm = meta(r), prev = mm.cleanup;
    mm.cleanup = () => { try { prev?.(); } catch {} sc.onBeforeRenderObservable.remove(obs); };
  }
  function finish(r, type, fields, opts) {
    tag(r, type, { health: 3, material: 'wood', ...fields });
    meta(r).opts = keepOpts(opts);
    state.props.push(r);
    return r;
  }
  // Options that make this object what it is, saved and exported with it.
  function keepOpts(opts) {
    const out = {};
    for (const k of ['color', 'intensity', 'range', 'y']) if (opts[k] != null) out[k] = opts[k];
    return out;
  }

  // Local lights only light what is near them: props, characters and floors
  // within range (rechecked every second, things move). Materials hold 8
  // lights and the scene has 4 global ones, so each mesh takes only its 4
  // nearest local lights; a big merged floor near a dozen lanterns used to
  // get the first ones in scene order and drop the rest (the lava's light).
  // The board's tiles get glow decals instead.
  const localLights = new Set(), PER_MESH = 4;
  function refreshLocalLights() {
    if (!localLights.size || !state.scene) return;
    for (const L of localLights) if (L.isDisposed()) localLights.delete(L);
    const meshes = state.scene.meshes.filter(m => m.isEnabled() && m.isVisible !== false && !/^(board_|paint_|hd_|sky|sea|lamp_pool)/.test(m.name));
    const per = new Map([...localLights].map(L => [L, []])), pos = new Map([...localLights].map(L => [L, L.getAbsolutePosition()]));
    for (const m of meshes) {
      const s = m.getBoundingInfo?.().boundingSphere; if (!s) continue;
      const near = [];
      for (const L of localLights) { const gap = BABYLON.Vector3.Distance(s.centerWorld, pos.get(L)) - s.radiusWorld; if (gap < L.range + 1) near.push([gap, L]); }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, L] of near.slice(0, PER_MESH)) per.get(L).push(m);
    }
    for (const [L, list] of per) L.includedOnlyMeshes = list;
  }
  setInterval(refreshLocalLights, 1000);
  function pointLight(r, name, { y, color, intensity, range }) {
    const L = new BABYLON.PointLight(name, V3(0, y, 0), state.scene);
    L.parent = r; L.diffuse = color; L.intensity = intensity; L.range = range;
    localLights.add(L);
    const mm = meta(r) || {}, prev = mm.cleanup;
    mm.cleanup = () => { try { prev?.(); } catch {} localLights.delete(L); L.dispose(); };
    queueMicrotask(refreshLocalLights);
    return L;
  }
  function hexColor(v, fallback) { try { return v ? BABYLON.Color3.FromHexString(String(v)) : fallback; } catch { return fallback; } }

  const makers = {
    campfire(sc, x, z, opts) {
      const r = rootAt('campfire', x, z, opts), parts = [];
      const log = mat('fire_log', C3(.23, .14, .08)), stone = mat('fire_stone', C3(.20, .17, .14), { rough: .9 });
      for (let i = 0; i < 4; i++) {
        const lg = BABYLON.MeshBuilder.CreateCylinder('fire_log', { height: .42, diameter: .075, tessellation: 6 }, sc);
        lg.rotation.z = Math.PI / 2; lg.rotation.y = i * Math.PI / 4 + .3; lg.position.y = .045; lg.material = log; parts.push(lg);
      }
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, st = BABYLON.MeshBuilder.CreatePolyhedron('fire_ring_stone', { type: 1, size: .055 }, sc);
        st.position.set(Math.cos(a) * .30, .035, Math.sin(a) * .30); st.rotation.set(i, i * 2, i * 3); st.material = stone; parts.push(st);
      }
      const flame = BABYLON.MeshBuilder.CreateCylinder('campfire_flame', { diameterTop: 0, diameterBottom: .20, height: .38, tessellation: 7 }, sc);
      flame.position.y = .24; flame.material = mat('flame', C3(1, .52, .16), { emissive: C3(.85, .30, .05), rough: .5 });
      own(r, parts); own(r, [flame], { shadow: false });
      finish(r, 'campfire', { material: 'stone', flammable: false, state: 'fire' }, opts);
      addLampPool(sc, r, { warm: true });
      const L = pointLight(r, 'campfire_light', { y: .8, color: hexColor(opts.color, C3(1, .54, .18)), intensity: +opts.intensity || 8, range: +opts.range || 6.2 });
      const base = L.intensity;
      if (!window.TABLEFOLK_STILL_MODE) animate(r, () => {
        const t = performance.now() * .004, f = 1 + Math.sin(t) * .08 + Math.sin(t * 2.7) * .05;
        flame.scaling.set(f, 1 + Math.sin(t * 1.7) * .12, f); L.intensity = base * (.95 + Math.sin(t * 3.1) * .09);
      });
      return r;
    },
    lantern(sc, x, z, opts) {
      const r = rootAt('lantern', x, z, opts), wood = mat('darkwood', C3(.115, .072, .042), { rough: .92 });
      const post = BABYLON.MeshBuilder.CreateBox('lantern_post', { width: .07, height: 1.3, depth: .07 }, sc); post.position.y = .65; post.material = wood;
      const arm = BABYLON.MeshBuilder.CreateBox('lantern_arm', { width: .36, height: .05, depth: .05 }, sc); arm.position.set(.16, 1.26, 0); arm.material = wood;
      const cage = BABYLON.MeshBuilder.CreateCylinder('lantern_cage', { height: .26, diameterTop: .12, diameterBottom: .16, tessellation: 6 }, sc);
      cage.position.set(.32, 1.1, 0); cage.material = mat('lantern_metal', C3(.14, .13, .12), { rough: .42, metallic: .55 });
      const bulb = BABYLON.MeshBuilder.CreateSphere('lantern_bulb', { diameter: .11, segments: 7 }, sc);
      bulb.position.set(.32, 1.1, 0); bulb.material = mat('lantern_glow', C3(.06, .05, .02), { emissive: C3(1.9, 1.15, .42), rough: .3 });
      own(r, [post, arm, cage]); own(r, [bulb], { shadow: false });
      finish(r, 'lantern', { material: 'wood' }, opts);
      addLampPool(sc, r, { warm: true });
      pointLight(r, 'lantern_light', { y: 1.1, color: hexColor(opts.color, C3(1, .72, .34)), intensity: +opts.intensity || 1.35, range: +opts.range || 6 });
      return r;
    },
    light(sc, x, z, opts) {
      const r = rootAt('light', x, z, opts);
      finish(r, 'light', { interactive: false, decor: true }, opts);
      pointLight(r, 'scenario_light', { y: opts.y != null ? +opts.y : 2, color: hexColor(opts.color, C3(1, .85, .65)), intensity: opts.intensity != null ? +opts.intensity : 3, range: +opts.range || 6 });
      return r;
    },
    fence(sc, x, z, opts) {
      const r = rootAt('fence', x, z, opts), wood = mat('fence_wood', C3(.36, .25, .15), { rough: .9 }), parts = [];
      for (const px of [-.42, 0, .42]) {
        const p = BABYLON.MeshBuilder.CreateBox('fence_post', { width: .09, height: .66, depth: .09 }, sc);
        p.position.set(px, .33, 0); p.material = wood; parts.push(p);
      }
      for (const y of [.24, .46]) {
        const rail = BABYLON.MeshBuilder.CreateBox('fence_rail', { width: 1, height: .07, depth: .05 }, sc);
        rail.position.set(0, y, 0); rail.material = wood; parts.push(rail);
      }
      own(r, parts);
      return finish(r, 'fence', { health: 1, material: 'wood', flammable: true }, opts);
    },
    signpost(sc, x, z, opts) {
      const r = rootAt('signpost', x, z, opts), wood = mat('sign_wood', C3(.40, .28, .17), { rough: .9 }), parts = [];
      const post = BABYLON.MeshBuilder.CreateBox('signpost_post', { width: .11, height: 1.0, depth: .11 }, sc); post.position.y = .5; post.material = wood; parts.push(post);
      for (const [y, dir] of [[.8, 1], [.56, -1]]) {
        const a = BABYLON.MeshBuilder.CreateBox('signpost_arm', { width: .62, height: .2, depth: .045 }, sc);
        a.position.set(dir * .3, y, dir * .05); a.rotation.y = dir * .16; a.material = wood; parts.push(a);
      }
      own(r, parts);
      return finish(r, 'signpost', { health: 2, material: 'wood', flammable: true }, opts);
    },
    lily_pad(sc, x, z, opts) {
      const onSea = !window.tablefolk?.hasGroundAt?.(x, z), y = onSea ? (state.seaLevel ?? -1.42) + .05 : (state.terrainTopY ?? 0) + .03;
      const r = rootAt('lily_pad', x, z, opts, y);
      const pad = BABYLON.MeshBuilder.CreateCylinder('lily_pad', { diameter: .34 + Math.abs(Math.sin(x * 3.1 + z * 1.7)) * .2, height: .028, tessellation: 10 }, sc);
      pad.material = mat('lily', C3(.09, .24, .10), { emissive: C3(.01, .04, .01), rough: .72 });
      own(r, [pad], { shadow: false });
      finish(r, 'lily_pad', { interactive: false, decor: true, material: 'soft' }, opts);
      const ph = x * 1.3 + z * .7;
      if (!window.TABLEFOLK_STILL_MODE) animate(r, () => {
        const t = performance.now() * .001;
        pad.position.y = Math.sin(t * 1.1 + ph) * .015; pad.rotation.z = Math.sin(t * .65 + ph) * .035;
      });
      return r;
    },
  };
  // Other code's lights (lava) join the same nearby-only lighting.
  const trackLight = L => { localLights.add(L); queueMicrotask(refreshLocalLights); };
  window.tablefolkScenery = { trackLight, types: Object.keys(makers), make: (type, x, z, opts = {}) => makers[type]?.(state.scene, x, z, opts) ?? null };
})();
