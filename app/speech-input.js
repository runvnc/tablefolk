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
 * The Voice pane's "Speech input" picks one. Automatic (the default):
 * Underdog Bark 3.0 in this browser (app/asr/; asked once before its download,
 * nothing leaves the machine), else the server's Gemma, else the browser's.
 * Bark runs fp16 on the graphics card (1.3 GB download, about 1.2 GB of
 * graphics memory, 0.4 s a sentence) when the card has shader-f16 and 1.5 GB
 * left beside the chat model (and Breeze, when it speaks), else int8 on the
 * processor (0.9 GB, no graphics memory, about 1.2 s a sentence). Measured with
 * tools/browser-test/asr-test.mjs (2026-11-01): 1.3% WER on LibriSpeech,
 * against 4.0% for Gemma 4 E2B's audio input at ten times the time.
 */
(function () {
  let mode = null; // 'gemma' | 'browser' | null
  const $ = id => document.getElementById(id);

  const pick = () => { try { return localStorage.getItem('tablefolk.speech') || 'auto'; } catch { return 'auto'; } };
  const barkOk = () => { try { return localStorage.getItem('tablefolk.barkOk'); } catch { return null; } };   // '1' yes, '0' declined
  async function detect() {
    const p = pick();
    if (p === 'bark' || p === 'bark-cpu' || (p === 'auto' && barkOk() !== '0')) return 'bark';
    if (p === 'browser' && (window.SpeechRecognition || window.webkitSpeechRecognition)) return 'browser';
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
  // fp16 on the graphics card when it has room, else int8 on the processor
  async function barkPlan() {
    const forced = new URLSearchParams(location.search).get('asrvariant');   // ?asrvariant=q8|fp16|q4 (q4: tests only, garbles some long clips)
    if (forced) return { variant: forced, gb: forced === 'q4' ? 0.5 : forced === 'q8' ? 0.9 : 1.3 };
    let f16 = false; try { f16 = !!(await navigator.gpu?.requestAdapter())?.features.has('shader-f16'); } catch {}
    const d = window.tablefolkDevice, breeze = /breeze/.test($('ttsEngine')?.value || '');
    const roomy = !d || d.freeGB == null || d.freeGB - (breeze ? 3 : 0) >= 1.5;
    return f16 && roomy && pick() !== 'bark-cpu' ? { variant: 'fp16', gb: 1.3 } : { variant: 'q8', gb: 0.9 };
  }
  // asked before recording (not after): yes keeps it, no falls back for good (the pane can pick it again)
  async function barkAsk() {
    if (barkOk() === '1') return true;
    const { gb } = await barkPlan();
    const yes = confirm(`Speech input in this browser needs a one-time ${gb} GB download (Underdog Bark 3.0, kept in the browser; your voice never leaves this computer). Download it?`);
    try { localStorage.setItem('tablefolk.barkOk', yes ? '1' : '0'); } catch {}
    return yes;
  }
  const BARK_URLS = ['https://geebr-models.mindroot.io/underdog-bark-3.0/', 'https://huggingface.co/ai-ecoverse/Underdog-Bark-3.0-ONNX/resolve/main/'];
  let barkWorker = null, barkReady = null, barkId = 0; const barkWait = new Map();
  function barkLoad() {
    if (barkReady) return barkReady;
    if (barkOk() !== '1') return Promise.reject(new Error('download not approved'));
    const urls = (new URLSearchParams(location.search).get('asr') ? [new URLSearchParams(location.search).get('asr')] : []).concat(BARK_URLS);
    barkReady = barkPlan().then(plan => new Promise((res, rej) => {
      barkWorker = new Worker('/app/asr/worker.js?v=20261101a', { type: 'module' });
      barkWorker.onmessage = e => {
        const m = e.data;
        if (m.type === 'progress') { const b = button(); if (b) b.title = `speech model: ${m.note} ${Math.round(m.fraction * 100)}%`; }   // the title only: it loads while you speak
        else if (m.type === 'ready') res();
        else if (m.type === 'text') barkWait.get(m.id)?.resolve(m.text), barkWait.delete(m.id);
        else if (m.type === 'error') { if (m.id != null) barkWait.get(m.id)?.reject(new Error(m.message)), barkWait.delete(m.id); else { barkReady = null; rej(new Error(m.message)); } }
      };
      barkWorker.onerror = e => { barkReady = null; rej(new Error(e.message || 'speech worker failed')); };
      barkWorker.postMessage({ type: 'load', urls, variant: plan.variant });
    }));
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
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true);
    out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, pcm.length * 2, true);
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
    if (mode === 'bark') {
      if (!(await barkAsk())) { if (pick() === 'auto') { mode = await detect(); } else { window.tablefolkToast?.('speech input: Underdog Bark not downloaded (pick another in the Voice pane)', { type: 'error' }); return; } }
      else barkLoad().catch(e => window.tablefolkToast?.('speech model: ' + e.message, { type: 'error' }));   // downloads while you speak
    }
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
