/* reactions.js -- how characters move and sound when they cast and when
 * they are hit.
 *
 *   window.tablefolkReact.gesture(g, 'cast', ms)   the cast clip, held for ms
 *   window.tablefolkReact.hit(g, dmg, fatal)       flinch, red flash, a cry
 *   window.tablefolkReact.voice(g, kind)           just the cry ('hurt', 'death')
 *   window.tablefolkReact.render(kind, profile)    the cry as a WAV Blob (tests)
 *
 * Gestures: the rig's cast clip (KayKit/Meshy Ranged_Magic_*, the Quaternius
 * wizard's Spell1, a punch as the last resort) plays once and is HELD for the
 * length of the spell: playRig is wrapped so that the end of a turn
 * (settleWorld) or a line of speech asking for idle/talk waits until the
 * gesture is over (the request is replayed then). A walk, an emote, a hit or
 * death take over at once. A rig with no such clip raises its casting arm
 * procedurally (aimed in world space from bone positions, so any skeleton
 * works): forward and up while it charges, thrust at the target on release.
 * Hits: the rig's Hit_A/Hit_B clip when it has one (combat.js plays it), else
 * a procedural jolt (chest and head thrown back, a small step of the whole
 * body for the ones with no bones); every hit tints the character red for a
 * moment (mesh overlay, no material changes).
 * Voices: synthesized on sfx.js's audio context, positioned in 3D through
 * spells.js's HRTF source (muted with the sound effects, silent before the
 * first click). A glottal source (two detuned saws, a pitch contour, jitter)
 * through three formant filters (a vowel: "uh", "ugh", "oof", "agh"), breath
 * noise and an "h" before it; the pitch and formants come from the character
 * (man, woman, small, big) and vary a little by name. Death is a longer,
 * louder falling cry. Creatures squeak (rat, bat), hiss (spider), yelp (wolf)
 * or growl (giant, troll, orc, dragon, demon); skeletons rattle, slimes
 * squelch, ghosts wail. Not the TTS: a grunt has to land with the blow.
 */
