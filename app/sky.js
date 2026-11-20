/* sky.js -- the light, the sky and the time of day (2026-11-20).
 *
 * One directional light is the sun by day and the moon by night (its
 * direction, colour and intensity change; it is never added or removed: a
 * light added or taken away recompiles every material), with one shadow map
 * fitted to the area around the camera's target (PCF; 2048 at medium/high,
 * 1024 refreshed every second frame at light). A hemispheric light is the
 * sky's fill. Local lights (lamps, fires, spells, lava) are untouched.
 *
 *   tablefolkSky.setTimeOfDay(hours)   0-24: sun or moon, colours, fog, sky
 *   tablefolkSky.setLighting(mode)     a scenario's "lighting": bright 10:00,
 *                                      dim 19:00, night 23:00 (moonlit)
 *   tablefolkSky.setWorld({ underground, fogNear, fogFar, sky })
 *        underground: no sun or sky, a faint cool fill, black fog (dungeons,
 *        caves); fogFar: where the haze is complete, past the camera's target
 *   window.tablefolkLook.setTimeOfDay is the same function; app.js publishes
 *   it as tablefolk.setTimeOfDay (the world clock, clock.js, calls that).
 *
 * The sky is a dome with a gradient painted for the hour (its horizon is the
 * fog colour, so the land fades into it), stars at night, a sun or moon disc
 * and a sheet of soft clouds drifting overhead. Fog is linear and starts a
 * little past the camera's target, so the board stays clear at any zoom and
 * the land beyond fades out. Loaded before app.js; app.js main() calls
 * init(scene, camera).
 */
