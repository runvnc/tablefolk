(() => {
  'use strict';
  // User-tunable graphics/perf knobs for the Graphics tab. Split out from the
  // hardcoded defaults so people on weaker GPUs (or hitting the
  // audio-glitches-during-heavy-rendering issue) can turn things down without
  // editing code. Targets the specific costs perf-monitor.js's profiling
  // pointed at: the two real-time point-light shadow generators (cornerShadow
  // "key" light + campfire fireShadow - 12 cubemap face renders/frame between
  // them at defaults) and the per-frame sea wave/foam rebuild in
  // terrain-hd.js's buildWater(). Everything defaults to the original
  // always-on behavior, so a fresh profile looks exactly as before.
  const KEY = 'tablefolkGfxSettings';
  const DEFAULTS = {
    keyShadowEnabled: true, keyShadowEvery: 1,
    campfireShadowEnabled: true, campfireShadowEvery: 1,
    seaWaveEnabled: true, seaFoamEnabled: true,
    // Light mode (applies on reload): the simple voxel island instead of the
    // HD diorama, and no SSAO / bloom / glow / real-time shadow maps. For when
    // a large model (Gemma 4 E4B) and the scene don't both fit in GPU memory.
    lite: true, quality: 'light',
    // the terrain's cell grid (terrain.js): off by default
    showGrid: false,
  };

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() { if (window.TABLEFOLK_GFX_NOSAVE) return; try { const out = { ...settings }; if (out.tightCapped) Object.assign(out, { quality: 'high', lite: false }); delete out.tightCapped; localStorage.setItem(KEY, JSON.stringify(out)); } catch {} }
  function clampEvery(v) { v = parseInt(v, 10); if (!Number.isFinite(v) || v < 1) v = 1; return Math.min(10, v); }

  // Read synchronously at script-load time (this file loads before
  // terrain-hd.js/app.js) so the very first frame already honors any
  // previously saved settings instead of flashing the defaults first.
  const settings = load();
  // Quality: 'high' (full detail), 'medium' (HD look, far less geometry and
  // 1k textures, no SSAO), 'light' (no shadow maps or post effects). Every
  // quality has the simple sea and sky; the HD sea and island are only behind
  // ?island=1. The old lite flag
  // maps onto it; settings.lite stays in sync for code that reads it.
  // Light is the default (2026-11-07): the scene shares the graphics card with
  // the characters' model and the voice.
  if (!['high', 'medium', 'light'].includes(settings.quality)) settings.quality = 'light';
  settings.lite = settings.quality === 'light';
  // Tabletop view (?tabletop=1): 1k textures, no shadow maps or moving sea,
  // for this page only (nothing is saved).
  if (window.TABLEFOLK_TABLETOP) Object.assign(settings, { quality: 'medium', lite: false, keyShadowEnabled: false, campfireShadowEnabled: false, seaWaveEnabled: false, seaFoamEnabled: false });
  // ?gfx=light|medium|high sets the quality for this page only (nothing is
  // saved), with shadow maps and the moving sea off below high: for headless
  // tests that need the whole game running at low cost.
  const gfxParam = new URLSearchParams(location.search).get('gfx');
  if (['high', 'medium', 'light'].includes(gfxParam)) {
    Object.assign(settings, { quality: gfxParam, lite: gfxParam === 'light' });
    if (gfxParam !== 'high') Object.assign(settings, { campfireShadowEnabled: false, seaWaveEnabled: false, seaFoamEnabled: false });
    window.TABLEFOLK_GFX_NOSAVE = true;
  }
  // High with a brain that only just fits the card (Bonsai 2.5 27B on 12 GB: world-integration.js tightGB) runs at
  // medium (not saved): the 27B peaks within 0.3 GB of a 12 GB card at high (brains.md "Rented-card checks")
  if (settings.quality === 'high' && !['high'].includes(gfxParam)) {
    let tight = false;
    try { const m = new URLSearchParams(location.search).get('model'); tight = m ? JSON.parse(localStorage.getItem('tablefolkTightModels') || '[]').includes(m) : localStorage.getItem('tablefolkTightNow') === '1'; } catch {}
    if (tight) { settings.quality = 'medium'; settings.lite = false; settings.tightCapped = true; }
  }
  window.TABLEFOLK_GFX = settings;
  // Light quality: at most 6 lights per material. Every light is computed for
  // every pixel a material covers; capping all materials at 4 saved 5.4 ms of
  // the Oracle's 9 ms GPU frame (1080p, RTX 2060, 2026-11-08). Six = the
  // scene's four (key, rim, sky, fill) plus the two nearest lamps, lanterns or
  // spell lights (scenery.js budgets those per mesh, by distance). Code that
  // asks for 8 gets 6: the setter is clamped once here.
  window.TABLEFOLK_MAX_LIGHTS = settings.lite ? 6 : 8;
  if (settings.lite && window.BABYLON) for (const C of [BABYLON.StandardMaterial, BABYLON.PBRMaterial]) {
    let p = C?.prototype, d = null;
    while (p && !(d = Object.getOwnPropertyDescriptor(p, 'maxSimultaneousLights'))) p = Object.getPrototypeOf(p);
    if (!d?.set || d.set.__capped) continue;
    const set = function (v) { d.set.call(this, Math.min(v, window.TABLEFOLK_MAX_LIGHTS)); }; set.__capped = true;
    Object.defineProperty(p, 'maxSimultaneousLights', { ...d, set });
  }
  // Generated models ship with four 4096px textures each (~360 MB of GPU
  // memory per model with mipmaps). Medium/light load the .1k.glb copies
  // (textures 1024px; geometry and materials identical).
  const HAS_1K = new Set(['critter_rigged.glb', 'barrel.glb', 'blade_cluster.glb', 'crate.glb', 'daisy_clump.glb', 'house.glb', 'rock_boulder3.glb', 'tree.glb',
    'cliff_rock_a.glb', 'cliff_rock_b.glb', 'cliff_straight_a.glb', 'cliff_straight_b.glb', 'grass_v7_orm.glb']);
  // Medium also has geometry-simplified copies (meshoptimizer) of the two
  // models that dominate the vertex count: the grass tile (4368 -> 1946
  // verts, x~120 tiles; .med2 because the first, too aggressive .med made
  // the tiles look puffy and browsers cache model files) and the tree.
  const MED = { 'grass_v7_orm.glb': 'grass_v7_orm.med2.glb', 'tree.glb': 'tree.med.glb' };
  // Props are small on screen: their 1k copies look the same at every quality
  // and save ~85 MB of GPU memory per texture. Only the shelved island's
  // terrain (?island=1) keeps 4096px textures on high.
  const PROPS = new Set(['barrel.glb', 'blade_cluster.glb', 'crate.glb', 'daisy_clump.glb', 'house.glb', 'rock_boulder3.glb', 'tree.glb']);
  window.tablefolkAsset = file => settings.quality === 'high' ? (PROPS.has(file) ? file.replace(/\.glb$/, '.1k.glb') : file)
    : (settings.quality !== 'high' && MED[file]) ? MED[file]   // light uses the simplified geometry too
    : HAS_1K.has(file) ? file.replace(/\.glb$/, '.1k.glb') : file;

  // Graphics memory the scene takes, in GB (2026-11-22): the textures it holds (width x
  // height x bytes a texel, a third more for mipmaps, six faces for a cube), render targets
  // and shadow maps included, plus ~0.3 GB of buffers and the screen's own; never under the
  // quality's floor (high draws 4k building textures, SSAO, bloom). The voice picker
  // (pocket-tts-manager.js) leaves a heavy voice out when the brain and this leave too little.
  const FLOOR_GB = { light: .45, medium: .8, high: 1.6 };
  let gfxMeasured = null, gfxAt = 0;
  window.tablefolkGfxGB = function () {
    const sc = window.TABLEFOLK_STATE?.scene;
    if (sc && performance.now() - gfxAt > 5000) {
      gfxAt = performance.now(); let bytes = 0;
      try {
        // every texture on the GPU once (2026-11-27): the engine's cache of internal textures, so textures held by
        // model containers, instanced models and the building kit count too (scene.textures missed them), and a
        // texture shared by several materials counts once
        const seen = new Set(), list = sc.getEngine().getLoadedTexturesCache?.() || [];
        // (compressed formats, the kit's KTX2: BC1 / ETC1-2 RGB half a byte a texel, BC3 / BC7 / ASTC 4x4 / ETC2 RGBA one)
        const HALF = new Set([33776, 33777, 35916, 35917, 36196, 37492, 37493]), ONE = new Set([33778, 33779, 35918, 35919, 36492, 36493, 37808, 37840, 37496, 37497]);
        const add = (w, h, type, cube, mips, fmt) => { const bpp = HALF.has(fmt) ? .5 : ONE.has(fmt) ? 1 : type === 1 ? 16 : type === 2 ? 8 : 4; bytes += w * h * bpp * (cube ? 6 : 1) * (mips ? 1.33 : 1); };
        for (const it of list) { if (!it?.width || seen.has(it)) continue; seen.add(it); add(it.width, it.height, it.type, it.isCube, it.generateMipMaps || HALF.has(it.format) || ONE.has(it.format), it.format); }
        if (!list.length) for (const t of sc.textures || []) { const z = t.getSize?.(); if (z?.width) add(z.width, z.height, t.textureType, t.isCube, !t.noMipmap); }
        const e = sc.getEngine(); bytes += e.getRenderWidth() * e.getRenderHeight() * 4 * (list.length ? 2 : 6);   // the swap chain and depth (render targets are in the cache)
        gfxMeasured = bytes / 2 ** 30 + .3;
      } catch { gfxMeasured = null; }
    }
    return Math.max(FLOOR_GB[settings.quality] || .45, gfxMeasured || 0);
  };

  function applyShadow(gen, enabled, every) {
    if (!gen) return;
    try {
      const map = gen.getShadowMap?.();
      if (map) map.refreshRate = enabled ? every : BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      const light = gen.getLight?.();
      if (light) light.shadowEnabled = enabled;
    } catch (e) { console.warn('[TablefolkGfx] shadow apply failed', e); }
  }
  function applyShadows() {
    const st = window.TABLEFOLK_STATE;
    // the sun's shadow map (sky.js): every frame at medium/high, every second frame at light
    applyShadow(st?.shadow, settings.keyShadowEnabled, Math.max(settings.quality === 'high' ? 1 : 2, clampEvery(settings.keyShadowEvery)));
    applyShadow((st?.extraShadows || [])[0], settings.campfireShadowEnabled && !settings.lite, clampEvery(settings.campfireShadowEvery));
  }
  // Both ShadowGenerators exist by the time main() dispatches this (it's the
  // very last thing main() does), so this always finds them.
  window.addEventListener('tablefolk-scene-ready', applyShadows);
  // Sea wave/foam toggles don't need an apply step: buildWater()'s animate()
  // reads window.TABLEFOLK_GFX directly every frame.

  function wireUi() {
    const el = id => document.getElementById(id);
    const keyEn = el('gfxKeyShadowEnabled'), keyEv = el('gfxKeyShadowEvery');
    const fireEn = el('gfxCampfireShadowEnabled'), fireEv = el('gfxCampfireShadowEvery');
    const waveEn = el('gfxSeaWaveEnabled'), foamEn = el('gfxSeaFoamEnabled');
    const resetBtn = el('gfxResetDefaults');
    const gridEn = el('gfxShowGrid');
    if (gridEn) { gridEn.checked = !!settings.showGrid; gridEn.addEventListener('change', () => { settings.showGrid = gridEn.checked; save(); window.tablefolkTerrain?.setGrid?.(gridEn.checked); }); }
    const qualitySel = el('gfxQuality');
    if (qualitySel) {
      qualitySel.value = settings.quality;
      qualitySel.addEventListener('change', () => { settings.quality = qualitySel.value; delete settings.tightCapped; settings.lite = settings.quality === 'light'; save(); location.reload(); });
    }
    if (!keyEn) return; // markup not present in this build; skip silently

    const syncInputs = () => {
      keyEn.checked = settings.keyShadowEnabled; keyEv.value = settings.keyShadowEvery;
      fireEn.checked = settings.campfireShadowEnabled; fireEv.value = settings.campfireShadowEvery;
      waveEn.checked = settings.seaWaveEnabled; foamEn.checked = settings.seaFoamEnabled;
    };
    syncInputs();

    const onShadowChange = () => {
      settings.keyShadowEnabled = keyEn.checked; settings.keyShadowEvery = clampEvery(keyEv.value);
      settings.campfireShadowEnabled = fireEn.checked; settings.campfireShadowEvery = clampEvery(fireEv.value);
      keyEv.value = settings.keyShadowEvery; fireEv.value = settings.campfireShadowEvery;
      save(); applyShadows();
      window.log?.('graphics: shadows updated (key ' + (keyEn.checked ? 'on/' + settings.keyShadowEvery : 'off') + ', campfire ' + (fireEn.checked ? 'on/' + settings.campfireShadowEvery : 'off') + ')');
    };
    for (const inp of [keyEn, keyEv, fireEn, fireEv]) inp.addEventListener('change', onShadowChange);

    waveEn.addEventListener('change', () => { settings.seaWaveEnabled = waveEn.checked; save(); window.log?.('graphics: sea wave animation ' + (waveEn.checked ? 'on' : 'off')); });
    foamEn.addEventListener('change', () => { settings.seaFoamEnabled = foamEn.checked; save(); window.log?.('graphics: sea foam ' + (foamEn.checked ? 'on' : 'off')); });

    resetBtn?.addEventListener('click', () => {
      Object.assign(settings, DEFAULTS);
      save(); applyShadows(); syncInputs();
      window.log?.('graphics settings reset to defaults');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUi);
  else wireUi();
})();
