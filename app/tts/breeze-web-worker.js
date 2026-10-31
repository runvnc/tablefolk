// Breeze TTS 2 in the browser: Breeze-TTS-2.cpp (HoppouAI, Apache-2.0)
// compiled to WebAssembly with ggml's WebGPU backend (tools/breeze-web/), as
// a speech worker for pocket-tts-manager.js (the same messages as
// pocket18-worker.js):
//   in:  load, set_audio_port, encode_voice {voiceId, audio, text, cacheKey},
//        generate {text, voice, instruction}, stop, delete_voice
//   out: status, runtime_info, bundle_loaded, loaded, voice_encoded,
//        generation_started, audio_chunk_meta, generation_metrics,
//        stream_ended, error
//
// The model (BreezeBlue's Breeze TTS 2, research and non-commercial licence;
// HoppouAI's q4_k-dd2 GGUF, 2.46 GB) comes once from the R2 mirror
// (breeze-tts-2/: 64 MiB parts, four at a time over the four hostnames,
// each written at its offset) into this origin's private file system (OPFS),
// then is mounted read-only (WORKERFS): the loader reads it tensor by tensor
// onto the GPU, never all of it into WebAssembly memory.
// A library voice is encoded once from its sample and transcript; the codes
// are kept in IndexedDB.
const BASES = ['https://geebr-models.mindroot.io', 'https://geebr-models-2.mindroot.io', 'https://geebr-models-3.mindroot.io', 'https://geebr-models-4.mindroot.io'];
const MODEL = 'breeze-tts-2-q4_k-dd2.gguf', DIR = 'tablefolk-breeze';
let M = null, port = null, stopPtr = 0, loading = null;
// views of the module's memory made fresh each time (they go stale when it grows)
const f32 = () => new Float32Array(M.wasmMemory.buffer), i32 = () => new Int32Array(M.wasmMemory.buffer);
const voices = new Map();   // voiceId -> { codes: Int32Array, frames, text }
const status = (text, state = 'loading') => postMessage({ type: 'status', status: text, state });

async function opfsModel(onProgress) {
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(DIR, { create: true });
  const man = await (await fetch(`${BASES[0]}/breeze-tts-2/${MODEL}.parts.json`)).json();
  const fh = await dir.getFileHandle(MODEL, { create: true });
  let file = await fh.getFile();
  if (file.size === man.size && (await dir.getFileHandle(MODEL + '.ok').then(() => true, () => false))) return file;
  try { await dir.removeEntry(MODEL + '.ok'); } catch {}
  const h = await fh.createSyncAccessHandle();
  try {
    h.truncate(man.size);
    let done = 0, next = 0;
    const one = async (i) => {
      for (let t = 0; ; t++) {
        try {
          const r = await fetch(`${BASES[i % 4]}/breeze-tts-2/${man.parts[i]}`);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = new Uint8Array(await r.arrayBuffer());
          h.write(buf, { at: i * man.partSize }); done += buf.length; onProgress(done, man.size); return;
        } catch (e) { if (t >= 3) throw new Error(`model part ${i}: ${e.message}`); await new Promise(r => setTimeout(r, 1500 * (t + 1))); }
      }
    };
    await Promise.all([0, 1, 2, 3].map(async () => { while (next < man.parts.length) await one(next++); }));
    h.flush();
  } finally { h.close(); }
  await dir.getFileHandle(MODEL + '.ok', { create: true });
  return fh.getFile();
}

