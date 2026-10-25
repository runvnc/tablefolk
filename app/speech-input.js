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
 *
 * Brain options > "Speech input" can pick one: in this browser with Underdog
 * Bark 3.0 (a 1.3 GB speech model on WebGPU, app/asr/, downloaded once, asked
 * first; nothing leaves the machine), the server's Gemma, or the browser's
 * own recognition.
 */
(function () {
  let mode = null; // 'gemma' | 'browser' | null
  const $ = id => document.getElementById(id);

  const pick = () => { try { return localStorage.getItem('tablefolk.speech') || 'auto'; } catch { return 'auto'; } };
  async function detect() {
    if (pick() === 'bark' && navigator.gpu) return 'bark';
    if (pick() === 'browser' && (window.SpeechRecognition || window.webkitSpeechRecognition)) return 'browser';
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
        if (mode === 'bark') { deliver(await barkText(await toPcm16k(new Blob(chunks, { type: rec.mimeType })))); return; }
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
  async function toPcm16k(blob) {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000, off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  }
  // ---- Underdog Bark (in this browser): the model lives in a worker
  const BARK_URLS = ['https://geebr-models.mindroot.io/underdog-bark-3.0/', 'https://huggingface.co/ai-ecoverse/Underdog-Bark-3.0-ONNX/resolve/main/'];
  let barkWorker = null, barkReady = null, barkId = 0; const barkWait = new Map();
  function barkLoad() {
    if (barkReady) return barkReady;
    const asked = (() => { try { return localStorage.getItem('tablefolk.barkOk') === '1'; } catch { return false; } })();
    if (!asked && !confirm('Speech input in this browser needs a one-time 1.3 GB download (Underdog Bark 3.0, kept in the browser; nothing is sent anywhere). Download it?')) return Promise.reject(new Error('download declined'));
    try { localStorage.setItem('tablefolk.barkOk', '1'); } catch {}
    const urls = (new URLSearchParams(location.search).get('asr') ? [new URLSearchParams(location.search).get('asr')] : []).concat(BARK_URLS);
    barkReady = new Promise((res, rej) => {
      barkWorker = new Worker('/app/asr/worker.js?v=1', { type: 'module' });
      barkWorker.onmessage = e => {
        const m = e.data;
        if (m.type === 'progress') setState('busy', `speech model: ${m.note} ${Math.round(m.fraction * 100)}%`);
        else if (m.type === 'ready') res();
        else if (m.type === 'text') barkWait.get(m.id)?.resolve(m.text), barkWait.delete(m.id);
        else if (m.type === 'error') { if (m.id != null) barkWait.get(m.id)?.reject(new Error(m.message)), barkWait.delete(m.id); else { barkReady = null; rej(new Error(m.message)); } }
      };
      barkWorker.onerror = e => { barkReady = null; rej(new Error(e.message || 'speech worker failed')); };
      barkWorker.postMessage({ type: 'load', urls });
    });
    return barkReady;
  }
  async function barkText(pcm) {
    await barkLoad();
    return new Promise((resolve, reject) => { const id = ++barkId; barkWait.set(id, { resolve, reject }); barkWorker.postMessage({ type: 'transcribe', id, audio: pcm }, [pcm.buffer]); });
  }
  async function toWav16k(blob) {
    const pcm = await toPcm16k(blob);
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
      if (mode === 'gemma' || mode === 'bark') await startRecording();
      else if (mode === 'browser') startBrowser();
      else window.tablefolkToast?.('no speech input: run the Tablefolk server with litert-lm serve, or use Chrome', { type: 'error' });
    } catch (e) { window.tablefolkToast?.('microphone: ' + e.message, { type: 'error' }); setState('idle'); }
  }

  const init = () => { const sel = $('speechMode'); if (sel) sel.value = pick(); button(); setState('idle'); detect().then(m => { mode = m; const b = button(); if (b) b.title = (m === 'bark' ? 'speak (Underdog Bark, in this browser)' : m === 'gemma' ? 'speak (Gemma 4 audio on this machine)' : m === 'browser' ? 'speak (browser speech recognition)' : 'speech input unavailable') + ' - click to start, click again to send'; }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.tablefolkSpeech = { toggle, toWav16k, toPcm16k, detect, barkText, setMode: m => { try { localStorage.setItem('tablefolk.speech', m); } catch {} mode = null; detect().then(x => mode = x); } };
})();
