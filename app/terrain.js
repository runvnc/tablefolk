/* terrain.js -- the ground: one continuous, blended terrain instead of tiles
 * (2026-11-20), and what lies beyond the board's edge.
 *
 * The board is still a grid of 1 x 1 cells for the logic (walking, physics,
 * paths, sight are unchanged); only the picture is new. One mesh covers the
 * board and a margin around it (2 vertices a cell), flat at y = 0 on every
 * walkable cell; sea cells dip under the water. A second, coarser mesh runs
 * on to about 170 m: gentle hills outdoors (height only outside the board),
 * flat for a street or under the rock of a dungeon, the sea floor for an
 * island.
 *
 * Splat material: a PBRMaterial with a material plugin (TfTerrain). Each
 * cell's floor (paint, or the world's default ground) maps to one of the
 * environment textures in assets/textures/env (manifest.json: real tile size
 * in metres). Their colour (+ roughness in alpha) and normal (+ ambient
 * occlusion, + a height from luminance) go into two 2D texture arrays, so the
 * whole ground costs four samplers (two control maps, two arrays). The
 * control maps hold one weight per layer at 8 texels a cell, blurred wide
 * (natural ground: grass, dirt, sand, mud, forest floor) or tight (built:
 * cobbles, flagstones, planks); the shader wobbles the lookup with noise so
 * the edges wander by about 0.3 cell and never follow the grid, blends by
 * height (stones poke through grass), and adds a low-frequency colour
 * variation that hides the texture's repeat. World-space UVs at each
 * texture's real size. Light quality: 1k textures, at most 4 layers,
 * constant roughness and no AO; medium 1k with roughness and AO, up to 8
 * layers; high 2k. Before the textures arrive (and on WebGL, which has no
 * plugin code here) vertex colours show the layers' mean colours.
 *
 * Outside the board ("outside" in a scenario, else by world kind):
 *   land    outdoor worlds: the dominant ground runs on into hills and haze
 *           (surroundings.js puts trees on them)
 *   rock    dungeons, caves, dark worlds: solid rock at wall-top height over
 *           every cell outside the rooms, on for 10 cells into black fog
 *   street  a world that is all one building: a cobbled street into dusk fog
 *   sea     islands (sea cells at the edge): a sandy shore and open water
 *   none    nothing past the board's margin
 * An edge link (a section's "edge": "east" link, scenario.js state.edgeLinks)
 * gets a dirt road running on from its square on the rim past the board.
 * The grid lines are an overlay drawn by the shader: off by default (the
 * Graphics pane's "show grid", tablefolkTerrain.setGrid), on in the tabletop
 * print view.
 *
 *   window.tablefolkTerrain = { rebuild(), mode(), heightAt(x,z), setGrid(on), layerAt(x,z) }
 * Loaded after app.js (uses state, WORLD, paintAt, wallH, meta, PAINT_MATERIALS).
 */
