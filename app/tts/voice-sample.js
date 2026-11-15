/* voice-sample.js -- voices a world carries (scenario "voices") and voices of
 * one's own kept in this browser ("my voices"), shared by the world builder
 * (app/builder.js) and the game (app/tts/pocket-tts-manager.js).
 *
 * A voice: { id, name, gender, description, sample, text?, zonos?, v }
 *   sample  a short clip (up to 12 s), Ogg Opus at 24 kbit/s as a data URL
 *           (~35 KB for 12 s; WebCodecs' AudioEncoder; without it 8-bit WAV
 *           at 16 kHz, ~4x bigger). Pocket-TTS and Breeze clone from it.
 *   text    what is said in it (Breeze clones from a sample and its words)
 *   zonos   ZONOS3-Mini's speaker embedding: 192 float32, base64 (1 KB);
 *           made here when ZONOS3-Mini is downloaded, else by the game from
 *           the sample the first time the voice speaks
 *   v       a hash of the sample (cached clones are keyed by it)
 * In a scenario a character names one as "ttsVoiceId": "pack:<id>", like a
 * library voice (assets/voices/); the world's own voice wins over a library
 * voice of the same id.
 *
 *   window.tablefolkVoiceSample = { prepare, decode, embedding, say, zonosReady,
 *     myVoices: { list, put, remove, fromVoicePane }, b64ToFloats, floatsToB64, hash }
 */
