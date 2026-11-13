// @tablefolk/hear -- speech to text in the browser:
//   browser  the browser's SpeechRecognition (Chrome: on this device when it
//            has the language pack, which it may install; else its cloud)
//   bark     Underdog Bark 3.0 (ai-ecoverse, CC-BY-4.0, a Parakeet-TDT 0.6B
//            fine-tune) in a worker: fp16 on WebGPU (1.3 GB download once,
//            ~0.4 s a sentence) or int8 on the processor (0.9 GB, ~1.2 s).
//            Your voice never leaves the machine. 1.3% WER on LibriSpeech.
//
//   import { createListener } from '@tablefolk/hear';
//   const ear = await createListener({ engine: 'auto', onStatus: s => console.log(s) });
//   ear.engine, ear.why
//   await ear.start();            // recording (hold-to-talk: start on press...)
//   const text = await ear.stop() // ...stop on release: the words
//   await ear.transcribe(pcm16k)  // bark: a Float32Array at 16 kHz you recorded yourself
//
// 'auto': a phone or tablet with SpeechRecognition uses it (lighter);
// elsewhere Bark (ask: async ({ gb }) => true to allow its download, default
// allowed), else the browser's. Bark's files come from Hugging Face, or
// Tablefolk's mirror on tablefolk.world.
import { createWorker, mirrorAllowed, sources, note } from '../models/index.js';
import { detectHardware } from '../device/index.js';

const BARK = { mirror: 'https://geebr-models.mindroot.io/underdog-bark-3.0/', hf: 'https://huggingface.co/ai-ecoverse/Underdog-Bark-3.0-ONNX/resolve/main/' };
const SR = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

export async function chooseEngine({ preferBrowserOnPhones = true } = {}) {
  const hw = await detectHardware().catch(() => null);
  if (preferBrowserOnPhones && SR() && hw && (hw.cls === 'phone' || hw.cls === 'tablet')) return { engine: 'browser', why: 'a phone or tablet: the browser\'s recognition is lighter' };
  if (typeof Worker === 'function') return { engine: 'bark', why: 'Underdog Bark in this browser (private, accurate)' };
  return SR() ? { engine: 'browser', why: 'the browser\'s recognition' } : { engine: null, why: 'no speech recognition here' };
}
// fp16 on the graphics card when it has shader-f16, else int8 on the processor
export async function barkPlan({ cpu = false } = {}) {
  let f16 = false; try { f16 = !!(await navigator.gpu?.requestAdapter())?.features.has('shader-f16'); } catch {}
  return f16 && !cpu ? { variant: 'fp16', gb: 1.3, where: 'the graphics card' } : { variant: 'q8', gb: 0.9, where: 'the processor' };
}

export async function createListener({ engine = 'auto', onStatus = () => {}, ask = null, cpu = false, lang = null } = {}) {
  let pick = engine === 'auto' ? await chooseEngine() : { engine, why: 'asked for' };
  if (pick.engine === 'bark') {
    const plan = await barkPlan({ cpu });
    if (ask && !(await ask(plan))) pick = SR() ? { engine: 'browser', why: 'Bark\'s download declined: the browser\'s recognition' } : { engine: null, why: 'Bark\'s download declined' };
  }
  if (!pick.engine) throw new Error(pick.why);
  note('hear', `${pick.engine}: ${pick.why}`);
  return pick.engine === 'browser' ? browserListener(pick, lang) : barkListener(pick, { onStatus, cpu });
}

// ---- Bark
async function barkListener(pick, { onStatus, cpu }) {
  const plan = await barkPlan({ cpu });
  const w = createWorker(new URL('./bark-worker.js', import.meta.url));
  const wait = new Map(); let id = 0;
  await new Promise((resolve, reject) => {
    w.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') onStatus(`${m.note || 'loading'} ${Math.round(m.fraction * 100)}%`);
      else if (m.type === 'ready') resolve();
      else if (m.type === 'text') { wait.get(m.id)?.resolve(m.text); wait.delete(m.id); }
      else if (m.type === 'error') { if (m.id != null) { wait.get(m.id)?.reject(new Error(m.message)); wait.delete(m.id); } else reject(new Error(m.message)); }
    };
    w.onerror = e => reject(new Error(e.message || 'speech worker failed'));
    w.postMessage({ type: 'load', urls: sources(BARK, mirrorAllowed()), variant: plan.variant });
  });
  onStatus(`Underdog Bark ready on ${plan.where}`);
  const transcribe = pcm => new Promise((resolve, reject) => { const n = ++id; wait.set(n, { resolve, reject }); const a = Float32Array.from(pcm); w.postMessage({ type: 'transcribe', id: n, audio: a }, [a.buffer]); });
  const rec = recorder();
  return { engine: 'bark', why: pick.why + ` (${plan.where})`, transcribe,
    start: () => rec.start(),
    async stop() { const blob = await rec.stop(); if (!blob) return ''; const pcm = await toPcm16k(blob); return level(pcm).voiced < .02 ? '' : transcribe(pcm); },
    cancel: () => rec.stop(), unload() { rec.stop(); w.terminate(); } };
}

// ---- the browser's recognition
function browserListener(pick, lang) {
  const R = SR(); if (!R) throw new Error('no SpeechRecognition in this browser');
  lang ||= navigator.language || 'en-US';
  let recog = null, latest = '', ended = null;
  return { engine: 'browser', why: pick.why,
    async start() {
      let local = false;
      try { const o = { langs: [lang], processLocally: true }, a = await R.available?.(o); if (a === 'available') local = true; else if (a === 'downloadable' || a === 'downloading') local = !!(await R.install(o)); } catch {}
      recog = new R(); recog.lang = lang; recog.interimResults = true; recog.continuous = true; if (local) recog.processLocally = true;
      latest = ''; ended = new Promise(r => { recog.onend = () => r(latest); });
      recog.onresult = e => { latest = [...e.results].map(x => x[0].transcript).join(' '); };
      recog.start();
      return { local };
    },
    async stop() { if (!recog) return ''; recog.stop(); const t = await ended; recog = null; return t.trim(); },
    cancel() { recog?.abort(); recog = null; },
    transcribe() { throw new Error('the browser\'s recognition listens itself: use start() and stop()'); },
    unload() { recog?.abort(); } };
}

// ---- helpers: the microphone, 16 kHz mono, loudness
export function recorder() {
  let rec = null, chunks = [], stream = null;
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start();
    },
    stop() {
      if (!rec) return Promise.resolve(null);
      return new Promise(res => { const r = rec; rec = null; r.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: r.mimeType })); }; r.stop(); });
    },
  };
}
export async function toPcm16k(blob) {
  const ctx = new AudioContext(), buf = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close();
  const rate = 16000, off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}
// peak, seconds, and the share of 20 ms frames louder than -40 dBFS (a silent
// clip is better not transcribed: recognisers hear "Thank you" in silence)
export function level(pcm) {
  let peak = 0, voiced = 0, frames = 0;
  for (let i = 0; i + 320 <= pcm.length; i += 320) {
    let e = 0; for (let j = i; j < i + 320; j++) { const v = pcm[j]; e += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
    frames++; if (Math.sqrt(e / 320) > .01) voiced++;
  }
  return { peak, seconds: pcm.length / 16000, voiced: frames ? voiced / frames : 0 };
}
