/* weather.js -- a minimal weather layer: rain, snow, fog, storm, wind and
 * darkness, with sound, that the game, a scenario, the director and packages
 * set. Packages declare kinds of their own on top of these (a green plague
 * fog, a rain of frogs) and pay for them in their powers; core only draws and
 * plays the base kinds.
 *
 *   tablefolkWeather.set(kind, { intensity: 0-1 (1), duration: seconds (0: until changed), area: { x, z, r } | null,
 *                                wind: [x, z] (a direction; default from the kind) }) -> the weather now
 *   tablefolkWeather.clear(), .now() -> { kind, base, intensity, until, area, wind } | null, .kinds(), .register(kind, def, from)
 * Base kinds: clear, rain, snow, fog, storm (rain, lightning, thunder), wind, dark.
 * A package kind: { base: 'rain' | 'snow' | 'fog' | 'storm' | 'wind' | 'dark', color: [r, g, b] (particles, fog),
 *   intensity, sound: a package sound name (looped), label, onStart(w, api), onTick(w, api) (every game quarter
 *   hour while it lasts), onEnd(w, api) }.
 * The world flag "weather" holds the kind's name ("clear" when none), so conditions, triggers and
 * characters' cards can follow it; "tablefolk-weather" ({ kind, intensity, area }) fires on a change.
 * A scenario's "weather": "rain" or { "kind": "fog", "intensity": 0.6 } is its weather at the start.
 * Visuals: one particle system that follows the view (or covers the area), the scene's fog for fog,
 * a shade over the screen for darkness and the storm's flashes; sound: filtered noise (rain, wind)
 * and thunder made with Web Audio (no files). ?art=1 and the tabletop view draw it too.
 * Loaded after sky.js and sfx.js; uses app.js globals (state).
 */
