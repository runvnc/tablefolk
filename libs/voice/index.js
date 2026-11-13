// @tablefolk/voice -- text to speech in the browser, nothing sent anywhere:
//   pocket-18m   Pocket-TTS small (Kyutai, CC-BY-4.0): ~40 MB, English, on the processor; phones
//   pocket-100m  Pocket-TTS (~120 MB, five languages), on the processor
//   breeze-web   Breeze TTS 2 (3B, WebGPU, a 2.5 GB download once): far better, needs a
//                graphics card with ~3.5 GB free, shader-f16 and JSPI. Its weights are for
//                research and non-commercial use only (BreezeBlue's licence).
//   browser      the browser's own speechSynthesis (no download)
//
//   import { createVoice, chooseEngine } from '@tablefolk/voice';
//   const v = await createVoice({ engine: 'auto', onStatus: s => console.log(s) });
//   v.engine, v.why                         // 'pocket-18m', 'a phone: the small model'
//   await v.speak('Well met, traveller.', { voice: 'alba' })   // resolves when it has been heard
//   for await (const pcm of v.stream('Hello')) ...   // Float32Array chunks at v.sampleRate (no playback)
//   v.voices                                // the built-in voice names
//   await v.cloneVoice('me', pcm24k, 'the words said in it')   // Pocket: audio alone; Breeze: with its transcript
//   v.stop(); v.unload(); v.level()          // level: loudness now (for a talking mouth)
//
// 'auto': Breeze in the browser when the device has room for it beside what
// else it runs (pass freeGB, the graphics memory left) and allowBreeze is
// true (default; false for a commercial product); else Pocket-TTS small. The
// models download from Hugging Face, or Tablefolk's mirror on tablefolk.world.
import { createWorker, mirrorAllowed, note } from '../models/index.js';
import { detectHardware, usableGB } from '../device/index.js';

export const ENGINES = {
  'pocket-18m': { label: 'Pocket-TTS small (18M, English)', worker: 'pocket18-worker.js', size: '~40 MB' },
  'pocket-100m': { label: 'Pocket-TTS (100M, 5 languages)', worker: 'pocket-worker.js', size: '~120 MB', languages: true },
  'breeze-web': { label: 'Breeze TTS 2 (3B, WebGPU; non-commercial licence)', worker: 'breeze-web-worker.js', size: '2.5 GB', needGB: 3.5, nonCommercial: true },
  'browser': { label: 'the browser\'s speech', size: 'none' },
};
export const POCKET_VOICES = ['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius'];

// The engine for this device, and why. freeGB: graphics memory left beside
// the page's other models (default: all of what @tablefolk/device finds usable).
export async function chooseEngine({ allowBreeze = true, freeGB = null, preferBreeze = true } = {}) {
  const hw = await detectHardware().catch(() => null);
  if (hw && (hw.cls === 'phone' || hw.cls === 'tablet')) return { engine: 'pocket-18m', why: 'a phone or tablet: the small model' };
  if (!allowBreeze || !preferBreeze) return { engine: 'pocket-18m', why: allowBreeze ? 'the small model' : 'Breeze not allowed here (its licence is non-commercial)' };
  const no = await breezeWhyNot(hw, freeGB);
  return no ? { engine: 'pocket-18m', why: 'Breeze can\'t run here: ' + no } : { engine: 'breeze-web', why: 'the graphics card has room for Breeze' };
}
export async function breezeWhyNot(hw = null, freeGB = null) {
  if (typeof WebAssembly.Suspending !== 'function') return 'no JSPI in this browser';
  const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!a) return 'no WebGPU';
  if (!a.features.has('shader-f16')) return 'no shader-f16 on this graphics card';
  hw ||= await detectHardware().catch(() => null);
  const free = freeGB ?? usableGB(hw);
  if (free == null) return 'the graphics memory is not known';
  if (free < ENGINES['breeze-web'].needGB) return `${free} GB of graphics memory free; Breeze wants ${ENGINES['breeze-web'].needGB}`;
  return '';
}