(function () {
  const RATE = 24000, MAX_SEC = 12;

  // ---- small helpers
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const bytesToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const floatsToB64 = a => bytesToB64(new Uint8Array(Float32Array.from(a).buffer));
  const b64ToFloats = b => { if (Array.isArray(b)) return Float32Array.from(b); const u = b64ToBytes(String(b)); return new Float32Array(u.buffer, 0, u.length >> 2).slice(); };

  async function toMono24(buf) {
    // the browser's own resampler (a filtered one), then mono
    const len = Math.max(1, Math.ceil(buf.duration * RATE)), off = new OfflineAudioContext(1, len, RATE), src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  }
  async function decodeBytes(ab) {
    const ctx = new OfflineAudioContext(1, 1, RATE);
    try { return await toMono24(await ctx.decodeAudioData(ab.slice(0))); }
    catch (e) { const u = new Uint8Array(ab); if (u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && 'AudioDecoder' in self) return decodeOggOpus(u); throw e; }
  }
  // trim silence at both ends, keep up to MAX_SEC, level to a peak of 0.9
  function tidy(a) {
    let s = 0, e = a.length; const th = .01;
    while (s < e && Math.abs(a[s]) < th) s++; while (e > s && Math.abs(a[e - 1]) < th) e--;
    s = Math.max(0, s - RATE / 10); e = Math.min(a.length, e + RATE / 10);
    let out = a.slice(s, Math.min(e, s + MAX_SEC * RATE)), peak = 0;
    for (const x of out) peak = Math.max(peak, Math.abs(x));
    if (peak > .001) { const k = Math.min(4, .9 / peak); for (let i = 0; i < out.length; i++) out[i] *= k; }
    return out;
  }

  // ---- Ogg Opus (RFC 7845) written by hand around WebCodecs' raw Opus packets
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
  function oggPage(packets, granule, serial, seq, flags) {
    const lace = []; for (const p of packets) { let n = p.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n); }
    const body = packets.reduce((n, p) => n + p.length, 0), page = new Uint8Array(27 + lace.length + body), dv = new DataView(page.buffer);
    page.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
    dv.setUint32(6, granule % 0x100000000, true); dv.setUint32(10, Math.floor(granule / 0x100000000), true);
    dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); page[26] = lace.length; page.set(lace, 27);
    let o = 27 + lace.length; for (const p of packets) { page.set(p, o); o += p.length; }
    let c = 0; for (const b of page) c = ((c << 8) ^ CRC[((c >>> 24) ^ b) & 255]) >>> 0; dv.setUint32(22, c, true);
    return page;
  }
  async function encodeOggOpus(a) {
    const packets = []; let preSkip = 312, err = null;
    const enc = new AudioEncoder({ output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description; if (d) { const u = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer || d); if (u.length >= 12 && String.fromCharCode(...u.subarray(0, 8)) === 'OpusHead') preSkip = u[10] | (u[11] << 8); }
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push({ b, dur: chunk.duration });
    }, error: e => { err = e; } });
    const cfg = { codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: 24000 };
    if (!(await AudioEncoder.isConfigSupported(cfg)).supported) throw new Error('no Opus encoder');
    enc.configure(cfg);
    for (let i = 0; i < a.length; i += RATE) { const part = a.slice(i, i + RATE); enc.encode(new AudioData({ format: 'f32', sampleRate: RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round(i / RATE * 1e6), data: part })); }
    await enc.flush(); enc.close(); if (err) throw err; if (!packets.length) throw new Error('nothing encoded');
    const serial = (Math.random() * 0xffffffff) >>> 0, head = new Uint8Array(19), hv = new DataView(head.buffer);
    head.set(new TextEncoder().encode('OpusHead')); head[8] = 1; head[9] = 1; hv.setUint16(10, preSkip, true); hv.setUint32(12, RATE, true);
    const vendor = new TextEncoder().encode('tablefolk'), tags = new Uint8Array(16 + vendor.length), tv = new DataView(tags.buffer);
    tags.set(new TextEncoder().encode('OpusTags')); tv.setUint32(8, vendor.length, true); tags.set(vendor, 12);
    const pages = [oggPage([head], 0, serial, 0, 2), oggPage([tags], 0, serial, 1, 0)];
    const total = preSkip + Math.round(a.length * 48000 / RATE); let g = preSkip, group = [], seq = 2;
    packets.forEach((p, i) => {
      group.push(p.b); g += Math.round((p.dur || 20000) * 48 / 1000);
      const last = i === packets.length - 1;
      if (group.length >= 50 || last) { pages.push(oggPage(group, last ? total : Math.min(g, total), serial, seq++, last ? 4 : 0)); group = []; }
    });
    const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of pages) { out.set(p, o); o += p.length; }
    return out;
  }
  // a browser whose decodeAudioData does not read Ogg: the packets through WebCodecs
  async function decodeOggOpus(u) {
    const packets = []; let head = null, partial = [];
    for (let o = 0; o + 27 <= u.length;) {
      const n = u[o + 26], lace = u.subarray(o + 27, o + 27 + n); let p = o + 27 + n;
      for (const l of lace) { partial.push(u.subarray(p, p + l)); p += l; if (l < 255) { const len = partial.reduce((s, x) => s + x.length, 0), pk = new Uint8Array(len); let q = 0; for (const x of partial) { pk.set(x, q); q += x.length; } partial = []; if (!head) head = pk; else if (!(pk[0] === 0x4f && pk[1] === 0x70 && pk[4] === 0x54)) packets.push(pk); } }
      o = p;
    }
    const pre = head ? head[10] | (head[11] << 8) : 0, parts = []; let err = null;
    const dec = new AudioDecoder({ output: d => { const f = new Float32Array(d.numberOfFrames); d.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); parts.push({ f, rate: d.sampleRate }); d.close(); }, error: e => { err = e; } });
    dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, description: head });
    let t = 0; for (const pk of packets) { dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: t, data: pk })); t += 20000; }
    await dec.flush(); dec.close(); if (err) throw err;
    const rate = parts[0]?.rate || 48000, all = new Float32Array(parts.reduce((n, p) => n + p.f.length, 0)); let o = 0; for (const p of parts) { all.set(p.f, o); o += p.f.length; }
    const cut = all.subarray(Math.round(pre * rate / 48000)), buf = new AudioBuffer({ length: Math.max(1, cut.length), sampleRate: rate, numberOfChannels: 1 });
    buf.copyToChannel(cut, 0); return toMono24(buf);
  }
  function wav8(a, rate = 16000) {
    const n = Math.round(a.length * rate / RATE), out = new Uint8Array(44 + n), dv = new DataView(out.buffer);
    out.set(new TextEncoder().encode('RIFF')); dv.setUint32(4, 36 + n, true); out.set(new TextEncoder().encode('WAVEfmt '), 8);
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    out.set(new TextEncoder().encode('data'), 36); dv.setUint32(40, n, true);
    for (let i = 0; i < n; i++) out[44 + i] = Math.max(0, Math.min(255, Math.round(a[Math.floor(i * RATE / rate)] * 127 + 128)));
    return out;
  }

  // a file or a recording -> { audio (24 kHz mono), seconds, sample (data URL), v }
  async function prepare(fileOrBlob) {
    const audio = tidy(await decodeBytes(await fileOrBlob.arrayBuffer()));
    if (audio.length < RATE * 2) throw new Error('the sample is too short: 3 to 12 seconds of one person speaking works best');
    let bytes, type;
    try { if (!('AudioEncoder' in self)) throw new Error('no AudioEncoder'); bytes = await encodeOggOpus(audio); type = 'audio/ogg'; }
    catch (e) { console.warn('[voice] Opus encoding failed, keeping 8-bit WAV:', e.message); bytes = wav8(audio); type = 'audio/wav'; }
    const sample = `data:${type};base64,` + bytesToB64(bytes);
    return { audio, seconds: audio.length / RATE, sample, v: hash(sample) };
  }
  // a sample URL (data:, a library file) -> 24 kHz mono
  async function decode(url) { const r = await fetch(url); if (!r.ok) throw new Error('voice sample ' + r.status); return decodeBytes(await r.arrayBuffer()); }

  // ---- ZONOS3-Mini on this page (the builder): only when the game has downloaded it already
  const zonosReady = () => { try { return !!navigator.gpu && localStorage.getItem('tablefolkZonosWebReady') === '1'; } catch { return false; } };
  let zw = null, zLoad = null; const zWait = new Map();
  function zonos() {
    if (zLoad) return zLoad;
    zw = new Worker('/libs/voice/zonos-web-worker.js', { type: 'module' });
    zw.onmessage = e => { const m = e.data || {}; for (const [k, w] of zWait) if (w.on(m)) zWait.delete(k); };
    const mirror = window.tablefolkMirrorAllowed?.() ?? /(^|\.)tablefolk\.world$|^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    zLoad = waitFor('load', m => m.type === 'loaded' ? true : m.type === 'error' ? new Error(m.error) : null, 300000);
    zw.postMessage({ type: 'load', data: { mirror } });
    zLoad.catch(() => { try { zw.terminate(); } catch {} zw = null; zLoad = null; });
    return zLoad;
  }
  function waitFor(key, test, ms = 60000, onEach) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { zWait.delete(key); rej(new Error('ZONOS3-Mini did not answer')); }, ms);
      zWait.set(key, { on: m => { onEach?.(m); const r = test(m); if (r == null) return false; clearTimeout(t); r instanceof Error ? rej(r) : res(r === true ? m : r); return true; } });
    });
  }
  // the 192-number embedding of a sample (base64), or null without ZONOS3-Mini here
  async function embedding(audio, v) {
    if (!zonosReady()) return null;
    await zonos();
    const id = 'b-' + v, a = Float32Array.from(audio);
    const done = waitFor('enc', m => m.type === 'voice_encoded' && m.voiceId === id ? true : m.type === 'error' ? new Error(m.error) : null);
    zw.postMessage({ type: 'encode_voice', data: { voiceId: id, audio: a, cacheKey: 'scn:' + v } }, [a.buffer]); await done;
    const got = waitFor('emb', m => m.type === 'embedding' && m.voiceId === id ? m : null);
    zw.postMessage({ type: 'get_embedding', data: { voiceId: id } });
    const e = (await got).embedding; return e ? floatsToB64(e) : null;
  }
  // speak a line in a voice (an embedding) with ZONOS3-Mini and play it
  let playing = null;
  async function say(text, zonosB64, { language = 'auto' } = {}) {
    await zonos();
    const id = 'say-' + hash(String(zonosB64)); zw.postMessage({ type: 'voice_embedding', data: { voiceId: id, embedding: Array.from(b64ToFloats(zonosB64)) } });
    await waitFor('vemb', m => m.type === 'voice_encoded' && m.voiceId === id ? true : null);
    const parts = [];
    const done = waitFor('say', m => m.type === 'stream_ended' ? true : m.type === 'error' ? new Error(m.error) : null, 120000, m => { if (m.type === 'audio_chunk') parts.push(new Float32Array(m.data)); });
    zw.postMessage({ type: 'generate', data: { text, voice: 'custom:' + id, language } }); await done;
    const n = parts.reduce((s, p) => s + p.length, 0); if (!n) throw new Error('no sound came out');
    try { playing?.stop(); } catch {}
    const ctx = say.ctx ||= new AudioContext({ sampleRate: RATE }), buf = ctx.createBuffer(1, n, RATE); let o = 0;
    for (const p of parts) { buf.copyToChannel(p, 0, o); o += p.length; }
    await ctx.resume(); const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(); playing = src;
    return n / RATE;
  }

  // ---- my voices: kept in this browser, offered in every world
  const DB = 'tablefolk-my-voices';
  const db = () => new Promise((res, rej) => { const q = indexedDB.open(DB, 1); q.onupgradeneeded = () => q.result.createObjectStore('voices', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const tx = async (mode, f) => { const d = await db(); return new Promise((res, rej) => { const q = f(d.transaction('voices', mode).objectStore('voices')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const myVoices = {
    list: () => tx('readonly', s => s.getAll()).catch(() => []),
    put: v => tx('readwrite', s => s.put({ ...v, saved: Date.now() })),
    remove: id => tx('readwrite', s => s.delete(id)),
    // the voices made in the game's Voice pane (pocket-tts-manager.js addVoice: 24 kHz floats)
    async fromVoicePane() {
      const d = await new Promise((res, rej) => { const q = indexedDB.open('tablefolk-pocket-tts', 1); q.onupgradeneeded = () => q.result.createObjectStore('voices', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }).catch(() => null);
      if (!d) return [];
      return new Promise(res => { const q = d.transaction('voices').objectStore('voices').getAll(); q.onsuccess = () => res((q.result || []).filter(v => !v.pack && v.audio?.length)); q.onerror = () => res([]); });
    },
  };

  // a float array (a Voice pane voice) as if it were a file
  function floatsToFile(a) { const n = a.length, out = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, RATE, true); out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a[i])) * 32767, true);
    return new Blob([out.buffer], { type: 'audio/wav' }); }

  window.tablefolkVoiceSample = { prepare, decode, embedding, say, zonosReady, myVoices, floatsToFile, b64ToFloats, floatsToB64, hash, MAX_SEC };
})();