// voice codes kept between visits
const db = () => new Promise((res, rej) => { const q = indexedDB.open('tablefolk-breeze-voices', 1); q.onupgradeneeded = () => q.result.createObjectStore('codes'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function cacheGet(key) { try { const d = await db(); return await new Promise(r => { const q = d.transaction('codes').objectStore('codes').get(key); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch { return null; } }
async function cachePut(key, v) { try { const d = await db(); d.transaction('codes', 'readwrite').objectStore('codes').put(v, key); } catch {} }

async function load(opts = {}) {
  if (M) return;
  status('Breeze TTS 2: checking the model…');
  const t0 = performance.now();
  const file = await opfsModel((n, total) => status(`Downloading Breeze TTS 2 ${Math.floor(100 * n / total)}% (${(n / 2 ** 30).toFixed(2)} / ${(total / 2 ** 30).toFixed(2)} GB, once)`));
  status('Breeze TTS 2: loading onto the GPU…');
  const create = (await import('./breeze-web/breeze.mjs?v=20261030g')).default;
  M = await create({ print: s => console.log('[breeze]', s), printErr: s => console.warn('[breeze]', s) });
  M.FS.mkdir('/m'); M.FS.mount(M.WORKERFS || M.FS.filesystems.WORKERFS, { files: [file] }, '/m');
  const rc = await M.ccall('tf_init', 'number', ['string'], ['/m/' + MODEL], { async: true });
  if (rc !== 0) { const err = M.UTF8ToString(M._tf_error()); M = null; throw new Error('Breeze TTS 2 failed to load: ' + err); }
  stopPtr = M._tf_stop_flag();
  M.onAudio = pcm => onAudio(pcm);
  const backend = M.UTF8ToString(M._tf_backend());
  console.info('[breeze] devices:', M.UTF8ToString(M._tf_devices()), '| using', backend);
  // ggml's WebGPU backend needs the shader-f16 feature (missing in Chrome on
  // Linux with NVIDIA's Vulkan driver); on the CPU a line takes minutes
  if (!/webgpu/i.test(backend) && !opts.allowCpu) { M = null; throw new Error('Breeze TTS 2 needs a graphics card with WebGPU shader-f16 support in this browser; this one runs it only on the CPU (far too slow)'); }
  postMessage({ type: 'runtime_info', data: { backend: 'Breeze TTS 2 in this browser (' + backend + ')' } });
  postMessage({ type: 'bundle_loaded', sampleRate: M._tf_sample_rate() || 24000 });
  postMessage({ type: 'loaded', loadMs: Math.round(performance.now() - t0) });
  status('Breeze TTS 2 ready (' + backend + ')', 'ready');
}

async function encode({ voiceId, audio, text, cacheKey }) {
  if (!text) { voices.set(voiceId, null); return; }   // no transcript: it can only design a voice
  let v = cacheKey && await cacheGet(cacheKey);
  if (!v) {
    const a = audio instanceof Float32Array ? audio : Float32Array.from(audio || []);
    const p = M._malloc(a.length * 4); f32().set(a, p >>> 2);
    const frames = await M.ccall('tf_encode', 'number', ['number', 'number'], [p, a.length], { async: true });
    M._free(p);
    if (frames < 0) throw new Error('voice encode: ' + M.UTF8ToString(M._tf_error()));
    const n = M._tf_codes_len(), ptr = M._tf_codes();
    v = { codes: i32().slice(ptr >>> 2, (ptr >>> 2) + n), frames, text };
    if (cacheKey) cachePut(cacheKey, v);
  }
  voices.set(voiceId, v);
}

let gen = null;
function onAudio(pcm) {
  if (!gen) return;
  if (gen.first == null) gen.first = performance.now() - gen.t0;
  gen.samples += pcm.length;
  const metrics = { chunkRtfx: gen.samples / 24000 / ((performance.now() - gen.t0) / 1000) };
  if (port) { port.postMessage({ type: 'audio', data: pcm }, [pcm.buffer]); postMessage({ type: 'audio_chunk_meta', metrics }); }
  else postMessage({ type: 'audio_chunk', data: pcm.buffer, metrics }, [pcm.buffer]);
}

async function generate({ text, voice, instruction }) {
  if (!String(text || '').trim()) { postMessage({ type: 'stream_ended' }); return; }
  const v = voices.get(String(voice).replace(/^custom:/, '')) || null;
  gen = { t0: performance.now(), samples: 0, first: null };
  port?.postMessage({ type: 'reset' });
  postMessage({ type: 'generation_started', data: { time: gen.t0, sourceSampleRate: 24000 } });
  let cp = 0;
  if (v) { cp = M._malloc(v.codes.length * 4); i32().set(v.codes, cp >>> 2); }
  i32()[stopPtr >>> 2] = 0;
  const rc = await M.ccall('tf_generate', 'number',
    ['string', 'string', 'string', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [String(text), v ? '' : (instruction || 'A warm, natural speaking voice. Speak clearly and naturally.'), v ? v.text : '', cp, v ? v.codes.length : 0, v ? v.frames : 0, 7, 1, 4, 25],
    { async: true });
  if (cp) M._free(cp);
  const g = gen; gen = null;
  if (rc === 1) throw new Error('Breeze: ' + M.UTF8ToString(M._tf_error()));
  const secs = (performance.now() - g.t0) / 1000;
  postMessage({ type: 'generation_metrics', metrics: { rtfx: g.samples / 24000 / secs, genTime: secs, totalTime: secs, audioDuration: g.samples / 24000, firstAudioMs: g.first } });
  if (rc === 0) { port?.postMessage({ type: 'stream-ended' }); postMessage({ type: 'stream_ended' }); }
}

// one job at a time (the model has one cache); stop goes straight through
let chain = Promise.resolve();
self.onmessage = e => {
  const { type, data = {} } = e.data || {};
  if (type === 'set_audio_port') { port = e.ports?.[0] || null; return; }
  if (type === 'stop') { if (M && stopPtr) i32()[stopPtr >>> 2] = 1; return; }
  if (type === 'delete_voice') { voices.delete(data.voiceId); return; }
  if (type === 'set_language') { postMessage({ type: 'voices_loaded', voices: [], language: 'english' }); return; }
  chain = chain.then(async () => {
    try {
      if (type === 'load') return await (loading ||= load(data).catch(err => { loading = null; throw err; }));
      if (type === 'encode_voice' || type === 'load_voice_state' || type === 'load_voice_bin') { if (type === 'encode_voice') await encode(data); postMessage({ type: 'voice_encoded', voiceId: data.voiceId }); return; }
      if (type === 'generate') return await generate(data);
    } catch (err) { console.error('[breeze]', err?.stack || err); postMessage({ type: 'error', error: String(err?.message || err) }); }
  });
};