export async function createVoice({ engine = 'auto', voice = null, language = null, onStatus = () => {}, audioContext = null, allowBreeze = true, freeGB = null } = {}) {
  const pick = engine === 'auto' ? await chooseEngine({ allowBreeze, freeGB }) : { engine, why: 'asked for' };
  const E = ENGINES[pick.engine]; if (!E) throw new Error('unknown voice engine ' + pick.engine);
  note('voice', `${E.label}: ${pick.why}`);
  if (pick.engine === 'browser') return browserVoice(pick);

  const w = createWorker(new URL('./' + E.worker, import.meta.url));
  let sampleRate = 24000, voices = [], defaultVoice = voice;
  let sink = null;   // the stream being read: { push(Float32Array), end(), fail(e) }
  const waitLoad = new Promise((resolve, reject) => {
    w.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'status') onStatus(m.status);
      else if (m.type === 'bundle_loaded') sampleRate = m.sampleRate || sampleRate;
      else if (m.type === 'voices_loaded') { voices = m.voices || voices; defaultVoice ||= m.defaultVoice; }
      else if (m.type === 'loaded') resolve();
      else if (m.type === 'generation_started') sampleRate = m.data?.sourceSampleRate || sampleRate;
      else if (m.type === 'audio_chunk') sink?.push(new Float32Array(m.data));
      else if (m.type === 'stream_ended') sink?.end();
      else if (m.type === 'voice_encoded') sink?.encoded?.(m.voiceName);
      else if (m.type === 'error') { const err = new Error(m.error || 'voice error'); if (sink) sink.fail(err); else reject(err); }
    };
    w.onerror = e => reject(new Error(e.message || 'voice worker failed'));
  });
  w.postMessage({ type: 'load', data: { mirror: mirrorAllowed(), language: language || undefined, allowCpu: false } });
  await waitLoad;
  onStatus(`${E.label} ready`);

  let queue = Promise.resolve();
  // PCM pieces of one line (one line at a time: the worker generates one)
  function stream(text, { voice: v = defaultVoice, instruction } = {}) {
    const chunks = [], waiters = []; let done = false, error = null;
    const wake = () => { while (waiters.length && (chunks.length || done || error)) waiters.shift()(); };
    const run = () => new Promise(res => {
      sink = { push: c => { chunks.push(c); wake(); }, end: () => { done = true; sink = null; wake(); res(); }, fail: e => { error = e; sink = null; wake(); res(); } };
      w.postMessage({ type: 'generate', data: { text, voice: v, instruction } });
    });
    queue = queue.then(run, run);
    return { [Symbol.asyncIterator]() { return this; },
      async next() {
        while (!chunks.length && !done && !error) await new Promise(r => waiters.push(r));
        if (chunks.length) return { value: chunks.shift(), done: false };
        if (error) throw error;
        return { value: undefined, done: true };
      } };
  }

  // playback: chunks scheduled back to back
  let ctx = audioContext, gain = null, analyser = null, levelBuf = null, playing = new Set(), stopped = 0;
  function audio() {
    if (!ctx) ctx = new AudioContext();
    if (!gain) { gain = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 1024; levelBuf = new Float32Array(analyser.fftSize); gain.connect(analyser); analyser.connect(ctx.destination); }
    return ctx;
  }
  async function speak(text, opts = {}) {
    const c = audio(); if (c.state === 'suspended') await c.resume().catch(() => {});
    const gen = stopped; let at = c.currentTime + 0.05, last = null;
    for await (const pcm of stream(text, opts)) {
      if (gen !== stopped) break;
      const b = c.createBuffer(1, pcm.length, sampleRate); b.copyToChannel(pcm, 0);
      const s = c.createBufferSource(); s.buffer = b; s.connect(gain);
      at = Math.max(at, c.currentTime + 0.02); s.start(at); at += b.duration;
      playing.add(s); s.onended = () => playing.delete(s); last = s;
    }
    if (last && gen === stopped) await new Promise(r => { last.addEventListener('ended', r, { once: true }); });
  }
  return {
    engine: pick.engine, why: pick.why, label: E.label,
    get voices() { return voices.map(v => typeof v === 'string' ? v : v.name || v.id).filter(Boolean); },
    get sampleRate() { return sampleRate; },
    speak, stream,
    setVolume(v) { audio(); gain.gain.value = v; },
    level() { if (!analyser) return 0; analyser.getFloatTimeDomainData(levelBuf); let s = 0; for (const v of levelBuf) s += v * v; return Math.sqrt(s / levelBuf.length); },
    // a voice of your own: 24 kHz mono audio (a few seconds); Breeze also wants the words said in it
    cloneVoice(id, audio24k, text = '') {
      return new Promise((resolve, reject) => {
        const prev = sink;
        sink = { encoded: name => { sink = prev; resolve(name); }, fail: e => { sink = prev; reject(e); }, push() {}, end() {} };
        const a = new Float32Array(audio24k);
        w.postMessage({ type: 'encode_voice', data: { voiceId: id, audio: a, text, cacheKey: id } }, [a.buffer]);
      });
    },
    stop() { stopped++; w.postMessage({ type: 'stop' }); for (const s of playing) { try { s.stop(); } catch {} } playing.clear(); },
    unload() { this.stop(); w.terminate(); },
  };
}

// the browser's speechSynthesis behind the same methods (no stream: it plays itself)
function browserVoice(pick) {
  const S = globalThis.speechSynthesis;
  if (!S) throw new Error('no speechSynthesis in this browser');
  const list = () => S.getVoices();
  return {
    engine: 'browser', why: pick.why, label: ENGINES.browser.label, sampleRate: null,
    get voices() { return list().map(v => v.name); },
    speak(text, { voice } = {}) {
      return new Promise((resolve, reject) => {
        const u = new SpeechSynthesisUtterance(text);
        const v = voice && list().find(x => x.name === voice); if (v) u.voice = v;
        u.onend = () => resolve(); u.onerror = e => e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error));
        S.speak(u);
      });
    },
    stream() { throw new Error('the browser\'s speech plays itself: use speak()'); },
    level: () => 0, setVolume() {}, cloneVoice() { throw new Error('the browser\'s speech has no custom voices'); },
    stop() { S.cancel(); }, unload() { S.cancel(); },
  };
}
