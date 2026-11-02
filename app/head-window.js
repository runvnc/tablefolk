/* head-window.js -- window view: the webcam follows your head and the screen
 * becomes a window onto the board (head-coupled perspective). The camera's
 * eye moves with your head while the screen's rectangle stays put in the
 * world (an off-axis projection, the same trick as Johnny Lee's Wii head
 * tracking): move right and you see more of the left side behind the glass,
 * the board slides behind the frame (the glass stands in front of it, like a
 * diorama box's front), and leaning in shows more through the window, or,
 * with the Graphics pane's "leaning in" set to magnify, brings it closer. Off by default; H or the
 * Graphics pane turns it on, after the browser asks for the camera.
 *
 * Face tracking: MediaPipe's face detector (@mediapipe/tasks-vision, Apache-2.0,
 * its WebAssembly from jsdelivr, about 14 MB, only when turned on) with the
 * 230 KB BlazeFace short-range model kept in assets/models/mediapipe/. The
 * eyes' midpoint and the face box's centre give the head's position, the box's
 * width how near it is, against a neutral pose taken over the first half
 * second (the median, drifting slowly after it so it stays centred where you
 * sit). A One Euro filter (Casiez 2012) steadies it: heavy smoothing when the
 * head is still, little lag when it moves. Video never leaves the page; a
 * small mirrored preview shows while it runs.
 *
 * The camera's own angles and distance are left alone (dragging and zooming
 * keep working): the head goes into the projection matrix only, frozen each
 * frame (picking uses the same matrix, so clicks still land). Free and follow
 * cameras; first person has its own view; an orthographic camera is skipped.
 *
 *   window.tablefolkHeadWindow.toggle() / start() / stop() / recenter()
 *   window.tablefolkHeadWindow.strength = 2.4     how far the eye moves
 *   window.tablefolkHeadWindow.glass = .55        the glass's distance (1 = at the target)
 *   window.tablefolkHeadWindow.setHead(x, y, near)   simulate a head (tests)
 * Loaded after app.js; uses its globals (state).
 */
