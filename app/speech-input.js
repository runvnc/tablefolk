/* speech-input.js -- talk to characters with your voice.
 *
 * The 🎤 button in the chat box records while pressed-on (click to start,
 * click again to send). Speech becomes text by:
 *   1. Gemma 4's own audio input on this machine: the Tablefolk server's
 *      /api/transcribe, which runs `litert-lm serve` with a multimodal Gemma 4
 *      (gemma4-e2b-mm). The in-browser LiteRT-LM model is text-only for now,
 *      so this needs the server.
 *   2. Otherwise the browser's built-in speech recognition (Chrome/Edge).
 * The words go into the chat box and are sent like typed text.
 */
(function () {
  let mode = null; // 'gemma' | 'browser' | null
  const $ = id => document.getElementById(id);

  async function detect() {
    try {
      const r = await fetch('/api/status', { signal: AbortSignal.timeout(2500) });
      if (r.ok && (await r.json()).speech) return 'gemma';
    } catch {}
    return (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'browser' : null;
  }

  function button() {
    let b = $('micBtn');
    if (b) return b;
    const send = $('chatSend'); if (!send) return null;
    b = document.createElement('button');
    b.id = 'micBtn'; b.type = 'button'; b.className = 'mic-btn'; b.textContent = '🎤';
    b.title = 'speak (click to start, click again to send)';
    send.parentNode.insertBefore(b, send);
    b.addEventListener('click', toggle);
    return b;
  }
  const setState = (st, title) => { const b = button(); if (!b) return; b.dataset.state = st; if (title) b.title = title; };

  function deliver(text) {
    text = String(text || '').trim();
    if (!text) { window.tablefolkToast?.('heard nothing', { type: 'error' }); return; }
    const input = $('chatInput'); if (!input) return;
    input.value = text;
    $('chatSend')?.click();
  }

  // ---- Gemma (server) path: record, convert to 16 kHz mono WAV, post.
  let rec = null, chunks = [], stream = null;
  async function startRecording() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setState('busy', 'transcribing…');
      try {
        const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
        const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'transcription failed');
        deliver(d.text);
      } catch (e) {
        window.tablefolkToast?.('speech: ' + e.message, { type: 'error' });
        if (window.SpeechRecognition || window.webkitSpeechRecognition) mode = 'browser';
      } finally { setState('idle', 'speak (click to start, click again to send)'); }
    };
    rec.start();
    setState('rec', 'listening… click to send');
  }
  async function toWav16k(blob) {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000, off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return out.buffer;
  }

  // ---- Browser path.
  let recog = null;
  function startBrowser() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recog = new SR(); recog.lang = navigator.language || 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1;
    recog.onresult = e => deliver(e.results[0]?.[0]?.transcript);
    recog.onerror = e => window.tablefolkToast?.('speech: ' + e.error, { type: 'error' });
    recog.onend = () => { recog = null; setState('idle'); };
    recog.start(); setState('rec', 'listening… (stops when you pause)');
  }

  async function toggle() {
    if (rec?.state === 'recording') { rec.stop(); return; }
    if (recog) { recog.stop(); return; }
    if (button()?.dataset.state === 'busy') return;
    mode ??= await detect();
    try {
      if (mode === 'gemma') await startRecording();
      else if (mode === 'browser') startBrowser();
      else window.tablefolkToast?.('no speech input: run the Tablefolk server with litert-lm serve, or use Chrome', { type: 'error' });
    } catch (e) { window.tablefolkToast?.('microphone: ' + e.message, { type: 'error' }); setState('idle'); }
  }

  const init = () => { button(); setState('idle'); detect().then(m => { mode = m; const b = button(); if (b) b.title = (m === 'gemma' ? 'speak (Gemma 4 audio on this machine)' : m === 'browser' ? 'speak (browser speech recognition)' : 'speech input unavailable') + ' - click to start, click again to send'; }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.tablefolkSpeech = { toggle, toWav16k, detect };
})();
