/* spells.js -- fireball, lightning and spawn: what they do, how they look
 * and how they sound.
 *
 *   fireball(target?)   lightning(target?)   spawn(thing[, how many])
 *
 * Allowed in a scenario as "spell.fireball", "spell.lightning" and "spawn"
 * (app.js COMMANDS; parseLLMCommandLine turns fireball(x) / lightning(x) into
 * {kind:'spell', spell, target} and spawn(x, n) into {kind:'spawn'}).
 * With a target (a character, the player, or a thing by name) the spell hits
 * it (fireball 3 damage and burns things nearby, lightning 4) and the caster
 * takes 1 from the backlash (combat.js hurt). Without one (or naming himself,
 * or a target that can't be found) it comes back on the caster: the fireball
 * goes up and falls on him (3), the lightning strikes him (4). On purpose: a
 * tiny model that forgets the target hurts itself.
 * spawn(thing, n) makes 1-6 of an object (pack items, crate, barrel, lamp,
 * mushroom, campfire, ...) appear on free cells in front of the caster; an
 * unknown thing (or the placeholder "thing") conjures a random small object
 * (no error is shown or said).
 *
 * Graphics: Babylon particle systems (GPU particles when supported and the
 * quality is above light; CPU ones, fewer, at light), unlit emissive meshes
 * with additive blending (light quality has no glow layer), flickering point
 * lights joined to scenery.js's light budget, a branching bolt rebuilt for
 * each flash, a sky flash (the global lights and a faint screen flash),
 * shockwave rings, scorch marks that fade, a small camera shake. Everything
 * is disposed when it is done.
 * Sound: synthesized Web Audio on sfx.js's context. Each sound is a source in
 * an HRTF PannerNode at the effect (the fireball's moves with it); the
 * listener is at the player's head (the camera in first person, else the
 * avatar or camera target), turned the way the camera looks, updated every
 * frame while a sound plays; a short shared reverb. Muted with the other
 * sound effects (sfx.js enabled).
 *
 *   window.tablefolkSpells = { cast(g, spell, target), spawn(g, thing, n),
 *     fireballVfx(from, to), resolveThing(name) }
 *
 * Loaded after app.js and combat.js; uses app.js globals (state, meta,
 * playRig, faceToward, cellPassable, makeCatalogItem, ITEM_CATALOG, ...).
 */