(function () {
  'use strict';
  const ENV = () => (window.tablefolkPacks?.base || '/assets/') + 'textures/env/';
  const GFX = () => window.TABLEFOLK_GFX || {};
  const RES = 4, MARGIN = 8, FAR = 170;   // control map texels a cell (8 cost ~470 ms of main thread a build on a 45 x 35 board)
  const NATURAL = new Set(['grass_meadow', 'grass_dry', 'forest_floor', 'dirt_path', 'mud', 'sand', 'gravel', 'farmland', 'snow']);
  let manifest = null, manifestP = null;
  const T = { mesh: null, far: null, rock: null, sea: null, mat: null, rockMat: null, seaMat: null, arrays: null, arraysKey: '', ctrl: [], layers: [], mode: 'land', grid: false, cover: [], coverKey: '', sig: '', holes: [] };

  function loadManifest() {
    manifestP ||= fetch(ENV() + 'manifest.json').then(r => r.json()).then(m => { manifest = Object.fromEntries(m.materials.map(x => [x.name, x])); return manifest; }).catch(e => { console.warn('[terrain] manifest', e); manifest = {}; return manifest; });
    return manifestP;
  }
  const mean = name => { const m = manifest?.[name]?.meanSRGB; return m || [.4, .4, .38]; };
  const tile = name => manifest?.[name]?.tileMeters || 2;

  // ---- what the world is ----
  const scn = () => state.envScn || window.tablefolkScenario?.active?.scn || {};
  function genKind() { return String(scn().generate?.kind || '').toLowerCase(); }
  function mode() {
    const s = scn(), o = s.outside;
    if (['land', 'sea', 'rock', 'street', 'none'].includes(o)) return o;
    if (s.dark || s.base === 'dungeon' || /dungeon|cave|crypt|castle|keep|mine|catacomb|tomb/.test(genKind())) return 'rock';
    // sea cells on the board's rim: an island
    const hw = WORLD.halfW - 1, hh = WORLD.halfH - 1; let sea = 0, rim = 0;
    for (let x = -hw; x <= hw; x++) for (const z of [-hh, hh]) { rim++; if (paintAt(x, z)?.mat === 'sea') sea++; }
    for (let z = -hh; z <= hh; z++) for (const x of [-hw, hw]) { rim++; if (paintAt(x, z)?.mat === 'sea') sea++; }
    if (sea > rim * .6) return 'sea';
    const R = window.tablefolkRoofs?.findRooms?.();
    if (R && R.rooms.length && R.outsideShare < .25) return 'street';
    return 'land';
  }
  // the ground of a cell, as an env texture name
  function defaultGround(m) {
    if (m === 'rock') return 'flagstone';
    if (m === 'street') return 'wood_planks_worn';
    return /forest|wood|wild/.test(genKind()) ? 'forest_floor' : 'grass_meadow';
  }
  function layerFor(mat, m, indoor, dflt) {
    switch (mat) {
      case 'grass': return 'grass_meadow';
      case 'stone': return m === 'rock' ? 'flagstone' : 'cobblestone';
      case 'flagstone': return 'flagstone';
      case 'dirt': return 'dirt_path';
      case 'sand': return 'sand';
      case 'wood': case 'oak': return 'wood_planks_worn';
      case 'tile': return 'flagstone';
      case 'concrete': return 'stone_floor_rough';
      case 'water': return 'mud';
      case 'lava': return 'stone_floor_rough';
      case 'sea': return m === 'rock' ? 'stone_floor_rough' : 'sand';
      case 'carpet': return 'wood_planks_worn';
    }
    return indoor ? (m === 'rock' ? 'flagstone' : 'wood_planks_worn') : dflt;
  }

  // ---- noise ----
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; }
  // the shader's hash and value noise, the same in JS (ground cover takes the grass patches' tint)
  const sHash = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
  const sNoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = sHash(ix, iz), b = sHash(ix + 1, iz), c = sHash(ix, iz + 1), d = sHash(ix + 1, iz + 1); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };
  const patchAt = (x, z) => sNoise(x * .085 + 17, z * .085 + 3) * .7 + sNoise(x * .19 + 2, z * .19 + 9) * .3;
  const sm = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const kindFor = () => window.tablefolkSurroundings?.kindFor?.(scn()) || 'fields';
  const fbm = (x, z) => vnoise(x, z) * .55 + vnoise(x * 2.1 + 7, z * 2.1 + 3) * .28 + vnoise(x * 4.3 + 1, z * 4.3 + 9) * .17;

  // ---- heights ----
  const inner = () => ({ x0: -(WORLD.halfW - .5) - MARGIN, x1: (WORLD.halfW - .5) + MARGIN, z0: -(WORLD.halfH - .5) - MARGIN, z1: (WORLD.halfH - .5) + MARGIN });
  const outsideBoard = (x, z) => Math.max(0, Math.abs(x) - (WORLD.halfW - .5), Math.abs(z) - (WORLD.halfH - .5));
  // the sea carries on outward from sea cells on the board's rim (a coast)
  function rimSea(x, z) {
    const bx = WORLD.halfW - 1, bz = WORLD.halfH - 1;
    return seaCell(Math.max(-bx, Math.min(bx, Math.round(x))), Math.max(-bz, Math.min(bz, Math.round(z))));
  }
  function heightAt(x, z) {
    const m = T.mode, d = outsideBoard(x, z);
    if (m === 'sea' || (d > 0 && (m === 'land' || m === 'street') && rimSea(x, z))) { if (d <= 0) return 0; return -Math.min(2.6, .8 + d * .5); }
    if (m !== 'land' || d < 4) return 0;
    const k = Math.min(1, (d - 4) / 40), r = k * k * (3 - 2 * k);
    return r * (fbm(x * .011 + 3, z * .011 + 5) * 16 - 3 + vnoise(x * .028, z * .028) * 2) * (.4 + .6 * Math.min(1, d / 90));
  }

  // ---- texture arrays ----
  async function decode(url, n) {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: n, resizeHeight: n, resizeQuality: 'high' });
    const cv = new OffscreenCanvas(n, n), c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0); bmp.close?.();
    return c.getImageData(0, 0, n, n).data;
  }
  async function buildArrays(names, hi) {
    // light quality: 512 (the ground is seen from a few metres up at least)
    const lite = !!GFX().lite, n = hi ? 2048 : lite ? 512 : 1024, sfx = hi ? '' : '_1k', N = n * n, sc = state.scene;
    const alb = new Uint8Array(N * 4 * names.length), nrm = new Uint8Array(N * 4 * names.length);
    // one layer a frame (off the critical path: decoding and packing took long frames at start-up)
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      await new Promise(r => requestAnimationFrame(() => r()));
      await window.tablefolkDressGate?.();
      const base = ENV() + name + '_';
      const [col, nor, rough, ao] = await Promise.all([decode(base + 'color' + sfx + '.webp', n), decode(base + 'normal' + sfx + '.webp', n), decode(base + 'rough' + sfx + '.webp', n).catch(() => null), decode(base + 'ao' + sfx + '.webp', n).catch(() => null)]);
      const o = i * N * 4;
      for (let p = 0, q = o; p < N * 4; p += 4, q += 4) {
        alb[q] = col[p]; alb[q + 1] = col[p + 1]; alb[q + 2] = col[p + 2]; alb[q + 3] = rough ? rough[p] : 220;
        nrm[q] = nor[p]; nrm[q + 1] = nor[p + 1]; nrm[q + 2] = ao ? ao[p] : 255;
        nrm[q + 3] = (col[p] * 77 + col[p + 1] * 150 + col[p + 2] * 29) >> 8;   // height: brightness
      }
    }
    const mk = (data, name) => { const t = new BABYLON.RawTexture2DArray(data, n, n, names.length, BABYLON.Engine.TEXTUREFORMAT_RGBA, sc, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE); t.name = name; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8; return t; };
    return { alb: mk(alb, 'terrain_alb'), nrm: mk(nrm, 'terrain_nrm'), n };
  }

  // ---- the shader ----
  let Plugin = null;
  const WGSL_FN = `
fn tfHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn tfNoise(p: vec2f) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tfHash(i), tfHash(i + vec2f(1.0, 0.0)), u.x), mix(tfHash(i + vec2f(0.0, 1.0)), tfHash(i + vec2f(1.0, 1.0)), u.x), u.y); }
`;
  const GLSL_FN = `
float tfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tfNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tfHash(i), tfHash(i + vec2(1.0, 0.0)), u.x), mix(tfHash(i + vec2(0.0, 1.0)), tfHash(i + vec2(1.0, 1.0)), u.x), u.y); }
`;
  // one layer: its weight, height-adjusted, accumulated
  const wgslLayer = i => `
  { let w = tfW[${i}];
    if (w > 0.003) {
      let k = select(uniforms.tfTile1[${i % 4}], uniforms.tfTile0[${i % 4}], ${i} < 4);
      let uv = tfP * k + vec2f(${(i * .37).toFixed(2)}, ${(i * .61).toFixed(2)});
      let a = textureSampleGrad(tfAlbSampler, tfAlbSamplerSampler, uv, ${i}, tfDx * k, tfDy * k);
      let nn = textureSampleGrad(tfNrmSampler, tfNrmSamplerSampler, uv, ${i}, tfDx * k, tfDy * k);
      let hw = pow(w, 1.6) * (0.15 + nn.a);
      tfAcc += hw * a.rgb; tfAccN += hw * vec3f(nn.rg * 2.0 - 1.0, 1.0); tfAccR += hw * a.a; tfAccAO += hw * nn.b; tfSum += hw;
    } }`;
  const glslLayer = i => `
  { float w = tfW[${i}];
    if (w > 0.003) {
      float k = ${i} < 4 ? tfTile0[${i % 4}] : tfTile1[${i % 4}];
      vec2 uv = tfP * k + vec2(${(i * .37).toFixed(2)}, ${(i * .61).toFixed(2)});
      vec4 a = textureGrad(tfAlbSampler, vec3(uv, ${i}.0), tfDx * k, tfDy * k);
      vec4 nn = textureGrad(tfNrmSampler, vec3(uv, ${i}.0), tfDx * k, tfDy * k);
      float hw = pow(w, 1.6) * (0.15 + nn.a);
      tfAcc += hw * a.rgb; tfAccN += hw * vec3(nn.rg * 2.0 - 1.0, 1.0); tfAccR += hw * a.a; tfAccAO += hw * nn.b; tfSum += hw;
    } }`;
  function pluginClass() {
    if (Plugin) return Plugin;
    const WGSL = BABYLON.ShaderLanguage?.WGSL;
    Plugin = class extends BABYLON.MaterialPluginBase {
      constructor(mat) { super(mat, 'TfTerrain', 200, { TFTERRAIN: false }); this._enable(true); this.tex = {}; this.u = { ctrl: [0, 0, 1, 1], t0: [1, 1, 1, 1], t1: [1, 1, 1, 1], p: [0, .3, 6, 5], f: [4, .9, 1, .12] }; }
      getClassName() { return 'TfTerrainPlugin'; }
      isCompatible() { return true; }
      prepareDefines(d) { d.TFTERRAIN = true; }
      getSamplers(s) { s.push('tfCtrl0Sampler', 'tfCtrl1Sampler', 'tfAlbSampler', 'tfNrmSampler'); }
      getUniforms(lang) {
        const ubo = ['tfCtrl', 'tfTile0', 'tfTile1', 'tfParams', 'tfFlags', 'tfKind0', 'tfKind1', 'tfExtra', 'tfHole0', 'tfHole1', 'tfHole2', 'tfHole3'].map(name => ({ name, size: 4, type: 'vec4' }));
        return lang === WGSL ? { ubo } : { ubo, fragment: 'uniform vec4 tfCtrl;uniform vec4 tfTile0;uniform vec4 tfTile1;uniform vec4 tfParams;uniform vec4 tfFlags;uniform vec4 tfKind0;uniform vec4 tfKind1;uniform vec4 tfExtra;uniform vec4 tfHole0;uniform vec4 tfHole1;uniform vec4 tfHole2;uniform vec4 tfHole3;\n' };
      }
      bindForSubMesh(ubo) {
        const u = this.u;
        ubo.updateFloat4('tfCtrl', ...u.ctrl); ubo.updateFloat4('tfTile0', ...u.t0); ubo.updateFloat4('tfTile1', ...u.t1);
        ubo.updateFloat4('tfParams', T.grid ? 1 : 0, u.p[1], u.p[2], u.p[3]); ubo.updateFloat4('tfFlags', ...u.f); ubo.updateFloat4('tfKind0', ...(u.k0 || [1, 1, 1, 1])); ubo.updateFloat4('tfKind1', ...(u.k1 || [1, 1, 1, 1])); ubo.updateFloat4('tfExtra', ...(u.x || [0, 0, 0, 0]));
        // stairwells (sections.js): up to four squares of ground left open (x0, z0, x1, z1)
        for (let i = 0; i < 4; i++) ubo.updateFloat4('tfHole' + i, ...(T.holes[i] || [1e5, 1e5, 1e5, 1e5]));
        for (const k of ['tfCtrl0Sampler', 'tfCtrl1Sampler', 'tfAlbSampler', 'tfNrmSampler']) if (this.tex[k]) ubo.setTexture(k, this.tex[k]);
      }
      getCustomCode(type, lang) {
        if (type !== 'fragment') return null;
        if (lang === WGSL) return {
          CUSTOM_FRAGMENT_MAIN_BEGIN: `
{ let hp = fragmentInputs.vPositionW.xz;
  if ((hp.x > uniforms.tfHole0.x && hp.x < uniforms.tfHole0.z && hp.y > uniforms.tfHole0.y && hp.y < uniforms.tfHole0.w) || (hp.x > uniforms.tfHole1.x && hp.x < uniforms.tfHole1.z && hp.y > uniforms.tfHole1.y && hp.y < uniforms.tfHole1.w)
   || (hp.x > uniforms.tfHole2.x && hp.x < uniforms.tfHole2.z && hp.y > uniforms.tfHole2.y && hp.y < uniforms.tfHole2.w) || (hp.x > uniforms.tfHole3.x && hp.x < uniforms.tfHole3.z && hp.y > uniforms.tfHole3.y && hp.y < uniforms.tfHole3.w)) { discard; } }
`,
          CUSTOM_FRAGMENT_DEFINITIONS: `
var tfCtrl0SamplerSampler: sampler; var tfCtrl0Sampler: texture_2d<f32>;
var tfCtrl1SamplerSampler: sampler; var tfCtrl1Sampler: texture_2d<f32>;
var tfAlbSamplerSampler: sampler; var tfAlbSampler: texture_2d_array<f32>;
var tfNrmSamplerSampler: sampler; var tfNrmSampler: texture_2d_array<f32>;
${WGSL_FN}`,
          CUSTOM_FRAGMENT_UPDATE_ALPHA: `
var tfRough: f32 = uniforms.tfFlags.y; var tfAO: f32 = 1.0;
{
  let wp = fragmentInputs.vPositionW;
  let tfP = wp.xz; let tfDx = dpdx(tfP); let tfDy = dpdy(tfP);
  let n1 = vec2f(tfNoise(tfP * 1.1), tfNoise(tfP * 1.1 + vec2f(31.7, 11.3))) - vec2f(0.5);
  let n2 = vec2f(tfNoise(tfP * 3.3 + vec2f(5.1, 2.3)), tfNoise(tfP * 3.3 + vec2f(1.9, 17.7))) - vec2f(0.5);
  let cp = tfP + (n1 * 0.85 + n2 * 0.35) * uniforms.tfParams.y;
  let cuv = (cp - uniforms.tfCtrl.xy) * uniforms.tfCtrl.zw;
  let c0 = textureSample(tfCtrl0Sampler, tfCtrl0SamplerSampler, cuv);
  let c1 = textureSample(tfCtrl1Sampler, tfCtrl1SamplerSampler, cuv);
  var tfW = array<f32, 8>(c0.r, c0.g, c0.b, c0.a, c1.r, c1.g, c1.b, c1.a);
  var tfAcc = vec3f(0.0); var tfAccN = vec3f(0.0); var tfAccR = 0.0; var tfAccAO = 0.0; var tfSum = 0.0;
  ${[0, 1, 2, 3, 4, 5, 6, 7].map(wgslLayer).join('')}
  if (tfSum > 0.0001) {
    let tfMac = tfNoise(tfP * 0.09) * 0.6 + tfNoise(tfP * 0.23 + vec2f(3.0, 7.0)) * 0.4;
    var col = tfAcc / tfSum;
    col = col * (1.0 + (tfMac - 0.5) * uniforms.tfFlags.w * 2.0);
    // natural ground: patches of drier/yellower and lusher grass, 6-15 m across
    var tfNat = 0.0; var tfPath = 0.0;
    for (var i = 0; i < 4; i++) { tfNat += tfW[i] * step(0.5, uniforms.tfKind0[i]); tfPath += tfW[i] * step(1.5, uniforms.tfKind0[i]); tfNat += tfW[i + 4] * step(0.5, uniforms.tfKind1[i]); tfPath += tfW[i + 4] * step(1.5, uniforms.tfKind1[i]); }
    let tfPat = tfNoise(tfP * 0.085 + vec2f(17.0, 3.0)) * 0.7 + tfNoise(tfP * 0.19 + vec2f(2.0, 9.0)) * 0.3;
    col = mix(col, col * vec3f(1.2, 1.12, 0.74), smoothstep(0.5, 0.8, tfPat) * 0.75 * tfNat);
    col = mix(col, col * vec3f(0.86, 1.04, 0.86), smoothstep(0.5, 0.82, 1.0 - tfPat) * 0.5 * tfNat);
    // paths: a lighter worn centre, darker damp edges
    let tfWear = mix(0.84, 1.1, smoothstep(0.45, 0.95, tfPath));
    col = col * mix(1.0, tfWear, min(1.0, tfPath * 2.2));
    // far fields: a patchwork of crops and meadows outside the board (land worlds)
    let tfOut = max(abs(tfP.x) - uniforms.tfParams.z, abs(tfP.y) - uniforms.tfParams.w);
    if (uniforms.tfExtra.x > 0.5) {
      let wq = vec2f(tfNoise(tfP * 0.021 + vec2f(4.0, 1.0)), tfNoise(tfP * 0.021 + vec2f(9.0, 6.0))) - vec2f(0.5);
      let q = vec2f(tfP.x * 0.94 + tfP.y * 0.34, tfP.y * 0.94 - tfP.x * 0.34) + wq * 22.0 + n1 * 2.0;
      let cell = floor(q / vec2f(26.0, 17.0)); let h = tfHash(cell);
      let tint = select(select(vec3f(1.3, 1.16, 0.66), vec3f(1.1, 1.14, 0.86), h > 0.33), vec3f(0.96, 0.85, 0.66), h > 0.72);
      // soft field edges (a hedge-dark seam), never a hard step
      let fe = abs(fract(q / vec2f(26.0, 17.0)) - vec2f(0.5)) * 2.0; let edge = smoothstep(0.78, 1.0, max(fe.x, fe.y));
      col = mix(col, mix(col * tint, col * 0.78, edge * 0.7), smoothstep(16.0, 45.0, tfOut) * 0.32);
    }
    surfaceAlbedo = pow(max(col, vec3f(0.0)), vec3f(2.2));
    let tn = tfAccN / tfSum; let tz = sqrt(max(0.0, 1.0 - dot(tn.xy, tn.xy)));
    let N = normalize(fragmentInputs.vNormalW);
    let Tg = normalize(vec3f(1.0, 0.0, 0.0) - N * N.x); let Bg = cross(N, Tg);
    normalW = normalize(Tg * tn.x * uniforms.tfFlags.z + Bg * tn.y * uniforms.tfFlags.z + N * tz);
    if (uniforms.tfFlags.x > 0.5) { tfRough = clamp(tfAccR / tfSum, 0.55, 1.0); tfAO = mix(1.0, tfAccAO / tfSum, 0.8); }
  }
  if (uniforms.tfParams.x > 0.5 && abs(wp.x) < uniforms.tfParams.z && abs(wp.z) < uniforms.tfParams.w) {
    let g = abs(fract(tfP + vec2f(0.5)) - vec2f(0.5)); let fw = (abs(tfDx) + abs(tfDy)) * 1.2;
    let line = 1.0 - min(smoothstep(vec2f(0.0), fw, g).x, smoothstep(vec2f(0.0), fw, g).y);
    surfaceAlbedo = surfaceAlbedo * (1.0 - line * 0.45);
  }
}
`,
          '!var roughness: f32=reflectivityOut\\.roughness;': 'var roughness: f32=tfRough;microSurface=1.0-roughness;aoOut.ambientOcclusionColor=aoOut.ambientOcclusionColor*tfAO;',
        };
        return {
          CUSTOM_FRAGMENT_MAIN_BEGIN: `
{ vec2 hp = vPositionW.xz;
  if ((hp.x > tfHole0.x && hp.x < tfHole0.z && hp.y > tfHole0.y && hp.y < tfHole0.w) || (hp.x > tfHole1.x && hp.x < tfHole1.z && hp.y > tfHole1.y && hp.y < tfHole1.w)
   || (hp.x > tfHole2.x && hp.x < tfHole2.z && hp.y > tfHole2.y && hp.y < tfHole2.w) || (hp.x > tfHole3.x && hp.x < tfHole3.z && hp.y > tfHole3.y && hp.y < tfHole3.w)) discard; }
`,
          CUSTOM_FRAGMENT_DEFINITIONS: `
uniform sampler2D tfCtrl0Sampler; uniform sampler2D tfCtrl1Sampler;
uniform highp sampler2DArray tfAlbSampler; uniform highp sampler2DArray tfNrmSampler;
${GLSL_FN}`,
          CUSTOM_FRAGMENT_UPDATE_ALPHA: `
float tfRough = tfFlags.y; float tfAO = 1.0;
{
  vec2 tfP = vPositionW.xz; vec2 tfDx = dFdx(tfP); vec2 tfDy = dFdy(tfP);
  vec2 n1 = vec2(tfNoise(tfP * 1.1), tfNoise(tfP * 1.1 + vec2(31.7, 11.3))) - 0.5;
  vec2 n2 = vec2(tfNoise(tfP * 3.3 + vec2(5.1, 2.3)), tfNoise(tfP * 3.3 + vec2(1.9, 17.7))) - 0.5;
  vec2 cuv = (tfP + (n1 * 0.85 + n2 * 0.35) * tfParams.y - tfCtrl.xy) * tfCtrl.zw;
  vec4 c0 = texture2D(tfCtrl0Sampler, cuv); vec4 c1 = texture2D(tfCtrl1Sampler, cuv);
  float tfW[8]; tfW[0]=c0.r; tfW[1]=c0.g; tfW[2]=c0.b; tfW[3]=c0.a; tfW[4]=c1.r; tfW[5]=c1.g; tfW[6]=c1.b; tfW[7]=c1.a;
  vec3 tfAcc = vec3(0.0); vec3 tfAccN = vec3(0.0); float tfAccR = 0.0; float tfAccAO = 0.0; float tfSum = 0.0;
  ${[0, 1, 2, 3, 4, 5, 6, 7].map(glslLayer).join('')}
  if (tfSum > 0.0001) {
    float tfMac = tfNoise(tfP * 0.09) * 0.6 + tfNoise(tfP * 0.23 + vec2(3.0, 7.0)) * 0.4;
    vec3 col = tfAcc / tfSum; col *= 1.0 + (tfMac - 0.5) * tfFlags.w * 2.0;
    float tfNat = 0.0; float tfPath = 0.0;
    for (int i = 0; i < 4; i++) { tfNat += tfW[i] * step(0.5, tfKind0[i]) + tfW[i + 4] * step(0.5, tfKind1[i]); tfPath += tfW[i] * step(1.5, tfKind0[i]) + tfW[i + 4] * step(1.5, tfKind1[i]); }
    float tfPat = tfNoise(tfP * 0.085 + vec2(17.0, 3.0)) * 0.7 + tfNoise(tfP * 0.19 + vec2(2.0, 9.0)) * 0.3;
    col = mix(col, col * vec3(1.2, 1.12, 0.74), smoothstep(0.5, 0.8, tfPat) * 0.75 * tfNat);
    col = mix(col, col * vec3(0.86, 1.04, 0.86), smoothstep(0.5, 0.82, 1.0 - tfPat) * 0.5 * tfNat);
    col *= mix(1.0, mix(0.84, 1.1, smoothstep(0.45, 0.95, tfPath)), min(1.0, tfPath * 2.2));
    float tfOut = max(abs(tfP.x) - tfParams.z, abs(tfP.y) - tfParams.w);
    if (tfExtra.x > 0.5) {
      vec2 wq = vec2(tfNoise(tfP * 0.021 + vec2(4.0, 1.0)), tfNoise(tfP * 0.021 + vec2(9.0, 6.0))) - 0.5;
      vec2 q = vec2(tfP.x * 0.94 + tfP.y * 0.34, tfP.y * 0.94 - tfP.x * 0.34) + wq * 22.0 + n1 * 2.0;
      float h = tfHash(floor(q / vec2(26.0, 17.0)));
      vec3 tint = h > 0.72 ? vec3(0.96, 0.85, 0.66) : h > 0.33 ? vec3(1.1, 1.14, 0.86) : vec3(1.3, 1.16, 0.66);
      vec2 fe = abs(fract(q / vec2(26.0, 17.0)) - 0.5) * 2.0; float edge = smoothstep(0.78, 1.0, max(fe.x, fe.y));
      col = mix(col, mix(col * tint, col * 0.78, edge * 0.7), smoothstep(16.0, 45.0, tfOut) * 0.32);
    }
    surfaceAlbedo = pow(max(col, vec3(0.0)), vec3(2.2));
    vec3 tn = tfAccN / tfSum; float tz = sqrt(max(0.0, 1.0 - dot(tn.xy, tn.xy)));
    vec3 N = normalize(vNormalW); vec3 Tg = normalize(vec3(1.0, 0.0, 0.0) - N * N.x); vec3 Bg = cross(N, Tg);
    normalW = normalize(Tg * tn.x * tfFlags.z + Bg * tn.y * tfFlags.z + N * tz);
    if (tfFlags.x > 0.5) { tfRough = clamp(tfAccR / tfSum, 0.55, 1.0); tfAO = mix(1.0, tfAccAO / tfSum, 0.8); }
  }
  if (tfParams.x > 0.5 && abs(vPositionW.x) < tfParams.z && abs(vPositionW.z) < tfParams.w) {
    vec2 g = abs(fract(tfP + 0.5) - 0.5); vec2 fw = fwidth(tfP) * 1.2;
    float line = 1.0 - min(smoothstep(0.0, fw.x, g.x), smoothstep(0.0, fw.y, g.y));
    surfaceAlbedo *= 1.0 - line * 0.45;
  }
}
`,
          '!float roughness=reflectivityOut\\.roughness;': 'float roughness=tfRough;microSurface=1.0-roughness;aoOut.ambientOcclusionColor*=tfAO;',
        };
      }
    };
    return Plugin;
  }

  // ---- control maps ----
  function blur(src, w, h, r) {
    if (r < .5) return src;
    const out = new Float32Array(src.length), tmp = new Float32Array(src.length), R = Math.round(r), k = 1 / (2 * R + 1);
    for (let pass = 0; pass < 2; pass++) {
      const a = pass ? out : src;
      for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -R; x <= R; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) { tmp[row + x] = s * k; s += a[row + Math.min(w - 1, x + R + 1)] - a[row + Math.max(0, x - R)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -R; y <= R; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) { out[y * w + x] = s * k; s += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x]; } }
    }
    return out;
  }
  // the layer of every cell over the board and its margin
  function cellLayers(m) {
    const I = inner(), cx0 = Math.round(I.x0 + .5), cx1 = Math.round(I.x1 - .5), cz0 = Math.round(I.z0 + .5), cz1 = Math.round(I.z1 - .5);
    const dflt = defaultGround(m), R = window.tablefolkRoofs?.findRooms?.(), insideRoom = new Set();
    if (R && m !== 'rock') for (const r of R.rooms) for (const c of r.cells) insideRoom.add(c);
    const bx = WORLD.halfW - 1, bz = WORLD.halfH - 1, cells = new Map(), rimCells = [];
    // the dominant ground on the board's rim carries on outside it
    const count = new Map();
    for (let z = -bz; z <= bz; z++) for (let x = -bx; x <= bx; x++) {
      const p = paintAt(x, z), L = layerFor(p?.mat, m, insideRoom.has(x + ',' + z), dflt); cells.set(x + ',' + z, L);
      if (Math.abs(x) === bx || Math.abs(z) === bz) rimCells.push([x, z]);
      if ((Math.abs(x) === bx || Math.abs(z) === bz) && NATURAL.has(L)) count.set(L, (count.get(L) || 0) + 1);
    }
    let outside = m === 'street' ? 'cobblestone' : m === 'sea' ? 'sand' : m === 'rock' ? 'stone_floor_rough' : dflt;
    if (m === 'land' && count.size) outside = [...count].sort((a, b) => b[1] - a[1])[0][0];
    // an edge link (scenario.js state.edgeLinks): a dirt road runs on from its square on the rim
    const roads = m === 'rock' ? [] : (state.edgeLinks || []).filter(e => Array.isArray(e.road));
    const onRoad = (x, z) => roads.some(({ edge, road: [rx, rz] }) => { const out = edge === 'east' ? rx - x : edge === 'west' ? x - rx : edge === 'north' ? rz - z : z - rz, side = edge === 'east' || edge === 'west' ? Math.abs(z - rz) : Math.abs(x - rx); return out > 0 && side <= (out < 6 ? 1 : 0); });
    const off = (x, z) => onRoad(x, z) ? 'dirt_path' : rimSea(x, z) ? 'sand' : outside;
    return { cx0, cx1, cz0, cz1, at: (x, z) => cells.get(x + ',' + z) || off(x, z), outside };
  }
  function buildControl(m, maxLayers) {
    const C = cellLayers(m), W = (C.cx1 - C.cx0 + 1) * RES, H = (C.cz1 - C.cz0 + 1) * RES;
    // layers by use; past the limit a layer falls back to the closest-coloured kept one
    const use = new Map();
    for (let z = C.cz0; z <= C.cz1; z++) for (let x = C.cx0; x <= C.cx1; x++) { const L = C.at(x, z); use.set(L, (use.get(L) || 0) + 1); }
    let names = [...use].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const kept = names.slice(0, maxLayers), remap = new Map(kept.map(n => [n, n]));
    for (const n of names.slice(maxLayers)) { const c = mean(n); let best = kept[0], bd = 1e9; for (const k of kept) { const d = mean(k).reduce((s, v, i) => s + (v - c[i]) ** 2, 0); if (d < bd) { bd = d; best = k; } } remap.set(n, best); }
    names = kept;
    const idx = new Map(names.map((n, i) => [n, i])), L = names.length;
    const raw = names.map(() => new Float32Array(W * H));
    for (let z = C.cz0; z <= C.cz1; z++) for (let x = C.cx0; x <= C.cx1; x++) {
      const i = idx.get(remap.get(C.at(x, z))), ox = (x - C.cx0) * RES, oz = (z - C.cz0) * RES;
      for (let v = 0; v < RES; v++) raw[i].fill(1, (oz + v) * W + ox, (oz + v) * W + ox + RES);
    }
    const wide = raw.map(a => blur(a, W, H, RES * .5)), tight = raw.map(a => blur(a, W, H, RES * .14));
    const built = names.map(n => !NATURAL.has(n));
    const d0 = new Uint8Array(W * H * 4), d1 = new Uint8Array(W * H * 4), cols = [];
    for (let p = 0; p < W * H; p++) {
      let B = 0; for (let i = 0; i < L; i++) if (built[i]) B += wide[i][p];
      const t = Math.min(1, B * 2.2); let s = 0; const w = [];
      for (let i = 0; i < L; i++) { const v = wide[i][p] * (1 - t) + tight[i][p] * t; w.push(v); s += v; }
      for (let i = 0; i < L; i++) { const v = Math.round(w[i] / (s || 1) * 255); if (i < 4) d0[p * 4 + i] = v; else d1[p * 4 + i - 4] = v; }
    }
    const sc = state.scene, mk = (d, name) => { const t = new BABYLON.RawTexture(d, W, H, BABYLON.Engine.TEXTUREFORMAT_RGBA, sc, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE); t.name = name; t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; return t; };
    // world rect the map covers (cell edges)
    const ctrl = [C.cx0 - .5, C.cz0 - .5, 1 / (W / RES), 1 / (H / RES)];
    // per-vertex mean colour (the fallback before the textures load)
    const colorAt = (x, z) => { const u = Math.min(W - 1, Math.max(0, Math.floor((x - ctrl[0]) * RES))), v = Math.min(H - 1, Math.max(0, Math.floor((z - ctrl[1]) * RES))), p = v * W + u; const c = [0, 0, 0];
      for (let i = 0; i < L; i++) { const wv = (i < 4 ? d0[p * 4 + i] : d1[p * 4 + i - 4]) / 255, m2 = mean(names[i]); c[0] += wv * m2[0] ** 2.2; c[1] += wv * m2[1] ** 2.2; c[2] += wv * m2[2] ** 2.2; } return c; };
    return { names, tex: [mk(d0, 'terrain_ctrl0'), mk(d1, 'terrain_ctrl1')], ctrl, colorAt, outside: C.outside, at: (x, z) => remap.get(C.at(x, z)) || C.at(x, z) };
  }

  // ---- meshes ----
  function gridMesh(name, x0, x1, z0, z1, step, skip, hgt, colorAt) {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), P = [], Cc = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + i * step, z = z0 + j * step, y = hgt(x, z); P.push(x, y, z); const c = colorAt(x, z); Cc.push(c[0], c[1], c[2], 1); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (skip && skip(x0 + (i + .5) * step, z0 + (j + .5) * step)) continue;
      I.push(a, b, c, b, d, c);
    }
    const N = []; BABYLON.VertexData.ComputeNormals(P, I, N);
    const vd = new BABYLON.VertexData(); vd.positions = P; vd.indices = I; vd.normals = N; vd.colors = Cc;
    const m = new BABYLON.Mesh(name, state.scene); vd.applyToMesh(m, false);
    m.isPickable = false; m.receiveShadows = true;
    return m;
  }
  function seaCell(x, z) { return paintAt(x, z)?.mat === 'sea'; }
  // a vertex (on a half-cell lattice) dips under the water when every cell it
  // touches is sea (in sea mode the ground past the board is sea too)
  function boardHeight(x, z) {
    const xs = Math.abs(x - Math.round(x)) < .01 ? [Math.round(x)] : [Math.floor(x), Math.ceil(x)];
    const zs = Math.abs(z - Math.round(z)) < .01 ? [Math.round(z)] : [Math.floor(z), Math.ceil(z)];
    let land = false;
    for (const cx of xs) for (const cz of zs) {
      const on = Math.abs(cx) <= WORLD.halfW - 1 && Math.abs(cz) <= WORLD.halfH - 1;
      if (on ? !seaCell(cx, cz) : (T.mode !== 'sea' && !rimSea(cx, cz))) land = true;
    }
    if (!land) return outsideBoard(x, z) > .6 ? heightAt(x, z) : -.75;
    return outsideBoard(x, z) > 0 ? heightAt(x, z) : 0;
  }

  // ---- rock over everything outside the rooms (dungeons) ----
  function buildRock() {
    const R = window.tablefolkRoofs?.findRooms?.(); if (!R) return null;
    const top = (state.terrainTopY ?? 0) + wallH() + .03;
    const wallSet = new Set(); for (const b of state.blocks || []) { if (!b || b.isDisposed?.()) continue; const t = meta(b)?.type; if (t === 'wall' || t === 'door') wallSet.add(Math.round(b.position.x) + ',' + Math.round(b.position.z)); }
    const bx = WORLD.halfW - 1, bz = WORLD.halfH - 1, E = 10;
    // unexplored squares of a dark world are the same rock until the player finds them (darkness.js asks for a rebuild as it explores)
    const D = window.tablefolkDark, hid = (x, z) => !!(D?.on && !D.known(x, z));
    const isSolid = (x, z) => { const k = x + ',' + z; if (wallSet.has(k)) return false; if (Math.abs(x) > bx || Math.abs(z) > bz) return true; if (!R.outside?.has(k)) return false; const p = paintAt(x, z)?.mat; return !p || p === 'sea'; };
    const isRock = (x, z) => isSolid(x, z) || (!wallSet.has(x + ',' + z) && hid(x, z));
    const nearHid = (x, z) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dz]) => !wallSet.has((x + dx) + ',' + (z + dz)) && hid(x + dx, z + dz));
    T.rockCells = new Set(); for (let z = -bz; z <= bz; z++) for (let x = -bx; x <= bx; x++) if (isSolid(x, z)) T.rockCells.add(x + ',' + z);
    const isWall = (x, z) => wallSet.has(x + ',' + z) && !doorAt(x, z);
    const doorAt = (x, z) => (state.blocks || []).some(b => !b.isDisposed?.() && meta(b)?.type === 'door' && Math.round(b.position.x) === x && Math.round(b.position.z) === z);
    // half-cell quads: rock cells whole, and the half of a wall cell on the rock side
    // (the half of a wall cell is its own mesh, cut with the walls: left whole it stood as a row
    // of "teeth" over cut walls)
    const q = new Set(), qw = new Set(), qk = (i, j) => i + ',' + j;   // i, j: half-cell index, centre at (i/2 + .25 - .5 ...)
    for (let z = -bz - E; z <= bz + E; z++) for (let x = -bx - E; x <= bx + E; x++) {
      const rock = isRock(x, z), wall = isWall(x, z);
      if (!rock && !wall) continue;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (rock || isRock(x + sx, z) || isRock(x, z + sz) || (isRock(x + sx, z + sz) && isWall(x + sx, z) && isWall(x, z + sz))) {
          // (only a wall the player knows: an unexplored room's walls stay under whole rock)
          // (a wall beside an unexplored square counts as unexplored: in "rooms" reveal its cell is "known")
          const k = qk(2 * x + (sx > 0 ? 1 : 0), 2 * z + (sz > 0 ? 1 : 0)); q.add(k); if (!rock && !nearHid(x, z)) qw.add(k);
        }
      }
    }
    const G = [{ P: [], N: [], U: [], I: [] }, { P: [], N: [], U: [], I: [] }], tk = 1 / 2.2;
    let P, N, U, I;
    const quad = (pts, n, uvs) => { const b = P.length / 3; for (let k = 0; k < 4; k++) { P.push(...pts[k]); N.push(...n); U.push(...uvs[k]); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    for (const k of q) {
      ({ P, N, U, I } = G[qw.has(k) ? 1 : 0]);
      const [i, j] = k.split(',').map(Number), x0 = i / 2 - .5, x1 = x0 + .5, z0 = j / 2 - .5, z1 = z0 + .5;
      quad([[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], [[x0 * tk, z0 * tk], [x1 * tk, z0 * tk], [x1 * tk, z1 * tk], [x0 * tk, z1 * tk]]);
      const side = (has, pts, n, a0, a1) => { if (has) return; quad(pts, n, [[a0 * tk, 0], [a1 * tk, 0], [a1 * tk, top * tk], [a0 * tk, top * tk]]); };
      side(q.has(qk(i - 1, j)), [[x0, 0, z1], [x0, 0, z0], [x0, top, z0], [x0, top, z1]], [-1, 0, 0], z1, z0);
      side(q.has(qk(i + 1, j)), [[x1, 0, z0], [x1, 0, z1], [x1, top, z1], [x1, top, z0]], [1, 0, 0], z0, z1);
      side(q.has(qk(i, j - 1)), [[x0, 0, z0], [x1, 0, z0], [x1, top, z0], [x0, top, z0]], [0, 0, -1], x0, x1);
      side(q.has(qk(i, j + 1)), [[x1, 0, z1], [x0, 0, z1], [x0, top, z1], [x1, top, z1]], [0, 0, 1], x1, x0);
    }
    if (!G[0].P.length && !G[1].P.length) return null;
    const mk = (name, g, mat) => { const m = new BABYLON.Mesh(name, state.scene), vd = new BABYLON.VertexData(); vd.positions = g.P; vd.normals = g.N; vd.uvs = g.U; vd.indices = g.I; vd.applyToMesh(m); m.material = mat; m.isPickable = false; m.receiveShadows = true; return m; };
    const m = mk('board_rock', G[0].P.length ? G[0] : { P: [0, -9, 0, 0, -9, 0, 0, -9, 0], N: [0, 1, 0, 0, 1, 0, 0, 1, 0], U: [0, 0, 0, 0, 0, 0], I: [0, 1, 2] }, rockMaterial());
    if (G[1].P.length) { const w = mk('board_rock_wall', G[1], rockWallMaterial()); w.parent = m; }
    return m;
  }
  // the rock over walls' outer halves: cut like the walls (cutaway.js), its inside drawn dark
  function rockWallMaterial() {
    if (T.rockWallMat && !T.rockWallMat.isDisposed?.()) return T.rockWallMat;
    const m = rockMaterial().clone('board_rock_wall_mat'); m.backFaceCulling = false;
    window.tablefolkCutaway?.attach?.(m);
    return (T.rockWallMat = m);
  }
  function envTex(name, kind, srgb) {
    const t = new BABYLON.Texture(ENV() + name + '_' + kind + '_1k.webp', state.scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.gammaSpace = !!srgb; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8; return t;
  }
  function rockMaterial() {
    if (T.rockMat && !T.rockMat.isDisposed?.()) return T.rockMat;
    const m = new BABYLON.PBRMaterial('board_rock_mat', state.scene);
    m.albedoTexture = envTex('stone_wall_rubble', 'color', true); m.bumpTexture = envTex('stone_wall_rubble', 'normal'); m.bumpTexture.level = 1.2;
    m.invertNormalMapX = true; m.invertNormalMapY = false;
    m.albedoColor = new BABYLON.Color3(.42, .4, .38); m.metallic = 0; m.roughness = .95; m.backFaceCulling = true;   // single-sided: a close camera behind the player can sit inside the rock
    return (T.rockMat = m);
  }
  // open water around an island (and under sea cells)
  function seaMaterial() {
    if (T.seaMat && !T.seaMat.isDisposed?.()) return T.seaMat;
    const m = new BABYLON.PBRMaterial('sea_water_mat', state.scene);
    m.albedoColor = new BABYLON.Color3(.03, .07, .085); m.metallic = 0; m.roughness = .14; m.alpha = .88; m.environmentIntensity = .9; m.maxSimultaneousLights = 8; m._tfMatte = true;
    m.bumpTexture = envTex('mud', 'normal'); m.bumpTexture.level = .25; m.bumpTexture.uScale = m.bumpTexture.vScale = 40;
    return (T.seaMat = m);
  }

  // ---- ground cover: grass tufts, flowers, pebbles (thin instances) ----
  const COVER = (window.tablefolkPacks?.base || '/assets/') + 'models/props/env-nature/cover/';
  let coverModels = null;
  function loadCover() {
    coverModels ||= Promise.all(['grass_tufts', 'flowers', 'pebbles'].map(n => BABYLON.SceneLoader.ImportMeshAsync('', COVER, n + '.gltf', state.scene).then(r => {
      const meshes = r.meshes.filter(m => m.getTotalVertices?.() > 0);
      for (const m of meshes) { m.computeWorldMatrix(true); m.setParent(null); m.bakeCurrentTransformIntoVertices(); m.setEnabled(false); m.isPickable = false; m.receiveShadows = true;
        if (m.material) { LOOK()?.matte?.(m.material); m.material.backFaceCulling = false; m.material.maxSimultaneousLights = 8; } }
      for (const m of r.meshes) if (!meshes.includes(m)) m.dispose();
      return { kind: n, meshes };
    }))).catch(e => { console.warn('[terrain] cover', e); return []; });
    return coverModels;
  }
  const LOOK = () => window.TABLEFOLK_LOOK;
  async function buildCover(C) {
    for (const m of T.cover) try { m.dispose(); } catch {}
    T.cover = [];
    if (window.TABLEFOLK_TABLETOP || T.mode === 'rock' || T.mode === 'street' || /nocover/.test(location.search)) return;
    await window.tablefolkDressGate?.();
    const lite = !!GFX().lite, models = await loadCover(); if (!models.length) return;
    const blocked = new Set();
    for (const b of state.blocks || []) if (!b.isDisposed?.()) blocked.add(Math.round(b.position.x) + ',' + Math.round(b.position.z));
    const objs = new Set();
    for (const p of state.props || []) { if (!p || p.isDisposed?.()) continue; const pos = p.getAbsolutePosition?.() || p.position; objs.add(Math.round(pos.x) + ',' + Math.round(pos.z)); }
    const R = window.tablefolkRoofs?.findRooms?.(), inRoom = new Set(); if (R) for (const r of R.rooms) for (const c of r.cells) inRoom.add(c);
    const bx = WORLD.halfW - 1, bz = WORLD.halfH - 1, lists = new Map();
    let seed = 7919 + ((scn().seed | 0) * 131);
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const green = L => L === 'grass_meadow' || L === 'forest_floor' || L === 'grass_dry';
    const push = (kind, mi, x, z, s, ry) => { const k = kind + ':' + mi; if (!lists.has(k)) lists.set(k, []); const pt = patchAt(x, z), dry = sm(.5, .8, pt) * .75, lush = sm(.5, .82, 1 - pt) * .5;
      const col = kind === 'grass_tufts' ? [(1 + .2 * dry - .14 * lush) * 1.25, (1 + .12 * dry + .04 * lush) * 1.25, (1 - .26 * dry - .14 * lush) * 1.15] : kind === 'pebbles' ? [1.25, 1.22, 1.18] : [1, 1, 1];
      lists.get(k).push([BABYLON.Matrix.Compose(new BABYLON.Vector3(s, s, s), BABYLON.Quaternion.RotationYawPitchRoll(ry, 0, 0), new BABYLON.Vector3(x, 0, z)), col]); };
    let total = 0; const CAP = lite ? 500 : 3500;
    for (let z = -bz - 3; z <= bz + 3; z++) for (let x = -bx - 3; x <= bx + 3; x++) {
      const k = x + ',' + z; if (blocked.has(k) || inRoom.has(k) || seaCell(x, z)) continue;
      const L = C.at(x, z), onBoard = Math.abs(x) <= bx && Math.abs(z) <= bz;
      if (!green(L)) { if (NATURAL.has(L) && rnd() < .08) push('pebbles', (rnd() * 5) | 0, x + rnd() - .5, z + rnd() - .5, .7 + rnd() * .6, rnd() * 6.28); continue; }
      // edges: next to a path, a wall or a built floor
      // edges: next to a path, a wall or a built floor. Tufts gather toward
      // a wall's foot but keep off a path (the blend wanders ~.3 cell into it)
      let edge = 0; const lim = { x0: -.5, x1: .5, z0: -.5, z1: .5 };
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = C.at(x + dx, z + dz), wall = blocked.has((x + dx) + ',' + (z + dz));
        if (!green(n) || wall) edge++;
        if (!green(n) && !wall) { if (dx > 0) lim.x1 = .05; if (dx < 0) lim.x0 = -.05; if (dz > 0) lim.z1 = .05; if (dz < 0) lim.z0 = -.05; }
      }
      const px = () => x + lim.x0 + rnd() * (lim.x1 - lim.x0), pz = () => z + lim.z0 + rnd() * (lim.z1 - lim.z0);
      // open grass: a tuft on about one cell in three (from above the cards read as dark specks); edges keep their clumps
      const busy = objs.has(k) ? .5 : 1, n = lite ? 0 : edge ? Math.round((.6 + edge * 1.5) * busy) : (rnd() < .33 * (onBoard ? 1 : .6) ? 1 : 0);
      for (let i = 0; i < n; i++) push('grass_tufts', (rnd() * 4) | 0, px(), pz(), .6 + rnd() * .6, rnd() * 6.28);
      if (!lite && rnd() < .22 + edge * .08) push('flowers', (rnd() * 3) | 0, px(), pz(), .8 + rnd() * .5, rnd() * 6.28);
      if ((edge || objs.has(k)) && rnd() < .14) push('pebbles', (rnd() * 5) | 0, x + rnd() - .5, z + rnd() - .5, .7 + rnd() * .6, rnd() * 6.28);
    }
    for (const [k, list] of lists) {
      const [kind, mi] = k.split(':'), src = models.find(m => m.kind === kind)?.meshes[+mi]; if (!src) continue;
      const use = list.slice(0, Math.max(0, CAP - total)); total += use.length; if (!use.length) continue;
      const m = src.clone('board_cover_' + kind + '_' + mi); m.makeGeometryUnique(); m.setEnabled(true);
      const buf = new Float32Array(use.length * 16), cb = new Float32Array(use.length * 4); use.forEach(([mx, c], i) => { mx.copyToArray(buf, i * 16); cb.set([c[0], c[1], c[2], 1], i * 4); });
      m.thinInstanceSetBuffer('matrix', buf, 16, true); m.thinInstanceSetBuffer('color', cb, 4, true); m.thinInstanceRefreshBoundingInfo(false); m.isPickable = false;
      T.cover.push(m);
    }
    window.tablefolkDiag?.note?.('terrain', `ground cover: ${total} tufts, flowers and pebbles`);
  }

  // ---- (re)build ----
  let busy = null, again = false;
  let debounce = null, lastKey = '';
  let rebuildWaiters = [];
  function rebuild() {
    // world construction asks many times in a few hundred ms: build once after the last request
    // (every caller's promise settles with that build: the loading cover waits on one)
    clearTimeout(debounce);
    return new Promise(res => { rebuildWaiters.push(res); debounce = setTimeout(() => { const w = rebuildWaiters; rebuildWaiters = []; const p = rebuildNow(); for (const r of w) r(p); }, 120); });
  }
  function rebuildNow() {
    if (busy) { again = true; return busy; }
    busy = (async () => {
      try { await build(); } catch (e) { console.error('[terrain]', e); }
      busy = null; if (again) { again = false; return rebuildNow(); }
    })();
    return busy;
  }
  // start-up profiling: window.__tfMarks (ms summed per part, and counts)
  window.tfMark = window.tfMark || ((k, t0) => { const m = (window.__tfMarks ||= {}); const d = performance.now() - t0; m[k] = +((m[k] || 0) + d).toFixed(1); m[k + '#'] = (m[k + '#'] || 0) + 1; });
  async function build() {
    const sc = state.scene; if (!sc) return;
    const tB = performance.now();
    await loadManifest();
    T.mode = mode();
    const lite = !!GFX().lite, hi = GFX().quality === 'high', maxL = lite ? 4 : 8;
    // nothing changed (same size, mode, cell layers, walls): keep everything
    const inKey = [WORLD.cols, WORLD.rows, T.mode, lite, hi, [...(state.paint || [])].map(([k, v]) => k + v.mat).join(), (state.blocks || []).length, T.grid, JSON.stringify(state.edgeLinks || [])].join('|');
    if (inKey === lastKey && T.mesh && !T.mesh.isDisposed()) return;
    lastKey = inKey;
    const tC = performance.now(); const C = buildControl(T.mode, maxL); tfMark('terrain.control', tC);
    const I = inner();
    const sig = [WORLD.cols, WORLD.rows, T.mode, [...(state.paint || [])].filter(([, v]) => v.mat === 'sea').map(([k]) => k).join(';')].join('|');
    // meshes: rebuilt when the size, mode or sea changes; recoloured otherwise
    if (sig !== T.sig || !T.mesh || T.mesh.isDisposed()) {
      for (const m of [T.mesh, T.far, T.sea]) try { m?.dispose(); } catch {}
      T.sig = sig;
      T.mesh = gridMesh('board_terrain', I.x0, I.x1, I.z0, I.z1, .5, null, boardHeight, C.colorAt);
      const step = lite ? 4 : 2, F = Math.ceil(FAR / step) * step;   // 2 m below light: 3 m faceted the hills in the haze
      const far = T.mode === 'none' ? null : T.mode === 'rock' ? 24 : T.mode === 'street' ? 40 : F;
      T.far = far ? gridMesh('board_terrain_far', -far - WORLD.halfW, far + WORLD.halfW, -far - WORLD.halfH, far + WORLD.halfH, step,
        (x, z) => x > I.x0 + step && x < I.x1 - step && z > I.z0 + step && z < I.z1 - step,
        (x, z) => (x > I.x0 && x < I.x1 && z > I.z0 && z < I.z1) ? -.04 : heightAt(x, z), C.colorAt) : null;
      const anySea = [...(state.paint || [])].some(([, v]) => v.mat === 'sea');
      if (T.mode === 'sea' || (anySea && T.mode !== 'rock')) {   // a dungeon's 'sea' squares are under the rock
        const S = 900;
        T.sea = BABYLON.MeshBuilder.CreateGround('sea', { width: S, height: S, subdivisions: 1 }, sc);
        T.sea.position.y = -.22; T.sea.material = seaMaterial(); T.sea.isPickable = false; T.sea.receiveShadows = true;
        state.seaLevel = T.sea.position.y;
      } else T.sea = null;
    } else {
      // recolour only
      for (const m of [T.mesh, T.far]) if (m) { const p = m.getVerticesData(BABYLON.VertexBuffer.PositionKind), c = new Float32Array(p.length / 3 * 4); for (let i = 0; i < p.length / 3; i++) { const v = C.colorAt(p[i * 3], p[i * 3 + 2]); c.set([v[0], v[1], v[2], 1], i * 4); } m.setVerticesData(BABYLON.VertexBuffer.ColorKind, c); }
    }
    // the material
    if (!T.mat || T.mat.isDisposed?.()) {
      const m = new BABYLON.PBRMaterial('board_terrain_mat', sc);
      m.albedoColor = new BABYLON.Color3(1, 1, 1); m.metallic = 0; m.roughness = .92; m.environmentIntensity = .45; m.maxSimultaneousLights = 8; m._tfMatte = true;
      T.mat = m;
    }
    for (const m of [T.mesh, T.far]) if (m) m.material = T.mat;
    for (const t of T.ctrl) try { t.dispose(); } catch {}
    T.ctrl = C.tex; T.layers = C.names;
    // rock
    try { T.rock?.dispose(); } catch {} T.rockCells = null; T.rock = T.mode === 'rock' ? buildRock() : null;
    window.tablefolkDark?.update?.();
    state.boardMeshes = [T.mesh, T.far, T.rock, T.sea].filter(Boolean);
    window.tablefolkSky?.setWorld?.(T.mode === 'rock' ? { underground: true, fogNear: 6, fogFar: 26 } : T.mode === 'street' ? { underground: false, indoor: true, hills: false, fogNear: 8, fogFar: 32 } : { underground: false, indoor: false, hills: T.mode !== 'sea', fogNear: 30, fogFar: 200 });
    // the textures (WebGPU only: the plugin's WGSL); kept while the layer set is the same
    const key = C.names.join(',') + '|' + (hi ? 2 : 1);
    // the textures wait until the world has started (the mean-colour ground shows until then), so they are
    // decoded once, off the world's critical path
    if (!/notex/.test(location.search) && (T.started || !window.tablefolkScenario)) {
      if (key !== T.arraysKey) {
        T.arraysKey = key;
        const tA = performance.now(); const arr = await buildArrays(C.names, hi); tfMark('terrain.arrays(async)', tA);
        if (T.arraysKey !== key) { arr.alb.dispose(); arr.nrm.dispose(); return; }
        if (T.arrays) { T.arrays.alb.dispose(); T.arrays.nrm.dispose(); }
        T.arrays = arr;
      }
      const P = T.mat._tfTerrain ||= new (pluginClass())(T.mat);
      const tiles = [0, 1, 2, 3, 4, 5, 6, 7].map(i => 1 / tile(C.names[i] || C.names[0]));
      P.u.ctrl = C.ctrl; P.u.t0 = tiles.slice(0, 4); P.u.t1 = tiles.slice(4, 8);
      P.u.p = [0, .32, WORLD.halfW - .5, WORLD.halfH - .5];
      P.u.f = [lite ? 0 : 1, .9, lite ? .8 : 1, .16];
      const kindOf = n => !n ? 1 : n === 'dirt_path' ? 2 : NATURAL.has(n) ? 1 : 0, ks = [0, 1, 2, 3, 4, 5, 6, 7].map(i => kindOf(C.names[i]));
      P.u.k0 = ks.slice(0, 4); P.u.k1 = ks.slice(4); P.u.x = [T.mode === 'land' && kindFor() !== 'forest' ? 1 : 0, 0, 0, 0];
      P.tex = { tfCtrl0Sampler: C.tex[0], tfCtrl1Sampler: C.tex[1], tfAlbSampler: T.arrays.alb, tfNrmSampler: T.arrays.nrm };
    }
    tfMark('terrain.build(async)', tB);
    const tCv = performance.now(); T.coverP = buildCover(C).then(() => tfMark('terrain.cover(async)', tCv)).catch(e => console.warn('[terrain] cover', e));
    window.dispatchEvent(new CustomEvent('tablefolk-terrain', { detail: { mode: T.mode, layers: C.names } }));
  }
  function setGrid(on) { T.grid = !!on; }
  T.grid = !!(GFX().showGrid || window.TABLEFOLK_TABLETOP);
  // the world is finished (walls, rooms, scenario): build once more with all of it
  // (the loading cover waits for it: ground textures and ground cover, loading.js)
  addEventListener('tablefolk-scenario-started', () => { T.started = true; lastKey = ''; const done = window.tablefolkLoading?.begin('ground'); setTimeout(() => rebuild().then(() => T.coverP).finally(() => done?.()), 400); });
  addEventListener('tablefolk-scenario-exit', () => { T.started = false; });
  // water a walker would fall into: a sea cell, or past the board's edge where the sea is
  function waterAt(x, z) {
    const cx = Math.round(x), cz = Math.round(z), on = Math.abs(cx) <= WORLD.halfW - 1 && Math.abs(cz) <= WORLD.halfH - 1;
    return on ? seaCell(cx, cz) : (T.mode === 'sea' || rimSea(cx, cz));
  }
  // darkness.js: the explored area grew; the rock over unexplored rooms follows (throttled)
  let rockTimer = null;
  function refreshRock() { if (T.mode !== 'rock' || rockTimer) return; rockTimer = setTimeout(() => { rockTimer = null; try { const old = T.rock; T.rock = buildRock(); old?.dispose(); state.boardMeshes = [T.mesh, T.far, T.rock, T.sea].filter(Boolean); } catch (e) { console.warn('[terrain] rock', e); } }, 350); }
  window.tablefolkTerrain = { rebuild, refreshRock, mode: () => T.mode, heightAt, waterAt, isRock: (x, z) => T.mode === 'rock' && !!T.rockCells?.has(Math.round(x) + ',' + Math.round(z)), setGrid, setHoles: h => { T.holes = (h || []).slice(0, 4); }, layerAt: (x, z) => cellLayers(T.mode).at(Math.round(x), Math.round(z)), get layers() { return T.layers; }, get state() { return T; } };
})();
