/* clock.js -- the world's time of day.
 *
 * A living world (live.js on) has a clock: state.clock = { min, day }
 * (minutes since midnight, day 1 first). It runs while the world lives and
 * stops when it is paused. Scenario fields (normalizeScenario):
 *   "time": "08:00"     the start (default 08:00; 21:00 when "lighting" is "night")
 *   "dayMinutes": 12    real minutes a game day takes (default 12); 0 freezes it
 *   "clock": false      no clock at all (as before: night is the lighting)
 * ?dayMinutes=8 in the page address overrides it (tests). The clock is saved
 * with the world (app.js worldStateData) and shown in the HUD (#worldClock,
 * "07:45 · day 2").
 *
 * Every game quarter of an hour it fires 'tablefolk-clock' ({ min, day, hour })
 * and calls tablefolk.setTimeOfDay(hours): for now that only blends the
 * existing lights' intensities between app.js setLighting's presets ('bright'
 * by day, to 'night' over dusk 18-20, on to 'dim' by 22:00, back from 04:00,
 * 'bright' again after dawn 5-7) and darkens the clear and fog colours a little at night. It adds
 * or removes no lights (that would recompile materials). Dark worlds
 * (dungeons, caves, "dark": true) keep their lighting; only the clock runs.
 * The lighting rework is expected to take this hook over.
 *
 *   window.tablefolkClock = { now(), hour(), isNight(), running, set(min, day), fmt(min) }
 * Loaded after live.js; uses app.js globals (state).
 */