(function () {
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
  const MODEL = (typeof ASSET_BASE !== 'undefined' ? ASSET_BASE : '/assets/') + 'models/mediapipe/blaze_face_short_range.tflite';
  // EYE: screen widths the eye moves per frame width of head movement (about
  // 1.4 would be true to life at arm's length; more reads as a window better).
  // LEAN: how much leaning in brings the eye closer. DRIFT: how fast the
  // neutral pose follows you. FOLLOW: per-second rate the view eases to the
  // filtered head between camera frames.
  // GLASS: where the window's glass stands, as a fraction of the distance to
  // what the camera looks at: in front of the board (a diorama box's front),
  // so leaning in brings the board closer and moving shows it sliding behind
  // the frame. At 1 (the board itself) leaning only widened the edges.
  const LEAN = 1.6, DRIFT = .0008, FOLLOW = 14, MAXE = .6;
  // leaning in: 'window' (the glass stays put, so you see more, and the board
  // gets smaller on screen, as through a real window) or 'magnify' (the eye
  // moves in with the lens unchanged: the board comes closer)
  let lean = localStorage.getItem('tablefolk.headWindowLean') === 'magnify' ? 'magnify' : 'window';
  let glass = Number(localStorage.getItem('tablefolk.headWindowGlass')) || .55;
  let strength = Number(localStorage.getItem('tablefolk.headWindowStrength')) || 2.4;
  const W = { on: false, video: null, detector: null, stream: null, raf: 0, neutral: null, calib: [], sim: null,
    head: { x: 0, y: 0, s: 1 }, view: { x: 0, y: 0, s: 1 }, frozen: false, obs: null };
  let preview = null, lastT = 0;

  // One Euro filter: the cutoff rises with speed, so a still head is steady
  // and a moving one does not lag.
  function oneEuro(minCut, beta, dCut = 1) {
    let x = null, dx = 0, t0 = 0;
    const a = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    return (v, t) => {
      if (x === null) { x = v; t0 = t; return v; }
      const dt = Math.max(1e-3, (t - t0) / 1000); t0 = t;
      dx += (((v - x) / dt) - dx) * a(dCut, dt);
      x += (v - x) * a(minCut + beta * Math.abs(dx), dt);
      return x;
    };
  }
  let F = null;
  const resetFilters = () => { F = { x: oneEuro(.5, 3), y: oneEuro(.5, 3), s: oneEuro(.6, 4) }; };

  async function start() {
    if (W.on) return;
    W.on = true; sync();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser has no camera access');
      W.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
      if (!W.on) return stopStream();
      const v = W.video = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = W.stream; await v.play();
      showPreview(v);
      window.tablefolkToast?.('window view: hold still a moment, then move your head (H to stop)');
      if (!W.detector) {
        const vision = await import(MP + '/vision_bundle.mjs');
        const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
        W.detector = await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: .5 });
      }
      if (!W.on) return stopStream();
      recenter(); hook(); loop();
    } catch (e) {
      console.warn('[head-window]', e); window.tablefolkToast?.('window view needs the camera: ' + (e.message || e), { type: 'error' });
      stop();
    }
  }
  function stopStream() { try { W.stream?.getTracks().forEach(t => t.stop()); } catch {} W.stream = null; W.video = null; preview?.remove(); preview = null; }
  function stop() {
    W.on = false; cancelAnimationFrame(W.raf); W.raf = 0; stopStream();
    unhook(); sync();
  }
  const toggle = () => W.on ? stop() : start();
  function recenter() { W.neutral = null; W.calib = []; resetFilters(); W.head = { x: 0, y: 0, s: 1 }; }

  function showPreview(v) {
    preview?.remove();
    preview = document.createElement('div'); preview.className = 'head-window-preview';
    preview.title = 'window view: the camera follows your head (H to stop)';
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
    const dot = document.createElement('i'); preview.append(v, dot); document.body.append(preview);
  }

  // One head sample from the detector: x, y in the frame (0-1), s the face
  // box's width as a fraction of the frame.
  function detect() {
    const v = W.video;
    let res; try { res = W.detector.detectForVideo(v, performance.now()); } catch { return null; }
    const d = res?.detections?.[0]; if (!d) return null;
    const k = d.keypoints, b = d.boundingBox, vw = v.videoWidth || 640, vh = v.videoHeight || 480;
    let x = null, y = null, s = null;
    if (b) { x = (b.originX + b.width / 2) / vw; y = (b.originY + b.height / 2) / vh; s = b.width / vw; }
    if (k && k.length >= 2) {
      const ex = (k[0].x + k[1].x) / 2, ey = (k[0].y + k[1].y) / 2;
      x = x === null ? ex : (x + ex) / 2; y = y === null ? ey : (y + ey) / 2;
      if (s === null) s = Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y) * 2.5;
    }
    return x === null ? null : { x, y, s };
  }
  const median = (list, k) => { const a = list.map(v => v[k]).sort((p, q) => p - q); return a[a.length >> 1]; };

  let lastVideoTime = -1;
  function loop() {
    if (!W.on) return;
    W.raf = requestAnimationFrame(loop);
    const now = performance.now();
    let raw = W.sim;
    if (!raw && W.detector && W.video?.readyState >= 2 && W.video.currentTime !== lastVideoTime) {
      lastVideoTime = W.video.currentTime; raw = detect();
    }
    if (raw) {
      if (!W.neutral) {
        W.calib.push(raw);
        if (W.calib.length >= 15) W.neutral = { x: median(W.calib, 'x'), y: median(W.calib, 'y'), s: median(W.calib, 's') };
      } else {
        const f = { x: F.x(raw.x, now), y: F.y(raw.y, now), s: F.s(raw.s, now) };
        // the camera image is mirrored: the head moving to your right moves left in it
        W.head = { x: -(f.x - W.neutral.x), y: -(f.y - W.neutral.y), s: f.s / (W.neutral.s || 1) };
        for (const key of ['x', 'y', 's']) W.neutral[key] += (raw[key] - W.neutral[key]) * DRIFT;
        const dot = preview?.querySelector('i'); if (dot) dot.style.transform = `translate(${-W.head.x * 200}px, ${-W.head.y * 200}px)`;
      }
    }
    // ease the view towards the head between camera frames (30 a second)
    const dt = lastT ? Math.min(.1, (now - lastT) / 1000) : 0; lastT = now;
    const k = 1 - Math.exp(-FOLLOW * dt);
    for (const key of ['x', 'y', 's']) W.view[key] += ((W.neutral ? W.head[key] : key === 's' ? 1 : 0) - W.view[key]) * k;
  }

  // The projection: the eye at e (camera space, in world units) looks through
  // the screen's rectangle, which stays where it was at the target's distance.
  function hook() {
    const scene = state.scene; if (!scene || W.obs) return;
    W.obs = scene.onBeforeRenderObservable.add(project);
  }
  function unhook() {
    if (W.obs) { state.scene?.onBeforeRenderObservable.remove(W.obs); W.obs = null; }
    release();
  }
  // SSAO rebuilds positions from depth with a centred lens: under the skewed
  // projection it paints black blocks, so it is off while the view is
  function ssao(on) {
    const mgr = state.scene?.postProcessRenderPipelineManager, c = state.camera;
    if (!mgr?._renderPipelines?.ssao || !c || on === !W.ssaoOff) return;
    try { on ? mgr.attachCamerasToRenderPipeline('ssao', c) : mgr.detachCamerasFromRenderPipeline('ssao', c); W.ssaoOff = !on; } catch (e) { console.warn('[head-window] ssao', e); }
  }
  function release() { if (W.frozen) { try { state.camera?.unfreezeProjectionMatrix(); } catch {} W.frozen = false; } ssao(true); }
  function project() {
    const c = state.camera;
    const usable = c && state.scene?.activeCamera === c && !state.firstPerson && c.mode !== BABYLON.Camera.ORTHOGRAPHIC_CAMERA && W.neutral;
    if (!usable) return release();
    if (W.frozen) c.unfreezeProjectionMatrix(); else ssao(false);
    const P = c.getProjectionMatrix(true).clone(), m = P.m;
    const D = Math.max(.5, glass * (c.radius || BABYLON.Vector3.Distance(c.position, c.target || BABYLON.Vector3.Zero())));
    const hw = D / m[0], hh = D / m[5];
    const v = W.view, clampE = x => Math.max(-MAXE, Math.min(MAXE, x));
    // head offsets are fractions of the camera frame; the screen's width maps to it
    const ex = clampE(v.x * strength) * 2 * hw, ey = clampE(v.y * strength * .75) * 2 * hw;
    // the face's width grows as 1/distance: leaning from 60 to 40 cm is 1.5
    const near = Math.max(.5, Math.min(2.5, Math.pow(v.s || 1, LEAN * strength / 2.4)));
    const Dp = D / near;
    const vals = Array.from(m);
    if (lean === 'window') { vals[0] = m[0] * Dp / D; vals[5] = m[5] * Dp / D; }
    // the glass's centre stays at the screen's centre (the lens is D/Dp narrower when magnifying)
    const k = lean === 'window' ? 1 : D / Dp;
    vals[8] = ex / hw * k; vals[9] = ey / hh * k;
    const off = BABYLON.Matrix.FromArray(vals);
    const M = BABYLON.Matrix.Translation(-ex, -ey, -(D - Dp)).multiply(off);
    c.freezeProjectionMatrix(M); W.frozen = true;
  }

  function sync() {
    const box = document.getElementById('headWindow'); if (box) box.checked = W.on;
    document.getElementById('headWindowBtn')?.classList.toggle('active', W.on);
  }
  function init() {
    document.getElementById('headWindow')?.addEventListener('change', e => e.target.checked ? start() : stop());
    document.getElementById('headWindowBtn')?.addEventListener('click', toggle);
    const sel = document.getElementById('headWindowLean');
    if (sel) { sel.value = lean; sel.addEventListener('change', () => { window.tablefolkHeadWindow.lean = sel.value; }); }
    window.addEventListener('keydown', e => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'h') { toggle(); e.preventDefault(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.addEventListener('pagehide', stop);

  window.tablefolkHeadWindow = {
    start, stop, toggle, recenter, get on() { return W.on; },
    get strength() { return strength; },
    set strength(v) { strength = Math.max(0, Number(v) || 0); localStorage.setItem('tablefolk.headWindowStrength', String(strength)); },
    get head() { return { ...W.view }; },
    get lean() { return lean; },
    set lean(v) { lean = v === 'magnify' ? 'magnify' : 'window'; localStorage.setItem('tablefolk.headWindowLean', lean); const sel = document.getElementById('headWindowLean'); if (sel) sel.value = lean; },
    get glass() { return glass; },
    set glass(v) { glass = Math.max(.1, Math.min(1, Number(v) || .55)); localStorage.setItem('tablefolk.headWindowGlass', String(glass)); },
    // tests: a fake head (x right, y up, as fractions of the frame; near 1 = neutral)
    setHead(x, y, near = 1) {
      W.sim = { x: .5 - x, y: .5 - y, s: .2 * near };
      if (!W.neutral) { W.neutral = { x: .5, y: .5, s: .2 }; resetFilters(); }
      if (!W.on) { W.on = true; hook(); loop(); }
    },
  };
})();
