/* head-window.js -- window view: the webcam follows your head and the free
 * camera moves with it, so the board looks like a diorama seen through a
 * window (head-coupled perspective). Move your head right and the camera
 * swings the same way around what it looks at, showing more of the left side;
 * up shows more from above; leaning in comes closer. Off by default; H or the
 * Graphics pane turns it on, after the browser asks for the camera.
 *
 * Face tracking: MediaPipe's face detector (@mediapipe/tasks-vision, Apache-2.0,
 * its WebAssembly from jsdelivr, about 14 MB, only when turned on) with the
 * 230 KB BlazeFace short-range model kept in assets/models/mediapipe/. The
 * eyes' midpoint gives the head's position and their distance how near it is,
 * against a neutral pose taken over the first half second (and drifting
 * slowly after it, so it stays centred where you sit). Video never leaves the
 * page; a small mirrored preview shows while it runs.
 *
 * The offsets are added to the camera's own angles and distance every frame
 * and taken out again, so dragging and zooming keep working. Only the free
 * (overview) camera: the follow camera's angles are locked, first person has
 * its own view.
 *
 *   window.tablefolkHeadWindow.toggle() / start() / stop() / recenter()
 *   window.tablefolkHeadWindow.setHead(x, y, near)   simulate a head (tests)
 * Loaded after app.js; uses its globals (state).
 */
(function () {
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
  const MODEL = (typeof ASSET_BASE !== 'undefined' ? ASSET_BASE : '/assets/') + 'models/mediapipe/blaze_face_short_range.tflite';
  // radians of camera swing per unit of head offset (a fraction of the frame
  // width), the strongest swing, and how strongly leaning in zooms
  const YAW = 1.7, PITCH = 1.2, MAX = .45, ZOOM = .8, SMOOTH = .3, DRIFT = .0015;
  const W = { on: false, video: null, detector: null, stream: null, raf: 0, neutral: null, calib: [], head: { x: 0, y: 0, s: 1 }, sim: null,
    applied: { a: 0, b: 0, r: 1 } };
  let preview = null;

  async function start() {
    if (W.on) return;
    W.on = true; sync();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser has no camera access');
      W.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      if (!W.on) return stopStream();
      const v = W.video = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = W.stream; await v.play();
      showPreview(v);
      window.tablefolkToast?.('window view: hold still a moment, then look around (H to stop)');
      if (!W.detector) {
        const vision = await import(MP + '/vision_bundle.mjs');
        const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
        W.detector = await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: .5 });
      }
      if (!W.on) return stopStream();
      recenter(); loop();
    } catch (e) {
      console.warn('[head-window]', e); window.tablefolkToast?.('window view needs the camera: ' + (e.message || e), { type: 'error' });
      stop();
    }
  }
  function stopStream() { try { W.stream?.getTracks().forEach(t => t.stop()); } catch {} W.stream = null; W.video = null; preview?.remove(); preview = null; }
  function stop() {
    W.on = false; cancelAnimationFrame(W.raf); W.raf = 0; stopStream();
    apply(0, 0, 1); sync();
  }
  const toggle = () => W.on ? stop() : start();
  function recenter() { W.neutral = null; W.calib = []; }

  function showPreview(v) {
    preview?.remove();
    preview = document.createElement('div'); preview.className = 'head-window-preview';
    preview.title = 'window view: the camera follows your head (H to stop)';
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
    const dot = document.createElement('i'); preview.append(v, dot); document.body.append(preview);
  }

  let lastVideoTime = -1;
  function loop() {
    if (!W.on) return;
    W.raf = requestAnimationFrame(loop);
    let raw = W.sim;
    if (!raw && W.detector && W.video?.readyState >= 2 && W.video.currentTime !== lastVideoTime) {
      lastVideoTime = W.video.currentTime;
      let res; try { res = W.detector.detectForVideo(W.video, performance.now()); } catch {}
      const k = res?.detections?.[0]?.keypoints;
      if (k && k.length >= 2) raw = { x: (k[0].x + k[1].x) / 2, y: (k[0].y + k[1].y) / 2, s: Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y) };
    }
    if (raw) {
      if (!W.neutral) {
        W.calib.push(raw);
        if (W.calib.length >= 15) W.neutral = { x: avg(W.calib, 'x'), y: avg(W.calib, 'y'), s: avg(W.calib, 's') };
      } else {
        // the camera image is mirrored: the head moving to your right moves left in it
        const h = { x: -(raw.x - W.neutral.x), y: -(raw.y - W.neutral.y), s: raw.s / (W.neutral.s || 1) };
        for (const key of ['x', 'y', 's']) W.head[key] += (h[key] - W.head[key]) * SMOOTH;
        for (const key of ['x', 'y', 's']) W.neutral[key] += (raw[key] - W.neutral[key]) * DRIFT;
        const dot = preview?.querySelector('i'); if (dot) dot.style.transform = `translate(${-W.head.x * 200}px, ${-W.head.y * 200}px)`;
      }
    }
    const usable = state.camera && state.scene?.activeCamera === state.camera && !state.firstPerson && state.cameraMode !== 'follow';
    if (!usable || !W.neutral) { apply(0, 0, 1); return; }
    const c = state.camera, clampA = v => Math.max(-MAX, Math.min(MAX, v));
    // which way an angle moves the camera on screen, from the camera itself
    const right = c.getDirection(BABYLON.Axis.X), up = c.getDirection(BABYLON.Axis.Y);
    const sa = Math.sin(c.alpha), ca = Math.cos(c.alpha), sb = Math.sin(c.beta), cb = Math.cos(c.beta);
    const dA = new BABYLON.Vector3(-sa * sb, 0, ca * sb), dB = new BABYLON.Vector3(ca * cb, -sb, sa * cb);
    const sgnA = Math.sign(BABYLON.Vector3.Dot(dA, right)) || 1, sgnB = Math.sign(BABYLON.Vector3.Dot(dB, up)) || 1;
    apply(clampA(sgnA * W.head.x * YAW), clampA(sgnB * W.head.y * PITCH), Math.max(.7, Math.min(1.3, Math.pow(1 / (W.head.s || 1), ZOOM))));
  }
  const avg = (list, k) => list.reduce((t, v) => t + v[k], 0) / list.length;

  // Add this frame's offsets after taking out the last ones.
  function apply(a, b, r) {
    const c = state.camera, p = W.applied; if (!c) return;
    if (a === p.a && b === p.b && r === p.r) return;
    c.alpha += a - p.a;
    const lo = c.lowerBetaLimit ?? .01, hi = c.upperBetaLimit ?? Math.PI - .01;
    const nb = Math.max(lo, Math.min(hi, c.beta + b - p.b)); b = p.b + (nb - c.beta); c.beta = nb;
    c.radius = c.radius / p.r * r;
    W.applied = { a, b, r };
  }

  function sync() {
    const box = document.getElementById('headWindow'); if (box) box.checked = W.on;
    document.getElementById('headWindowBtn')?.classList.toggle('active', W.on);
  }
  function init() {
    document.getElementById('headWindow')?.addEventListener('change', e => e.target.checked ? start() : stop());
    document.getElementById('headWindowBtn')?.addEventListener('click', toggle);
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
    // tests: a fake head (x right, y up, as fractions of the frame; near 1 = neutral)
    setHead(x, y, near = 1) { W.sim = { x: .5 - x, y: .5 - y, s: .1 * near }; if (!W.neutral) W.neutral = { x: .5, y: .5, s: .1 }; if (!W.on) { W.on = true; loop(); } },
  };
})();
