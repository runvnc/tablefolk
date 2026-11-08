/* video-recorder.js -- record the game as a video with its sound.
 *
 * The ⏺ button in the top bar starts recording; click it again to stop,
 * and the file downloads: MP4 with H.264 (and AAC, or Opus on Linux Chrome,
 * which has no AAC encoder), else WebM (VP9/VP8 + Opus).
 *
 * Picture: the 3D canvas (renderCanvas.captureStream at 30 fps), so panels and
 * the chat box are not in it; speech bubbles and everything drawn in the scene
 * are. Sound: the voices (pocket-tts-manager.js's gain node, on its own 24 kHz
 * context) and the sound effects and spells (sfx.js's master, on its context)
 * are tapped after their volume, mixed on the sfx context and recorded as one
 * track. A voice engine loaded during a recording is picked up within a
 * second. Nothing is downloaded or sent anywhere; the file is made in the
 * browser. Stops by itself after MAX_MIN minutes.
 *
 *   window.tablefolkVideo = { start(), stop(), get recording }
 *
 * (recorder.js is the older APNG "incident" recorder in the Debug pane: 4 fps,
 * no sound, with the world's state embedded for debugging.)
 */
(() => {
  'use strict';
  const FPS = 30, MAX_MIN = 10, VIDEO_BPS = 8_000_000, AUDIO_BPS = 160_000;
  // H.264 first (it plays everywhere, phones included): with AAC where the
  // browser has an AAC encoder (Chrome on Windows/macOS, Safari), else with
  // Opus (Chrome on Linux). A bare 'video/mp4' is skipped: Chrome fills it
  // with VP9, which iPhones don't play.
  const TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4;codecs=avc1.640028,opus', 'video/mp4;codecs=avc1,opus',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  let rec = null;   // { recorder, chunks, type, started, timer, taps, mixCtx, dest, ttsTapped }
  const $ = id => document.getElementById(id);

  function pickType() {
    if (!window.MediaRecorder) return null;
    return TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
  }

  // The mix: a MediaStreamDestination on the sfx context (created now if the
  // game hasn't made a sound yet), fed by sfx's master and the voices' gain.
  function audioMix() {
    const sfx = window.tablefolkSfx?.context?.();
    let ctx = sfx?.ctx;
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    try { ctx.resume?.(); } catch {}
    const dest = ctx.createMediaStreamDestination(), taps = [];
    if (sfx?.master) { sfx.master.connect(dest); taps.push(() => { try { sfx.master.disconnect(dest); } catch {} }); }
    return { ctx, dest, taps, sfxTapped: !!sfx?.master };
  }
  function tapVoices(r) {
    const tts = window.tablefolkTTS, g = tts?.gain, actx = tts?.audioCtx;
    if (!g || !actx || r.ttsTapped === g) return;
    try {
      // the voices' context is another one (24 kHz): bridge it through a stream
      const bridge = actx.createMediaStreamDestination();
      g.connect(bridge);
      const src = r.mixCtx.createMediaStreamSource(bridge.stream);
      src.connect(r.dest);
      r.taps.push(() => { try { g.disconnect(bridge); } catch {} try { src.disconnect(); } catch {} });
      r.ttsTapped = g;
    } catch (e) { console.warn('[video] could not record the voices', e); }
  }
  function tapSfxLate(r) {
    if (r.sfxTapped) return;
    const sfx = window.tablefolkSfx?.context?.();
    if (!sfx?.master || sfx.ctx !== r.mixCtx) return;   // a different context: picked at start only
    sfx.master.connect(r.dest); r.taps.push(() => { try { sfx.master.disconnect(r.dest); } catch {} }); r.sfxTapped = true;
  }

  function start() {
    if (rec) return;
    const canvas = $('renderCanvas');
    const type = pickType();
    if (!canvas?.captureStream || type === null) { window.tablefolkToast?.('This browser cannot record video (no MediaRecorder).', { type: 'error' }); return; }
    const video = canvas.captureStream(FPS);
    const mix = audioMix();
    const stream = new MediaStream([...video.getVideoTracks(), ...(mix ? mix.dest.stream.getAudioTracks() : [])]);
    let recorder;
    try { recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS }); }
    catch (e) { window.tablefolkToast?.('Could not start recording: ' + e.message, { type: 'error' }); return; }
    const r = rec = { recorder, chunks: [], type: recorder.mimeType || type || 'video/webm', started: performance.now(), taps: mix?.taps || [], mixCtx: mix?.ctx, dest: mix?.dest, sfxTapped: mix?.sfxTapped, ttsTapped: null, video };
    if (mix) tapVoices(r);
    recorder.ondataavailable = e => { if (e.data?.size) r.chunks.push(e.data); };
    recorder.onstop = () => finish(r);
    recorder.start(1000);
    r.timer = setInterval(() => {
      if (mix) { tapVoices(r); tapSfxLate(r); }
      const s = (performance.now() - r.started) / 1000;
      ui(true, s);
      if (s > MAX_MIN * 60) stop();
    }, 500);
    ui(true, 0);
    window.tablefolkToast?.('Recording the 3D view with sound. Click ⏺ again to stop and save.', { type: 'info' });
  }

  function stop() {
    const r = rec; if (!r || r.recorder.state === 'inactive') return;
    clearInterval(r.timer);
    try { r.recorder.requestData(); } catch {}
    r.recorder.stop();
  }

  function finish(r) {
    for (const t of r.taps) t();
    for (const t of r.video.getTracks()) t.stop();
    rec = null; ui(false);
    if (!r.chunks.length) { window.tablefolkToast?.('Nothing was recorded.', { type: 'error' }); return; }
    const blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
    const ext = /mp4/.test(r.type) ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const title = (window.tablefolkScenario?.active?.scn?.title || 'tablefolk').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'tablefolk';
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${title}-${stamp}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const secs = Math.round((performance.now() - r.started) / 1000);
    window.tablefolkToast?.(`Saved ${a.download} (${secs} s, ${(blob.size / 1048576).toFixed(1)} MB)`, { type: 'info' });
  }

  function ui(on, secs = 0) {
    const b = $('videoRecBtn'); if (!b) return;
    b.classList.toggle('recording', !!on);
    const t = b.querySelector('.rec-time');
    if (t) t.textContent = on ? `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}` : '';
    b.title = on ? 'stop recording and save the video' : 'record a video of the 3D view with sound';
    b.setAttribute('aria-label', b.title);
  }

  function init() {
    const b = $('videoRecBtn');
    b?.addEventListener('click', () => rec ? stop() : start());
    ui(false);
  }
  window.tablefolkVideo = { start, stop, get recording() { return !!rec; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
