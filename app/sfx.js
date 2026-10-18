/* sfx.js -- small synthesized sound effects (Web Audio, no files).
 *
 *   window.tablefolkSfx.play(name, pos)   name: doorOpen, doorClose,
 *       chestOpen, coins, pickup, hit, miss, step
 *   pos (optional {x, z}): quieter with distance from the listener (the
 *   player's avatar, else the camera target).
 *   window.tablefolkSfx.enabled           false mutes (saved in localStorage)
 *
 * The audio context starts on the first click or key press (browsers block
 * sound before a user gesture).
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
  const wake = () => { try { audio()?.resume(); } catch {} };
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
  // A hinge creak: a buzzy tone whose pitch wanders, through a resonant filter.
  function creak(out, t, dur, base) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = base * 4; f.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .04);
    let k = t;
    o.frequency.setValueAtTime(base, t);
    while (k < t + dur) { k += .03 + Math.random() * .05; o.frequency.linearRampToValueAtTime(base * (.75 + Math.random() * .7), k); g.gain.linearRampToValueAtTime(.06 + Math.random() * .14, k); }
    g.gain.exponentialRampToValueAtTime(.001, t + dur + .05);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .1);
  }

  const SOUNDS = {
    doorOpen(out, t) { creak(out, t, .55, 90 + Math.random() * 40); noise(t, .08, { type: 'lowpass', freq: 600, gain: .25 }).connect(out); },
    doorClose(out, t) {
      creak(out, t, .18, 120);
      const th = t + .16;
      noise(th, .22, { type: 'lowpass', freq: 380, q: .7, gain: .9 }).connect(out);
      tone(th, .2, { f0: 95, f1: 45, gain: .55 }).g.connect(out);
    },
    chestOpen(out, t) { creak(out, t, .35, 150); noise(t + .3, .12, { type: 'lowpass', freq: 500, gain: .4 }).connect(out); },
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
    try { SOUNDS[name](out, ctx.currentTime + .01); } catch (e) { console.warn('sfx', name, e); }
    setTimeout(() => { try { out.disconnect(); } catch {} }, 2000);
  }

  window.tablefolkSfx = {
    play,
    get enabled() { return enabled; },
    set enabled(on) { enabled = !!on; try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch {} },
  };
})();
