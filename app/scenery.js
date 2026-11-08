/* scenery.js -- the old island's pieces as ordinary scenario objects.
 *
 *   campfire  logs, ring stones, a flickering flame and its light
 *   lantern   post with a hanging lantern and a warm light
 *   light     an invisible point light: "color" (#rrggbb), "intensity",
 *             "range", "y" (height)
 *   fence     one 1-cell fence section along x ("ry" turns it)
 *   signpost  a post with two arms
 *   lily_pad  a pad floating on the sea (or a pond)
 *   crystal_ball  a scrying crystal on a gilded pedestal: violet light
 *             swirling inside the glass ("color" tints it)
 *   scrying_pool  a shallow golden bowl of glowing water on a pedestal:
 *             ripples and a rising mist ("color" tints it)
 *   rune_circle   a ring of glowing runes inlaid in the floor (~2.3 m),
 *             turning slowly, walked over ("color" tints it)
 *
 * The arcane pieces are lit from within: unlit additive layers (no glow
 * layer at light quality), one small point light each in the local-lights
 * budget below, a coloured glow decal on the floor (floors take no local
 * lights) and a few CPU particles; their animation is one observer each,
 * removed with the object.
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
  // The crystal ball's hum: two low sines a fifth apart, a faint high shimmer,
  // slowly beating and swelling with the glow; 3D at the ball (spells.js's
  // panner and listener), quiet (heard within a few steps), silent while the
  // sound effects are off. It starts once the page's audio runs (first click).
  function crystalHum(r, pos, ph) {
    let nodes = null;
    const start = () => {
      const a = window.tablefolkSfx?.context?.(), sp = window.tablefolkSpells?.audio; if (!a || !sp?.place) return;
      const { ctx } = a, out = ctx.createGain(), pan = ctx.createPanner(), lp = ctx.createBiquadFilter();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1.2; pan.rolloffFactor = 1.6; pan.maxDistance = 40; sp.place(pan, pos);
      lp.type = 'lowpass'; lp.frequency.value = 1100; out.gain.value = 0;
      const oscs = [[98, .5], [98.7, .35], [147, .28], [392.4, .05]].map(([f, g]) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(); return o; });
      lp.connect(out); out.connect(pan); pan.connect(a.master);
      out.gain.setTargetAtTime(.05, ctx.currentTime, 1.5);   // fades in
      nodes = { ctx, out, oscs, all: [out, pan, lp] };
    };
    r.onDisposeObservable?.add(() => { if (!nodes) return; for (const o of nodes.oscs) try { o.stop(); o.disconnect(); } catch {} for (const n of nodes.all) try { n.disconnect(); } catch {} nodes = null; });
    return {
      tick(p) {
        if (!nodes) { start(); return; }
        const on = window.tablefolkSfx?.enabled !== false, t = performance.now() * .001;
        // swells with the glow, plus a slow wobble of its own
        const g = on ? .03 + .03 * p + .012 * Math.sin(t * .37 + ph) : 0;
        nodes.out.gain.setTargetAtTime(g, nodes.ctx.currentTime, .25);
        nodes.oscs[3].frequency.setTargetAtTime(392.4 + 3 * Math.sin(t * .8 + ph), nodes.ctx.currentTime, .3);
        window.tablefolkSpells?.audio?.listen?.();
      },
    };
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
    for (const k of ['color', 'intensity', 'range', 'y', 'scale']) if (opts[k] != null) out[k] = opts[k];
    return out;
  }

  // Local lights only light what is near them: props, characters and floors
  // within range (rechecked every second, things move). Materials hold 8
  // lights and the scene has 4 global ones, so each mesh takes only its 4
  // nearest local lights; a big merged floor near a dozen lanterns used to
  // get the first ones in scene order and drop the rest (the lava's light).
  // The board's tiles get glow decals instead.
  // Hidden meshes count too (a character in the fog, a door the cutaway
  // hides): left out, they came back unlit by these lights, grey, until the
  // next check. The budget is what the 8 a material holds leaves after the
  // scene's other lights (carried torches come and go).
  const localLights = new Set(), MAX_LIGHTS = 8;
  function refreshLocalLights() {
    if (!localLights.size || !state.scene) return;
    for (const L of localLights) if (L.isDisposed()) localLights.delete(L);
    const others = state.scene.lights.filter(L => !localLights.has(L) && L.isEnabled()).length, PER_MESH = Math.max(1, MAX_LIGHTS - others);
    const meshes = state.scene.meshes.filter(m => !/^(board_|paint_|hd_|sky|sea|lamp_pool)/.test(m.name));
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

  // ---------- arcane pieces: shared textures, materials, parts ----------
  const texs = new Map();
  function canvasTex(name, size, draw) {
    const old = texs.get(name); if (old && old.getScene() === state.scene && old.getInternalTexture()) return old;
    const t = new BABYLON.DynamicTexture('arcane_' + name, { width: size, height: size }, state.scene, true);
    const c = t.getContext(); c.clearRect(0, 0, size, size); draw(c, size); t.update(); t.hasAlpha = true;
    texs.set(name, t); return t;
  }
  const blob = (c, x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); for (const [o, col] of stops) g.addColorStop(o, col); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const TX = {
    glow: () => canvasTex('glow', 64, (c, s) => blob(c, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.7)'], [.6, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']])),
    pool: () => canvasTex('pool', 128, (c, s) => blob(c, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,.55)'], [.4, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']])),
    mist: () => canvasTex('mist', 64, (c, s) => { seed = 11; for (let i = 0; i < 9; i++) blob(c, s / 2 + (rand() - .5) * s * .3, s / 2 + (rand() - .5) * s * .3, s * (.2 + rand() * .15), [[0, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); }),
    // wisps that wrap around a sphere (whole periods across u), drawn in colour
    nebula: () => canvasTex('nebula', 256, (c, s) => {
      seed = 3; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const k = 1 + Math.floor(rand() * 2), ph = rand() * 6.28, y0 = s * (.22 + rand() * .56), a = s * (.06 + rand() * .12), w = 3 + rand() * 9;
        const hue = rand() < .3 ? 190 + rand() * 20 : 255 + rand() * 50;
        c.strokeStyle = `hsla(${hue},100%,${45 + rand() * 15}%,${.3 + rand() * .3})`; c.lineWidth = w; c.shadowColor = c.strokeStyle; c.shadowBlur = 10;
        c.beginPath(); for (let x = -4; x <= s + 4; x += 4) { const y = y0 + a * Math.sin(x / s * 6.283 * k + ph) + a * .4 * Math.sin(x / s * 6.283 * (k + 2) + ph * 2); x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
      }
      c.shadowBlur = 0; for (let i = 0; i < 40; i++) blob(c, rand() * s, s * (.15 + rand() * .7), 1 + rand() * 2.5, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
    }),
    ripple: () => canvasTex('ripple', 256, (c, s) => {
      const m = s / 2; for (let i = 0; i < 2; i++) { const r = m * (.8 + i * .12), a = .7 - i * .35; c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 3 - i; c.shadowColor = 'white'; c.shadowBlur = 6; c.beginPath(); c.arc(m, m, r, 0, 6.283); c.stroke(); }
    }),
    // water: soft glints that drift over it
    caustic: () => canvasTex('caustic', 256, (c, s) => {
      seed = 5; for (let i = 0; i < 30; i++) { const x = s * (.1 + rand() * .8), y = s * (.1 + rand() * .8), r = s * (.02 + rand() * .05); c.save(); c.translate(x, y); c.scale(1.8, .7); c.rotate(rand() * .4); blob(c, 0, 0, r, [[0, `rgba(255,255,255,${.5 + rand() * .4})`], [1, 'rgba(255,255,255,0)']]); c.restore(); }
    }),
    // the runes' ring and the inner star, separate so they turn opposite ways
    runes: () => canvasTex('runes', 512, (c, s) => {
      const m = s / 2; c.strokeStyle = 'white'; c.fillStyle = 'white'; c.shadowColor = 'white'; c.shadowBlur = 10; c.lineCap = 'round'; c.lineJoin = 'round';
      const ring = (r, w) => { c.lineWidth = w; c.beginPath(); c.arc(m, m, r, 0, 6.283); c.stroke(); };
      ring(m * .96, 5); ring(m * .9, 2.5); ring(m * .7, 3); ring(m * .65, 1.5);
      seed = 19; const N = 18;
      for (let i = 0; i < N; i++) {
        const a = i / N * 6.283, rr = m * .8, h = m * .075;
        c.save(); c.translate(m + Math.cos(a) * rr, m + Math.sin(a) * rr); c.rotate(a + Math.PI / 2); c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(0, -h); c.lineTo(0, h);   // the stave
        for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) { const y0 = (rand() - .5) * h * 1.4, side = rand() < .5 ? -1 : 1, kind = rand();
          if (kind < .4) { c.moveTo(0, y0); c.lineTo(side * h * .6, y0 + h * .5); }
          else if (kind < .7) { c.moveTo(0, y0); c.lineTo(side * h * .55, y0 - h * .35); c.lineTo(0, y0 - h * .7); }
          else { c.moveTo(-h * .45, y0); c.lineTo(h * .45, y0 + h * .3); } }
        c.stroke(); c.restore();
        const b = a + Math.PI / N; c.beginPath(); c.arc(m + Math.cos(b) * rr, m + Math.sin(b) * rr, 3, 0, 6.283); c.fill();
      }
      for (let i = 0; i < 72; i++) { const a = i / 72 * 6.283, r0 = m * .9, r1 = m * (i % 6 ? .925 : .955); c.lineWidth = 1.6; c.beginPath(); c.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); c.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); c.stroke(); }
    }),
    star: () => canvasTex('star', 512, (c, s) => {
      const m = s / 2; c.strokeStyle = 'white'; c.shadowColor = 'white'; c.shadowBlur = 10; c.lineJoin = 'round';
      const poly = (n, step, r, w) => { c.lineWidth = w; c.beginPath(); for (let i = 0; i <= n; i++) { const a = i * step * 6.283 / n - Math.PI / 2, x = m + Math.cos(a) * r, y = m + Math.sin(a) * r; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
      poly(7, 3, m * .62, 3); poly(7, 1, m * .62, 1.5); poly(7, 2, m * .36, 2);
      c.lineWidth = 2.5; c.beginPath(); c.arc(m, m, m * .2, 0, 6.283); c.stroke(); c.beginPath(); c.arc(m, m, m * .27, 0, 6.283); c.stroke();
      c.fillStyle = 'white'; for (let i = 0; i < 7; i++) { const a = i * 6.283 / 7 - Math.PI / 2; c.beginPath(); c.arc(m + Math.cos(a) * m * .62, m + Math.sin(a) * m * .62, 6, 0, 6.283); c.fill(); }
    }),
  };
  // Unlit additive material on a shared texture, one per object part (each
  // is tinted and animated on its own); disposed with the object, the
  // texture stays.
  function ownGlowMat(r, name, tex, color, alpha = 1, colored = false) {
    const m = new BABYLON.StandardMaterial('arcane_' + name, state.scene);
    // The texture is the shape (opacity) and the colour is emissiveColor;
    // Babylon adds an emissive texture to emissiveColor rather than tinting
    // it, so only a texture drawn in colour (colored: the nebula) is one.
    m.disableLighting = true; m.diffuseColor = C3(0, 0, 0); m.specularColor = C3(0, 0, 0); m.emissiveColor = colored ? C3(0, 0, 0) : color;
    if (colored) m.emissiveTexture = tex;
    m.opacityTexture = tex; m.alpha = alpha; m.alphaMode = BABYLON.Engine.ALPHA_ADD;
    m.disableDepthWrite = true; m.backFaceCulling = false; m.fogEnabled = false;
    // listed as shared so disposeWorldObject leaves it (it would take the
    // texture too); disposed here after the object is gone
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    const mm = meta(r), prev = mm.cleanup; mm.cleanup = () => { try { prev?.(); } catch {} queueMicrotask(() => { state.sharedAssetMats.delete(m); m.dispose(false, false); }); };
    return m;
  }
  function plastic(name, color, { rough = .3, metallic = 0, coat = .7, emissive = null } = {}) {
    const fresh = !mats.has(name), m = mat(name, color, { rough, metallic, emissive });
    if (fresh) { window.plasticFinish?.(m, { coat, coatRough: .08 }); m.environmentIntensity = Math.max(m.environmentIntensity, .9); }
    return m;
  }
  const arcaneGold = () => plastic('arcane_gold', C3(.86, .62, .24), { rough: .26, metallic: .85, coat: .5 });
  const arcaneStone = () => plastic('arcane_stone', C3(.085, .07, .13), { rough: .22, coat: .85 });
  const floorY = (x, z) => (state.terrainTopY ?? 0) + (typeof floorLiftAt === 'function' ? floorLiftAt(x, z) : 0);
  function lathe(name, shape, sc, tess = 20) {
    return BABYLON.MeshBuilder.CreateLathe(name, { shape: shape.map(([r, y]) => V3(r, y, 0)), tessellation: tess, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, sc);
  }
  // A dark glossy baluster on an octagonal foot with gilded bands, top at h.
  function pedestal(sc, h, name) {
    const st = arcaneStone(), au = arcaneGold(), parts = [];
    const foot = BABYLON.MeshBuilder.CreateCylinder(name + '_foot', { diameter: .5, height: .08, tessellation: 8 }, sc); foot.position.y = .04; foot.material = st;
    const band = BABYLON.MeshBuilder.CreateCylinder(name + '_band', { diameterTop: .36, diameterBottom: .42, height: .05, tessellation: 8 }, sc); band.position.y = .105; band.material = au;
    const col = lathe(name + '_column', [[0, .13], [.12, .13], [.09, .18], [.075, .26], [.1, .36], [.12, .44], [.1, .52], [.065, .6], [.055, h - .2], [.07, h - .13], [.06, h - .1], [0, h - .1]].map(([r, y]) => [r, Math.min(y, h - .1)]), sc);
    col.material = st;
    const ring = BABYLON.MeshBuilder.CreateTorus(name + '_ring', { diameter: .2, thickness: .025, tessellation: 20 }, sc); ring.position.y = .44; ring.material = au;
    const cap = BABYLON.MeshBuilder.CreateCylinder(name + '_cap', { diameterTop: .3, diameterBottom: .16, height: .07, tessellation: 16 }, sc); cap.position.y = h - .065; cap.material = au;
    const top = BABYLON.MeshBuilder.CreateCylinder(name + '_top', { diameter: .3, height: .03, tessellation: 16 }, sc); top.position.y = h - .015; top.material = st;
    parts.push(foot, band, col, ring, cap, top);
    return parts;
  }
  // A coloured glow on the floor around a light (floors take no local lights).
  function floorGlow(r, name, color, radius, alpha) {
    const d = BABYLON.MeshBuilder.CreateGround(name + '_floorglow', { width: radius * 2, height: radius * 2 }, state.scene);
    d.parent = r; d.position.y = .012; d.material = ownGlowMat(r, name + '_floor', TX.pool(), color, alpha);
    d.isPickable = false; d.alphaIndex = 5; d.metadata = { proxy: r };
    state.glowLayer?.addExcludedMesh(d);   // floor light, not a lamp (medium/high bloomed it)
    return d;
  }
  function sprite(r, name, size, color, alpha) {
    const p = BABYLON.MeshBuilder.CreatePlane(name, { size }, state.scene);
    p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; p.parent = r; p.isPickable = false; p.metadata = { proxy: r };
    p.material = ownGlowMat(r, name, TX.glow(), color, alpha);
    return p;
  }
  function cpuParticles(r, name, cap, emitter, tex) {
    const ps = new BABYLON.ParticleSystem('arcane_' + name, cap, state.scene);
    ps.particleTexture = tex; ps.emitter = emitter; ps.updateSpeed = 1 / 60;
    const mm = meta(r), prev = mm.cleanup; mm.cleanup = () => { try { prev?.(); } catch {} ps.stop(); ps.dispose(false); };
    return ps;
  }
  const still = () => !!window.TABLEFOLK_STILL_MODE;

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
    crystal_ball(sc, x, z, opts) {
      const r = rootAt('crystal_ball', x, z, opts, floorY(x, z)), H = .9, cy = H + .165, tint = hexColor(opts.color, C3(.62, .42, 1));
      // built at full size, shown at 0.72 (beside a person it read too big); "scale" sets it
      const S = Math.max(.3, Math.min(2, +opts.scale || .72)); r.scaling.setAll(S);
      finish(r, 'crystal_ball', { health: 6, material: 'stone', flammable: false }, opts);
      const parts = pedestal(sc, H, 'crystal_ball'), au = arcaneGold();
      // four gilded claws hold the ball (none straight behind it from the sides)
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4, path = [V3(Math.cos(a) * .05, H, Math.sin(a) * .05)];
        for (let k = 0; k <= 10; k++) { const th = .35 + k * .1, d = .178 * Math.sin(th); path.push(V3(Math.cos(a) * d, cy - .178 * Math.cos(th), Math.sin(a) * d)); }
        const claw = BABYLON.MeshBuilder.CreateTube('crystal_ball_claw', { path, radiusFunction: (k, dist) => .017 - .01 * Math.min(1, dist / .4), tessellation: 8, cap: BABYLON.Mesh.CAP_ALL }, sc); claw.material = au; parts.push(claw);
      }
      own(r, parts);
      // the glass: dark, clear, glossy; the light inside it is additive layers
      const glass = BABYLON.MeshBuilder.CreateSphere('crystal_ball_glass', { diameter: .32, segments: 20 }, sc);
      glass.position.y = cy;
      if (!mats.has('crystal_glass')) {
        const g = mat('crystal_glass', C3(.04, .04, .1), { rough: .03, emissive: C3(.05, .03, .12) });
        window.plasticFinish?.(g, { coat: 1, coatRough: .02 }); g.alpha = .42; g.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND; g.environmentIntensity = 1.3; g.specularIntensity = 1.5;
      }
      glass.material = mats.get('crystal_glass');
      const swirlA = BABYLON.MeshBuilder.CreateSphere('crystal_ball_swirl', { diameter: .27, segments: 14 }, sc), swirlB = BABYLON.MeshBuilder.CreateSphere('crystal_ball_swirl', { diameter: .2, segments: 12 }, sc);
      swirlA.material = ownGlowMat(r, 'crystal_swirl_a', TX.nebula(), null, .7, true); swirlB.material = ownGlowMat(r, 'crystal_swirl_b', TX.nebula(), null, .45, true);
      swirlB.material.backFaceCulling = true;
      swirlB.rotation.set(.9, 0, .5);
      for (const m of [swirlA, swirlB]) m.position.y = cy;
      const core = sprite(r, 'crystal_ball_core', .11, tint.add(C3(.2, .2, .1)), .5); core.position.y = cy;
      const halo = sprite(r, 'crystal_ball_halo', .6, tint.scale(.4), .3); halo.position.y = cy;
      own(r, [glass, swirlA, swirlB], { shadow: false }); glass.receiveShadows = false;
      floorGlow(r, 'crystal_ball', tint, 1.4, .5);
      // motes drifting in the glass
      const motes = cpuParticles(r, 'crystal_motes', 14, V3(x, r.position.y + cy * S, z), TX.glow());
      Object.assign(motes, { minSize: .012 * S, maxSize: .028 * S, minLifeTime: 1.2, maxLifeTime: 2.2, emitRate: 8, minEmitPower: .01, maxEmitPower: .04, gravity: V3(0, .01, 0), blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD });
      motes.createSphereEmitter(.1 * S, 1); motes.color1 = new BABYLON.Color4(.85, .75, 1, 1); motes.color2 = new BABYLON.Color4(.6, .95, 1, 1); motes.colorDead = new BABYLON.Color4(.4, .2, 1, 0);
      if (!still()) motes.start();
      const L = pointLight(r, 'crystal_ball_light', { y: cy + .3, color: tint, intensity: +opts.intensity || 1.2, range: +opts.range || 3.6 }), base = L.intensity;
      const ph = x * 1.7 + z;
      const hum = still() ? null : crystalHum(r, V3(x, r.position.y + cy * S, z), ph);
      if (!still()) animate(r, () => {
        const t = performance.now() * .001, p = .5 + .5 * Math.sin(t * 1.3 + ph);
        hum?.tick(p);
        swirlA.rotation.y = t * .55; swirlA.rotation.x = Math.sin(t * .23) * .5; swirlB.rotation.y = -t * .9; swirlB.rotation.z = .5 + Math.sin(t * .31) * .6;
        core.scaling.setAll(.8 + .35 * p); halo.material.alpha = .2 + .14 * p; core.material.alpha = .35 + .25 * p;
        L.intensity = base * (.8 + .35 * p);
      });
      return r;
    },
    scrying_pool(sc, x, z, opts) {
      const r = rootAt('scrying_pool', x, z, opts, floorY(x, z)), H = .78, tint = hexColor(opts.color, C3(.3, .9, 1));
      finish(r, 'scrying_pool', { health: 6, material: 'metal', flammable: false }, opts);
      const parts = pedestal(sc, H, 'scrying_pool');
      // a wide shallow golden bowl (a closed profile: outside, rim, inside)
      const bowl = lathe('scrying_pool_bowl', [[0, 0], [.09, 0], [.2, .025], [.29, .07], [.345, .125], [.35, .14], [.33, .142], [.29, .1], [.2, .06], [0, .05]].map(([r0, y]) => [r0, H + y]), sc, 28);
      bowl.material = arcaneGold(); parts.push(bowl);
      const lip = BABYLON.MeshBuilder.CreateTorus('scrying_pool_lip', { diameter: .68, thickness: .025, tessellation: 32 }, sc); lip.position.y = H + .14; lip.material = arcaneGold(); parts.push(lip);
      own(r, parts);
      const wy = H + .108;
      const water = BABYLON.MeshBuilder.CreateDisc('scrying_pool_water', { radius: .3, tessellation: 32 }, sc);
      water.rotation.x = Math.PI / 2; water.position.y = wy;
      if (!mats.has('scry_water')) { const w = mat('scry_water', C3(.01, .05, .08), { rough: .03, emissive: C3(.01, .1, .14) }); window.plasticFinish?.(w, { coat: 1, coatRough: .02 }); w.environmentIntensity = 1.2; }
      water.material = mats.get('scry_water');
      const glowW = BABYLON.MeshBuilder.CreateDisc('scrying_pool_glow', { radius: .3, tessellation: 32 }, sc); glowW.rotation.x = Math.PI / 2; glowW.position.y = wy + .002;
      glowW.material = ownGlowMat(r, 'scry_glow', TX.pool(), tint.scale(.55), .6);
      const caus = BABYLON.MeshBuilder.CreateDisc('scrying_pool_caustic', { radius: .29, tessellation: 32 }, sc); caus.rotation.x = Math.PI / 2; caus.position.y = wy + .004;
      caus.material = ownGlowMat(r, 'scry_caustic', TX.caustic(), tint.scale(.4), .25);
      const ripples = [0, 1].map(i => { const d = BABYLON.MeshBuilder.CreateDisc('scrying_pool_ripple', { radius: .29, tessellation: 32 }, sc); d.rotation.x = Math.PI / 2; d.position.y = wy + .006; d.material = ownGlowMat(r, 'scry_ripple' + i, TX.ripple(), tint.scale(.7), .4); return d; });
      own(r, [water, glowW, caus, ...ripples], { shadow: false });
      for (const m of [glowW, caus, ...ripples]) m.isPickable = false;
      floorGlow(r, 'scrying_pool', tint, 1.4, .45);
      const mist = cpuParticles(r, 'scry_mist', 26, V3(x, r.position.y + wy, z), TX.mist());
      Object.assign(mist, { minSize: .12, maxSize: .22, minLifeTime: 2.2, maxLifeTime: 3.4, emitRate: 5, minEmitPower: .06, maxEmitPower: .13, gravity: V3(0, .03, 0), blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD,
        minAngularSpeed: -.3, maxAngularSpeed: .3, minInitialRotation: 0, maxInitialRotation: 6.28 });
      mist.createDirectedCylinderEmitter(.2, .01, 1, V3(-.15, 1, -.15), V3(.15, 1, .15));
      mist.addColorGradient(0, new BABYLON.Color4(tint.r, tint.g, tint.b, 0)); mist.addColorGradient(.25, new BABYLON.Color4(tint.r * .5, tint.g * .5, tint.b * .5, .16)); mist.addColorGradient(1, new BABYLON.Color4(tint.r * .2, tint.g * .2, tint.b * .3, 0));
      mist.addSizeGradient(0, .5); mist.addSizeGradient(1, 1.6);
      if (!still()) mist.start();
      const L = pointLight(r, 'scrying_pool_light', { y: wy + .25, color: tint, intensity: +opts.intensity || 1, range: +opts.range || 3.4 }), base = L.intensity;
      const ph = x * 1.3 + z * .7;
      if (!still()) animate(r, () => {
        const t = performance.now() * .001;
        caus.rotation.y = t * .12; caus.material.alpha = .2 + .08 * Math.sin(t * 1.7 + ph);
        ripples.forEach((d, i) => { const u = (t * .45 + i * .5 + ph) % 1; d.scaling.set(.15 + .85 * u, .15 + .85 * u, 1); d.material.alpha = .45 * Math.sin(Math.PI * u) * (1 - u * .5); });
        glowW.material.alpha = .55 + .1 * Math.sin(t * 1.1 + ph); L.intensity = base * (.88 + .12 * Math.sin(t * 1.1 + ph));
      });
      return r;
    },
    rune_circle(sc, x, z, opts) {
      const r = rootAt('rune_circle', x, z, opts, floorY(x, z)), tint = hexColor(opts.color, C3(1, .58, .18)), D = 2.3;
      finish(r, 'rune_circle', { health: 99, material: 'stone', flammable: false }, opts);
      const ring = BABYLON.MeshBuilder.CreateGround('rune_circle_ring', { width: D, height: D }, sc), star = BABYLON.MeshBuilder.CreateGround('rune_circle_star', { width: D, height: D }, sc);
      ring.position.y = .008; star.position.y = .01;
      // dimmer above light quality, where bloom spreads it over the floor
      const k = window.TABLEFOLK_GFX?.lite ? 1 : .55;
      ring.material = ownGlowMat(r, 'rune_ring', TX.runes(), tint.scale(k), .9); star.material = ownGlowMat(r, 'rune_star', TX.star(), tint.scale(.9 * k), .7);
      // inlaid gold: alpha-blended, so it stays gold over a coloured rug (additive turned it white on blue)
      for (const m of [ring, star]) { m.material.alphaMode = BABYLON.Engine.ALPHA_COMBINE; m.material.zOffset = -2; m.parent = r; m.metadata = { proxy: r }; m.isPickable = false; m.alphaIndex = 6; state.glowLayer?.addExcludedMesh(m); }
      const ph = x + z * 2.1;
      if (!still()) animate(r, () => {
        const t = performance.now() * .001, p = .5 + .5 * Math.sin(t * .9 + ph);
        ring.rotation.y = t * .06; star.rotation.y = -t * .1;
        ring.material.alpha = .72 + .25 * p; star.material.alpha = .5 + .3 * (1 - p);
      });
      return r;
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
