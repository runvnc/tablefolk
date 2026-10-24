/* fp-hands.js -- your hands in first person. The avatar's body is hidden
 * while you look through its eyes (app.js setFirstPerson), so this draws a
 * pair of forearms in front of the camera: the right one holds the weapon
 * you wield, the left one the torch you carry, and both punch (taking turns)
 * when you attack with bare fists. They draw over the world (rendering group
 * 1), so they never sink into a wall.
 *
 *   window.tablefolkHands.swing(w)   combat.js, when the player attacks;
 *                                    w: the weapon ({ kind, two }) or fists
 * Loaded after combat.js and darkness.js; uses app.js globals (state, fpCam).
 */
(function () {
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  // camera space: x right, y up, z ahead
  const REST = { r: [.21, -.25, .44], l: [-.27, -.3, .46] }, LOW = { r: [.24, -.5, .34], l: [-.24, -.5, .34] };
  let rig = null, swing = null, nextFist = 'r';

  function mat(sc, name, c, rough = .8) {
    const m = new BABYLON.PBRMaterial(name, sc); m.albedoColor = c; m.metallic = 0; m.roughness = rough; m.maxSimultaneousLights = 8;
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    return m;
  }
  function prep(m) {
    for (const p of [m, ...m.getChildMeshes(false)]) {
      p.isPickable = false; p.renderingGroupId = 1; p.receiveShadows = false; p.alwaysSelectAsActiveMesh = true;
      // weapon parts were added as shadow casters (combat.js); not up here
      for (const L of state.scene.lights) L.getShadowGenerator?.()?.removeShadowCaster?.(p, false);
    }
  }
  // a sleeve, a fist and a thumb; the fist at the node's origin
  function arm(sc, side, M) {
    const node = new BABYLON.TransformNode('fp_arm_' + side, sc), s = side === 'r' ? 1 : -1;
    const fore = BABYLON.MeshBuilder.CreateCylinder('fp_fore_' + side, { diameterTop: .07, diameterBottom: .058, height: .34, tessellation: 12 }, sc);
    fore.rotation.x = Math.PI / 2; fore.position.z = -.19; fore.material = M.sleeve; fore.parent = node;
    const cuff = BABYLON.MeshBuilder.CreateCylinder('fp_cuff_' + side, { diameter: .076, height: .035, tessellation: 12 }, sc);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = -.04; cuff.material = M.cuff; cuff.parent = node;
    // a rounded fist: a squashed ball, a row of knuckles, a thumb across
    const fist = BABYLON.MeshBuilder.CreateSphere('fp_fist_' + side, { diameter: 1, segments: 8 }, sc);
    fist.scaling.set(.078, .07, .092); fist.position.z = .02; fist.material = M.skin; fist.parent = node;
    for (let i = 0; i < 4; i++) {
      const k = BABYLON.MeshBuilder.CreateSphere('fp_knuckle_' + side + i, { diameter: .024, segments: 5 }, sc);
      k.position.set((i - 1.5) * .019, .02, .06); k.material = M.skin; k.parent = node;
    }
    const thumb = BABYLON.MeshBuilder.CreateCapsule('fp_thumb_' + side, { radius: .012, height: .06, tessellation: 8 }, sc);
    thumb.rotation.z = Math.PI / 2; thumb.position.set(-.012 * s, -.02, .055); thumb.material = M.skin; thumb.parent = node;
    prep(node);
    return node;
  }
  function build() {
    const sc = state.scene, cam = window.fpCam || (typeof fpCam !== 'undefined' ? fpCam : null);
    if (!sc || !cam) return null;
    const M = { skin: mat(sc, 'fp_skin', C3(.74, .53, .4), .7), sleeve: mat(sc, 'fp_sleeve', C3(.24, .16, .1)), cuff: mat(sc, 'fp_cuff', C3(.13, .09, .06)) };
    const root = new BABYLON.TransformNode('fp_hands', sc); root.parent = cam;
    const r = arm(sc, 'r', M), l = arm(sc, 'l', M); r.parent = l.parent = root;
    rig = { sc, cam, root, r, l, weapon: null, weaponKey: '', torch: null };
    sc.onBeforeRenderObservable.add(frame);
    return rig;
  }

  // what the hands hold
  function holdings() {
    const g = state.playerAvatar, C = window.tablefolkCombat;
    const name = g && C?.wielded(g), w = name ? C.weaponFor(name) || { kind: 'club', dmg: 2 } : null;
    const key = w ? w.kind + (w.two ? '2' : '') : '';
    if (key !== rig.weaponKey) {
      rig.weapon?.dispose(false, false); rig.weapon = null; rig.weaponKey = key;
      if (w) {
        const m = C.weaponMesh(w.kind); m.parent = rig.r;
        // grip in the fist, pointing up and a little ahead
        m.position.set(0, -.01, .02); m.rotation.set(.55, 0, 0); m.scaling.setAll(w.two ? 1.1 : 1);
        prep(m); rig.weapon = m;
      }
    }
    const torch = !!(g && window.tablefolkDark?.carriesTorch(g));
    if (torch && !rig.torch && window.tablefolkDark?.torchMesh) {
      const t = window.tablefolkDark.torchMesh(); t.root.parent = rig.l; t.root.position.set(0, -.04, .02); t.root.rotation.set(.18, 0, -.12); t.root.scaling.setAll(.72);
      prep(t.root); rig.torch = t;
    } else if (!torch && rig.torch) { rig.torch.root.dispose(false, false); rig.torch = null; }
    return { w, torch };
  }

  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  // 0 -> 1 -> 0 over a swing: fast out, slower back
  const pulse = (t, peak) => t < peak ? ease(t / peak) : 1 - ease((t - peak) / (1 - peak));

  function frame() {
    const on = state.firstPerson && rig.sc.activeCamera === rig.cam && state.playerAvatar && !state.playerAvatar.defeated;
    rig.root.setEnabled(!!on); if (!on) return;
    const { w, torch } = holdings(), now = performance.now(), bob = Math.sin(now * .0021) * .006;
    let t = swing ? (now - swing.t0) / swing.ms : 2; if (t > 1) swing = null;
    for (const side of ['r', 'l']) {
      const node = rig[side], holds = side === 'r' ? !!w : torch;
      const swinging = swing && swing.side === side;
      // at rest an empty hand waits below the view; a full one is held up
      let p = holds ? REST[side] : LOW[side], rx = 0, ry = 0, rz = 0;
      if (swinging) {
        const k = pulse(t, swing.peak);
        if (swing.kind === 'punch') { p = lerp3(holds ? REST[side] : LOW[side], [side === 'r' ? .06 : -.06, -.14, .6], k); rx = -.15 * k; ry = (side === 'r' ? -.25 : .25) * k; }
        else if (swing.kind === 'stab') { p = lerp3(REST[side], [.08, -.15, .72], k); rx = -.4 * k; }
        else {
          // a chop: raised up and right, brought down across to the left
          const up = ease(t / swing.peak), down = ease((t - swing.peak) / (1 - swing.peak) * 1.6);
          p = t < swing.peak ? lerp3(REST.r, [.26, -.06, .4], up) : lerp3([.26, -.06, .4], [-.08, -.3, .58], Math.min(1, down));
          if (t > .8) p = lerp3(p, REST.r, ease((t - .8) / .2));
          rx = t < swing.peak ? -.5 * up : -.5 + 1.6 * Math.min(1, down) * (t > .8 ? 1 - ease((t - .8) / .2) : 1);
          rz = t < swing.peak ? -.35 * up : -.35 + .7 * Math.min(1, down);
        }
      }
      node.position.set(p[0], p[1] + bob * (side === 'r' ? 1 : -1), p[2]);
      node.rotation.set(rx, ry, rz);
      node.setEnabled(holds || swinging);
    }
    if (rig.torch) rig.torch.flame.scaling.set(1, 1 + Math.sin(now * .0102) * .15, 1);
  }

  function swingNow(w) {
    if (!state.firstPerson) return;
    if (!rig) build(); if (!rig) return;
    const torch = window.tablefolkDark?.carriesTorch(state.playerAvatar);
    if (!w || w.kind === 'fists' || w.kind === 'natural') {
      // bare fists take turns (the right only, while the left holds a torch)
      const side = torch ? 'r' : nextFist; nextFist = side === 'r' ? 'l' : 'r';
      swing = { side, kind: 'punch', t0: performance.now(), ms: 360, peak: .32 };
    } else swing = { side: 'r', kind: w.kind === 'dagger' || w.kind === 'spear' ? 'stab' : 'chop', t0: performance.now(), ms: w.two ? 620 : 480, peak: .35 };
  }
  // build when first person starts (so held things show before any swing)
  setInterval(() => { if (state.firstPerson && !rig && state.scene) build(); }, 300);

  window.tablefolkHands = { swing: swingNow };
})();
