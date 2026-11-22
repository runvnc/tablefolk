/* sfx.js -- small synthesized sound effects (Web Audio, no files).
 *
 *   window.tablefolkSfx.play(name, pos)   name: doorOpen, doorClose,
 *       chestOpen, coins, pickup, swing, swingHeavy, hit (fists), hitBlade,
 *       hitBlunt, miss, step
 *   pos (optional {x, z} or {x, y, z}): a world sound, placed in 3D (2026-11-22): a
 *   Web Audio PannerNode at that spot, panned by where it is relative to the view
 *   (the listener faces the way the camera looks) and fainter with distance from
 *   the listener's position (the player's avatar, else the camera's target; in first
 *   person the eyes): full within 1.5 m, half at 3 m, silent beyond MAX_DIST (20 m).
 *   No pos: a UI sound, not placed (the player's own swing, a threat's horn).
 *   window.tablefolkSfx.volume            the effects' volume 0..1 (Settings; saved)
 *   window.tablefolkSfx.measure(name)     peak and RMS of one effect (tests: level checks)
 *   window.tablefolkSfx.enabled           false mutes (saved in localStorage)
 *   window.tablefolkSfx.context()         { ctx, master, noise } for spells.js's
 *       positional sounds (null while muted or before the first gesture)
 *
 * The audio context starts on the first click or key press (browsers block
 * sound before a user gesture). Doors and hits play recorded samples
 * (Kenney's RPG Audio and Impact Sounds, CC0, assets/sounds/kenney-*), one
 * picked at random, layered with a synthesized thump; the rest are
 * synthesized, as are all of them until the samples have loaded.
 *   window.tablefolkSfx.voiceBuffer(bank)  a random recorded cry or call from
 *       a voice bank (null until loaded; reactions.js plays them)
 *   window.tablefolkSfx.register(name, url | [urls]) / registerAll(map, baseUrl, from)
 *       a pack's or package's "sounds" (packages.js, packs.js): play(name)
 *       finds them first; unregister(name) (a package's reset)
 *   window.tablefolkSfx.requested         the last 50 play() calls ({ name, at }),
 *       played or not (tests: "was the howl asked for")
 */
