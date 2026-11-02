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
 * nothing leaves the machine), else the server's Gemma, else a llama.cpp model
 * with audio input on this computer (LFM3-Omni-2B: tools/llama-server.sh
 * --omni; found through the endpoint settings or the helper finder), else the
 * browser's: Chrome's on-device recognition when it has it (its language pack,
 * about 300 MB, installed on the first 🎤 click), else its cloud one.
 * Bark runs fp16 on the graphics card (1.3 GB download, about 1.2 GB of
 * graphics memory, 0.4 s a sentence) when the card has shader-f16 and 1.5 GB
 * left beside the chat model (and Breeze, when it speaks), else int8 on the
 * processor (0.9 GB, no graphics memory, about 1.2 s a sentence). Measured with
 * tools/browser-test/asr-test.mjs (2026-11-01): 1.3% WER on LibriSpeech,
 * against 4.0% for Gemma 4 E2B's audio input at ten times the time.
 * The button names the recogniser in use (Bark GPU, Bark CPU, Chrome
 * on-device, Chrome cloud, Gemma (server), the llama.cpp model) and its
 * tooltip the last transcription's time; a fallback also says so in a toast.
 */
(function () {
  let mode = null; // 'bark' | 'gemma' | 'llama' | 'browser' | null
  let llama = null;   // { base, model } of a llama.cpp server whose model hears (GET /props: modalities.audio)
  const $ = id => document.getElementById(id);

  const pick = () => { try { return localStorage.getItem('tablefolk.speech') || 'auto'; } catch { return 'auto'; } };
  const barkOk = () => { try { return localStorage.getItem('tablefolk.barkOk'); } catch { return null; } };   // '1' yes, '0' declined
  async function detect() {
    const p = pick();
    if (p === 'bark' || p === 'bark-cpu' || (p === 'auto' && barkOk() !== '0')) return 'bark';
    if (p === 'browser' && (window.SpeechRecognition || window.webkitSpeechRecognition)) return 'browser';
    if (p === 'llama' && (await findLlama())) return 'llama';
    if (p !== 'llama') try {
      const r = await fetch('/api/status', { signal: AbortSignal.timeout(2500) });
      if (r.ok && (await r.json()).speech) return 'gemma';
    } catch {}
    if (p !== 'gemma' && (await findLlama())) return 'llama';
    return (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'browser' : null;
  }

  // the endpoint brain's server (when it is not this server's proxy), and llama.cpp's
  // usual port once the helper finder has run (probing 127.0.0.1 unasked makes Chrome ask)
  async function findLlama() {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('tablefolk_llm_endpoint') || '{}') || {}; } catch {}
    const bases = [saved.baseURL && !/^\/api\//.test(saved.baseURL) ? saved.baseURL : null, localStorage.getItem('tablefolkHelpers') === '1' ? 'http://127.0.0.1:8080/v1' : null].filter(Boolean);
    for (const b of bases) {
      const base = b.replace(/\/+$/, '');
      try {
        const r = await fetch(base.replace(/\/v1$/, '') + '/props', { signal: AbortSignal.timeout(2000) }), d = r.ok ? await r.json() : null;
        if (d?.modalities?.audio) return (llama = { base, model: d.model_alias || saved.model || '' });
      } catch {}
    }
    return (llama = null);
  }
  async function llamaText(wav) {
    const u8 = new Uint8Array(wav); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    const r = await fetch(llama.base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: llama.model || undefined, temperature: 0, max_tokens: 400,
      messages: [{ role: 'system', content: 'Perform ASR in English.' }, { role: 'user', content: [{ type: 'input_audio', input_audio: { data: btoa(bin), format: 'wav' } }] }] }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'llama.cpp transcription failed');
    return d.choices?.[0]?.message?.content || '';
  }

  function button() {
    let b = $('micBtn');
    if (b) return b;
    const send = $('chatSend'); if (!send) return null;
    b = document.createElement('button');
    b.id = 'micBtn'; b.type = 'button'; b.className = 'mic-btn'; b.innerHTML = '🎤<span class="mic-engine"></span>';
    b.title = 'speak (click to start, click again to send)';
    send.parentNode.insertBefore(b, send);
    b.addEventListener('click', toggle);
    return b;
  }
  const setState = (st, title) => { const b = button(); if (!b) return; b.dataset.state = st; if (title) b.title = title; };
  // Which recogniser is in use, on the button itself (every mode, not only
  // dev): Bark GPU / Bark CPU, Chrome on-device / Chrome cloud, Gemma, llama.cpp.
  let engine = '', lastNote = '';
  function showEngine(name, note) {
    if (name != null) engine = name; if (note != null) lastNote = note;
    const b = button(), tag = b?.querySelector('.mic-engine'); if (!tag) return;
    tag.textContent = engine;
    b.setAttribute('aria-label', 'speak' + (engine ? ' (' + engine + ')' : ''));
    if (b.dataset.state === 'idle') b.title = `speak${engine ? ' with ' + engine : ''}${lastNote ? ' (' + lastNote + ')' : ''}: click to start, click again to send. The Voice pane picks the speech input.`;
  }
  async function guessEngine(m) {
    if (m === 'bark') { const p = await barkPlan(); return 'Bark ' + (p.variant === 'q8' ? 'CPU' : 'GPU'); }
    if (m === 'gemma') return 'Gemma (server)';
    if (m === 'llama') return (llama?.model || 'llama.cpp').replace(/\.gguf$/i, '').replace(/-GGUF$/i, '').slice(0, 18);
    if (m === 'browser') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      let a = null; try { a = await SR?.available?.({ langs: [navigator.language || 'en-US'], processLocally: true }); } catch {}
      return a === 'available' || a === 'downloadable' || a === 'downloading' ? 'Chrome on-device' : 'Chrome cloud';
    }
    return 'off';
  }

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
      const t0 = performance.now(), took = () => `last one ${((performance.now() - t0) / 1000).toFixed(1)} s`;
      try {
        const blob = new Blob(chunks, { type: rec.mimeType });
        // what the microphone gave: kept for tablefolkSpeech.playLast(), and a silent clip
        // is not sent (the recognisers hear "Yeah" or "Thank you" in silence)
        const pcm = await toPcm16k(blob), lv = level(pcm);
        last = { blob, ...lv };
        console.log(`[speech] ${mode}: ${lv.seconds.toFixed(1)} s, peak ${lv.peak.toFixed(3)}, loud ${Math.round(lv.voiced * 100)}%`);
        if (lv.peak < .015 || lv.voiced < .02) { window.tablefolkToast?.(`speech: the microphone sent ${lv.peak < .002 ? 'silence' : 'almost nothing'} (peak ${lv.peak.toFixed(3)}); check the input device (tablefolkSpeech.playLast() plays it back)`, { type: 'error' }); return; }
        if (mode === 'bark') { const text = await barkText(pcm); console.log('[speech] heard:', JSON.stringify(text)); showEngine('Bark ' + (barkVariant === 'q8' ? 'CPU' : 'GPU'), took() + `, mic peak ${lv.peak.toFixed(2)}`); deliver(text); return; }
        const wav = await toWav16k(blob);
        if (mode === 'llama') { const text = await llamaText(wav); showEngine(null, took()); deliver(text); return; }
        const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'transcription failed');
        showEngine(null, took()); deliver(d.text);
      } catch (e) {
        window.tablefolkToast?.('speech: ' + e.message, { type: 'error' });
        if (window.SpeechRecognition || window.webkitSpeechRecognition) {
          mode = 'browser'; guessEngine('browser').then(n => { showEngine(n, 'fell back after an error'); window.tablefolkToast?.('speech input now: ' + n, { type: 'info' }); });
        }
      } finally { setState('idle'); showEngine(); }
    };
    rec.start();
    setState('rec', 'listening… click to send');
  }
  // peak, length, and the share of 20 ms frames louder than -40 dBFS
  let last = null;
  function level(pcm) {
    let peak = 0, voiced = 0, frames = 0;
    for (let i = 0; i + 320 <= pcm.length; i += 320) {
      let e = 0; for (let j = i; j < i + 320; j++) { const v = pcm[j]; e += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
      frames++; if (Math.sqrt(e / 320) > .01) voiced++;
    }
    return { peak, seconds: pcm.length / 16000, voiced: frames ? voiced / frames : 0 };
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
    const d = window.tablefolkDevice, breeze = /breeze/.test(window.tablefolkTTS?.engine || $('ttsEngine')?.value || '');
    const roomy = !d || d.freeGB == null || d.freeGB - (breeze ? 3 : 0) >= 1.5;
    return f16 && roomy && pick() !== 'bark-cpu' && !barkCpuOnly ? { variant: 'fp16', gb: 1.3 } : { variant: 'q8', gb: 0.9 };
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
  let barkWorker = null, barkReady = null, barkId = 0, barkVariant = null; const barkWait = new Map();
  function barkLoad() {
    if (barkReady) return barkReady;
    if (barkOk() !== '1') return Promise.reject(new Error('download not approved'));
    const urls = (new URLSearchParams(location.search).get('asr') ? [new URLSearchParams(location.search).get('asr')] : []).concat(BARK_URLS);
    barkReady = barkPlan().then(plan => new Promise((res, rej) => {
      barkVariant = plan.variant; showEngine('Bark ' + (plan.variant === 'q8' ? 'CPU' : 'GPU'));
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
  // A WebGPU error (seen with the card full: Breeze and llama.cpp beside the game, 5.7 of 6 GB) moves
  // Bark to the processor for the rest of the session and reads the clip again there.
  let barkCpuOnly = false;
  async function barkText(pcm) {
    await barkLoad();
    const copy = pcm.slice();
    const once = audio => new Promise((resolve, reject) => { const id = ++barkId; barkWait.set(id, { resolve, reject }); barkWorker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]); });
    try { return await once(pcm); }
    catch (e) {
      if (barkCpuOnly || !/webgpu|OrtRun|GPU/i.test(e.message)) throw e;
      barkCpuOnly = true; barkWorker?.terminate(); barkWorker = null; barkReady = null;
      window.tablefolkToast?.('speech: the graphics card is full; Underdog Bark moves to the processor', { type: 'info' }); showEngine('Bark CPU');
      await barkLoad(); return once(copy);
    }
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
  // Chrome's on-device recognition when it has (or can install) the language pack: the audio stays here.
  // Measured on LibriSpeech (asr-test.mjs, 2026-11-01): 3.6% WER clean, 2.0% through a laptop-mic filter.
  async function startBrowser() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, lang = navigator.language || 'en-US';
    let local = false;
    try {
      const o = { langs: [lang], processLocally: true }, a = await SR.available?.(o);
      if (a === 'available') local = true;
      else if (a === 'downloadable' || a === 'downloading') { setState('busy', 'installing Chrome\'s speech recognition for ' + lang + '…'); local = !!(await SR.install(o)); }
    } catch {}
    recog = new SR(); recog.lang = lang; recog.interimResults = true; recog.continuous = true; recog.maxAlternatives = 1;
    if (local) recog.processLocally = true;
    let latest = '';
    recog.onresult = e => { latest = [...e.results].map(x => x[0].transcript).join(' '); };   // on stop, the latest words (final or not)
    recog.onerror = e => { if (e.error !== 'aborted') window.tablefolkToast?.('speech: ' + e.error, { type: 'error' }); };
    recog.onend = () => { recog = null; setState('idle'); showEngine(); deliver(latest); };
    showEngine(local ? 'Chrome on-device' : 'Chrome cloud');
    recog.start(); setState('rec', (local ? 'listening (on this device)' : 'listening (the browser\'s cloud recognition)') + '… click to send');
  }

  async function toggle() {
    if (rec?.state === 'recording') { rec.stop(); return; }
    if (recog) { recog.stop(); return; }
    if (button()?.dataset.state === 'busy') return;
    mode ??= await detect();
    if (mode === 'bark') {
      if (!(await barkAsk())) { if (pick() === 'auto') { mode = await detect(); showEngine(await guessEngine(mode)); } else { window.tablefolkToast?.('speech input: Underdog Bark not downloaded (pick another in the Voice pane)', { type: 'error' }); return; } }
      else barkLoad().catch(e => window.tablefolkToast?.('speech model: ' + e.message, { type: 'error' }));   // downloads while you speak
    }
    try {
      if (mode === 'gemma' || mode === 'bark' || mode === 'llama') await startRecording();
      else if (mode === 'browser') await startBrowser();
      else window.tablefolkToast?.('no speech input: run the Tablefolk server with litert-lm serve, or use Chrome', { type: 'error' });
    } catch (e) { window.tablefolkToast?.('microphone: ' + e.message, { type: 'error' }); setState('idle'); }
  }

  const init = () => { const sel = $('speechMode'); if (sel) sel.value = pick(); button(); setState('idle'); detect().then(async m => { mode = m; showEngine(await guessEngine(m)); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.tablefolkSpeech = { toggle, toWav16k, toPcm16k, detect, barkText,
    get last() { return last && { seconds: last.seconds, peak: last.peak, voiced: last.voiced }; },
    playLast() { if (!last) return 'nothing recorded yet'; const a = new Audio(URL.createObjectURL(last.blob)); a.play(); return { seconds: last.seconds, peak: last.peak }; }, setMode: m => { try { localStorage.setItem('tablefolk.speech', m); } catch {} mode = null; lastNote = ''; detect().then(async x => { mode = x; showEngine(await guessEngine(x)); }); }, get engine() { return engine; } };
})();