(function () {
  const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);
  const now = () => performance.now();
  const isPlayer = g => g && g === state.playerAvatar;
  const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) { console.warn('[react]', e); } }, ms);

  // ------------------------------------------------------------ held gestures
  const SOFT = new Set(['idle', 'talk', 'cast']);
  const basePlayRig = window.playRig;
  if (typeof basePlayRig === 'function' && !basePlayRig._held) {
    const wrapped = function (g, mode, loop) {
      const h = g?._hold;
      if (h && now() < h.until && !g.defeated && g.activeRigAnim === h.ag && SOFT.has(mode)) { h.then = mode; return; }
      return basePlayRig.apply(this, arguments);
    };
    wrapped._held = true;
    window.playRig = wrapped;   // app.js's own calls resolve the global binding too
  }
  const CAST_CLIPS = ['Ranged_Magic_Spellcasting', 'Ranged_Magic_Shoot', 'Ranged_Magic_Raise', 'Throw', 'Melee_Unarmed_Attack_Punch_A'];
  function gesture(g, kind = 'cast', ms = 1400) {
    if (!g?.root || g.defeated) return;
    g.anim = 'cast';
    if (g.pose) try { window.tablefolkUses?.standUp(g, true); } catch {}
    const ag = g.rigged && g.rigAnims ? CAST_CLIPS.map(n => g.rigAnims[n]).find(Boolean) : null;
    if (ag) {
      const fps = ag.targetedAnimations[0]?.animation.framePerSecond || 30, len = (ag.to - ag.from) / fps * 1000;
      // the thrust lands near the release (spells release at ~480 ms)
      const speed = Math.max(.8, Math.min(1.4, len / Math.max(700, ms * .7)));
      g.activeRigAnim?.stop(); clearTimeout(g._clipTimer);
      ag.start(len / speed < ms * .7, speed, ag.from, ag.to, false);
      g.activeRigAnim = ag; g.rigMode = 'cast';
      const h = g._hold = { ag, until: now() + ms, then: null };
      later(ms + 20, () => {
        if (g._hold !== h) return; g._hold = null;
        if (g.activeRigAnim !== ag || g.defeated) return;
        if (g.anim === 'cast') g.anim = 'idle';
        g.rigMode = null; window.playRig(g, h.then === 'talk' && g.anim === 'talk' ? 'talk' : g.anim === 'walk' ? 'walk' : 'idle', true);
      });
    } else if (g.rigged) {
      procArm(g, ms);
      later(ms, () => { if (g.anim === 'cast' && !g.defeated) { g.anim = 'idle'; window.playRig(g, 'idle', true); } });
    } else later(ms, () => { if (g.anim === 'cast') g.anim = 'idle'; });   // primitive bodies wave their arms (app.js)
  }

  // ------------------------------------------------------------ bones
  const NAMES = {
    chest: ['Spine02', 'chest', 'Torso', 'Chest', 'Spine1', 'Spine01', 'Spine', 'spine', 'Body'],
    head: ['Head', 'head'],
    armR: ['RightArm', 'upperarm.r', 'UpperArm.R', 'Arm.R', 'arm.r'], foreR: ['RightForeArm', 'lowerarm.r', 'LowerArm.R', 'Forearm.R'], handR: ['RightHand', 'hand.r', 'Fist.R', 'Wrist.R', 'Hand.R', 'Arm.R_end'],
  };
  function bones(g) {
    if (g._reactBones !== undefined) return g._reactBones;
    const all = g.rigRoot ? [g.rigRoot, ...g.rigRoot.getDescendants(false)] : [];
    const b = {};
    for (const [k, ns] of Object.entries(NAMES)) for (const n of ns) { const hit = all.find(x => x.name === n && x.rotationQuaternion); if (hit) { b[k] = hit; break; } }
    return g._reactBones = Object.keys(b).length ? b : null;
  }
  // An additive pose for `ms`: fn(u, b) changes bone rotations after the clips
  // have animated; the clip's own values are put back before the next frame.
  function overlay(g, ms, fn) {
    const b = bones(g), sc = state.scene; if (!b || !sc) return;
    const t0 = now(), saved = new Map();
    const restore = () => { for (const [n, q] of saved) n.rotationQuaternion.copyFrom(q); saved.clear(); };
    const pre = sc.onBeforeAnimationsObservable.add(restore);
    const post = sc.onAfterAnimationsObservable.add(() => {
      const u = (now() - t0) / ms;
      if (u >= 1 || g.root.isDisposed?.()) { sc.onBeforeAnimationsObservable.remove(pre); sc.onAfterAnimationsObservable.remove(post); return; }
      for (const n of Object.values(b)) saved.set(n, n.rotationQuaternion.clone());
      g.root.computeWorldMatrix(true);
      try { fn(u, b); } catch (e) { console.warn('[react]', e); sc.onAfterAnimationsObservable.remove(post); }
    });
  }
  const refresh = n => { const c = []; for (let x = n; x; x = x.parent) c.push(x); for (let i = c.length - 1; i >= 0; i--) c[i].computeWorldMatrix(true); };
  // rotate a bone about a world-space axis (worked out in its parent's space,
  // like app.js's aimBoneAt)
  function turn(n, axis, ang) {
    if (!n?.parent || !ang) return;
    refresh(n);
    const inv = n.parent.getWorldMatrix().clone().invert();
    const a = BABYLON.Vector3.TransformNormal(axis, inv).normalize();
    n.rotationQuaternion = BABYLON.Quaternion.RotationAxis(a, ang).multiply(n.rotationQuaternion);
    n.computeWorldMatrix(true);
  }
  // swing a bone so the direction to `child` points along `dir`, by weight w
  function aim(n, child, dir, w) {
    if (!n?.parent || !child || w <= 0) return;
    refresh(child);
    const inv = n.parent.getWorldMatrix().clone().invert();
    const cur = BABYLON.Vector3.TransformNormal(child.getAbsolutePosition().subtract(n.getAbsolutePosition()), inv).normalize();
    const des = BABYLON.Vector3.TransformNormal(dir, inv).normalize();
    const q = new BABYLON.Quaternion(); BABYLON.Quaternion.FromUnitVectorsToRef(cur, des, q);
    const L = n.rotationQuaternion;
    n.rotationQuaternion = BABYLON.Quaternion.Slerp(L, q.multiply(L), Math.min(1, w));
    n.computeWorldMatrix(true);
  }
  function frame(g) {
    const ry = g.root.rotation?.y || 0, fwd = V3(-Math.sin(ry), 0, -Math.cos(ry));   // zero yaw faces north (-z)
    return { fwd, right: BABYLON.Vector3.Cross(V3(0, 1, 0), fwd).normalize() };
  }
  // no cast clip: the right arm comes up in front, then thrusts out
  function procArm(g, ms) {
    overlay(g, ms, (u, b) => {
      const { fwd } = frame(g);
      const up = u < .3 ? u / .3 : 1, out = u < .3 ? 0 : u < .42 ? (u - .3) / .12 : 1, down = u > .8 ? 1 - (u - .8) / .2 : 1;
      const dir = fwd.scale(.4 + .6 * out).add(V3(0, .9 - .7 * out, 0));
      aim(b.armR, b.foreR || b.handR, dir, Math.min(1, up) * down);
      if (b.foreR && b.handR) aim(b.foreR, b.handR, dir, Math.min(1, up) * down * .8);
    });
  }
  // no hit clip: thrown back and jolted, then recovers
  function procFlinch(g) {
    const ms = 420;
    if (bones(g)?.chest || bones(g)?.head) {
      overlay(g, ms, (u, b) => {
        const { right } = frame(g), k = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * .4);
        turn(b.chest, right, .45 * k);
        if (b.head) turn(b.head, right, .3 * k);
      });
      return;
    }
    // no bones (primitive bodies, critters with one bone): a small hop back
    const r = g.rigRoot || g.root.getChildren()[0]; if (!r?.position) return;
    const p0 = r.position.clone(), t0 = now(), sc = state.scene;
    const back = V3(0, 0, .1);
    const o = sc.onBeforeRenderObservable.add(() => {
      const u = (now() - t0) / 300;
      if (u >= 1 || r.isDisposed?.()) { r.position.copyFrom(p0); sc.onBeforeRenderObservable.remove(o); return; }
      const k = Math.sin(Math.PI * u);
      r.position.set(p0.x + back.x * k, p0.y + .06 * k, p0.z + back.z * k);
    });
  }
  // a red flash on every mesh of the character
  function flash(g, ms = 380) {
    const meshes = g.root.getChildMeshes(false).filter(m => m.isVisible && m.getTotalVertices?.() > 0 && !/collider/.test(m.name));
    const red = new BABYLON.Color3(1, .08, .04), t0 = now(), sc = state.scene;
    for (const m of meshes) { m.overlayColor = red; m.overlayAlpha = .45; m.renderOverlay = true; }
    const o = sc.onBeforeRenderObservable.add(() => {
      const u = (now() - t0) / ms;
      if (u >= 1) { for (const m of meshes) { m.renderOverlay = false; } sc.onBeforeRenderObservable.remove(o); return; }
      for (const m of meshes) m.overlayAlpha = .45 * (1 - u) * (1 - u);
    });
  }

  // ------------------------------------------------------------ voices
  const FEM = /woman|witch|sorceress|huntress|swordswoman|princess|queen|girl|lady|_f\b|female/i;
  function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; }
  function profile(g) {
    const m = isPlayer(g) ? String(state.player?.model || g.charModel || '') : String(g.charModel || g.style || '');
    const cfg = !isPlayer(g) && g.id ? (getBrainConfig(g.id) || {}) : {};
    const v = String(cfg.ttsVoiceId || '') + ' ' + m, r = hash(g.id || 'player');
    if (/skeleton/.test(m)) return { kind: 'rattle' };
    if (/slime/.test(m)) return { kind: 'squelch' };
    if (/ghost/.test(m)) return { kind: 'wail', f0: 180 + 40 * r };
    if (/rat|bat/.test(m)) return { kind: 'squeak', f0: 1400 + 600 * r };
    if (/spider/.test(m)) return { kind: 'hiss' };
    if (/wolf/.test(m)) return { kind: 'yelp', f0: 520 + 120 * r };
    if (/giant|troll|dragon|demon|orc/.test(m)) return { kind: 'voice', f0: 62 + 14 * r, fs: .78, growl: 1 };
    if (/goblin|kobold/.test(m)) return { kind: 'voice', f0: 230 + 50 * r, fs: 1.22, growl: .5 };
    if (FEM.test(v)) return { kind: 'voice', f0: 200 + 45 * r, fs: 1.17 };
    if (/wizard|king|old|elder|oracle/i.test(v + ' ' + (g.id || ''))) return { kind: 'voice', f0: 98 + 22 * r, fs: .97, shaky: 1 };
    return { kind: 'voice', f0: 108 + 30 * r, fs: 1 };
  }
  const VOWELS = { uh: [620, 1100, 2350], ugh: [560, 1000, 2300], oof: [420, 820, 2250], agh: [760, 1200, 2500], ah: [800, 1180, 2600], oh: [520, 860, 2400] };
  function noiseSrc(ctx, noise, t, dur) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * .5); s.stop(t + dur + .05); return s; }
  function env(ctx, t, pts) { const gn = ctx.createGain(); gn.gain.setValueAtTime(.0001, t); for (const [dt, v, lin] of pts) (lin ? gn.gain.linearRampToValueAtTime : gn.gain.exponentialRampToValueAtTime).call(gn.gain, Math.max(.0001, v), t + dt); return gn; }
  function bp(ctx, f, q) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; }
  // a human-ish cry: out is a node, t the start time
  function sayVoice(ctx, out, noise, t, p, death) {
    const dur = death ? .85 + Math.random() * .25 : .24 + Math.random() * .12;
    const vowel = death ? VOWELS[Math.random() < .5 ? 'agh' : 'ah'] : VOWELS[['uh', 'ugh', 'oof', 'agh'][Math.floor(Math.random() * 4)]];
    const fs = p.fs || 1, f0 = p.f0 * (death ? 1.08 : 1) * (.95 + Math.random() * .1);
    const t1 = t + .035;   // after the "h"
    // glottal source: two detuned saws through a soft low-pass
    const src = ctx.createGain(); src.gain.value = 1;
    const oscs = [0, 8].map(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = cents; o.connect(src); return o; });
    const pitch = (o) => {
      const F = o.frequency;
      if (death) { F.setValueAtTime(f0 * 1.05, t1); F.linearRampToValueAtTime(f0 * 1.4, t1 + .16); F.linearRampToValueAtTime(f0 * 1.15, t1 + dur * .55); F.exponentialRampToValueAtTime(f0 * .62, t1 + dur); }
      else { F.setValueAtTime(f0 * 1.3, t1); F.exponentialRampToValueAtTime(f0 * .82, t1 + dur); }
    };
    oscs.forEach(pitch);
    // vibrato / shake and jitter
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = p.shaky ? 7 : 5.5; lg.gain.value = f0 * (death ? .045 : p.shaky ? .03 : .015);
    lfo.connect(lg); for (const o of oscs) lg.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; src.connect(lp);
    // growl: a subharmonic, roughly amplitude-modulated
    let sub = null;
    if (p.growl) { sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.setValueAtTime(f0 * .5, t1); sub.frequency.exponentialRampToValueAtTime(f0 * .42, t1 + dur); const sg = ctx.createGain(); sg.gain.value = .35 * p.growl; sub.connect(sg); sg.connect(lp); }
    // formants
    const voiced = env(ctx, t1, [[.018, 1, true], [dur * (death ? .7 : .35), death ? .85 : .7], [dur, .0001]]);
    const mix = ctx.createGain(); mix.gain.value = death ? .7 : .65;
    vowel.forEach((F, i) => {
      const f = bp(ctx, F * fs, 6 + i * 3), gn = ctx.createGain(); gn.gain.value = [1, .55, .22][i] * (i ? 1.4 : 1);
      if (death && i < 2) f.frequency.linearRampToValueAtTime(VOWELS.oh[i] * fs, t1 + dur);
      lp.connect(f); f.connect(gn); gn.connect(voiced);
    });
    voiced.connect(mix);
    // breath: an "h" before, a little air throughout
    const air = noiseSrc(ctx, noise, t, dur + .05), af = bp(ctx, vowel[1] * fs, 1.2);
    const ae = env(ctx, t, [[.02, death ? .5 : .35, true], [.045, .08], [dur + .03, .0001]]);
    air.connect(af); af.connect(ae); ae.connect(mix);
    mix.connect(out);
    for (const o of oscs) { o.start(t1); o.stop(t1 + dur + .05); }
    lfo.start(t1); lfo.stop(t1 + dur + .05); sub?.start(t1); sub?.stop(t1 + dur + .05);
    return dur + .1;
  }
  function sayCreature(ctx, out, noise, t, p, death) {
    const k = death ? 1.8 : 1, g = ctx.createGain(); g.gain.value = { wail: 4, rattle: 2, hiss: .4 }[p.kind] || .7; g.connect(out);
    if (p.kind === 'rattle') {   // bones clattering
      for (let i = 0, n = death ? 14 : 6; i < n; i++) { const tt = t + i * (.03 + Math.random() * .04); const s = noiseSrc(ctx, noise, tt, .03); const f = bp(ctx, 1800 + Math.random() * 2400, 8); const e = env(ctx, tt, [[.002, .8, true], [.028, .0001]]); s.connect(f); f.connect(e); e.connect(g); }
      return .7 * k;
    }
    if (p.kind === 'squelch' || p.kind === 'hiss') {
      const dur = (p.kind === 'hiss' ? .35 : .3) * k, s = noiseSrc(ctx, noise, t, dur), f = ctx.createBiquadFilter();
      f.type = p.kind === 'hiss' ? 'highpass' : 'lowpass'; f.frequency.setValueAtTime(p.kind === 'hiss' ? 3500 : 900, t); if (p.kind === 'squelch') f.frequency.exponentialRampToValueAtTime(180, t + dur); f.Q.value = p.kind === 'squelch' ? 9 : 1;
      const e = env(ctx, t, [[.015, .8, true], [dur, .0001]]); s.connect(f); f.connect(e); e.connect(g); return dur + .1;
    }
    // squeak, yelp, wail: a pitched sine/triangle with a quick bend
    const dur = (p.kind === 'wail' ? .9 : p.kind === 'yelp' ? .22 : .12) * k, o = ctx.createOscillator();
    o.type = p.kind === 'squeak' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(p.f0 * (p.kind === 'wail' ? 1 : 1.4), t); o.frequency.exponentialRampToValueAtTime(p.f0 * (p.kind === 'wail' ? .6 : .8), t + dur);
    const e = env(ctx, t, [[.01, .6, true], [dur, .0001]]); o.connect(e);
    if (p.kind === 'wail') { const f = bp(ctx, 900, 2); e.connect(f); f.connect(g); } else e.connect(g);
    o.start(t); o.stop(t + dur + .05); return dur + .1;
  }
  function sayAny(ctx, out, noise, t, p, death) { return p.kind === 'voice' ? sayVoice(ctx, out, noise, t, p, death) : sayCreature(ctx, out, noise, t, p, death); }
  function voice(g, kind = 'hurt') {
    if (!g?.root || !window.tablefolkSfx?.enabled) return;
    const A = window.tablefolkSpells?.audio; if (!A) return;
    const death = kind === 'death', at = g.root.position.add(V3(0, (g.height || 1.2) * .85, 0));
    const s = A.source(at, { gain: death ? 1.6 : 1.1, ref: 2, wet: .3, ms: 2500 }); if (!s) return;
    // keep it a little apart from the blow's thud
    sayAny(s.ctx, s.out, s.noise, s.t + .04, profile(g), death);
  }
  // offline: the cry as a 16-bit WAV (tools / tests)
  async function render(kind = 'hurt', p = { kind: 'voice', f0: 110, fs: 1 }) {
    const sr = 44100, ctx = new OfflineAudioContext(1, sr * 1.6, sr), n = ctx.createBuffer(1, sr, sr), d = n.getChannelData(0);
    for (let i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1;
    const out = ctx.createGain(); out.gain.value = .9; out.connect(ctx.destination);
    sayAny(ctx, out, n, .05, p, kind === 'death');
    const buf = await ctx.startRendering(), x = buf.getChannelData(0), b = new DataView(new ArrayBuffer(44 + x.length * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, x.length * 2, true);
    let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i < x.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return { blob: new Blob([b], { type: 'audio/wav' }), peak };
  }

  // ------------------------------------------------------------ hits
  // combat.js calls this for every blow that lands (melee, spells, skills).
  function hit(g, dmg = 1, fatal = false) {
    if (!g?.root) return;
    try { flash(g, fatal ? 600 : 380); } catch {}
    voice(g, fatal ? 'death' : 'hurt');
    if (fatal || isPlayer(g) && state.firstPerson) return;
    g._hold = null;   // a hit ends a held gesture
    const hasClip = g.rigged && ['Hit_A', 'Hit_B'].some(n => g.rigAnims?.[n]);
    if (!hasClip) try { procFlinch(g); } catch {}
  }

  window.tablefolkReact = { gesture, hit, voice, render, profile };
})();
