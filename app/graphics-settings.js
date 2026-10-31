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
    lite: false,
  };

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() { if (window.TABLEFOLK_GFX_NOSAVE) return; try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }
  function clampEvery(v) { v = parseInt(v, 10); if (!Number.isFinite(v) || v < 1) v = 1; return Math.min(10, v); }

  // Read synchronously at script-load time (this file loads before
  // terrain-hd.js/app.js) so the very first frame already honors any
  // previously saved settings instead of flashing the defaults first.
  const settings = load();
  // Quality: 'high' (full detail), 'medium' (HD look, far less geometry and
  // 1k textures, no SSAO), 'light' (simple voxel island). The old lite flag
  // maps onto it; settings.lite stays in sync for code that reads it.
  if (!['high', 'medium', 'light'].includes(settings.quality)) settings.quality = settings.lite ? 'light' : 'high';
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
    if (gfxParam !== 'high') Object.assign(settings, { keyShadowEnabled: false, campfireShadowEnabled: false, seaWaveEnabled: false, seaFoamEnabled: false });
    window.TABLEFOLK_GFX_NOSAVE = true;
  }
  window.TABLEFOLK_GFX = settings;
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
    applyShadow(st?.shadow, settings.keyShadowEnabled && !settings.lite, clampEvery(settings.keyShadowEvery));
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
    const qualitySel = el('gfxQuality');
    if (qualitySel) {
      qualitySel.value = settings.quality;
      qualitySel.addEventListener('change', () => { settings.quality = qualitySel.value; settings.lite = settings.quality === 'light'; save(); location.reload(); });
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
