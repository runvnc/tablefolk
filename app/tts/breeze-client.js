// Breeze TTS 2 (BreezeBlue, 3B, English and Mandarin) as a speech engine,
// running in breeze-server (HoppouAI/Breeze-TTS-2.cpp, Vulkan; the Q4 model
// is about 2.5 GB and takes about 3 GB of graphics memory) on the player's own
// machine: tools/breeze-server.sh starts it. No browser build of the model
// exists (2026-10-30), so this is a client, reached through the Tablefolk
// server (/api/tts/breeze, server.js) or a URL set in the Voice pane (a
// breeze-server started with --cors).
//
// It stands in for a speech worker: pocket-tts-manager.js talks to it with
// the same messages as pocket18-worker.js (load, set_audio_port, generate,
// stop, encode_voice ... / loaded, generation_started, audio_chunk_meta,
// stream_ended, error), and it streams the server's 24 kHz s16le PCM into the
// same audio worklet, so panning, volume and lip sync work unchanged.
//
// Voices: a library voice ("pack:<id>[@<mood>]") is cloned from its sample
// and the sample's exact transcript (voices.json "text" / "mood_text"),
// saved on the server once as tf_<id>_<mood>_<version> (a .breeze file
// there, kept across restarts). The eight built-in names, and samples
// recorded in the Voice pane (no transcript), get a voice designed from
// their description instead. Breeze's weights are for research and
// non-commercial use only (BreezeBlue's licence).
(() => {
  const DEFAULT_URL = '/api/tts/breeze';
  const base = () => { try { return (localStorage.getItem('tablefolkBreezeUrl') || DEFAULT_URL).replace(/\/+$/, ''); } catch { return DEFAULT_URL; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // is a breeze-server answering? (cached for a minute)
  let probe = null;
  async function available() {
    if (probe && Date.now() - probe.at < 60000) return probe.ok;
    let ok = false;
    try { const r = await fetch(base() + '/health', { signal: AbortSignal.timeout(1500) }); ok = r.ok && (await r.json()).status === 'ok'; } catch {}
    probe = { ok, at: Date.now() };
    return ok;
  }

  // 16-bit mono WAV at the given rate
  function wav(samples, rate) {
    const b = new DataView(new ArrayBuffer(44 + samples.length * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return new Blob([b.buffer], { type: 'audio/wav' });
  }

  class BreezeWorker {
    constructor() { this.onmessage = null; this.onerror = null; this.port = null; this.ctrl = null; this.saved = null; this.making = new Map(); }
    emit(data) { try { this.onmessage?.({ data }); } catch (e) { console.error('[breeze]', e); } }
    postMessage(m, transfer) {
      if (m?.type === 'set_audio_port') { this.port = transfer?.[0] || null; return; }
      this.handle(m || {}).catch(e => { if (e.name !== 'AbortError') this.emit({ type: 'error', error: 'Breeze: ' + e.message }); });
    }
    terminate() { this.ctrl?.abort(); }
    async handle({ type, data = {} }) {
      if (type === 'load') {
        this.emit({ type: 'status', data: { text: 'Connecting to Breeze TTS 2…', state: 'loading' } });
        const r = await fetch(base() + '/health', { signal: AbortSignal.timeout(4000) }).catch(() => null);
        const h = r?.ok ? await r.json().catch(() => ({})) : {};
        if (h.status !== 'ok') throw new Error(`no breeze-server answers at ${base()} (start it with tools/breeze-server.sh${r?.status === 403 ? '; this server only lets its owner use it' : ''})`);
        this.emit({ type: 'runtime_info', data: { backend: 'Breeze TTS 2 (breeze-server, GPU)' } });
        this.emit({ type: 'bundle_loaded', sampleRate: h.sample_rate || 24000 });
        this.emit({ type: 'loaded' });
        return;
      }
      if (type === 'stop') { this.ctrl?.abort(); return; }
      if (type === 'set_language') { this.emit({ type: 'voices_loaded', voices: [], language: 'english' }); return; }
      if (type === 'encode_voice' || type === 'load_voice_state' || type === 'load_voice_bin') { this.emit({ type: 'voice_encoded', voiceId: data.voiceId }); return; }
      if (type === 'delete_voice' || type === 'set_voice') return;
      if (type === 'generate') return this.generate(String(data.text || ''), String(data.voice || 'alba'));
    }

    // a library voice, saved on the server the first time it is needed
    async voiceId(id) {
      const [packId, mood] = id.split('@'), v = (window.TABLEFOLK_PACK_VOICES || []).find(x => x.id === packId);
      const file = v && ((mood && v.moods?.[mood]) || v.file), text = v && ((mood && v.mood_text?.[mood]) || v.text);
      if (!file || !text) return null;
      const name = ('tf_' + packId.slice(5) + '_' + (mood && v.moods?.[mood] ? mood : 'main') + '_' + (v.v || '0')).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
      if (!this.saved) {
        const r = await fetch(base() + '/v1/voices').catch(() => null);
        this.saved = new Set(r?.ok ? (await r.json().catch(() => [])).map(x => x.id) : []);
      }
      if (this.saved.has(name)) return name;
      if (!this.making.has(name)) this.making.set(name, (async () => {
        const res = await fetch((window.tablefolkPacks?.base || './assets/') + 'voices/' + file + '?v=' + (v.v || ''));
        if (!res.ok) throw new Error('voice sample ' + res.status);
        const ctx = new OfflineAudioContext(1, 1, 24000), audio = await ctx.decodeAudioData(await res.arrayBuffer());
        const fd = new FormData();
        fd.append('ref_audio', wav(audio.getChannelData(0), audio.sampleRate), 'ref.wav'); fd.append('ref_text', text); fd.append('name', name);
        fd.append('description', `${v.name}${mood ? ' (' + mood + ')' : ''}: ${v.description || ''}`.slice(0, 4000));
        const r = await fetch(base() + '/v1/voices', { method: 'POST', body: fd });
        if (!r.ok) throw new Error('saving the voice on breeze-server: HTTP ' + r.status);
        this.saved.add(name); return name;
      })().finally(() => this.making.delete(name)));
      return this.making.get(name);
    }
    // a voice designed from words: the built-in names' descriptions
    instructionFor(voice) {
      const id = voice.replace(/^(builtin|custom):/, ''), v = (window.TABLEFOLK_VOICES || []).find(x => x.id === id);
      if (v) return `A ${v.gender || ''} voice: ${v.description || 'natural and clear'}. Speak clearly and naturally.`.replace(/\s+/g, ' ');
      return 'A warm, natural speaking voice. Speak clearly and naturally.';
    }

    async generate(text, voice) {
      if (!text.trim()) { this.emit({ type: 'stream_ended' }); return; }
      const ctrl = this.ctrl = new AbortController(), t0 = performance.now();
      this.port?.postMessage({ type: 'reset' });   // a fresh stream for the worklet (clears the last one's end)
      this.emit({ type: 'generation_started', data: { time: t0, sourceSampleRate: 24000 } });
      const fd = new FormData();
      fd.append('text', text); fd.append('seed', '7');
      let vid = null;
      if (voice.startsWith('pack:')) vid = await this.voiceId(voice).catch(e => { console.warn('[breeze] voice', voice, e); return null; });
      if (vid) fd.append('voice_id', vid); else fd.append('instruction', this.instructionFor(voice));
      let res;
      // one generation at a time on the server: a busy answer (409) is tried again
      for (let i = 0; i < 40; i++) {
        res = await fetch(base() + '/v1/audio/speech', { method: 'POST', body: fd, signal: ctrl.signal });
        if (res.status !== 409) break;
        await sleep(250);
      }
      if (!res.ok) throw new Error(`speech: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
      const reader = res.body.getReader();
      let carry = null, samples = 0, first = null;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let bytes = value;
          if (carry) { const b = new Uint8Array(carry.length + value.length); b.set(carry); b.set(value, carry.length); bytes = b; carry = null; }
          const n = bytes.length >> 1; if (bytes.length & 1) carry = bytes.slice(n * 2);
          if (!n) continue;
          const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2), pcm = new Float32Array(n);
          for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(i * 2, true) / 32768;
          if (first == null) first = performance.now() - t0;
          samples += n;
          const metrics = { chunkRtfx: samples / 24000 / ((performance.now() - t0) / 1000) };
          if (this.port) { this.port.postMessage({ type: 'audio', data: pcm }, [pcm.buffer]); this.emit({ type: 'audio_chunk_meta', metrics }); }
          else this.emit({ type: 'audio_chunk', data: pcm.buffer, metrics });
        }
      } catch (e) { if (e.name === 'AbortError' || ctrl.signal.aborted) return; throw e; }
      if (ctrl.signal.aborted) return;
      const secs = (performance.now() - t0) / 1000;
      this.emit({ type: 'generation_metrics', metrics: { rtfx: samples / 24000 / secs, genTime: secs, totalTime: secs, audioDuration: samples / 24000, firstAudioMs: first } });
      this.port?.postMessage({ type: 'stream-ended' });
      this.emit({ type: 'stream_ended' });
    }
  }
  window.TablefolkBreezeWorker = BreezeWorker;
  window.tablefolkBreeze = { available, base, DEFAULT_URL, reset() { probe = null; } };
})();
