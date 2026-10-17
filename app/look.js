/* tablefolk.world - shared "painted clay diorama" look.
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
    rough: 0.24,        // deliberately glossy global finish
    detail: 0.11,       // locked subtle clay tooth; >0.3 reads as crusty sand
    detailScale: 5,     // detail map UV tiling per unit tile
    envIntensity: 0.85
  };

  let _detailTex = null;
  let _detailUrl = DEFAULTS.detailNormalUrl;

  function detailNormal(scene) {
    if (!_detailTex || _detailTex.getScene() !== scene) {
      _detailTex = new BABYLON.Texture(_detailUrl, scene, false, false);
      _detailTex.wrapU = _detailTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
    return _detailTex;
  }

  function applyClayLook(m, scene, opts) {
    if (!m) return m;
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (m instanceof BABYLON.PBRMaterial) {
      m.metallic = 0;
      m.useMetallnessFromMetallicTextureBlue = false;
      // The requested global wet/glazed finish overrides baked ORM roughness.
      m.useRoughnessFromMetallicTextureGreen = false;
      m.useRoughnessFromMetallicTextureAlpha = false;
      m.roughness = o.rough;
      m.environmentIntensity = o.envIntensity;
      m.specularIntensity = 0.5;
      if (o.detail > 0) {
        const t = detailNormal(scene);
        m.detailMap.texture = t;
        m.detailMap.texture.uScale = o.detailScale;
        m.detailMap.texture.vScale = o.detailScale;
        m.detailMap.isEnabled = true;
        m.detailMap.bumpLevel = o.detail;
        m.detailMap.diffuseBlendLevel = 0;
        m.detailMap.roughnessBlendLevel = 0;
      }
    } else if (m instanceof BABYLON.StandardMaterial) {
      // StandardMaterial ignores the IBL for diffuse so it can never fully
      // match a PBR asset. At minimum kill the plastic highlight.
      m.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
      m.specularPower = 128;
    }
    return m;
  }

  function applyClayLookToMeshes(meshes, scene, opts) {
    const seen = new Set();
    for (const mesh of meshes || []) {
      const m = mesh && mesh.material;
      if (!m || seen.has(m.uniqueId)) continue;
      seen.add(m.uniqueId);
      applyClayLook(m, scene, opts);
    }
  }

  /* ---------------------------------------------------------------- tonemap */
  function applyTonemap(scene, o) {
    o = o || {};
    const ip = scene.imageProcessingConfiguration;
    ip.exposure = o.exposure !== undefined ? o.exposure : 1.28;
    ip.contrast = o.contrast !== undefined ? o.contrast : 1.10;
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
    if (o.grade === false) { ip.colorCurvesEnabled = false; return; }
    try {
      const cc = new BABYLON.ColorCurves();
      cc.shadowsHue = 195; cc.shadowsDensity = 26;
      cc.shadowsSaturation = -6; cc.shadowsExposure = 5;
      cc.midtonesSaturation = 4;
      cc.highlightsHue = 40; cc.highlightsDensity = 16; cc.highlightsSaturation = -4;
      cc.globalSaturation = 6;
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
    detailNormal,
    applyClayLook,
    applyClayLookToMeshes,
    applyTonemap,
    setupSSAO
  };
})();
