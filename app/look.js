/* tablefolk.world - the shared materials and post-processing: matte,
 * weathered, painterly-realistic since 2026-11-20 (a glossy "painted clay
 * diorama" before; the notes below are about those older assets). sky.js has
 * the light, the sky and the time of day.
 *
 * SINGLE SOURCE OF TRUTH for materials + post-processing, so that app.js and
 * app/tilepreview.html cannot drift apart (this codebase already got burned by
 * five duplicate roundedTile() definitions in terrain-hd.js). Loaded as a plain
 * script before app.js via preflight.js; exposes window.TABLEFOLK_LOOK.
 *
 * WHY THIS EXISTS - measured facts about our image-to-3D assets:
 *
 *  - Tripo bakes an ORM texture whose RED (occlusion) channel is pure white
 *    (mean 254.8/255, std 0.6). There is NO ambient occlusion in the asset and
 *    the glTF does not even declare an occlusionTexture. Fixed offline by
 *    handoff/tile_work/orm.py, which ray-traces real AO into that channel.
 *  - Tripo's normal map is effectively blank (std ~2/255). So all micro-surface
 *    comes from ONE shared tiling detail normal applied at high UV scale via
 *    PBRMaterial.detailMap. Do not bother requesting per-asset normal maps.
 *  - Tripo writes metallicFactor 1.0 and roughness ~0.49 (semi-gloss), which
 *    reads as plastic. The concept art is matte clay: roughness ~0.88,
 *    metallic 0, almost no specular highlight.
 *
 * NOTE on roughness: glTF multiplies roughnessFactor by the ORM green channel,
 * so once a metallicRoughnessTexture exists you CANNOT raise roughness from the
 * material side, only lower it. That is why orm.py rewrites the texture itself.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    detailNormalUrl: (window.tablefolkPacks?.base || './assets/') + 'textures/detail_clay_n.png',
    minRough: 0.55,     // matte: nothing is glossier than this (metals: METAL_MIN)
    envIntensity: 0.55  // moderate image-based light; the sky fill and sun do the rest
  };
  const METAL_MIN = 0.3, METAL_RE = /metal|iron|steel|gold|silver|brass|bronze|copper|blade|sword|axe|armou?r|chain|nail|coin/i;

  let _detailTex = null;
  let _detailUrl = DEFAULTS.detailNormalUrl;
  function detailNormal(scene) {
    if (!_detailTex || _detailTex.getScene() !== scene) {
      _detailTex = new BABYLON.Texture(_detailUrl, scene, false, false);
      _detailTex.wrapU = _detailTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
    return _detailTex;
  }

  // Roughness floor for materials whose roughness comes from a texture (the
  // factor can only lower it): a plugin clamps it in the shader, right after
  // the reflectivity block, so a glossy map can't make plastic.
  let MattePlugin = null;
  function matteClass() {
    if (MattePlugin) return MattePlugin;
    const WGSL = BABYLON.ShaderLanguage?.WGSL;
    MattePlugin = class extends BABYLON.MaterialPluginBase {
      constructor(mat, min) { super(mat, 'TfMatte', 250, { TFMATTE: false }); this.min = min; this._enable(true); }
      getClassName() { return 'TfMattePlugin'; }
      isCompatible() { return true; }
      prepareDefines(d) { d.TFMATTE = true; }
      getUniforms(lang) { const ubo = [{ name: 'tfMatte', size: 1, type: 'float' }]; return lang === WGSL ? { ubo } : { ubo, fragment: '#ifdef TFMATTE\nuniform float tfMatte;\n#endif\n' }; }
      bindForSubMesh(ubo) { ubo.updateFloat('tfMatte', this.min); }
      getCustomCode(type, lang) {
        if (type !== 'fragment') return null;
        if (lang === WGSL) return { '!var roughness: f32=reflectivityOut\\.roughness;': 'var roughness: f32=max(reflectivityOut.roughness,uniforms.tfMatte);microSurface=1.0-roughness;' };
        return { '!float roughness=reflectivityOut\\.roughness;': 'float roughness=max(reflectivityOut.roughness,tfMatte);microSurface=1.0-roughness;' };
      }
    };
    return MattePlugin;
  }

  // The finish of everything (2026-11-20): matte, weathered, each model's own
  // PBR maps. No clear coat, no forced gloss, no clay detail normal. Plain
  // (untextured) roughness is raised to minRough; a roughness map is clamped
  // in the shader. Metallic only where a metallic map says so or the
  // material is named as metal (glTF's default metallicFactor 1 without a
  // map made props chrome); metals keep down to METAL_MIN.
  function matte(m, opts) {
    if (!m || m._tfMatte) return m;
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (m instanceof BABYLON.PBRMaterial) {
      m._tfMatte = true;
      const metal = !!m.metallicTexture || METAL_RE.test(m.name || '');
      if (!metal) m.metallic = 0;
      const min = metal ? METAL_MIN : o.minRough;
      try { m.clearCoat.isEnabled = false; } catch {}
      try { if (m.detailMap) { m.detailMap.isEnabled = false; m.detailMap.texture = null; } } catch {}
      if (m.roughness == null) m.roughness = 1;
      const fromMap = m.metallicTexture && (m.useRoughnessFromMetallicTextureGreen || m.useRoughnessFromMetallicTextureAlpha);
      if (!fromMap) m.roughness = Math.max(m.roughness, min);
      else if (!m._tfMattePlugin) { try { m._tfMattePlugin = new (matteClass())(m, min); } catch (e) { console.warn('[look] matte plugin', e); } }
      m.environmentIntensity = Math.min(m.environmentIntensity ?? 1, o.envIntensity);
      m.enableSpecularAntiAliasing = true;
    } else if (m instanceof BABYLON.StandardMaterial) {
      m._tfMatte = true;
      m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
      m.specularPower = 16;
    }
    return m;
  }
  // old names: every caller now gets the matte finish
  function applyClayLook(m, scene, opts) { return matte(m, opts); }
  function applyClayLookToMeshes(meshes, scene, opts) {
    const seen = new Set();
    for (const mesh of meshes || []) {
      const m = mesh && mesh.material;
      if (!m || seen.has(m.uniqueId)) continue;
      seen.add(m.uniqueId);
      if (m.subMaterials) for (const sm of m.subMaterials) matte(sm, opts); else matte(m, opts);
    }
  }

  /* ---------------------------------------------------------------- tonemap */
  function applyTonemap(scene, o) {
    o = o || {};
    const ip = scene.imageProcessingConfiguration;
    ip.exposure = o.exposure !== undefined ? o.exposure : 1.0;
    ip.contrast = o.contrast !== undefined ? o.contrast : 1.06;
    const mode = o.tonemap || 'neutral';
    if (mode === 'none') {
      ip.toneMappingEnabled = false;
    } else {
      ip.toneMappingEnabled = true;
      const N = BABYLON.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
      ip.toneMappingType = (mode === 'neutral' && N !== undefined)
        ? N
        : BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    }
    if (o.grade !== 'warm') { ip.colorCurvesEnabled = false; return; }
    try {
      const cc = new BABYLON.ColorCurves();
      // a faint warm grade only (the teal shadow grade is gone)
      cc.highlightsHue = 40; cc.highlightsDensity = 8; cc.globalSaturation = -4;
      ip.colorCurves = cc;
      ip.colorCurvesEnabled = true;
    } catch (e) { console.warn('color curves unavailable', e); }
  }

  /* ------------------------------------------------------------------- SSAO */
  function setupSSAO(scene, camera, o) {
    o = o || {};
    try {
      if (!BABYLON.SSAO2RenderingPipeline || !BABYLON.SSAO2RenderingPipeline.IsSupported) {
        console.warn('SSAO2 unsupported on this device');
        return null;
      }
      const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene,
        { ssaoRatio: o.ssaoRatio || 1, blurRatio: o.blurRatio || 1 }, [camera]);
      ssao.radius = o.radius !== undefined ? o.radius : 0.55;
      ssao.totalStrength = o.strength !== undefined ? o.strength : 1.05;
      ssao.base = 0;
      ssao.samples = o.samples || 16;
      ssao.maxZ = o.maxZ || 60;
      ssao.minZAspect = 0.2;
      ssao.expensiveBlur = true;
      return ssao;
    } catch (e) { console.warn('ssao unavailable', e); return null; }
  }

  window.TABLEFOLK_LOOK = {
    DEFAULTS,
    setDetailNormalUrl(u) { _detailUrl = u; _detailTex = null; },
    METAL_RE,
    detailNormal,
    matte,
    applyClayLook,
    applyClayLookToMeshes,
    applyTonemap,
    setupSSAO
  };
})();