(function () {
  const BASE = {
    clear: { particles: 0 },
    rain: { particles: 2600, speed: 16, size: [.03, .05], len: 9, color: [.72, .8, .95], alpha: .5, sound: 'rain', fog: .006, shade: .12, wind: [.25, .1] },
    snow: { particles: 1800, speed: 1.6, size: [.06, .12], len: 0, color: [1, 1, 1], alpha: .9, sound: 'wind', fog: .012, shade: .05, wind: [.4, .1] },
    fog: { particles: 0, fog: .07, fogColor: [.62, .66, .7], shade: .08, sound: null },
    storm: { particles: 4200, speed: 22, size: [.03, .06], len: 11, color: [.68, .76, .92], alpha: .55, sound: 'rain', fog: .012, shade: .32, wind: [1.1, .3], lightning: true },
    wind: { particles: 220, speed: 2, size: [.05, .09], len: 0, color: [.55, .48, .3], alpha: .8, sound: 'wind', fog: 0, shade: 0, wind: [5, 1.2] },
    dark: { particles: 0, fog: .02, fogColor: [.02, .02, .04], shade: .62, sound: null },
  };
  const KINDS = new Map(Object.entries(BASE).map(([k, d]) => [k, { base: k, label: k, ...d }]));
  let cur = null, ps = null, timer = null, shadeEl = null, fogWas = null, audio = null, flashT = 0, thunderT = 0;
  const S = () => state.scene;
  const flag = v => { try { window.tablefolkStory?.set?.('weather', v); } catch {} };
  const api = () => window.tablefolkPackages?.api?.();

  function register(kind, def = {}, from = null) {
    const base = BASE[def.base] ? def.base : 'rain';
    KINDS.set(String(kind), { ...BASE[base], ...def, base, label: def.label || String(kind).replace(/_/g, ' '), from, color: def.color || BASE[base].color, fogColor: def.fogColor || def.color || BASE[base].fogColor });
    return KINDS.get(String(kind));
  }
  function resetPackaged() { for (const [k, d] of [...KINDS]) if (d.from) KINDS.delete(k); if (cur && !KINDS.has(cur.kind)) clear(); }

  // ---- drawing
  function streakTexture(sc, len) {
    const t = new BABYLON.DynamicTexture('wx_tex', { width: 16, height: len ? 64 : 16 }, sc, false); const c = t.getContext();
    c.clearRect(0, 0, 16, len ? 64 : 16);
    if (len) { const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = g; c.fillRect(6, 0, 4, 64); }
    else { const g = c.createRadialGradient(8, 8, 0, 8, 8, 8); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 16, 16); }
    t.hasAlpha = true; t.update(); return t;
  }
  function center() {
    if (cur?.area) return new BABYLON.Vector3(cur.area.x, 0, cur.area.z);
    const t = state.camera?.target || state.playerAvatar?.root?.position || BABYLON.Vector3.Zero(); return new BABYLON.Vector3(t.x, 0, t.z);
  }
  function startParticles(d, k) {
    stopParticles(); const sc = S(); if (!sc || !d.particles) return;
    const n = Math.round(d.particles * Math.max(.15, k)), r = cur.area ? Math.max(2, +cur.area.r || 6) : 16, top = (state.terrainTopY ?? 0) + 9;
    ps = new BABYLON.ParticleSystem('weather', n, sc);
    ps.particleTexture = streakTexture(sc, d.len);
    const emitter = new BABYLON.Vector3(0, top, 0); ps.emitter = emitter;
    ps.minEmitBox = new BABYLON.Vector3(-r, 0, -r); ps.maxEmitBox = new BABYLON.Vector3(r, 1, r);
    const [cr, cg, cb] = d.color || [1, 1, 1];
    ps.color1 = new BABYLON.Color4(cr, cg, cb, d.alpha ?? .7); ps.color2 = new BABYLON.Color4(cr, cg, cb, (d.alpha ?? .7) * .7); ps.colorDead = new BABYLON.Color4(cr, cg, cb, 0);
    ps.minSize = d.size[0]; ps.maxSize = d.size[1];
    if (d.len) { ps.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED; ps.minScaleY = d.len * .5; ps.maxScaleY = d.len; }
    const w = cur.wind || d.wind || [0, 0];
    ps.direction1 = new BABYLON.Vector3(w[0] - .2, -d.speed, w[1] - .2); ps.direction2 = new BABYLON.Vector3(w[0] + .2, -d.speed * .85, w[1] + .2);
    if (d.base === 'wind') { ps.direction1 = new BABYLON.Vector3(w[0], -.4, w[1]); ps.direction2 = new BABYLON.Vector3(w[0] * 1.3, .3, w[1] * 1.3); ps.minEmitBox.y = -8.5; ps.maxEmitBox.y = -7.5; }
    ps.minEmitPower = 1; ps.maxEmitPower = 1; ps.updateSpeed = .016;
    const life = d.base === 'wind' ? 4 : (top + 1) / d.speed; ps.minLifeTime = life * .8; ps.maxLifeTime = life * 1.05;
    ps.emitRate = n / life; ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD; ps.gravity = BABYLON.Vector3.Zero();
    ps.start();
    ps._follow = sc.onBeforeRenderObservable.add(() => { const c = center(); emitter.x = c.x; emitter.z = c.z; });
  }
  function stopParticles() { if (!ps) return; try { S()?.onBeforeRenderObservable.remove(ps._follow); ps.stop(); ps.particleTexture?.dispose(); ps.dispose(); } catch {} ps = null; }
  function shade(alpha, color = '0,0,0') {
    if (!shadeEl) { shadeEl = document.createElement('div'); shadeEl.id = 'weatherShade'; shadeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;transition:background-color 1.2s ease'; document.body.appendChild(shadeEl); }
    shadeEl.style.backgroundColor = alpha > 0 ? `rgba(${color},${alpha})` : 'transparent';
  }
  function fog(d, k) {
    const sc = S(); if (!sc) return;
    if (!fogWas) fogWas = { mode: sc.fogMode, density: sc.fogDensity, color: sc.fogColor?.clone?.() };
    if (!d.fog) { restoreFog(); return; }
    sc.fogMode = BABYLON.Scene.FOGMODE_EXP2; sc.fogDensity = Math.max(fogWas.density || 0, d.fog * Math.max(.2, k));
    if (d.fogColor) sc.fogColor = new BABYLON.Color3(...d.fogColor);
  }
  function restoreFog() { const sc = S(); if (sc && fogWas) { sc.fogMode = fogWas.mode; sc.fogDensity = fogWas.density; if (fogWas.color) sc.fogColor = fogWas.color; } fogWas = null; }

  // ---- sound: noise through filters (rain: a hiss, wind: a low moan), thunder bursts
  function ctxA() { try { return (audio ||= { ac: new (window.AudioContext || window.webkitAudioContext)() }).ac; } catch { return null; } }
  function noise(ac) { const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; s.loop = true; return s; }
  function startSound(d, k) {
    stopSound(); const ac = ctxA(); if (!ac || !d.sound) return;
    const vol = (window.tablefolkSfx?.volume ?? 1) * .35 * Math.max(.2, k);
    // a package's own sound by name (sfx.js), looped by playing it again
    if (!['rain', 'wind'].includes(d.sound)) { const again = () => { if (!cur) return; window.tablefolkSfx?.play?.(d.sound); audio.loop = setTimeout(again, 6000); }; again(); return; }
    const src = noise(ac), f = ac.createBiquadFilter(), g = ac.createGain();
    if (d.sound === 'rain') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .5; g.gain.value = vol * .5; }
    else { f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = vol * .8; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .13; lg.gain.value = 180; lfo.connect(lg).connect(f.frequency); lfo.start(); audio.lfo = lfo; }
    src.connect(f).connect(g).connect(ac.destination); src.start(); audio.src = src; audio.gain = g;
    if (ac.state === 'suspended') addEventListener('pointerdown', () => ac.resume(), { once: true });
  }
  function stopSound() { if (!audio) return; try { audio.src?.stop(); audio.lfo?.stop(); } catch {} clearTimeout(audio.loop); audio.src = audio.lfo = audio.gain = null; }
  function thunder(k) {
    const ac = ctxA(); if (!ac) return;
    const src = noise(ac), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + .4 + Math.random() * 1.2;
    f.type = 'lowpass'; f.frequency.value = 160; g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(.55 * Math.max(.3, k) * (window.tablefolkSfx?.volume ?? 1), t); g.gain.exponentialRampToValueAtTime(.001, t + 2.6);
    src.connect(f).connect(g).connect(ac.destination); src.start(); src.stop(t + 2.8);
  }
  function flash() {
    shade(.0); if (!shadeEl) return; shadeEl.style.transition = 'none'; shadeEl.style.backgroundColor = 'rgba(235,240,255,.55)';
    setTimeout(() => { shadeEl.style.transition = 'background-color .5s ease'; apply(true); }, 90);
  }
  let tick = null;
  function storm() {
    if (!cur || !KINDS.get(cur.kind)?.lightning) return;
    const now = performance.now();
    if (now > flashT) { flash(); flashT = now + (6000 + Math.random() * 12000) / Math.max(.3, cur.intensity); thunder(cur.intensity); }
  }

  function apply(quiet = false) {
    const d = cur && KINDS.get(cur.kind);
    if (!d || d.base === 'clear') { stopParticles(); shade(0); restoreFog(); if (!quiet) stopSound(); return; }
    const k = cur.intensity;
    shade((d.shade || 0) * k, d.base === 'fog' ? '140,150,160' : '0,0,10');
    if (quiet) return;
    startParticles(d, k); fog(d, k); startSound(d, k);
  }
  function set(kind, o = {}) {
    const k = String(kind || 'clear');
    if (!KINDS.has(k)) throw new Error(`no weather "${k}" (${[...KINDS.keys()].join(', ')})`);
    const prev = cur;
    if (prev && prev.kind !== k) { try { KINDS.get(prev.kind)?.onEnd?.(prev, api()); } catch (e) { console.warn('[weather]', e); } }
    clearTimeout(timer);
    if (k === 'clear') { cur = null; apply(); flag('clear'); emit(); return null; }
    const d = KINDS.get(k);
    cur = { kind: k, base: d.base, label: d.label, intensity: Math.max(.05, Math.min(1, o.intensity ?? d.intensity ?? 1)), area: o.area && Number.isFinite(+o.area.x) ? { x: +o.area.x, z: +o.area.z, r: +o.area.r || 6 } : null,
      wind: Array.isArray(o.wind) ? o.wind : d.wind, until: o.duration ? Date.now() + o.duration * 1000 : 0, from: o.from || null };
    apply(); flag(k); emit();
    if (o.duration) timer = setTimeout(() => set('clear'), o.duration * 1000);
    try { d.onStart?.(cur, api()); } catch (e) { console.warn('[weather] onStart', e); }
    if (d.lightning) { flashT = performance.now() + 1500; }
    return cur;
  }
  const clear = () => set('clear');
  const emit = () => dispatchEvent(new CustomEvent('tablefolk-weather', { detail: cur ? { kind: cur.kind, intensity: cur.intensity, area: cur.area } : { kind: 'clear', intensity: 0, area: null } }));
  setInterval(storm, 500);
  addEventListener('tablefolk-clock', () => { const d = cur && KINDS.get(cur.kind); if (d?.onTick) try { d.onTick(cur, api()); } catch (e) { console.warn('[weather] onTick', e); } });
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    const w = window.tablefolkScenario?.active?.scn?.weather;
    try { if (w) set(typeof w === 'string' ? w : w.kind, typeof w === 'object' ? w : {}); else if (cur) clear(); } catch (err) { console.warn('[weather]', err.message); }
  });
  (window.tablefolkSaveHooks ||= {}).weather = { save: () => cur ? { kind: cur.kind, intensity: cur.intensity, area: cur.area, left: cur.until ? Math.max(1, (cur.until - Date.now()) / 1000) : 0 } : null, restore: x => { try { if (x?.kind && KINDS.has(x.kind)) set(x.kind, { intensity: x.intensity, area: x.area, duration: x.left || 0 }); } catch {} } };
  window.tablefolkWeather = { set, clear, now: () => cur ? { ...cur } : null, kinds: () => [...KINDS.keys()], register, resetPackaged };
})();