(function () {
  'use strict';
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  const hex = h => BABYLON.Color3.FromHexString(h);
  const GFX = () => window.TABLEFOLK_GFX || {};
  let sc = null, cam = null, sun = null, hemi = null, shadow = null, dome = null, domeTex = null, clouds = null, cloudMat = null, disc = null, discMat = null;
  let hours = 10, world = { underground: false, fogNear: 6, fogFar: 140, sky: true }, painted = '', cur = null;

  // keyframes: hour, sun colour, sun intensity, moon intensity, sky top, horizon, hemi sky, hemi ground, hemi intensity, environment, exposure, clouds, stars
  const K = (h, sunC, sunI, moonI, top, hor, hs, hg, hi, env, exp, cl, stars) => ({ h, sunC: hex(sunC), sunI, moonI, top: hex(top), hor: hex(hor), hs: hex(hs), hg: hex(hg), hi, env, exp, cl: hex(cl), stars });
  const KEYS = [
    // pass 2 (2026-11-20): brighter, clearer days; blue-warm haze; golden 17:30; blue-violet dusk; moonlit blue night
    K(0, '#ffffff', 0, .75, '#0b1430', '#25345c', '#6a82c0', '#1a1c26', .55, .18, 1.3, '#2c3656', 1),
    K(4.6, '#ffffff', 0, .7, '#0e1834', '#2c3a62', '#6a82c0', '#1a1c26', .52, .18, 1.3, '#303a5a', .9),
    K(5.7, '#ffa47a', .8, .1, '#4a6094', '#e6b49c', '#a0a4c0', '#4a4038', .5, .3, 1.15, '#e0a898', .25),
    K(7, '#ffe2c0', 3.0, 0, '#5a8ad0', '#d6dfe8', '#b4c4de', '#5a5040', .62, .5, 1.12, '#f6eee6', 0),
    K(10, '#fff2dc', 3.6, 0, '#4a82d0', '#d2e0ee', '#bccce6', '#5e5444', .7, .55, 1.12, '#ffffff', 0),
    K(15, '#fff0d8', 3.6, 0, '#4a82d0', '#d4e0ec', '#bccce6', '#5e5444', .7, .55, 1.12, '#ffffff', 0),
    K(16.6, '#ffe0b4', 3.3, 0, '#5684cc', '#e2dccc', '#c0c4d4', '#5e5040', .65, .5, 1.12, '#fff0e0', 0),
    K(17.5, '#ffb468', 2.9, 0, '#6a88c0', '#f4c48c', '#d0bcb0', '#5a4434', .6, .45, 1.15, '#ffd2a0', 0),
    K(18.6, '#ff8a52', 1.2, 0, '#46508a', '#e09a78', '#a69cb8', '#3a3036', .5, .32, 1.2, '#d89a88', .1),
    K(19.4, '#ff6a48', .15, .1, '#262e66', '#7a6496', '#7a7cb8', '#262434', .5, .26, 1.3, '#6a5a86', .35),
    K(20.4, '#ffffff', 0, .6, '#101a3c', '#2c3c66', '#6a80bc', '#1c1e28', .52, .2, 1.3, '#323c5e', .8),
    K(24, '#ffffff', 0, .75, '#0b1430', '#25345c', '#6a82c0', '#1a1c26', .55, .18, 1.3, '#2c3656', 1),
  ];
  const MOON_C = C3(.62, .72, 1.0);
  const lerp = (a, b, k) => a + (b - a) * k;
  const lc = (a, b, k) => C3(lerp(a.r, b.r, k), lerp(a.g, b.g, k), lerp(a.b, b.b, k));
  function at(h) {
    h = ((h % 24) + 24) % 24;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = (h - a.h) / Math.max(1e-6, b.h - a.h), o = {};
    for (const key of Object.keys(a)) o[key] = typeof a[key] === 'number' ? lerp(a[key], b[key], k) : lc(a[key], b[key], k);
    return o;
  }
  // where the sun is: rises in the east (-x), highest in the south (+z, the
  // default follow camera's side: faces toward the camera are lit and
  // shadows fall away from the viewer, to the side and back), sets in the west
  // (+x); morning from the south-east, evening from the south-west
  function sunVector(h) {
    const t = Math.min(1, Math.max(0, (h - 5.6) / 13.2)), E = Math.max(.05, Math.sin(Math.PI * t)) * 0.95, A = Math.PI * t;
    return new BABYLON.Vector3(-Math.cos(A) * Math.cos(E), Math.sin(E), Math.sin(A) * Math.cos(E) * .85 + .3).normalize();
  }
  const MOON_V = new BABYLON.Vector3(.4, .78, .45).normalize();

  // ---- the dome's picture for an hour ----
  function paintDome(L) {
    const key = [L.top, L.hor].map(c => c.toHexString()).join() + (L.stars > .02 ? (L.stars * 10 | 0) : 0);
    if (key === painted || !domeTex) return; painted = key;
    const c = domeTex.getContext(), W = 512, H = 256;
    const g = c.createLinearGradient(0, 0, 0, H);
    const top = L.top.toHexString(), hor = L.hor.toHexString(), mid = lc(L.top, L.hor, .55).toHexString();
    // v runs up the sphere: the canvas top is the zenith
    g.addColorStop(0, top); g.addColorStop(.32, mid); g.addColorStop(.47, hor); g.addColorStop(1, hor);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (L.stars > .02) {
      let s = 9137; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 420; i++) { const x = r() * W, y = r() * H * .44, a = (.25 + r() * .75) * L.stars * (1 - y / (H * .5)); c.fillStyle = `rgba(255,250,240,${a.toFixed(3)})`; c.fillRect(x, y, r() < .1 ? 1.6 : 1, r() < .1 ? 1.6 : 1); }
    }
    domeTex.update(false);
  }
  function cloudTexture() {
    const N = 256, t = new BABYLON.DynamicTexture('sky_clouds', { width: N, height: N }, sc, true), c = t.getContext(), img = c.createImageData(N, N);
    const oct = (cells, seed) => { let s = seed; const r = new Float32Array(cells * cells).map(() => (s = (s * 16807) % 2147483647) / 2147483647);
      return (x, y) => { const fx = x / N * cells, fy = y / N * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), v = (a, b) => r[((b % cells) + cells) % cells * cells + ((a % cells) + cells) % cells];
        return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy; }; };
    const o = [[oct(4, 11), .5], [oct(8, 23), .27], [oct(16, 37), .15], [oct(32, 51), .08]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0; for (const [f, w] of o) v += f(x, y) * w;
      const a = Math.max(0, Math.min(1, (v - .5) * 3.2)), i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * a * (3 - 2 * a) * 255;
    }
    c.putImageData(img, 0, 0); t.update(false); t.hasAlpha = true; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return t;
  }
  function discTexture() {
    const N = 128, t = new BABYLON.DynamicTexture('sky_disc', { width: N, height: N }, sc, true), c = t.getContext();
    const g = c.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.11, 'rgba(255,255,255,1)'); g.addColorStop(.14, 'rgba(255,255,255,.35)'); g.addColorStop(.4, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, N, N); t.update(false); t.hasAlpha = true;
    return t;
  }
  function buildSky() {
    const tabletop = !!window.TABLEFOLK_TABLETOP;
    domeTex = new BABYLON.DynamicTexture('sky_dome_tex', { width: 512, height: 256 }, sc, false);
    const m = new BABYLON.StandardMaterial('sky_mat', sc);
    m.emissiveTexture = domeTex; m.diffuseColor = C3(0, 0, 0); m.specularColor = C3(0, 0, 0); m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false;
    dome = BABYLON.MeshBuilder.CreateSphere('sky_dome', { diameter: 1000, segments: 16, sideOrientation: BABYLON.Mesh.BACKSIDE }, sc);
    dome.material = m; dome.isPickable = false; dome.infiniteDistance = true; dome.applyFog = false; dome.renderingGroupId = 0; dome.alphaIndex = -1000;
    if (tabletop) dome.setEnabled(false);
    // clouds: a sheet overhead that fades out toward the horizon (vertex alpha)
    clouds = BABYLON.MeshBuilder.CreateGround('sky_clouds', { width: 900, height: 900, subdivisions: 24 }, sc);
    const pos = clouds.getVerticesData(BABYLON.VertexBuffer.PositionKind), col = [];
    for (let i = 0; i < pos.length; i += 3) { const r = Math.hypot(pos[i], pos[i + 2]) / 450, a = Math.max(0, 1 - r) ** 1.4; col.push(1, 1, 1, a); }
    clouds.setVerticesData(BABYLON.VertexBuffer.ColorKind, col); clouds.hasVertexAlpha = true;
    cloudMat = new BABYLON.StandardMaterial('sky_clouds_mat', sc);
    const ct = cloudTexture(); ct.uScale = ct.vScale = 3;
    cloudMat.opacityTexture = ct; cloudMat.diffuseColor = C3(0, 0, 0); cloudMat.specularColor = C3(0, 0, 0); cloudMat.emissiveColor = C3(1, 1, 1);
    cloudMat.disableLighting = true; cloudMat.backFaceCulling = false; cloudMat.fogEnabled = false; cloudMat.useVertexColors = true; cloudMat.alpha = .85; cloudMat.disableDepthWrite = true;
    clouds.material = cloudMat; clouds.position.y = 110; clouds.infiniteDistance = true; clouds.isPickable = false; clouds.alphaIndex = -900;
    if (tabletop) clouds.setEnabled(false);
    discMat = new BABYLON.StandardMaterial('sky_disc_mat', sc);
    const dt = discTexture(); discMat.opacityTexture = dt; discMat.emissiveTexture = dt; discMat.diffuseColor = C3(0, 0, 0); discMat.specularColor = C3(0, 0, 0);
    discMat.disableLighting = true; discMat.fogEnabled = false; discMat.alphaMode = BABYLON.Engine.ALPHA_ADD; discMat.disableDepthWrite = true;
    disc = BABYLON.MeshBuilder.CreatePlane('sky_sun', { size: 60 }, sc); disc.material = discMat; disc.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
    disc.infiniteDistance = true; disc.isPickable = false; disc.alphaIndex = -800;
    if (tabletop) disc.setEnabled(false);
    if (!window.TABLEFOLK_STILL_MODE) sc.onBeforeRenderObservable.add(() => { const t = performance.now() * 1e-6; ct.uOffset = (t * 4) % 1; ct.vOffset = (t * 1.5) % 1; });
  }

  // ---- the sun's shadow map ----
  function buildShadow() {
    const q = GFX().quality, lite = !!GFX().lite, url = new URLSearchParams(location.search).get('sunshadow');
    const on = url != null ? url !== '0' : (lite ? GFX().sunShadowLight !== false : GFX().sunShadow !== false);
    if (!on || window.TABLEFOLK_TABLETOP) return null;
    const size = lite ? 1024 : 2048;
    const g = new BABYLON.ShadowGenerator(size, sun);
    g.usePercentageCloserFiltering = true;
    g.filteringQuality = q === 'high' ? BABYLON.ShadowGenerator.QUALITY_HIGH : lite ? BABYLON.ShadowGenerator.QUALITY_LOW : BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    g.bias = .0006; g.normalBias = .012; g.darkness = 0; g.transparencyShadow = true; g.useOpacityTextureForTransparentShadow = true;
    // every second frame below high (the shadow pass draws every caster again: 442 -> 200 draws in the market village)
    if (q !== 'high') { const map = g.getShadowMap(); if (map) map.refreshRate = 2; }
    sun.autoUpdateExtends = false; sun.autoCalcShadowZBounds = false; sun.shadowMinZ = 1; sun.shadowMaxZ = 240;
    return g;
  }
  // fit the shadow map around what the camera looks at; snapped to whole
  // shadow texels so it doesn't shimmer as the camera glides
  const tmp = { r: new BABYLON.Vector3(), u: new BABYLON.Vector3() };
  function fitShadow() {
    if (!sun || !cam) return;
    const target = cam.target || cam.getTarget?.() || BABYLON.Vector3.Zero();
    const rad = state?.firstPerson ? 14 : Math.min(70, Math.max(10, (cam.radius || 16) * 1.05));
    const R = Math.ceil(rad / 4) * 4, size = R * 2;
    sun.shadowFrustumSize = size;
    const d = sun.direction, up = Math.abs(d.y) > .98 ? BABYLON.Axis.X : BABYLON.Axis.Y;
    BABYLON.Vector3.CrossToRef(up, d, tmp.r); tmp.r.normalize(); BABYLON.Vector3.CrossToRef(d, tmp.r, tmp.u);
    const texel = size / (shadow?.getShadowMap()?.getSize().width || 2048);
    const a = Math.round(BABYLON.Vector3.Dot(target, tmp.r) / texel) * texel, b = Math.round(BABYLON.Vector3.Dot(target, tmp.u) / texel) * texel, c = BABYLON.Vector3.Dot(target, d);
    const ctr = tmp.r.scale(a).addInPlace(tmp.u.scale(b)).addInPlace(d.scale(c));
    sun.position.copyFrom(ctr.subtract(d.scale(120)));
  }
  function fitFog() {
    if (!sc || !cam || window.TABLEFOLK_TABLETOP) return;
    if (sc._tfFogHeld) return;   // darkness.js's first-person black fog
    const r = state?.firstPerson ? 4 : (cam.radius || 16);
    sc.fogStart = r + world.fogNear; sc.fogEnd = r + world.fogNear + world.fogFar;
  }

  function apply(h) {
    if (!sc || !sun) return;
    hours = ((+h % 24) + 24) % 24;
    const L = cur = at(hours), u = world.underground;
    const day = L.sunI >= L.moonI;
    const dir = (day ? sunVector(hours) : MOON_V).scale(-1);
    sun.direction.copyFrom(dir);
    sun.diffuse = day ? L.sunC : MOON_C; sun.specular = sun.diffuse.scale(.5);
    sun.intensity = u ? 0 : (day ? L.sunI : L.moonI);
    hemi.diffuse = u ? C3(.5, .58, .78) : L.hs; hemi.groundColor = u ? C3(.14, .14, .17) : L.hg;
    hemi.intensity = u ? .32 : L.hi;   // underground: a faint cool ambient, unlit explored stone dim but legible
    sc.environmentIntensity = u ? .1 : L.env;
    const ip = sc.imageProcessingConfiguration; ip.exposure = u ? 1.25 : L.exp;
    // haze: the horizon colour leaned a little blue (aerial perspective)
    const fog = u ? C3(0, 0, 0) : lc(L.hor, C3(.62, .72, .86), .18 * Math.min(1, L.sunI / 2));
    sc.fogColor = fog; sc.clearColor = new BABYLON.Color4(fog.r, fog.g, fog.b, 1);
    if (dome) { dome.setEnabled(!u && world.sky && !window.TABLEFOLK_TABLETOP); paintDome(L); }
    if (cloudMat) { cloudMat.emissiveColor = L.cl; cloudMat.alpha = .75; clouds.setEnabled(!u && world.sky && !window.TABLEFOLK_TABLETOP); }
    if (disc) {
      const v = day ? sunVector(hours) : MOON_V, low = Math.max(0, Math.min(1, v.y / .25));
      disc.position.copyFrom(v.scale(420));
      disc.scaling.setAll(day ? 1 : .55);
      discMat.emissiveColor = day ? lc(C3(1, .55, .3), C3(1, .95, .85), low).scale(Math.min(1, L.sunI)) : C3(.75, .8, .9).scale(Math.min(1, L.moonI * 1.6));
      disc.setEnabled(!u && world.sky && !window.TABLEFOLK_TABLETOP && (day ? L.sunI > .05 : L.moonI > .05));
    }
    window.tablefolkWalls?.setNight?.(day ? Math.max(0, Math.min(1, (2.2 - L.sunI) / 1.8)) : 1);
  }

  function setTimeOfDay(h) { apply(h); }
  const LIGHTING_HOURS = { bright: 10, dim: 19, night: 23 };
  function setLighting(mode) { apply(LIGHTING_HOURS[mode] ?? 10); }
  function setWorld(o) { Object.assign(world, o || {}); apply(hours); fitFog(); }

  function init(scene, camera) {
    sc = scene; cam = camera;
    hemi = new BABYLON.HemisphericLight('sky_fill', new BABYLON.Vector3(0, 1, 0), sc);
    hemi.specular = C3(0, 0, 0);
    sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-.4, -.8, .4), sc);
    sun.position = new BABYLON.Vector3(0, 60, 0);
    shadow = buildShadow();
    sc.fogMode = BABYLON.Scene.FOGMODE_LINEAR; sc.fogStart = 30; sc.fogEnd = 170;
    if (window.TABLEFOLK_TABLETOP) sc.fogMode = BABYLON.Scene.FOGMODE_NONE;
    buildSky();
    apply(10);
    sc.onBeforeRenderObservable.add(() => { cam = sc.activeCamera || cam; fitShadow(); fitFog(); });
    return { sun, hemi, shadow };
  }

  const api = { init, setTimeOfDay, setLighting, setWorld, at, get hours() { return hours; }, get sun() { return sun; }, get hemi() { return hemi; }, get shadow() { return shadow; }, get world() { return world; } };
  window.tablefolkSky = api;
  window.tablefolkLook = Object.assign(window.tablefolkLook || {}, { setTimeOfDay });
})();
