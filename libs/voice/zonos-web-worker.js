// ZONOS3-Mini in the browser (Zyphra, Apache-2.0 weights; its WebGPU engine is
// MIT): a speech worker for pocket-tts-manager.js and createVoice (the same
// messages as breeze-web-worker.js):
//   in:  load {language, mirror, base}, set_audio_port, generate {text, voice, language}, stop,
//        encode_voice {voiceId, audio (24 kHz), cacheKey},
//        voice_embedding {voiceId, embedding (192 floats)}, get_embedding {voiceId},
//        set_language {language: a ZONOS_LANGUAGES code or 'auto'}, delete_voice, warmup
//   out: status, runtime_info, bundle_loaded, voices_loaded, loaded,
//        voice_encoded, generation_started, audio_chunk(_meta),
//        generation_metrics, stream_ended, embedding, warmed, error
//
// Zyphra's engine (zonos-web/: servers/web of github.com/Zyphra/ZONOS3-Mini,
// built with vite; engine-worker.js + codec-worker.js) runs here as two nested
// workers and serves its HTTP API (/v2/generate...) over messages. The weights
// are its web export, pinned to one revision of Zyphra/ZONOS3-Mini on Hugging
// Face (web/): the backbone (Q4_0 experts, Q8_0 mixer, ~0.74 GB) and the fast
// keep2_plain decoder (~0.25 GB), kept in Cache Storage by the engine. Cloning
// from a sample uses the 45 MB speaker encoder (a 192-number voice embedding);
// the 2.8 GB reference encoder is never loaded.
//
// It speaks at 44.1 kHz; this worker resamples to 24 kHz (the page's audio
// graph runs at 24 kHz for every engine) with a windowed-sinc filter.
import { MIRROR, firstReachable } from '../models/index.js';
const REV = 'd2d142a86b1e6aeb4252679673c86ecd86177bf8';
const HF_BASE = `https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/${REV}/web/`;
// Tablefolk's R2 mirror of what this worker uses of that folder (the backbone, the keep2_plain
// decoder, the speaker encoder, companions, LACI heads, the voices' codes and embeddings; not the
// reference encoder, the aligner, speech editing or the full_mr decoder, which the engine then
// leaves out), byte for byte (SHA-256 checked). Pages where @tablefolk/models allows the mirror.
const MIRROR_BASE = `${MIRROR}zonos3-mini/${REV.slice(0, 7)}/web/`;
const OUT_RATE = 24000, IN_RATE = 44100;
// the built-in voices by name (gguf/voices/README.md); the page's Pocket-TTS
// names map onto them so a world written for Pocket keeps its men and women
export const ZONOS_VOICES = {
  cillian: 'default_2c5123a959875341', imogen: 'default_b78b28baf5c31a1d', jett: 'default_c95cf57259ed7313',
  morgana: 'default_40a3ba1017bfb68a', rupert: 'default_3765f0d1140c05c0', sakura: 'default_c5e098c322aae901',
  savannah: 'default_de4d191ca7574982', thaddeus: 'default_3c00e421e684f949', willow: 'default_940eaff39a929da0',
  wyatt: 'default_34370fd91e3484ef',
};
const FROM_POCKET = { alba: 'savannah', azelma: 'imogen', cosette: 'sakura', eponine: 'willow', fantine: 'morgana', javert: 'rupert', jean: 'wyatt', marius: 'cillian' };

let LACI = true, laciLanguages = new Set();   // set_options {laci} turns it off (tests)
let engine = null, codec = null, port = null, loading = null, nextId = 1, base = HF_BASE, language = 'auto';
const pending = new Map();   // request id -> { res(head), chunk(bytes), end() }
const voices = new Map();    // voiceId -> Float32Array embedding (cloned voices)
const SESSION = 'tablefolk';
const status = (text, state = 'loading') => postMessage({ type: 'status', status: text, state });