(function () {
  const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  const C4 = (r, g, b, a) => new BABYLON.Color4(r, g, b, a);
  const sc = () => state.scene;
  const lite = () => !!window.TABLEFOLK_GFX?.lite;
  const groundY = () => state.terrainTopY ?? 0;
  const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) { console.warn('[spells]', e); } }, ms);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const isPlayer = g => g && g === state.playerAvatar;

  // ------------------------------------------------------------ textures
  let texScene = null, tex = {};
  function canvasTex(name, size, draw) {
    if (texScene !== sc()) { texScene = sc(); tex = {}; }
    if (tex[name] && tex[name].getInternalTexture()) return tex[name];
    const t = new BABYLON.DynamicTexture('spell_tex_' + name, { width: size, height: size }, sc(), true);
    const c = t.getContext(); c.clearRect(0, 0, size, size); draw(c, size); t.update(); t.hasAlpha = true;
    return (tex[name] = t);
  }
  const radial = (c, x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); for (const [o, col] of stops) g.addColorStop(o, col); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const T = {
    flare: () => canvasTex('flare', 64, (c, s) => radial(c, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,255,255,.85)'], [.45, 'rgba(255,255,255,.3)'], [1, 'rgba(255,255,255,0)']])),
    smoke: () => canvasTex('smoke', 128, (c, s) => {
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = Math.random() * s * .2; radial(c, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(.16, .3), [[0, 'rgba(255,255,255,.32)'], [1, 'rgba(255,255,255,0)']]); }
    }),
    ring: () => canvasTex('ring', 128, (c, s) => radial(c, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,0)'], [.62, 'rgba(255,255,255,0)'], [.84, 'rgba(255,255,255,1)'], [.92, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']])),
    scorch: () => canvasTex('scorch', 128, (c, s) => {
      radial(c, s / 2, s / 2, s / 2, [[0, 'rgba(8,6,5,.92)'], [.45, 'rgba(18,12,9,.7)'], [.8, 'rgba(30,22,16,.25)'], [1, 'rgba(30,22,16,0)']]);
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = rnd(.25, .48) * s; radial(c, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(.03, .08), [[0, 'rgba(10,8,6,.55)'], [1, 'rgba(10,8,6,0)']]); }
    }),
    rune: () => canvasTex('rune', 256, (c, s) => {
      const m = s / 2; c.strokeStyle = 'rgba(255,255,255,1)'; c.shadowColor = 'white'; c.shadowBlur = 8;
      c.lineWidth = 5; c.beginPath(); c.arc(m, m, m * .9, 0, 6.283); c.stroke();
      c.lineWidth = 2.5; c.beginPath(); c.arc(m, m, m * .72, 0, 6.283); c.stroke();
      c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * 6.283 / 6 * 2 - Math.PI / 2; const x = m + Math.cos(a) * m * .7, y = m + Math.sin(a) * m * .7; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      c.lineWidth = 3; for (let i = 0; i < 24; i++) { const a = i * 6.283 / 24, r0 = m * .74, r1 = m * (i % 3 ? .8 : .88); c.beginPath(); c.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); c.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); c.stroke(); }
    }),
  };

  // ------------------------------------------------------------ helpers
  function tween(ms, step, done) {
    const scene = sc(), t0 = performance.now(); let last = t0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const now = performance.now(); let u = Math.min(1, (now - t0) / ms); const dt = Math.min(.1, (now - last) / 1000); last = now;
      try { step(u, dt); } catch (e) { console.warn('[spells] tween', e); u = 1; }
      if (u >= 1) { scene.onBeforeRenderObservable.remove(obs); try { done?.(); } catch (e) { console.warn('[spells]', e); } }
    });
    return () => scene.onBeforeRenderObservable.remove(obs);
  }
  function glowMat(name, color, { alpha = .95, add = true, texture = null } = {}) {
    const m = new BABYLON.StandardMaterial('spell_' + name, sc());
    m.disableLighting = true; m.emissiveColor = color; m.diffuseColor = C3(0, 0, 0); m.specularColor = C3(0, 0, 0);
    m.alpha = alpha; if (add) m.alphaMode = BABYLON.Engine.ALPHA_ADD;
    if (texture) { m.emissiveTexture = texture; m.opacityTexture = texture; }
    m.backFaceCulling = false; m.fogEnabled = false;
    return m;
  }
  function fx(mesh) { mesh.isPickable = false; mesh.doNotSyncBoundingInfo = true; mesh.alwaysSelectAsActiveMesh = true; return mesh; }
  // a camera-facing soft glow (additive): reads as light without a glow layer
  function sprite(name, size, color, alpha = .9) {
    const m = fx(BABYLON.MeshBuilder.CreatePlane('spell_' + name, { size }, sc()));
    m.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; m.material = glowMat(name, color, { texture: T.flare(), alpha });
    return m;
  }
  // light on the floor (board and paint meshes take no local lights)
  function floorGlow(at, size, color, alpha, ms) {
    const m = fx(BABYLON.MeshBuilder.CreateGround('spell_pool', { width: size, height: size }, sc()));
    m.position.set(at.x, groundY() + .02, at.z); m.material = glowMat('pool', color, { texture: T.flare(), alpha });
    tween(ms, u => { m.material.alpha = alpha * Math.pow(1 - u, 1.5) * (.8 + Math.random() * .2); }, () => kill(m));
  }
  const kill = (...xs) => { for (const x of xs) try { if (x?.material && !x.material._spellShared) x.material.dispose(false, false); x?.dispose?.(); } catch {} };
  function light(pos, color, intensity, range) {
    const L = new BABYLON.PointLight('spell_light', pos.clone(), sc());
    L.diffuse = color; L.specular = color.scale(.5); L.intensity = intensity; L.range = range;
    window.tablefolkScenery?.trackLight(L);   // into the nearest-lights budget
    return L;
  }
  // A particle system: GPU when it can be (and not at light quality), else CPU.
  function particles(name, cap, emitter, texture, { blend = 'add', gpu = true } = {}) {
    const n = Math.max(6, Math.round(cap * (lite() ? .6 : 1)));
    let s = null;
    if (gpu && !lite() && BABYLON.GPUParticleSystem?.IsSupported) { try { s = new BABYLON.GPUParticleSystem('spell_' + name, { capacity: n }, sc()); } catch { s = null; } }
    if (!s) s = new BABYLON.ParticleSystem('spell_' + name, n, sc());
    s.particleTexture = texture; s.emitter = emitter;
    s.blendMode = blend === 'add' ? BABYLON.ParticleSystem.BLENDMODE_ADD : BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    s.updateSpeed = 1 / 60; s.minAngularSpeed = -2; s.maxAngularSpeed = 2; s.minInitialRotation = 0; s.maxInitialRotation = 6.28;
    return s;
  }
  // stop after `ms`, dispose once the last particle is gone (the shared texture stays)
  function retire(s, ms) { later(ms, () => { try { s.stop(); } catch {} later(s.maxLifeTime * 1000 + 250, () => { try { s.dispose(false); } catch {} }); }); }
  function burst(s, count, ms = 90) { s.emitRate = count / (ms / 1000); s.targetStopDuration = 0; s.start(); retire(s, ms); return s; }
  function grad(s, stops) { for (const [t, c] of stops) s.addColorGradient(t, c); }

  function heightOf(g) {
    if (g._spellH) return g._spellH;
    let h = 1.1;
    try { const b = g.root.getHierarchyBoundingVectors(true); const v = b.max.y - g.root.position.y; if (v > .4 && v < 4) h = v; } catch {}
    return (g._spellH = h);
  }
  function fwd(g) {
    const d = g.dir ? g.dir.clone() : V3(0, 0, 1); d.y = 0;
    if (d.lengthSquared() < 1e-4) { const ry = g.root.rotation?.y || 0; d.set(Math.sin(ry), 0, Math.cos(ry)); }
    return d.normalize();
  }
  const handPos = (g, toward) => { const f = toward ? toward.subtract(g.root.position).multiplyByFloats(1, 0, 1).normalize() : fwd(g); return g.root.position.add(V3(0, heightOf(g) * .66, 0)).add(f.scale(.34)); };

  // ------------------------------------------------------------ 3D sound
  let verb = null, ticking = 0, tickObs = null;
  function au() {
    const a = window.tablefolkSfx?.context?.(); if (!a) return null;
    if (!verb || verb.ctx !== a.ctx) {
      const ctx = a.ctx, len = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
      const conv = ctx.createConvolver(); conv.buffer = b; const wet = ctx.createGain(); wet.gain.value = .35; conv.connect(wet); wet.connect(a.master);
      verb = { ctx, input: conv };
    }
    return a;
  }
  function setPos(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = -v.z; } else p.setPosition(v.x, v.y, -v.z); }
  // Babylon is left-handed, Web Audio right-handed: z is mirrored.
  function updateListener() {
    const a = au(), cam = sc()?.activeCamera; if (!a || !cam) return;
    const L = a.ctx.listener, f = cam.getDirection(BABYLON.Axis.Z), u = cam.getDirection(BABYLON.Axis.Y);
    const av = state.playerAvatar, p = state.firstPerson || !av ? (cam.globalPosition || cam.position) : av.root.position.add(V3(0, heightOf(av) * .9, 0));
    const set = (k, v) => { if (L[k]) L[k].value = v; };
    if (L.positionX) { set('positionX', p.x); set('positionY', p.y); set('positionZ', -p.z); set('forwardX', f.x); set('forwardY', f.y); set('forwardZ', -f.z); set('upX', u.x); set('upY', u.y); set('upZ', -u.z); }
    else { L.setPosition(p.x, p.y, -p.z); L.setOrientation(f.x, f.y, -f.z, u.x, u.y, -u.z); }
  }
  function source(pos, { ref = 2, roll = 1, gain = 1, wet = .5, ms = 4000 } = {}) {
    const a = au(); if (!a) return null; const ctx = a.ctx;
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 80; p.rolloffFactor = roll;
    setPos(p, pos);
    const out = ctx.createGain(); out.gain.value = gain; out.connect(p); p.connect(a.master);
    const send = ctx.createGain(); send.gain.value = wet; out.connect(send); send.connect(verb.input);
    updateListener();
    if (!ticking++) tickObs = sc().onBeforeRenderObservable.add(updateListener);
    later(ms, () => { try { out.disconnect(); p.disconnect(); send.disconnect(); } catch {} if (!--ticking) { sc().onBeforeRenderObservable.remove(tickObs); tickObs = null; } });
    return { ctx, out, t: ctx.currentTime + .01, noise: a.noise, move: v => setPos(p, v) };
  }
  function noise(s, t, dur, { type = 'bandpass', f0 = 1000, f1 = null, q = 1, gain = .4, attack = .005, curve = 'exp' } = {}) {
    const { ctx } = s, src = ctx.createBufferSource(); src.buffer = s.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
    if (curve === 'swell') { g.gain.exponentialRampToValueAtTime(gain, t + dur * .85); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    else { g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    src.connect(f); f.connect(g); g.connect(s.out); src.start(t, Math.random() * .5); src.stop(t + dur + .05);
    return g;
  }
  function tone(s, t, dur, { wave = 'sine', f0 = 200, f1 = null, gain = .3, attack = .005, lp = null } = {}) {
    const { ctx } = s, o = ctx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let last = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); last = f; }
    last.connect(g); g.connect(s.out); o.start(t); o.stop(t + dur + .05);
    return o;
  }
  function crackle(s, t, dur, { rate = 40, freq = 3000, gain = .25 } = {}) {
    for (let k = t; k < t + dur; k += rnd(.3, 1.7) / rate) noise(s, k, rnd(.006, .025), { type: 'highpass', f0: freq * rnd(.6, 1.4), gain: gain * rnd(.3, 1), attack: .001 });
  }
  const SOUND = {
    fireCharge(pos) { const s = source(pos, { gain: 1.3, ms: 1500 }); if (!s) return;
      noise(s, s.t, .5, { f0: 250, f1: 1600, q: 1.2, gain: .5, curve: 'swell' });
      tone(s, s.t, .5, { wave: 'sawtooth', f0: 70, f1: 160, gain: .18, attack: .35, lp: 600 });
      crackle(s, s.t + .1, .4, { rate: 30, freq: 2200, gain: .12 }); },
    // the roar that rides with the fireball: returns a mover
    fireRoar(pos, dur) { const s = source(pos, { gain: 1.7, ms: dur * 1000 + 1500, ref: 1.5 }); if (!s) return null;
      const g = noise(s, s.t, dur + .15, { type: 'lowpass', f0: 700, q: .8, gain: .7, attack: .05 });
      noise(s, s.t, dur + .1, { f0: 380, f1: 900, q: 2, gain: .35, attack: .05 });
      const lfo = s.ctx.createOscillator(), lg = s.ctx.createGain(); lfo.frequency.value = 13; lg.gain.value = .25; lfo.connect(lg); lg.connect(g.gain); lfo.start(s.t); lfo.stop(s.t + dur + .2);
      crackle(s, s.t, dur, { rate: 45, freq: 1800, gain: .16 });
      return s; },
    boom(pos, big = 1) { const s = source(pos, { gain: 1.05 * big, ms: 4000, ref: 2.5, wet: .7 }); if (!s) return;
      tone(s, s.t, 1.1, { f0: 110, f1: 28, gain: .95, attack: .004 });
      tone(s, s.t, .5, { wave: 'triangle', f0: 70, f1: 35, gain: .5, attack: .002 });
      noise(s, s.t, 1.6, { type: 'lowpass', f0: 2400, f1: 180, q: .7, gain: 1, attack: .003 });
      noise(s, s.t, .25, { type: 'highpass', f0: 1200, gain: .5, attack: .001 });
      crackle(s, s.t + .08, 1.4, { rate: 26, freq: 2600, gain: .22 }); },
    zapCharge(pos) { const s = source(pos, { gain: 1.2, ms: 1500 }); if (!s) return;
      const o = tone(s, s.t, .5, { wave: 'sawtooth', f0: 58, gain: .22, attack: .05, lp: 2500 });
      const o2 = tone(s, s.t, .5, { wave: 'square', f0: 117, gain: .08, attack: .1, lp: 1500 }); o2.detune.value = 9; void o;
      crackle(s, s.t, .5, { rate: 70, freq: 4200, gain: .3 }); },
    crack(pos) { const s = source(pos, { gain: 1.4, ms: 2500, ref: 3, wet: .8 }); if (!s) return;
      noise(s, s.t, .09, { type: 'highpass', f0: 900, gain: 1.4, attack: .0008 });
      noise(s, s.t + .01, .45, { type: 'bandpass', f0: 3200, f1: 500, q: .6, gain: .9, attack: .001 });
      tone(s, s.t, .18, { wave: 'sawtooth', f0: 2400, f1: 120, gain: .3, attack: .001 });
      crackle(s, s.t + .05, .6, { rate: 60, freq: 5000, gain: .35 }); },
    thunder(pos) { const s = source(pos, { gain: 1.5, ms: 5500, ref: 6, roll: .35, wet: 1 }); if (!s) return;
      const g = noise(s, s.t, 3.6, { type: 'lowpass', f0: 420, f1: 90, q: .5, gain: 1.1, attack: .06 });
      for (let k = .1; k < 3.2; k += rnd(.15, .45)) g.gain.setTargetAtTime(rnd(.25, 1.1) * (1 - k / 3.6), s.t + k, .07);
      tone(s, s.t, 2, { f0: 48, f1: 30, gain: .5, attack: .2 }); },
    poof(pos) { const s = source(pos, { gain: .8, ms: 2500, wet: .6 }); if (!s) return;
      noise(s, s.t + .25, .45, { f0: 900, f1: 180, q: .8, gain: .55, attack: .01 });
      noise(s, s.t, .7, { f0: 7000, q: 3, gain: .07, curve: 'swell' });
      [880, 1109, 1319, 1760, 2217].forEach((f, i) => tone(s, s.t + i * .055, .7, { wave: 'triangle', f0: f, gain: .07, attack: .004 })); },
  };

  // ------------------------------------------------------------ shared visuals
  // A subtle shake for whoever is close: screen offset on an orbit camera, a
  // tiny turn on a first-person or free one; undone after every frame.
  let shakeAmp = 0, shakeOn = false;
  function shake(at, amp) {
    const cam = sc()?.activeCamera; if (!cam) return;
    const d = BABYLON.Vector3.Distance(cam.globalPosition || cam.position, at); amp *= 1 / (1 + d * d * .015);
    if (amp < .01) return; shakeAmp = Math.max(shakeAmp, amp); if (shakeOn) return; shakeOn = true;
    const scene = sc(); let applied = null, last = performance.now();
    const before = scene.onBeforeRenderObservable.add(() => {
      const now = performance.now(), dt = (now - last) / 1000, t = now / 1000; last = now; shakeAmp *= Math.pow(.004, dt);
      const c = scene.activeCamera; if (!c) return;
      const a = shakeAmp, x = (Math.sin(t * 71) + Math.sin(t * 43.7)) * .5 * a, y = (Math.sin(t * 63 + 1) + Math.sin(t * 37.3)) * .5 * a;
      if (c.targetScreenOffset) { applied = { c, k: 'o', x: x * .35, y: y * .35 }; c.targetScreenOffset.x += applied.x; c.targetScreenOffset.y += applied.y; }
      else if (c.rotation) { applied = { c, k: 'r', x: y * .02, y: x * .02 }; c.rotation.x += applied.x; c.rotation.y += applied.y; }
    });
    const after = scene.onAfterRenderObservable.add(() => {
      if (applied) { const { c } = applied; if (applied.k === 'o') { c.targetScreenOffset.x -= applied.x; c.targetScreenOffset.y -= applied.y; } else { c.rotation.x -= applied.x; c.rotation.y -= applied.y; } applied = null; }
      if (shakeAmp < .01) { scene.onBeforeRenderObservable.remove(before); scene.onAfterRenderObservable.remove(after); shakeOn = false; shakeAmp = 0; }
    });
  }
  // The world's own lights brightened for a moment (lightning), and a faint
  // flash of the whole screen.
  const skyLit = new Map();
  function flashSky(k, ms, screen = 0) {
    for (const L of sc().lights) {
      if (!(L instanceof BABYLON.HemisphericLight || L instanceof BABYLON.DirectionalLight)) continue;
      if (!skyLit.has(L)) skyLit.set(L, L.intensity);
      L.intensity = skyLit.get(L) * k;
      clearTimeout(L._spellFlash); L._spellFlash = setTimeout(() => { if (skyLit.has(L)) { L.intensity = skyLit.get(L); skyLit.delete(L); } }, ms);
    }
    if (screen > 0) {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:40;background:radial-gradient(circle at 50% 35%,rgba(225,235,255,${screen}),rgba(170,190,255,${screen * .5}));transition:opacity ${ms * 2}ms ease-out;opacity:1`;
      document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '0'; })); setTimeout(() => d.remove(), ms * 2 + 100);
    }
  }
  function groundRing(at, color, { size = 4, ms = 450, alpha = .9 } = {}) {
    const m = fx(BABYLON.MeshBuilder.CreateGround('spell_ring', { width: 1, height: 1 }, sc()));
    m.position.set(at.x, groundY() + .03, at.z); m.material = glowMat('ring', color, { texture: T.ring(), alpha });
    tween(ms, u => { const s = .3 + size * (1 - Math.pow(1 - u, 3)); m.scaling.set(s, 1, s); m.material.alpha = alpha * (1 - u) ; }, () => kill(m));
  }
  function scorch(at, size = 1.3) {
    const m = fx(BABYLON.MeshBuilder.CreateGround('spell_scorch', { width: size, height: size }, sc()));
    m.position.set(at.x, groundY() + .015, at.z); m.rotation.y = Math.random() * 6.28;
    const mat = new BABYLON.StandardMaterial('spell_scorch', sc()); mat.diffuseTexture = T.scorch(); mat.useAlphaFromDiffuseTexture = true; mat.diffuseTexture.hasAlpha = true;
    mat.specularColor = C3(0, 0, 0); mat.diffuseColor = C3(1, 1, 1); mat.zOffset = -2; mat.disableLighting = true; mat.emissiveColor = C3(1, 1, 1); m.material = mat; mat.alpha = .9;
    later(7000, () => tween(3000, u => { mat.alpha = .9 * (1 - u); }, () => kill(m)));
  }
  function flicker(L, base, ms, decay = true) {
    return tween(ms, u => { L.intensity = base * (decay ? Math.pow(1 - u, 1.6) : 1) * (.75 + Math.random() * .5); }, () => kill(L));
  }

  // ------------------------------------------------------------ fireball
  function fireBall(at) {
    const core = sprite('fireball', .42, C3(1, .72, .35), .85);
    const shell = sprite('fireball_shell', 1, C3(1, .33, .04), .6); shell.parent = core;
    core.position.copyFrom(at);
    // flames trailing behind it (world-space particles from a moving emitter)
    const flame = particles('flame', 300, core, T.flare());
    Object.assign(flame, { minSize: .16, maxSize: .34, minLifeTime: .2, maxLifeTime: .45, emitRate: 240, minEmitPower: .05, maxEmitPower: .35, gravity: V3(0, 1.4, 0) });
    flame.createSphereEmitter(.09, 1);
    grad(flame, [[0, C4(1, .55, .15, .5)], [.25, C4(1, .32, .04, .42)], [.6, C4(.6, .09, .01, .28)], [1, C4(.2, .03, .01, 0)]]);
    flame.addSizeGradient(0, .9); flame.addSizeGradient(1, .25);
    const smoke = particles('trail_smoke', 120, core, T.smoke(), { blend: 'std' });
    Object.assign(smoke, { minSize: .18, maxSize: .34, minLifeTime: .7, maxLifeTime: 1.2, emitRate: 70, minEmitPower: .02, maxEmitPower: .15, gravity: V3(0, .5, 0) });
    smoke.createSphereEmitter(.08, 1); grad(smoke, [[0, C4(.12, .1, .09, 0)], [.15, C4(.14, .12, .1, .45)], [1, C4(.3, .29, .28, 0)]]);
    smoke.addSizeGradient(0, .5); smoke.addSizeGradient(1, 2.2);
    const embers = particles('embers', 160, core, T.flare());
    Object.assign(embers, { minSize: .025, maxSize: .055, minLifeTime: .4, maxLifeTime: .9, emitRate: 90, minEmitPower: .3, maxEmitPower: 1.1, gravity: V3(0, -2.5, 0) });
    embers.createSphereEmitter(.12, 1); embers.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED;
    embers.color1 = C4(1, .8, .3, 1); embers.color2 = C4(1, .5, .1, 1); embers.colorDead = C4(.6, .1, 0, 0);
    flame.start(); smoke.start(); embers.start();
    const L = light(at, C3(1, .5, .16), 0, 4.5);
    let alive = true, lastTrack = 0;
    const stopPulse = tween(60000, () => { if (!alive) return; const t = performance.now() / 1000; shell.scaling.setAll(1 + Math.sin(t * 31) * .1 + Math.sin(t * 17) * .08); L.position.copyFrom(core.position); L.intensity = L._base * (.82 + Math.random() * .36); if (performance.now() - lastTrack > 200) { lastTrack = performance.now(); window.tablefolkScenery?.trackLight(L); } });
    L._base = 0;
    return {
      core, light: L,
      // (a mesh's dispose takes the particle systems it emits, textures and all)
      end() { alive = false; stopPulse(); for (const s of [flame, smoke, embers]) { s.emitter = core.position.clone(); retire(s, 0); } kill(shell, core, L); },
    };
  }
  function explode(at, { ground = true, size = 1 } = {}) {
    const lt = light(at.add(V3(0, .4, 0)), C3(1, .55, .2), 7 * size, 7 * size); flicker(lt, 7 * size, 750);
    const flash = sprite('flash', 1, C3(1, .7, .35), .75), bloom = sprite('bloom', 1, C3(.9, .3, .04), .6);
    flash.position.copyFrom(at); bloom.position.copyFrom(at);
    tween(260, u => { flash.scaling.setAll((.6 + 2.2 * Math.sqrt(u)) * size); flash.material.alpha = .8 * (1 - u) * (1 - u); flash.material.emissiveColor.set(1, .7 - .35 * u, .35 - .3 * u); }, () => kill(flash));
    tween(650, u => { bloom.scaling.setAll((1.2 + 2 * Math.sqrt(u)) * size); bloom.material.alpha = .65 * Math.pow(1 - u, 1.6); }, () => kill(bloom));
    if (ground) floorGlow(at, 5 * size, C3(1, .5, .15), .9, 900);
    const fire = particles('burst_fire', 260, at.clone(), T.flare());
    Object.assign(fire, { minSize: .4 * size, maxSize: 1 * size, minLifeTime: .45, maxLifeTime: 1, minEmitPower: 1.2 * size, maxEmitPower: 3.6 * size, gravity: V3(0, 2.2, 0) });
    fire.createSphereEmitter(.25 * size, 1);
    grad(fire, [[0, C4(1, .62, .25, .65)], [.2, C4(.95, .36, .05, .55)], [.55, C4(.6, .13, .02, .38)], [1, C4(.15, .02, 0, 0)]]);
    fire.addSizeGradient(0, .6); fire.addSizeGradient(.4, 1.1); fire.addSizeGradient(1, .5);
    if (fire.addDragGradient) try { fire.addDragGradient(0, .1); fire.addDragGradient(1, .85); } catch {}
    burst(fire, 220);
    const smoke = particles('burst_smoke', 60, at.add(V3(0, .1, 0)), T.smoke(), { blend: 'std' });
    Object.assign(smoke, { minSize: .7 * size, maxSize: 1.3 * size, minLifeTime: 1.4, maxLifeTime: 2.4, minEmitPower: .5, maxEmitPower: 1.4 * size, gravity: V3(0, .7, 0) });
    smoke.createSphereEmitter(.35 * size, 1); grad(smoke, [[0, C4(.16, .13, .11, 0)], [.1, C4(.2, .17, .15, .6)], [.6, C4(.3, .29, .28, .35)], [1, C4(.4, .4, .4, 0)]]);
    smoke.addSizeGradient(0, .6); smoke.addSizeGradient(1, 2.2);
    later(90, () => burst(smoke, 50, 160));
    const sparks = particles('burst_sparks', 200, at.clone(), T.flare());
    Object.assign(sparks, { minSize: .04, maxSize: .09, minLifeTime: .5, maxLifeTime: 1.2, minEmitPower: 2.5 * size, maxEmitPower: 6.5 * size, gravity: V3(0, -7, 0) });
    sparks.createSphereEmitter(.2, 1); sparks.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED;
    sparks.color1 = C4(1, .9, .5, 1); sparks.color2 = C4(1, .6, .2, 1); sparks.colorDead = C4(.7, .15, 0, 0);
    burst(sparks, 170);
    if (ground) { groundRing(at, C3(1, .5, .15), { size: 4.2 * size }); scorch(at, 1.6 * size); }
    shake(at, .9 * size);
    SOUND.boom(at, size);
  }
  // Fly a fireball from -> to (arc), then explode; done(at) after the blast.
  function flyFireball(from, to, { arc = .5, speed = 8, ground = true, size = 1, charge = null } = {}, done) {
    const ball = fireBall(from); ball.light._base = 2.2;
    const dist = BABYLON.Vector3.Distance(from, to), dur = Math.max(.22, dist / speed);
    const roar = SOUND.fireRoar(from, dur);
    const mid = BABYLON.Vector3.Lerp(from, to, .5).add(V3(0, dist * .12 * arc, 0));
    tween(dur * 1000, u => {
      const a = BABYLON.Vector3.Lerp(from, mid, u), b = BABYLON.Vector3.Lerp(mid, to, u);
      ball.core.position.copyFrom(BABYLON.Vector3.Lerp(a, b, u)); roar?.move(ball.core.position);
    }, () => { ball.end(); explode(to, { ground, size }); done?.(to); });
    void charge;
  }
  // The charge in the hands before a throw.
  function chargeAt(pos, color, ms, kind) {
    const orb = sprite('charge', .5, color, .8); orb.position.copyFrom(pos);
    const swirl = particles('charge', 120, pos.clone(), T.flare());
    Object.assign(swirl, { minSize: .04, maxSize: .1, minLifeTime: .25, maxLifeTime: .4, emitRate: 220, minEmitPower: -1.4, maxEmitPower: -.8, gravity: V3(0, 0, 0) });
    swirl.createSphereEmitter(.45, 0);
    swirl.color1 = C4(color.r, color.g, color.b, 1); swirl.color2 = C4(1, 1, 1, 1); swirl.colorDead = C4(color.r, color.g, color.b, 0);
    swirl.start(); retire(swirl, ms);
    const L = light(pos, color, 0, 3);
    tween(ms, u => { orb.scaling.setAll(.2 + u * (kind === 'fire' ? 1.1 : .8) + Math.sin(u * 60) * .05); orb.material.alpha = .5 + .4 * u; L.intensity = 2.2 * u * (.8 + Math.random() * .4); }, () => kill(orb, L));
  }

  // ------------------------------------------------------------ lightning
  // A jagged path from a to b by midpoint displacement.
  function jag(a, b, rough, depth) {
    let pts = [a, b], off = BABYLON.Vector3.Distance(a, b) * rough;
    for (let d = 0; d < depth; d++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], dir = q.subtract(p).normalize();
        let r = V3(Math.random() - .5, Math.random() - .5, Math.random() - .5); r = r.subtract(dir.scale(BABYLON.Vector3.Dot(r, dir))).normalize().scale(off * rnd(.3, 1));
        out.push(BABYLON.Vector3.Lerp(p, q, .5).add(r), q);
      }
      pts = out; off *= .55;
    }
    return pts;
  }
  // The main bolt and its branches as two tubes each: a white-hot core and a
  // wide blue glow (additive).
  function boltMeshes(top, bottom, { branches = 4, width = 1, mats }) {
    const main = jag(top, bottom, .16, 6), paths = [[main, 1]];
    for (let i = 0; i < branches + Math.floor(Math.random() * 3); i++) {
      const k = Math.floor(rnd(.1, .75) * main.length), s = main[k], left = BABYLON.Vector3.Distance(s, bottom);
      const dir = V3(rnd(-1, 1), rnd(-1.4, -.4), rnd(-1, 1)).normalize();
      paths.push([jag(s, s.add(dir.scale(left * rnd(.2, .45))), .22, 4), .5]);
      if (Math.random() < .5) { const b2 = paths[paths.length - 1][0], s2 = b2[Math.floor(b2.length / 2)]; paths.push([jag(s2, s2.add(V3(rnd(-1, 1), -1, rnd(-1, 1)).normalize().scale(left * .15)), .25, 3), .3]); }
    }
    const meshes = [];
    for (const [p, w] of paths) {
      const c = fx(BABYLON.MeshBuilder.CreateTube('spell_bolt', { path: p, radius: .024 * w * width, tessellation: 5, cap: 0 }, sc())); c.material = mats.core;
      const g = fx(BABYLON.MeshBuilder.CreateTube('spell_bolt_glow', { path: p, radius: .1 * w * width, tessellation: 6, cap: 0 }, sc())); g.material = mats.glow;
      meshes.push(c, g);
      if (w === 1) { const o = fx(BABYLON.MeshBuilder.CreateTube('spell_bolt_halo', { path: p, radius: .26 * width, tessellation: 10, cap: 0 }, sc())); o.material = mats.halo; meshes.push(o); }
    }
    return meshes;
  }
  function boltMats() {
    const core = glowMat('bolt_core', C3(1, 1, 1), { alpha: .99 }), glow = glowMat('bolt_glow', C3(.3, .45, 1), { alpha: .5 }), halo = glowMat('bolt_halo', C3(.25, .3, .9), { alpha: .1 });
    core._spellShared = glow._spellShared = halo._spellShared = true;   // kill() leaves them; disposed with the strike
    return { core, glow, halo };
  }
  // Little arcs crawling over a spot (hands, the point of impact).
  function arcs(center, radius, ms, color = C3(.6, .75, 1)) {
    const core = glowMat('arc_core', C3(.9, .95, 1), { alpha: .95 }), glow = glowMat('arc_glow', color, { alpha: .4 });
    core._spellShared = glow._spellShared = true;
    let cur = [], next = 0;
    tween(ms, () => {
      const now = performance.now(); if (now < next) return; next = now + rnd(35, 80);
      kill(...cur); cur = [];
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const a = center.add(V3(rnd(-1, 1), rnd(-.5, 1), rnd(-1, 1)).scale(radius)), b = center.add(V3(rnd(-1, 1), rnd(-.6, .8), rnd(-1, 1)).scale(radius));
        const p = jag(a, b, .3, 3);
        const c = fx(BABYLON.MeshBuilder.CreateTube('spell_arc', { path: p, radius: .008, tessellation: 4 }, sc())); c.material = core;
        const g = fx(BABYLON.MeshBuilder.CreateTube('spell_arc_glow', { path: p, radius: .03, tessellation: 4 }, sc())); g.material = glow;
        cur.push(c, g);
      }
    }, () => { kill(...cur); core.dispose(); glow.dispose(); });
  }
  // A strike from the sky onto `at`; done() after the bolt is gone.
  // Under a roof the bolt leaps from the caster's hand (`from`) instead.
  function strike(at, { width = 1, done, from = null } = {}) {
    const top = from || at.add(V3(rnd(-1.6, 1.6), 11, rnd(-1.6, 1.6)));
    const mats = boltMats(); let cur = [];
    const lt = light(at.add(V3(0, 1.2, 0)), C3(.7, .8, 1), 0, 10);
    // flashes: on, off, on, off, on and fade (the classic stutter)
    const plan = [[0, 1], [70, 0], [120, 1], [180, 0], [230, .9], [330, .5], [420, 0]];
    for (const [ms, on] of plan) later(ms, () => {
      kill(...cur); cur = [];
      if (on) { cur = boltMeshes(top, at, { width, mats, branches: from ? 3 : 4 }); mats.glow.alpha = .45 * on; lt.intensity = 9 * on; flashSky(1 + (from ? 1.2 : 2.4) * on, 60, on > .8 ? (from ? .08 : .16) : 0); }
      else lt.intensity = 1.2;
    });
    later(470, () => { kill(...cur); for (const m of Object.values(mats)) m.dispose(); flicker(lt, 1.2, 250); done?.(); });
    // what the bolt does where it lands
    const bloom = sprite('zap_bloom', 1, C3(.6, .72, 1), .9); bloom.position.copyFrom(at.add(V3(0, .3, 0)));
    tween(450, u => { bloom.scaling.setAll(1.2 + 2.4 * Math.sqrt(u)); bloom.material.alpha = .9 * Math.pow(1 - u, 2) * (.6 + Math.random() * .4); }, () => kill(bloom));
    const sparks = particles('zap_sparks', 220, at.add(V3(0, .05, 0)), T.flare());
    Object.assign(sparks, { minSize: .035, maxSize: .08, minLifeTime: .35, maxLifeTime: 1, minEmitPower: 3, maxEmitPower: 8, gravity: V3(0, -9, 0) });
    sparks.createHemisphericEmitter(.15, 0); sparks.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED;
    sparks.color1 = C4(.85, .92, 1, 1); sparks.color2 = C4(.5, .7, 1, 1); sparks.colorDead = C4(.2, .3, 1, 0);
    burst(sparks, 190, 120);
    later(120, () => { const s2 = particles('zap_sparks2', 60, at.add(V3(0, .05, 0)), T.flare()); Object.assign(s2, { minSize: .025, maxSize: .05, minLifeTime: .25, maxLifeTime: .6, minEmitPower: 2, maxEmitPower: 5, gravity: V3(0, -9, 0) }); s2.createHemisphericEmitter(.15, 0); s2.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED; s2.color1 = C4(1, 1, 1, 1); s2.color2 = C4(.6, .75, 1, 1); s2.colorDead = C4(.2, .3, 1, 0); burst(s2, 50, 80); });
    const smoke = particles('zap_smoke', 30, at.add(V3(0, .15, 0)), T.smoke(), { blend: 'std' });
    Object.assign(smoke, { minSize: .4, maxSize: .8, minLifeTime: 1.2, maxLifeTime: 2.2, minEmitPower: .3, maxEmitPower: .9, gravity: V3(0, .9, 0) });
    smoke.createHemisphericEmitter(.3, 0); grad(smoke, [[0, C4(.5, .55, .65, 0)], [.1, C4(.4, .42, .48, .55)], [1, C4(.5, .5, .55, 0)]]);
    smoke.addSizeGradient(0, .5); smoke.addSizeGradient(1, 2.4);
    burst(smoke, 24, 200);
    const pool = fx(BABYLON.MeshBuilder.CreateGround('spell_zap_pool', { width: 2.4, height: 2.4 }, sc()));
    pool.position.set(at.x, groundY() + .025, at.z); pool.material = glowMat('zap_pool', C3(.55, .7, 1), { texture: T.flare(), alpha: .9 });
    tween(600, u => { pool.material.alpha = .9 * (1 - u) * (.7 + Math.random() * .3); }, () => kill(pool));
    groundRing(at, C3(.5, .65, 1), { size: 3.4, ms: 380 });
    scorch(at, 1.1);
    arcs(at.add(V3(0, .25, 0)), .45, 650);
    shake(at, 1.3);
    SOUND.crack(at);
    later(140, () => SOUND.thunder(at.add(V3(0, 4, 0))));
  }

  // Is there a roof (or anything solid) over this spot?
  function roofed(at) {
    const ray = new BABYLON.Ray(at.add(V3(0, 1.4, 0)), V3(0, 1, 0), 14);
    return !!sc().pickWithRay(ray, m => m.isEnabled() && m.isVisible && !m.name.startsWith('spell_') && m.getTotalVertices() > 0 && !m.infiniteDistance && !/sky/i.test(m.name), true)?.hit;
  }

  // ------------------------------------------------------------ targets
  function findThing(name, near) {
    const t = String(name || '').toLowerCase().replace(/^the\s+/, '').trim(); if (!t) return null;
    let best = null, bd = 14;
    for (const m of state.props) {
      if (!m || m.isDisposed?.()) continue; const mm = meta(m); if (!mm) continue;
      const names = [mm.type, mm.label, mm.name].filter(Boolean).map(s => String(s).toLowerCase().replace(/_/g, ' '));
      if (!names.some(n => n === t || (t.length > 2 && n.includes(t)) || (n.length > 2 && t.includes(n)))) continue;
      const d = BABYLON.Vector3.Distance(m.position, near); if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  // a character (or the player), else a thing, by name; null = none/not found
  function resolveTarget(g, name) {
    const t = String(name || '').trim().replace(/^["']|["']$/g, '');
    if (!t || /^(none|nothing|sky|air|up|the sky|name|target|enemy|someone|thing|it)$/i.test(t)) return null;   // (placeholders copied from the prompt)
    const who = window.tablefolkCombat?.resolveTarget(g, t);
    if (who === g) return null;   // naming himself: the same as no target (it comes back on him)
    if (who && !who.defeated) return { who, pos: () => who.root.position };
    const m = findThing(t, g.root.position);
    if (m) return { thing: m, pos: () => m.getAbsolutePosition() };
    return null;
  }
  const nameOf = g => window.tablefolkCombat?.nameOf(g) || g?.id || 'someone';
  // the line the caster's model reads back next turn (and the log for devs)
  function report(g, text) {
    const h = state.globalHistory;
    if (h?.length && !isPlayer(g)) { const last = h[h.length - 1]; if (last.startsWith('T') && last.includes(g.id + ':')) h[h.length - 1] = last + ' -> ' + text; }
    if (window.TABLEFOLK_DEV) console.log('[spells]', text);
  }
  function backlash(g, spell) {
    later(250, () => {
      const at = handPos(g);
      const puff = particles('backlash', 40, at, T.flare());
      Object.assign(puff, { minSize: .05, maxSize: .14, minLifeTime: .2, maxLifeTime: .45, minEmitPower: .4, maxEmitPower: 1.4, gravity: V3(0, 1, 0) });
      puff.createSphereEmitter(.1, 1);
      if (spell === 'fireball') { puff.color1 = C4(1, .7, .2, 1); puff.color2 = C4(1, .4, .1, 1); puff.colorDead = C4(.3, .05, 0, 0); }
      else { puff.color1 = C4(.8, .9, 1, 1); puff.color2 = C4(.5, .65, 1, 1); puff.colorDead = C4(.2, .3, 1, 0); arcs(g.root.position.add(V3(0, heightOf(g) * .55, 0)), .35, 350); }
      burst(puff, 36, 120);
      window.tablefolkCombat?.hurt(g, 1, 'the backlash of your own spell', '');
    });
  }
  function settle(g, ms) { later(ms, () => { if (g.anim === 'cast' && !g.defeated) { g.anim = 'idle'; playRig(g, 'idle', true); } }); }

  // ------------------------------------------------------------ cast
  function cast(g, spell, targetName) {
    if (!g?.root || g.defeated) return false;
    const tgt = resolveTarget(g, targetName);
    if (tgt?.who) faceToward(g, tgt.who, 4000);
    g.anim = 'cast'; playRig(g, 'cast', true); settle(g, 1700);
    const aim = tgt ? tgt.pos() : null, hand = handPos(g, aim);
    if (spell === 'fireball') {
      chargeAt(hand, C3(1, .55, .15), 480, 'fire'); SOUND.fireCharge(hand);
      later(480, () => {
        const from = handPos(g, aim);
        if (tgt) {
          // it bursts on the target's near side (in front of the eyes when it is you, in first person)
          let to = tgt.pos().add(V3(0, tgt.who ? heightOf(tgt.who) * .5 : .35, 0));
          const fp = isPlayer(tgt.who) && state.firstPerson, back = from.subtract(to); back.y = 0; back.normalize();
          to = to.add(back.scale(fp ? 1.1 : tgt.who ? .3 : .25)); if (fp) to.y -= .2;
          flyFireball(from, to, { arc: .6, speed: 8, size: fp ? .75 : 1 }, at => {
            if (tgt.who) window.tablefolkCombat?.hurt(tgt.who, 3, g.id, 'a fireball');
            for (const m of state.props.concat(state.blocks)) {
              if (!m || m.isDisposed?.()) continue; const d = BABYLON.Vector3.Distance(at, m.position);
              if (d < 1.8) { if (m === tgt.thing || d < 1.2) damage(m, meta(m)?.flammable ? 2 : 1, 'fire'); if (m.physicsBody && (meta(m)?.health ?? 1) > 0) impulse(m, at.add(V3(0, .1, 0)), 2.2, .5); }
            }
            report(g, `${g.id} hurls a fireball at ${tgt.who ? nameOf(tgt.who) : 'the ' + (meta(tgt.thing)?.type || 'thing')}${tgt.who ? ' (3 damage)' : ''}; the backlash burns ${g.id} for 1`);
            backlash(g, 'fireball');
          });
        } else {
          // no target: up into the air, a burst overhead (under the ceiling indoors), embers raining down
          const ceil = sc().pickWithRay(new BABYLON.Ray(from, V3(0, 1, 0), 8), m => m.isEnabled() && m.isVisible && !m.name.startsWith('spell_') && m.getTotalVertices() > 0 && !/sky/i.test(m.name), true);
          const up = ceil?.hit ? Math.max(.8, ceil.distance - .9) : 3.6;
          // ... and, with nobody named, it falls back on the caster (on purpose:
          // a tiny model forgetting the target hurts itself, which is funny)
          const top = from.add(fwd(g).scale(.6)).add(V3(rnd(-.2, .2), up, rnd(-.2, .2)));
          flyFireball(from, top, { arc: 0, speed: 7, ground: false, size: .5 }, () => {
            later(250, () => {
              const head = g.root.position.add(V3(0, heightOf(g) * .8, 0));
              flyFireball(top, head, { arc: 0, speed: 6, size: 1 }, () => {
                window.tablefolkCombat?.hurt(g, 3, g.id, 'his own fireball');
                report(g, `${g.id} throws a fireball at nobody; it comes straight back down on ${g.id} (3 damage)`);
              });
            });
          });
        }
      });
      return true;
    }
    if (spell === 'lightning') {
      arcs(hand, .28, 520); SOUND.zapCharge(hand);
      const cl = light(hand, C3(.6, .75, 1), 0, 3); tween(520, u => { cl.intensity = 2.5 * u * (.5 + Math.random()); }, () => kill(cl));
      later(520, () => {
        // with nobody named, the bolt finds the caster himself
        const victim = tgt?.who || (tgt ? null : g);
        let at = (tgt ? tgt.pos() : g.root.position).clone();
        at.y = groundY();
        const inside = roofed(at);
        if (victim && inside) at.y += heightOf(victim) * (isPlayer(victim) && state.firstPerson ? .35 : .55);
        else if (tgt?.thing && inside) at.y = Math.max(groundY() + .2, tgt.pos().y);
        if (!inside) {
          // a thin arc from the raised hand into the sky: the call
          const callTop = handPos(g).add(V3(rnd(-.5, .5), 6, rnd(-.5, .5))), mats = boltMats();
          const call = boltMeshes(handPos(g), callTop, { branches: 1, width: .45, mats });
          later(90, () => { kill(...call); for (const m of Object.values(mats)) m.dispose(); });
        }
        // inside, the bolt leaps from the hand; on himself it comes down from the ceiling
        later(inside ? 0 : 110, () => strike(at, inside && tgt ? { from: handPos(g, at) } : {}));
        later(170, () => {
          if (!tgt) { window.tablefolkCombat?.hurt(g, 4, g.id, 'his own lightning'); report(g, `${g.id} calls lightning down on nobody; it strikes ${g.id} (4 damage)`); return; }
          if (tgt.who) window.tablefolkCombat?.hurt(tgt.who, 4, g.id, 'a bolt of lightning');
          else if (tgt.thing) damage(tgt.thing, 2, 'fire');
          report(g, `${g.id} calls lightning down on ${tgt.who ? nameOf(tgt.who) + ' (4 damage)' : 'the ' + (meta(tgt.thing)?.type || 'thing')}; the backlash shocks ${g.id} for 1`); backlash(g, 'lightning');
        });
      });
      return true;
    }
    return false;
  }

  // The old fireballVfx(from, to) (skills.js's magic): a quick throw, no charge.
  function fireballVfx(from, to) { flyFireball(from, to, { arc: .4, speed: 10 }); }

  // ------------------------------------------------------------ spawn
  const BUILTIN = { crate: 'makeCrate', barrel: 'makeBarrel', mushroom: 'makeMushroom', lamp: 'makeLamp' };
  const SCENERY = ['campfire', 'lantern', 'fence', 'signpost', 'light'];
  const EXTRA = { box: 'crate', boxes: 'crate', keg: 'barrel', chair: 'wooden_chair', seat: 'stool', apple: 'apple_crate', apples: 'apple_crate', carrot: 'carrot_crate',
    gold: 'coin_pile', coins: 'coin_pile', coin: 'coin_pile', money: 'coin_pile', fire: 'campfire', candle: 'candles', book: 'bookcase', books: 'bookcase',
    rock: 'boulder', stone: 'boulder', sack: 'bag', jar: 'pot', cup: 'chalice', goblet: 'chalice', flower: 'flowers', light: 'lantern', lamp_post: 'lantern' };
  function known(t) { return !!(ITEM_CATALOG[t] || BUILTIN[t] || SCENERY.includes(t)); }
  function resolveThing(name) {
    let w = String(name || '').toLowerCase().replace(/["'.!]/g, '').replace(/^(a|an|the|some)\s+/, '').trim().replace(/\s+/g, '_');
    if (!w) return null;
    const aliases = {}; for (const [t, it] of Object.entries(window.tablefolkPacks?.items || {})) for (const a of it.aliases || []) aliases[a] = t;
    const tries = [w, w.replace(/es$/, ''), w.replace(/s$/, '')];
    const last = w.split('_').pop(); if (last !== w) tries.push(last, last.replace(/es$/, ''), last.replace(/s$/, ''));
    for (const x of tries) { if (known(x)) return x; const a = aliases[x] || EXTRA[x]; if (a && known(a)) return a; }
    return null;
  }
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1, some: 3, few: 3, several: 4, many: 6, lots: 6, pair: 2 };
  function spawn(g, thing, count) {
    if (!g?.root || g.defeated) return false;
    let words = String(thing || '').trim(), n = parseInt(count, 10);
    const lead = words.match(/^(\d+|[a-z]+)\s+(.+)$/i);   // spawn(3 apples)
    if (lead && (/^\d+$/.test(lead[1]) || NUM[lead[1].toLowerCase()])) { if (!(n > 0)) n = /^\d+$/.test(lead[1]) ? +lead[1] : NUM[lead[1].toLowerCase()]; words = lead[2]; }
    if (!(n > 0)) n = NUM[String(count || '').toLowerCase()] || 1;
    n = Math.max(1, Math.min(6, n));
    // A thing we don't have (spawn(ship)), or the prompt's placeholder copied
    // (spawn(thing)): a random small object instead, so the magic still happens.
    let type = resolveThing(words);
    if (!type) {
      const pool = ['apple_crate', 'coin_pile', 'candles', 'chalice', 'flowers', 'pot', 'bag', 'boulder', 'crate', 'barrel', 'mushroom', 'lantern'].filter(known);
      if (!pool.length) return false;
      type = pool[Math.floor(Math.random() * pool.length)];
      if (window.TABLEFOLK_DEV) console.log('[spells] spawn: no', JSON.stringify(thing), '- conjures', type);
    }
    // free cells in front of the caster, nearest the spot 1.6 ahead first
    const p = g.root.position, f = fwd(g), aimAt = p.add(f.scale(1.6)), cells = [];
    const busy = (x, z) => state.characters.concat(state.playerAvatar ? [state.playerAvatar] : []).some(c => c?.root && Math.hypot(c.root.position.x - x, c.root.position.z - z) < .8)
      || state.props.some(m => m && !m.isDisposed?.() && Math.hypot(m.position.x - x, m.position.z - z) < .7);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz;
      if (Math.hypot(x - p.x, z - p.z) < .9) continue;
      if (typeof cellPassable === 'function' && !cellPassable(x, z)) continue;
      if (busy(x, z)) continue;
      const pl = state.playerAvatar?.root?.position; if (pl && Math.hypot(pl.x - x, pl.z - z) < 1.5) continue;   // not in the player's way
      const ahead = (x - p.x) * f.x + (z - p.z) * f.z;
      cells.push({ x, z, s: Math.hypot(x - aimAt.x, z - aimAt.z) - (ahead > 0 ? .5 : 0) });
    }
    cells.sort((a, b) => a.s - b.s);
    if (!cells.length) return false;
    g.anim = 'cast'; playRig(g, 'cast', true); settle(g, 1300);
    const made = Math.min(n, cells.length);
    for (let i = 0; i < made; i++) {
      const { x, z } = cells[i];
      later(i * 220, () => spawnOne(type, x, z, i === made - 1 ? () => { try { updatePerceptionUI(); saveWorldState(); } catch {} } : null));
    }
    report(g, `${g.id} conjures ${made > 1 ? made + ' ' + type.replace(/_/g, ' ') + 's' : 'a ' + type.replace(/_/g, ' ')}`);
    return true;
  }
  function spawnOne(type, x, z, after) {
    const at = V3(x, groundY(), z);
    // a rune circle that turns and grows, sparkles spiralling up, a light
    const rune = fx(BABYLON.MeshBuilder.CreateGround('spell_rune', { width: 1.5, height: 1.5 }, sc()));
    rune.position.set(x, groundY() + .03, z); rune.material = glowMat('rune', C3(.55, .45, 1), { texture: T.rune(), alpha: .95 });
    tween(1100, u => { rune.rotation.y += .04; const s = u < .25 ? u / .25 : 1; rune.scaling.set(s, 1, s); rune.material.alpha = .95 * (u < .6 ? 1 : 1 - (u - .6) / .4); }, () => kill(rune));
    const sp = particles('spawn_sparkle', 160, at.add(V3(0, .05, 0)), T.flare());
    Object.assign(sp, { minSize: .03, maxSize: .09, minLifeTime: .5, maxLifeTime: .9, emitRate: 200, minEmitPower: .3, maxEmitPower: .8, gravity: V3(0, 2.2, 0) });
    sp.createCylinderEmitter(.5, .05, 0, 0);
    sp.color1 = C4(.7, .6, 1, 1); sp.color2 = C4(.5, .9, 1, 1); sp.colorDead = C4(.4, .2, 1, 0);
    sp.minAngularSpeed = 0; sp.maxAngularSpeed = 0; sp.start(); retire(sp, 500);
    const L = light(at.add(V3(0, .6, 0)), C3(.6, .55, 1), 0, 3.5);
    tween(1000, u => { L.intensity = 3 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (.85 + Math.random() * .3); }, () => kill(L));
    SOUND.poof(at.add(V3(0, .4, 0)));
    later(330, () => {
      let obj = null;
      try {
        if (ITEM_CATALOG[type]) obj = makeCatalogItem(sc(), type, x, z, { ry: Math.round(Math.random() * 4) * Math.PI / 2 });
        else if (BUILTIN[type]) obj = window[BUILTIN[type]]?.(sc(), x, z);
        else obj = window.tablefolkScenery?.make(type, x, z);
      } catch (e) { console.warn('[spells] spawn', type, e); }
      const puff = particles('spawn_puff', 40, at.add(V3(0, .3, 0)), T.smoke(), { blend: 'std' });
      Object.assign(puff, { minSize: .35, maxSize: .7, minLifeTime: .6, maxLifeTime: 1.1, minEmitPower: .5, maxEmitPower: 1.3, gravity: V3(0, .4, 0) });
      puff.createSphereEmitter(.3, 1); grad(puff, [[0, C4(.9, .85, 1, .0)], [.1, C4(.85, .8, 1, .6)], [1, C4(.7, .65, .9, 0)]]);
      puff.addSizeGradient(0, .5); puff.addSizeGradient(1, 1.8);
      burst(puff, 30, 90);
      groundRing(at, C3(.6, .5, 1), { size: 2.2, ms: 400, alpha: .7 });
      void obj; after?.();
    });
  }

  window.tablefolkSpells = { cast, spawn, fireballVfx, resolveThing, sound: SOUND };
})();