(function () {
  const urlDay = +new URLSearchParams(location.search).get('dayMinutes');
  let cfg = { on: false, dayMinutes: 12, dark: true };
  const scn = () => window.tablefolkScenario?.active?.scn || null;
  const parseTime = (t, dflt) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1] % 24) * 60 + Math.min(59, +m[2]) : dflt; };
  const fmt = min => { const m = ((Math.floor(min) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  function now() { const c = state.clock; return c && cfg.on ? { min: c.min, day: c.day, hour: c.min / 60 } : null; }
  const hour = () => now()?.hour ?? null;
  // night for routines: 21:00 to 05:00 by the clock, else the lighting (as before)
  function isNight() { const h = hour(); return h == null ? state.lighting === 'night' : (h >= 21 || h < 5); }

  // ---- the light, blended between setLighting's presets ----
  const LIGHTS = ['tree_key_moved', 'teal_rim', 'cool_fill', 'sky_dome_light'];
  let presets = null, baseColors = null, lastQuarter = -1;
  function snapshot() {
    const sc = state.scene; if (!sc || !window.tablefolk?.setLighting) return null;
    const out = {}, was = state.lighting || 'bright';
    for (const mode of ['bright', 'night', 'dim']) {
      window.tablefolk.setLighting(mode);
      out[mode] = { env: sc.environmentIntensity, lights: Object.fromEntries(LIGHTS.map(n => [n, sc.getLightByName(n)]).filter(([, l]) => l).map(([n, l]) => [n, { i: l.intensity, p: l.position?.clone?.() }])) };
    }
    window.tablefolk.setLighting(was);
    return out;
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  // [preset a, preset b, k] for an hour of the day
  function blendAt(h) {
    if (h >= 7 && h < 18) return ['bright', 'bright', 0];
    if (h >= 18 && h < 20) return ['bright', 'night', (h - 18) / 2];
    if (h >= 20 && h < 22) return ['night', 'dim', (h - 20) / 2];
    if (h >= 4 && h < 5) return ['dim', 'night', h - 4];
    if (h >= 5 && h < 7) return ['night', 'bright', (h - 5) / 2];
    return ['dim', 'dim', 0];
  }
  function setTimeOfDay(h) {
    // sky.js owns the light (sun, moon, sky, fog by the hour); the preset blend below is the fallback
    if (window.tablefolkSky) { if (!cfg.dark) window.tablefolkSky.setTimeOfDay(h); return; }
    const sc = state.scene; if (!sc || cfg.dark) return;
    presets ||= snapshot(); if (!presets) return;
    baseColors ||= { clear: sc.clearColor?.clone?.(), fog: sc.fogColor?.clone?.() };
    const [a, b, k] = blendAt(((h % 24) + 24) % 24), A = presets[a], B = presets[b];
    for (const n of LIGHTS) {
      const l = sc.getLightByName(n), x = A.lights[n], y = B.lights[n]; if (!l || !x || !y) continue;
      l.intensity = lerp(x.i, y.i, k);
      if (x.p && y.p && l.position) l.position.copyFrom(BABYLON.Vector3.Lerp(x.p, y.p, k));
    }
    if (A.env != null && B.env != null) sc.environmentIntensity = lerp(A.env, B.env, k);
    // night darkens the backdrop: 1 by day, .45 deep in the night
    const dark = { bright: 1, night: .75, dim: .45 }, f = lerp(dark[a], dark[b], k);
    if (baseColors.clear) sc.clearColor = new BABYLON.Color4(baseColors.clear.r * f, baseColors.clear.g * f, baseColors.clear.b * Math.min(1, f * 1.15), baseColors.clear.a);
    if (baseColors.fog) sc.fogColor = new BABYLON.Color3(baseColors.fog.r * f, baseColors.fog.g * f, baseColors.fog.b * Math.min(1, f * 1.15));
  }

  // ---- running ----
  let lastAt = performance.now();
  function tick() {
    const t = performance.now(), dt = Math.min(5, (t - lastAt) / 1000); lastAt = t;
    const c = state.clock;
    if (!c || !cfg.on || !cfg.dayMinutes || !window.tablefolkLive?.on) return;
    const before = c.min;
    c.min += dt * 1440 / (cfg.dayMinutes * 60);
    if (c.min >= 1440) { c.min -= 1440; c.day++; }
    const q = Math.floor(c.min / 15) + c.day * 96;
    if (q !== lastQuarter) { lastQuarter = q; quarter(); }
    if (Math.floor(before) !== Math.floor(c.min)) hud();
  }
  function quarter() {
    const c = state.clock; if (!c) return;
    try { (window.tablefolk?.setTimeOfDay || setTimeOfDay)(c.min / 60); } catch (e) { console.warn('[clock] light', e); }
    try { window.dispatchEvent(new CustomEvent('tablefolk-clock', { detail: { min: c.min, day: c.day, hour: c.min / 60 } })); } catch {}
  }
  setInterval(tick, 250);

  function hud() {
    let el = document.getElementById('worldClock');
    const c = state.clock, show = !!(c && cfg.on && (scn()?.live || window.tablefolkLive?.on));
    if (!el) { if (!show) return; el = document.createElement('div'); el.id = 'worldClock'; el.setAttribute('aria-live', 'off'); el.title = 'the time in this world';
      el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:30;padding:3px 10px;border-radius:12px;font:600 13px/1.4 system-ui,sans-serif;background:rgba(20,24,30,.62);color:#f3ead7;pointer-events:none;letter-spacing:.02em';
      document.body.appendChild(el); }
    el.hidden = !show; if (!show) return;
    const h = c.min / 60, icon = h >= 21 || h < 5 ? '☾' : h < 7 || h >= 18 ? '◑' : '☀';
    el.textContent = `${icon} ${fmt(c.min)} · day ${c.day}`;
  }

  function set(min, day = state.clock?.day || 1) { state.clock = { min: ((+min % 1440) + 1440) % 1440, day: Math.max(1, Math.floor(+day) || 1) }; lastQuarter = -1; quarter(); hud(); }
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    const s = scn() || {};
    presets = null; baseColors = null;
    cfg = { on: s.clock !== false, dayMinutes: urlDay > 0 ? urlDay : s.dayMinutes != null && Number.isFinite(+s.dayMinutes) ? Math.max(0, +s.dayMinutes) : 12, dark: !!(s.dark || s.base === 'dungeon' || (s._gen && /cave|dungeon|castle|crypt|keep/i.test(String(s.generate?.kind || '')))) };
    // a restored world keeps its saved time (restoreWorldState put it back)
    if (!state.clock || !state.clockRestored) state.clock = { min: parseTime(s.time, s.lighting === 'night' ? 21 * 60 : 8 * 60), day: 1 };
    state.clockRestored = false;
    lastQuarter = -1;
    // the light for the start time, once the scenario's own lighting is in
    setTimeout(() => { if (cfg.on && (s.live || window.tablefolkLive?.on)) quarter(); hud(); }, 50);
  });
  // the HUD follows live on/off (a world not live by itself shows the clock once it is started)
  setInterval(hud, 2000);

  window.tablefolkClock = { now, hour, isNight, set, fmt, setTimeOfDay, get running() { return !!(state.clock && cfg.on && cfg.dayMinutes && window.tablefolkLive?.on); }, get dayMinutes() { return cfg.dayMinutes; }, get enabled() { return cfg.on; } };
  // the hook the lighting rework takes over (window.tablefolk is published by app.js first)
  const hook = () => { if (window.tablefolk && !window.tablefolk.setTimeOfDay) window.tablefolk.setTimeOfDay = setTimeOfDay; };
  hook(); addEventListener('tablefolk-scene-ready', hook);
})();