// ---- the engine's API over messages (what its client.ts does on a page)
function request(method, path, json = null, pcm = null) {
  const id = nextId++;
  const body = json ? new TextEncoder().encode(JSON.stringify(json)).buffer : null;
  const head = Promise.withResolvers(), chunks = [], waiters = [];
  let done = false;
  const wake = () => { while (waiters.length) waiters.shift()(); };
  pending.set(id, { res: h => head.resolve(h), chunk: b => { chunks.push(new Uint8Array(b)); wake(); }, end: () => { done = true; pending.delete(id); wake(); } });
  const transfer = []; if (body) transfer.push(body); if (pcm) transfer.push(pcm.buffer);
  engine.postMessage({ type: 'req', id, method, path, headers: { 'content-type': 'application/json', 'x-tts-session-id': SESSION }, body, pcm: pcm || undefined, pcmSeconds: pcm ? pcm.length / IN_RATE : undefined }, transfer);
  return {
    id, head: head.promise,
    async *body() { for (;;) { if (chunks.length) { yield chunks.shift(); continue; } if (done) return; await new Promise(r => waiters.push(r)); } },
    async json() { const parts = []; for await (const c of this.body()) parts.push(c); const t = new TextDecoder().decode(await new Blob(parts).arrayBuffer()); return t ? JSON.parse(t) : null; },
  };
}
async function call(method, path, json, pcm) {
  const r = request(method, path, json, pcm), h = await r.head, out = await r.json();
  if (h.status >= 400) throw new Error(`ZONOS3-Mini ${path}: ${out?.detail ? (typeof out.detail === 'string' ? out.detail : JSON.stringify(out.detail)) : h.status}`);
  return out;
}

