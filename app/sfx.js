/* sfx.js -- small synthesized sound effects (Web Audio, no files).
 *
 *   window.tablefolkSfx.play(name, pos)   name: doorOpen, doorClose,
 *       chestOpen, coins, pickup, hit, miss, step
 *   pos (optional {x, z}): quieter with distance from the listener (the
 *   player's avatar, else the camera target).
 *   window.tablefolkSfx.enabled           false mutes (saved in localStorage)
 *
 * The audio context starts on the first click or key press (browsers block
 * sound before a user gesture). Doors play recorded samples (Kenney's RPG
 * Audio, CC0, assets/sounds/kenney-rpg/), one picked at random; the rest
 * are synthesized, as are doors until their samples have loaded.
 */
(function () {
  let ctx = null, master = null, noiseBuf = null;
  const KEY = 'tablefolk.sfx';
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const SAMPLES = {
    doorOpen: ['doorOpen_1', 'doorOpen_2'],
    doorClose: ['doorClose_1', 'doorClose_2', 'doorClose_3', 'doorClose_4'],
  };
  const decoded = {}; let loading = false;
  function loadSamples() {
    if (loading || !ctx) return; loading = true;
    const base = new URL('../assets/sounds/kenney-rpg/', document.baseURI);
    for (const [name, files] of Object.entries(SAMPLES)) for (const f of files)
      fetch(new URL(f + '.ogg?v=20261023a', base)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .then(b => ctx.decodeAudioData(b)).then(buf => (decoded[name] ||= []).push(buf))
        .catch(e => console.warn('sfx sample', f, e));
  }
  function sample(name, out, t) {
    const list = decoded[name]; if (!list?.length) return false;
    const src = ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = .94 + Math.random() * .12;
    src.connect(out); src.start(t);
    return true;
  }
  const wake = () => { try { audio()?.resume(); loadSamples(); } catch {} };
  addEventListener('pointerdown', wake, { capture: true });
  addEventListener('keydown', wake, { capture: true });

  function listener() {
    const s = window.TABLEFOLK_STATE, g = s?.playerAvatar;
    const p = g?.logicalPos || g?.root?.position || s?.camera?.target;
    return p ? { x: p.x, z: p.z } : null;
  }
  function volumeAt(pos) {
    if (!pos) return 1;
    const l = listener(); if (!l) return 1;
    const d = Math.hypot(pos.x - l.x, pos.z - l.z);
    return d > 14 ? 0 : 1 / (1 + d * d * .05);
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
    hit(out, t) { noise(t, .14, { type: 'lowpass', freq: 900, gain: .7 }).connect(out); tone(t, .12, { f0: 160, f1: 60, gain: .4 }).g.connect(out); },
    miss(out, t) { noise(t, .22, { type: 'bandpass', freq: 1800, q: .6, gain: .25, attack: .06 }).connect(out); },
    step(out, t) { noise(t, .07, { type: 'lowpass', freq: 420, gain: .18 }).connect(out); },
  };

  function play(name, pos) {
    if (!enabled || !SOUNDS[name]) return;
    if (!audio() || ctx.state !== 'running') return;
    const v = volumeAt(pos); if (v < .02) return;
    const out = ctx.createGain(); out.gain.value = v; out.connect(master);
    try { sample(name, out, ctx.currentTime) || SOUNDS[name](out, ctx.currentTime + .01); } catch (e) { console.warn('sfx', name, e); }
    setTimeout(() => { try { out.disconnect(); } catch {} }, 3000);
  }

  window.tablefolkSfx = {
    play,
    get enabled() { return enabled; },
    set enabled(on) { enabled = !!on; try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch {} },
  };
})();