(function () {
  let ctx = null, master = null, noiseBuf = null;
  const KEY = 'tablefolk.sfx';
  let enabled = true, volume = .8;
  try { enabled = localStorage.getItem(KEY) !== 'off'; const v = parseFloat(localStorage.getItem(KEY + '.volume')); if (v >= 0 && v <= 1) volume = v; } catch {}
  const MASTER = .55;

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER * volume; master.connect(ctx.destination);
    const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const n5 = (dir, f) => [0, 1, 2, 3, 4].map(i => dir + f + '_00' + i);
  const SAMPLES = {
    doorOpen: ['kenney-rpg/doorOpen_1', 'kenney-rpg/doorOpen_2'],
    doorClose: ['kenney-rpg/doorClose_1', 'kenney-rpg/doorClose_2', 'kenney-rpg/doorClose_3', 'kenney-rpg/doorClose_4'],
    punch: n5('kenney-impact/', 'impactPunch_heavy').concat(n5('kenney-impact/', 'impactPunch_medium')),
    slice: ['kenney-rpg/knifeSlice', 'kenney-rpg/knifeSlice2', 'kenney-rpg/chop'],
    soft: n5('kenney-impact/', 'impactSoft_heavy'),
    metal: n5('kenney-impact/', 'impactMetal_medium'),
  };
  const decoded = {}; let loading = false;
  function loadSamples() {
    if (loading || !ctx) return; loading = true;
    const base = new URL('../assets/sounds/', document.baseURI);
    for (const [name, files] of Object.entries(SAMPLES)) for (const f of files)
      fetch(new URL(f + '.ogg?v=20261024a', base)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .then(b => ctx.decodeAudioData(b)).then(buf => (decoded[name] ||= []).push(buf))
        .catch(e => console.warn('sfx sample', f, e));
  }
  function sample(name, out, t, gain = 1) {
    const list = decoded[name]; if (!list?.length) return false;
    const src = ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = .94 + Math.random() * .12;
    let to = out; if (gain !== 1) { to = ctx.createGain(); to.gain.value = gain; to.connect(out); }
    src.connect(to); src.start(t);
    return true;
  }
  // Voices (assets/sounds/voices/, CC0 recordings picked and checked by ear,
  // see its LICENSE.txt): banks of short clips, banks.json lists them:
  // people (hurt_m, hurt_f, die_m), monsters (mon_*, big_*, undead_*,
  // small_hurt, bug, flesh) and animals (cow, bull, pig, horse, donkey,
  // alpaca, sheep, deer, howl, bark, fox, frog, hiss, buzz). reactions.js
  // picks the bank for a body; voiceBuffer(bank) is null until loaded.
  const voices = {}; let voicesLoading = false;
  function loadVoices() {
    if (voicesLoading || !ctx) return; voicesLoading = true;
    const base = new URL('../assets/sounds/voices/', document.baseURI);
    fetch(new URL('banks.json?v=20261114a', base)).then(r => r.json()).then(banks => {
      for (const [bank, files] of Object.entries(banks)) for (const f of files)
        fetch(new URL(f + '?v=20261114a', base)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
          .then(b => ctx.decodeAudioData(b)).then(buf => (voices[bank] ||= []).push(buf)).catch(e => console.warn('voice', f, e));
    }).catch(e => console.warn('voices', e));
  }
  let lastPick = {};
  function voiceBuffer(bank) {
    const list = voices[bank]; if (!list?.length) return null;
    // never the same clip twice running
    let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === lastPick[bank]) i = (i + 1) % list.length;
    lastPick[bank] = i; return list[i];
  }
  function flesh(out, t, gain) {
    const b = voiceBuffer('flesh'); if (!b) return false;
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = .9 + Math.random() * .2;
    const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(out); src.start(t); return true;
  }
  const wake = () => { try { audio()?.resume(); loadSamples(); loadVoices(); } catch {} };
  addEventListener('pointerdown', wake, { capture: true });
  addEventListener('keydown', wake, { capture: true });

  // the listener: at the player (ear height), facing the way the view looks
  const MAX_DIST = 20, REF = 1.5;
  function listener() {
    const s = window.TABLEFOLK_STATE, g = s?.playerAvatar, cam = s?.scene?.activeCamera;
    const p = s?.firstPerson && cam ? cam.globalPosition : g?.logicalPos || g?.root?.position || cam?.target;
    if (!p) return null;
    const top = s?.terrainTopY ?? 0, y = s?.firstPerson ? p.y : top + 1.5;
    let fx = 0, fy = 0, fz = 1;
    const f = cam?.getForwardRay?.(1)?.direction; if (f) { fx = f.x; fy = f.y; fz = f.z; }
    return { x: p.x, y, z: p.z, fx, fy, fz };
  }
  // how far a sound is (for the cut-off and the tests); 0 for UI sounds
  function distanceOf(pos) { const l = pos && listener(); return l ? Math.hypot(pos.x - l.x, pos.z - l.z) : 0; }
  // the chain a placed sound goes through: its own gain (the fade to nothing near MAX_DIST)
  // into a panner at its spot; the listener set from the view at each sound
  function placed(pos) {
    const l = listener(), out = ctx.createGain();
    if (!l) { out.connect(master); return out; }
    const d = Math.hypot(pos.x - l.x, pos.z - l.z); if (d > MAX_DIST) return null;
    const L = ctx.listener, t = ctx.currentTime;
    // Babylon's left-handed world into Web Audio's right-handed one: z flipped
    if (L.positionX) { L.positionX.setValueAtTime(l.x, t); L.positionY.setValueAtTime(l.y, t); L.positionZ.setValueAtTime(-l.z, t); L.forwardX.setValueAtTime(l.fx, t); L.forwardY.setValueAtTime(l.fy, t); L.forwardZ.setValueAtTime(-l.fz, t); L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t); }
    else { L.setPosition(l.x, l.y, -l.z); L.setOrientation(l.fx, l.fy, -l.fz, 0, 1, 0); }
    const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = REF; p.rolloffFactor = 1; p.maxDistance = 10000;
    const y = pos.y ?? (window.TABLEFOLK_STATE?.terrainTopY ?? 0) + 1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = y; p.positionZ.value = -pos.z; } else p.setPosition(pos.x, y, -pos.z);
    out.gain.value = d > MAX_DIST - 6 ? (MAX_DIST - d) / 6 : 1;   // the last 6 m fade out
    out.connect(p); p.connect(master);
    return out;
  }
  function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = .4, attack = .005 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(g); src.start(t, Math.random() * .5); src.stop(t + dur + .05);
    return g;
  }
  function tone(t, dur, { wave = 'sine', f0 = 200, f1 = null, gain = .3, attack = .005 } = {}) {
    const o = ctx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + .05);
    return { o, g };
  }
  // A wooden creak: stick-slip friction, a train of tiny clicks whose rate
  // wanders (rate0 -> rate1 per second), each ringing a resonant body (the
  // door's wood, around `body` Hz). Rendered sample by sample into a buffer.
  function creak(out, t, dur, { rate0 = 28, rate1 = 70, body = 950, gain = .35 } = {}) {
    const sr = ctx.sampleRate, n = Math.floor(dur * sr), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let next = 0, ring = 0, ph = 0, f = body;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if (i >= next) {
        const rate = (rate0 + (rate1 - rate0) * u) * (.75 + Math.random() * .5);
        next = i + sr / rate; ring = .6 + Math.random() * .4; f = body * (.85 + Math.random() * .3);
      }
      ph += 2 * Math.PI * f / sr;
      const env = Math.min(1, u * 12) * Math.min(1, (1 - u) * 5);
      d[i] = (Math.sin(ph) * ring + (Math.random() * 2 - 1) * ring * .25) * env;
      ring *= .9975;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = body; f1.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f1); f1.connect(g); g.connect(out); src.start(t);
  }
  // latch: a sharp little metal tick
  function latch(out, t, gain = .5) {
    noise(t, .035, { type: 'highpass', freq: 2500, gain, attack: .001 }).connect(out);
    tone(t, .05, { wave: 'triangle', f0: 2600, f1: 1800, gain: gain * .5, attack: .001 }).g.connect(out);
  }

  // A swing through the air: noise through a band that sweeps up and back
  // down, loudest mid-swing.
  function whoosh(out, t, dur, f0, f1, gain) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * .55); f.frequency.exponentialRampToValueAtTime(f0 * .8, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * .5); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }
  // the weight of a blow landing: a short falling sine and a dull knock
  function thump(out, t, gain) {
    tone(t, .16, { f0: 120, f1: 45, gain: .55 * gain, attack: .002 }).g.connect(out);
    noise(t, .08, { type: 'lowpass', freq: 500, gain: .5 * gain, attack: .001 }).connect(out);
  }

  // Each effect's level (2026-11-22, a pass with measure(): doors were the loudest thing
  // in the game, a full-scale recording, ~14x a footstep's RMS at .55): doors and chests
  // now at about a footstep's RMS (~.013), blows ~.13 (they were ~.2), a miss a little up.
  const LEVEL = { doorOpen: .07, doorClose: .08, chestOpen: .25, coins: 1, pickup: .8, swing: .8, swingHeavy: .8, hit: .45, hitNatural: .45, hitBlade: .45, hitBlunt: .45, hitMetal: .55, miss: 1.5, step: 1 };
  const SOUNDS = {
    doorOpen(out, t) { latch(out, t); creak(out, t + .03, .5, { rate0: 22, rate1: 55, body: 820 + Math.random() * 200 }); },
    doorClose(out, t) {
      creak(out, t, .14, { rate0: 50, rate1: 70, body: 1000, gain: .2 });
      const th = t + .12;
      noise(th, .2, { type: 'lowpass', freq: 320, q: .7, gain: 1, attack: .002 }).connect(out);
      tone(th, .16, { f0: 110, f1: 55, gain: .5, attack: .002 }).g.connect(out);
      latch(out, th + .05, .35);
    },
    chestOpen(out, t) { latch(out, t, .4); creak(out, t + .04, .32, { rate0: 35, rate1: 60, body: 1300, gain: .25 }); },
    coins(out, t) {
      for (let i = 0; i < 7; i++) {
        const k = t + i * .045 + Math.random() * .03;
        tone(k, .18, { wave: 'triangle', f0: 2200 + Math.random() * 1800, gain: .07 }).g.connect(out);
        noise(k, .05, { type: 'highpass', freq: 5000, gain: .05 }).connect(out);
      }
    },
    pickup(out, t) { tone(t, .12, { wave: 'triangle', f0: 520, f1: 880, gain: .18 }).g.connect(out); tone(t + .08, .14, { wave: 'triangle', f0: 880, f1: 1320, gain: .14 }).g.connect(out); },
    swing(out, t) { whoosh(out, t, .26, 700, 2600, .55); },
    swingHeavy(out, t) { whoosh(out, t, .38, 380, 1500, .7); },
    // fists: a recorded punch over a low body thump
    hit(out, t) { sample('punch', out, t, 1.1) || noise(t, .14, { type: 'lowpass', freq: 900, gain: .7 }).connect(out); thump(out, t, .9); },
    // a bite or claw: a wet crunch (the voices' flesh bank) over the thump
    hitNatural(out, t) { flesh(out, t, .8) || sample('soft', out, t, 1); thump(out, t, .9); },
    hitBlade(out, t) { if (Math.random() < .5) flesh(out, t + .01, .45); sample('slice', out, t, .9); sample('punch', out, t + .01, .7) || noise(t, .1, { type: 'highpass', freq: 2500, gain: .4 }).connect(out); thump(out, t, .6); },
    hitBlunt(out, t) { sample('soft', out, t, 1) || sample('punch', out, t); thump(out, t, 1.1); },
    hitMetal(out, t) { sample('metal', out, t, .8); sample('punch', out, t, .6); thump(out, t, .5); },
    miss(out, t) { whoosh(out, t, .18, 1400, 600, .2); },
    step(out, t) { noise(t, .07, { type: 'lowpass', freq: 420, gain: .18 }).connect(out); },
  };

  // Sounds a pack or package names ("sounds": { "howl": "sounds/howl.ogg" }):
  // fetched and decoded on first play, cached; they win over the built-in
  // names. A list of files is a bank: one picked at random each time.
  const REG = {};   // name -> { urls, from, bufs: Promise<AudioBuffer[]> | null }
  function register(name, url, from = '') {
    name = String(name);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name)) throw new Error(`sound "${name}": use letters, digits, _ and -`);
    REG[name] = { urls: [].concat(url).map(String), from, bufs: null };
    return name;
  }
  function registerAll(map, baseUrl = location.href, from = '') {
    const out = [];
    for (const [name, src] of Object.entries(map && typeof map === 'object' ? map : {})) {
      try { out.push(register(name, [].concat(src).map(u => new URL(u, baseUrl).href), from)); } catch (e) { console.warn('[sfx]', e.message); }
    }
    return out;
  }
  const unregister = name => { delete REG[name]; };
  function registered(name, out, t) {
    const r = REG[name]; if (!r) return false;
    r.bufs ||= Promise.all(r.urls.map(u => fetch(u).then(x => x.ok ? x.arrayBuffer() : Promise.reject(x.status)).then(b => ctx.decodeAudioData(b)).catch(e => { console.warn('[sfx] sound', name, u, e); return null; }))).then(l => l.filter(Boolean));
    r.bufs.then(list => {
      if (!list.length) return;
      const src = ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)];
      src.connect(out); src.start(Math.max(t, ctx.currentTime));
      setTimeout(() => { try { out.disconnect(); } catch {} }, src.buffer.duration * 1000 + 500);
    });
    return true;
  }
  // every sound asked for, played or not (muted, no audio yet): tests and the dev console
  const requested = [];
  function play(name, pos) {
    const d = pos && Number.isFinite(pos.x) ? distanceOf(pos) : null;
    requested.push({ name: String(name), at: Date.now(), dist: d == null ? null : Math.round(d * 10) / 10 }); if (requested.length > 50) requested.shift();
    if (!enabled || (!SOUNDS[name] && !REG[name])) return;
    if (!audio() || ctx.state !== 'running') return;
    const out = d == null ? ctx.createGain() : placed(pos); if (!out) return;   // too far to hear
    if (d == null) out.connect(master);
    if (REG[name]) { registered(name, out, ctx.currentTime); return; }
    const lv = ctx.createGain(); lv.gain.value = LEVEL[name] ?? 1; lv.connect(out);
    try { (SAMPLES[name] && sample(name, lv, ctx.currentTime)) || SOUNDS[name](lv, ctx.currentTime + .01); } catch (e) { console.warn('sfx', name, e); }
    setTimeout(() => { try { out.disconnect(); lv.disconnect(); } catch {} }, 3000);
  }
  // one effect rendered offline: { peak, rms } (the level pass, tests); its own context swapped in
  async function measure(name) {
    if (!SOUNDS[name] || !audio()) return null;
    const real = ctx, sr = real.sampleRate, off = new OfflineAudioContext(1, Math.round(sr * 1.5), sr);
    ctx = off; let buf;
    try { const lv = off.createGain(); lv.gain.value = LEVEL[name] ?? 1; lv.connect(off.destination); (SAMPLES[name] && sample(name, lv, 0)) || SOUNDS[name](lv, .01); } finally { ctx = real; }
    buf = await off.startRendering();
    const a = buf.getChannelData(0); let pk = 0, ss = 0, n = 0; for (const v of a) { pk = Math.max(pk, Math.abs(v)); ss += v * v; } for (const v of a) if (Math.abs(v) > pk * .05) n++;
    return { peak: +pk.toFixed(3), rms: +Math.sqrt(ss / Math.max(1, n)).toFixed(3), sampled: !!(SAMPLES[name] && decoded[name]?.length) };
  }

  // Settings: the effects' volume slider
  const wire = () => { const el = document.getElementById('sfxVolume'); if (!el || el._tf) return; el._tf = true; el.value = volume; el.addEventListener('input', () => { window.tablefolkSfx.volume = el.value; }); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 0);
  window.tablefolkSfx = {
    play, voiceBuffer, register, registerAll, unregister, requested, measure, distanceOf, MAX_DIST, has: name => !!(SOUNDS[name] || REG[name]),
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, +v || 0)); if (master) master.gain.value = MASTER * volume; try { localStorage.setItem(KEY + '.volume', String(volume)); } catch {} },
    get names() { return [...Object.keys(REG), ...Object.keys(SOUNDS)]; },
    // spells.js builds its own 3D (HRTF) sounds on the same context:
    // { ctx, master, noise } once audio is running, else null.
    context() { return enabled && audio() && ctx.state === 'running' ? { ctx, master, noise: noiseBuf } : null; },
    get enabled() { return enabled; },
    set enabled(on) { enabled = !!on; try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch {} },
  };
})();