async function load(opts = {}) {
  if (engine) return;
  if (opts.base) base = opts.base;
  else if (opts.mirror !== false) base = await firstReachable([MIRROR_BASE + 'backbone/manifest.json', HF_BASE + 'backbone/manifest.json']).then(u => u.replace(/backbone\/manifest\.json$/, ''));
  if (ZONOS_LANGUAGES[opts.language] || opts.language === 'auto') language = opts.language;
  if (!navigator.gpu) throw new Error('ZONOS3-Mini needs WebGPU, and this browser\'s workers have none');
  status('ZONOS3-Mini: checking the model…');
  const t0 = performance.now();
  engine = new Worker(new URL('./zonos-web/engine-worker.js', import.meta.url), { type: 'module' });
  codec = new Worker(new URL('./zonos-web/codec-worker.js', import.meta.url), { type: 'module' });
  const ready = Promise.withResolvers();
  let lastPct = -1;
  engine.onmessage = e => {
    const m = e.data || {};
    if (m.type === 'progress') {
      if (!m.total) return;
      const pct = Math.floor(100 * m.loaded / m.total); if (pct === lastPct) return; lastPct = pct;
      const what = m.models?.includes('spk') ? 'its voice encoder' : 'ZONOS3-Mini';
      status(m.fetched > 0 ? `Downloading ${what} ${pct}% (${(m.loaded / 2 ** 30).toFixed(2)} / ${(m.total / 2 ** 30).toFixed(2)} GB, once)` : `ZONOS3-Mini: loading ${pct}%`);
    } else if (m.type === 'ready') ready.resolve();
    else if (m.type === 'fatal') { ready.reject(new Error(m.message)); postMessage({ type: 'error', error: 'ZONOS3-Mini: ' + m.message }); }
    else if (m.type === 'res') pending.get(m.id)?.res(m);
    else if (m.type === 'chunk') pending.get(m.id)?.chunk(m.data);
    else if (m.type === 'end') pending.get(m.id)?.end();
  };
  engine.onerror = e => ready.reject(new Error(e.message || 'the ZONOS3-Mini worker failed to start'));
  codec.onerror = e => ready.reject(new Error('the ZONOS3-Mini codec worker failed: ' + (e.message || 'did not start')));
  const ch = new MessageChannel();
  codec.postMessage({ type: 'port' }, [ch.port2]);
  // voicesPcm: the built-in voices' clips, only for previews (they carry their codes and embeddings)
  engine.postMessage({ type: 'init', base, cache: true, voicesPcm: {}, codecPort: ch.port1 }, [ch.port1]);
  try { await ready.promise; } catch (e) { try { engine.terminate(); codec.terminate(); } catch {} engine = codec = null; throw e; }
  const caps = await call('GET', '/v2/capabilities').catch(() => null);
  // the languages with alignment heads (laci/index.json): laci: true for another is a 400
  laciLanguages = new Set(Object.keys(await fetch(base + 'laci/index.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))));
  postMessage({ type: 'runtime_info', data: { backend: 'ZONOS3-Mini in this browser (WebGPU' + (caps?.decoder ? ', decoder ' + (caps.decoder.id || caps.decoder) : '') + ')' } });
  postMessage({ type: 'bundle_loaded', sampleRate: OUT_RATE });
  postMessage({ type: 'voices_loaded', voices: Object.keys(ZONOS_VOICES), defaultVoice: 'savannah' });
  postMessage({ type: 'loaded', loadMs: Math.round(performance.now() - t0) });
  status('ZONOS3-Mini ready (WebGPU)', 'ready');
}

// ---- voices of one's own: a 192-number embedding from the speaker encoder, kept in IndexedDB
const db = () => new Promise((res, rej) => { const q = indexedDB.open('tablefolk-zonos-voices', 1); q.onupgradeneeded = () => q.result.createObjectStore('emb'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function cacheGet(key) { try { const d = await db(); return await new Promise(r => { const q = d.transaction('emb').objectStore('emb').get(key); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch { return null; } }
async function cachePut(key, v) { try { const d = await db(); d.transaction('emb', 'readwrite').objectStore('emb').put(v, key); } catch {} }

async function encode({ voiceId, audio, cacheKey }) {
  let emb = cacheKey && await cacheGet('v1:' + cacheKey);
  if (!emb) {
    const a = audio instanceof Float32Array ? audio : Float32Array.from(audio || []);
    if (a.length < OUT_RATE / 2) throw new Error('ZONOS3-Mini: the voice sample is too short');
    const pcm = resampleWhole(a, OUT_RATE, IN_RATE);
    const spk = await call('POST', '/v2/speakers', { speaker_audio_base64: 'AA==', speaker_audio_name: voiceId + '.wav', label: voiceId }, pcm);
    emb = Float32Array.from((await call('GET', `/v2/speakers/${spk.id}/embedding`)).embedding);
    if (cacheKey) cachePut('v1:' + cacheKey, emb);
  }
  voices.set(voiceId, emb);
}

// a float32 [n] .npy (the API's speaker_embedding_base64)
function npyB64(v) {
  let h = `{'descr': '<f4', 'fortran_order': False, 'shape': (${v.length},), }`;
  const pad = 64 - ((10 + h.length + 1) % 64); h += ' '.repeat(pad % 64) + '\n';
  const out = new Uint8Array(10 + h.length + v.length * 4);
  out.set([0x93, 78, 85, 77, 80, 89, 1, 0, h.length & 255, h.length >> 8]); out.set(new TextEncoder().encode(h), 10);
  out.set(new Uint8Array(Float32Array.from(v).buffer), 10 + h.length);
  let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}

function speakerFields(voice) {
  const name = String(voice || '').replace(/^(custom|builtin|zonos):/, '');
  const emb = voices.get(name);
  if (emb) return { speaker_embedding_base64: npyB64(emb), speaker_embedding_name: name + '.npy', speaker_mode: 'embedding' };
  const k = name.toLowerCase(), id = ZONOS_VOICES[k] || ZONOS_VOICES[FROM_POCKET[k]] || ZONOS_VOICES.savannah;
  return { speaker_embedding_id: id };   // a built-in voice: its reference codes (the checkpoint's default mode)
}

// ---- 44.1 kHz -> 24 kHz, as the chunks come (windowed sinc, cutoff 11 kHz)
const TAPS = 24, FC = 11000 / IN_RATE, STEP = IN_RATE / OUT_RATE;
const kern = x => { if (x === 0) return 2 * FC; if (Math.abs(x) >= TAPS) return 0; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / TAPS); return Math.sin(2 * Math.PI * FC * x) / (Math.PI * x) * w; };
function resampler() {
  let buf = new Float32Array(0), off = 0, t = 0;   // buf[i] is input sample off+i; t: next output's input position
  const run = (flush) => {
    const end = off + buf.length - (flush ? 0 : TAPS), out = [];
    while (t < end) {
      const c = Math.floor(t); let s = 0;
      for (let j = c - TAPS + 1; j <= c + TAPS; j++) { const i = j - off; if (i >= 0 && i < buf.length) s += buf[i] * kern(t - j); }
      out.push(s); t += STEP;
    }
    const keep = Math.max(0, Math.floor(t) - TAPS - off); if (keep > 0) { buf = buf.slice(keep); off += keep; }
    return Float32Array.from(out);
  };
  return { push(x) { const b = new Float32Array(buf.length + x.length); b.set(buf); b.set(x, buf.length); buf = b; return run(false); }, flush() { return run(true); } };
}
function resampleWhole(a, from, to) {
  const n = Math.floor(a.length * to / from), o = new Float32Array(n), r = from / to, fc = Math.min(from, to) * 0.45 / from;
  for (let i = 0; i < n; i++) {
    const t = i * r, c = Math.floor(t); let s = 0;
    for (let j = c - TAPS + 1; j <= c + TAPS; j++) if (j >= 0 && j < a.length) { const x = t - j; s += a[j] * (x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x) * (0.5 + 0.5 * Math.cos(Math.PI * x / TAPS))); }
    o[i] = s;
  }
  return o;
}

let current = null;   // { id, stopped }
// 'auto': the script tells non-Latin languages apart; Latin text is English (a player who
// writes worlds in French or German picks the language in the Voice pane)
export const ZONOS_LANGUAGES = { en_us: 'English (US)', en_gb: 'English (UK)', fr_fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt_br: 'Portuguese (Brazil)', nl: 'Dutch', pl: 'Polish', cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', ru: 'Russian', uk: 'Ukrainian', el: 'Greek', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', tr: 'Turkish', ar: 'Arabic', he: 'Hebrew', ka: 'Georgian', cmn: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', th: 'Thai', tl: 'Tagalog', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', or: 'Odia', ur: 'Urdu' };
const SCRIPTS = [[/[\u3040-\u30ff]/, 'ja'], [/[\uac00-\ud7af\u1100-\u11ff]/, 'ko'], [/[\u4e00-\u9fff]/, 'cmn'], [/[\u0400-\u04ff]/, 'ru'], [/[\u0600-\u06ff]/, 'ar'], [/[\u0590-\u05ff]/, 'he'], [/[\u0370-\u03ff]/, 'el'], [/[\u10a0-\u10ff]/, 'ka'], [/[\u0e00-\u0e7f]/, 'th'], [/[\u0900-\u097f]/, 'hi'], [/[\u0980-\u09ff]/, 'bn'], [/[\u0b80-\u0bff]/, 'ta'], [/[\u0c00-\u0c7f]/, 'te'], [/[\u0a80-\u0aff]/, 'gu'], [/[\u0c80-\u0cff]/, 'kn'], [/[\u0d00-\u0d7f]/, 'ml'], [/[\u0a00-\u0a7f]/, 'pa'], [/[\u0b00-\u0b7f]/, 'or']];
function pickLanguage(text, want) {
  if (want && want !== 'auto' && ZONOS_LANGUAGES[want]) {
    // a non-Latin line under a Latin-script choice (a Russian character in an English world): its script wins
    if (!/^(ar|he|el|ka|cmn|ja|ko|th|hi|bn|ta|te|mr|gu|kn|ml|pa|or|ur|ru|uk|bg)$/.test(want)) for (const [re, l] of SCRIPTS) if (re.test(text)) return l;
    return want;
  }
  for (const [re, l] of SCRIPTS) if (re.test(text)) return l;
  return 'en_us';
}

async function generate({ text, voice, language: lang, silent = false }) {
  text = String(text || '').trim();
  if (!text) { if (!silent) postMessage({ type: 'stream_ended' }); return; }
  const t0 = performance.now();
  if (!silent) { port?.postMessage({ type: 'reset' }); postMessage({ type: 'generation_started', data: { time: t0, sourceSampleRate: OUT_RATE } }); }
  // laci: the alignment heads guard against skipped words and a take that never stops (seen
  // 2026-11-15: one sentence ran on for 132 s without it); max_tokens caps it anyway at 15
  // frames a second for the text read at 6 characters a second, plus 3 s
  const maxFrames = Math.ceil(15 * (text.length / 6 + 3));
  const L = pickLanguage(text, lang || language);
  const r = request('POST', '/v2/generate', { text, language: L, stream: true, format: 'pcm', laci: !!LACI && laciLanguages.has(L), max_tokens: maxFrames, ...speakerFields(voice) });
  const me = current = { id: r.id, stopped: false };
  const h = await r.head;
  if (h.status >= 400) { const e = await r.json().catch(() => null); current = null; throw new Error('ZONOS3-Mini: ' + (typeof e?.detail === 'string' ? e.detail : JSON.stringify(e?.detail || h.status))); }
  const rs = resampler(); let rest = new Uint8Array(0), samples = 0, first = null, loud = 0, heard = 0;
  const send = pcm => {
    if (!pcm.length || silent || me.stopped) return;
    if (first == null) first = performance.now() - t0;
    samples += pcm.length;
    const metrics = { chunkRtfx: samples / OUT_RATE / ((performance.now() - t0) / 1000) };
    if (port) { port.postMessage({ type: 'audio', data: pcm }, [pcm.buffer]); postMessage({ type: 'audio_chunk_meta', metrics }); }
    else postMessage({ type: 'audio_chunk', data: pcm.buffer, metrics }, [pcm.buffer]);
  };
  for await (const c of r.body()) {
    if (me.stopped) continue;   // drain what is already on its way
    const all = new Uint8Array(rest.length + c.length); all.set(rest); all.set(c, rest.length);
    const n = all.length >> 2 << 2; rest = all.slice(n);
    const pcm = new Float32Array(all.slice(0, n).buffer);
    // a graphics card out of memory: the engine's buffers fail to allocate (it only logs that),
    // and it makes silence that never ends. 3 s of nothing at the start: give up on it
    if (heard < 3 * IN_RATE) { for (const x of pcm) loud = Math.max(loud, Math.abs(x)); heard += pcm.length;
      if (heard >= 3 * IN_RATE && loud < 1e-4) { me.stopped = true; engine.postMessage({ type: 'abort', id: r.id }); if (current === me) current = null;
        postMessage({ type: 'error', fatal: true, error: 'ZONOS3-Mini made only silence: the graphics card is probably out of memory' }); return; } }
    send(rs.push(pcm));
  }
  if (!me.stopped) send(rs.flush());
  if (current === me) current = null;
  if (silent || me.stopped) return;
  const secs = (performance.now() - t0) / 1000, after = Math.max(.001, secs - (first || 0) / 1000);
  postMessage({ type: 'generation_metrics', metrics: { rtfx: samples / OUT_RATE / after, overallRtfx: samples / OUT_RATE / secs, genTime: secs, totalTime: secs, audioDuration: samples / OUT_RATE, firstAudioMs: first } });
  port?.postMessage({ type: 'stream-ended' }); postMessage({ type: 'stream_ended' });
}

// one job at a time; stop goes straight through
let chain = Promise.resolve();
self.onmessage = e => {
  const { type, data = {} } = e.data || {};
  if (type === 'set_audio_port') { port = e.ports?.[0] || null; return; }
  if (type === 'stop') { if (current) { current.stopped = true; engine?.postMessage({ type: 'abort', id: current.id }); } return; }
  if (type === 'set_options') { if ('laci' in data) LACI = !!data.laci; return; }
  if (type === 'delete_voice') { voices.delete(data.voiceId); return; }
  if (type === 'set_language') { language = ZONOS_LANGUAGES[data.language] ? data.language : 'auto'; postMessage({ type: 'voices_loaded', voices: Object.keys(ZONOS_VOICES), language }); return; }
  chain = chain.then(async () => {
    try {
      if (type === 'load') return await (loading ||= load(data).catch(err => { loading = null; throw err; }));
      if (type === 'encode_voice') { await encode(data); postMessage({ type: 'voice_encoded', voiceId: data.voiceId }); return; }
      if (type === 'voice_embedding') { voices.set(data.voiceId, Float32Array.from(data.embedding)); postMessage({ type: 'voice_encoded', voiceId: data.voiceId }); return; }
      if (type === 'get_embedding') { const v = voices.get(data.voiceId); postMessage({ type: 'embedding', voiceId: data.voiceId, embedding: v ? Array.from(v, x => Math.round(x * 1e6) / 1e6) : null }); return; }
      if (type === 'generate') return await generate(data);
      if (type === 'warmup') { postMessage({ type: 'warmed' }); return; }   // the engine warms itself up before 'ready'
    } catch (err) { console.error('[zonos]', err?.stack || err); postMessage({ type: 'error', error: String(err?.message || err) }); }
  });
};
