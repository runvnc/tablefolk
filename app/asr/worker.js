/* asr/worker.js -- speech to text in the browser: Underdog Bark 3.0
 * (ai-ecoverse/Underdog-Bark-3.0-ONNX, a Parakeet-TDT 0.6B fine-tune,
 * CC-BY-4.0) on onnxruntime-web. The encoder (fp16, 1.2 GB) runs on WebGPU,
 * the small decoder/joint network on WASM; mel.js is the feature frontend and
 * the greedy TDT loop below is export/tdt.py of the model card.
 *
 * Messages in:  { type: 'load', urls: [base urls to try] }
 *               { type: 'transcribe', id, audio: Float32Array (mono, 16 kHz) }
 * Messages out: { type: 'progress', note, fraction } ... { type: 'ready' }
 *               { type: 'text', id, text, ms } | { type: 'error', id?, message }
 * Files are kept in the Cache API (tablefolk-asr-1), so a download happens once.
 */
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs';
import { logMel } from './mel.js';

// fp16 (1.2 GB) on WebGPU where the card has shader-f16 (token-exact with the
// reference on 19 of 20 clips); else int8 (0.84 GB) on WASM, which reads the
// same words (the card measured it token-exact on fewer clips, but the text
// matches on the ones checked). The int4 build is broken: never used.
const VARIANTS = {
  fp16: { enc: 'encoder_model_fp16.onnx', dec: 'decoder_joint_model_fp16.onnx', ep: 'webgpu', sizes: [0.001, 0.93, 0.06, 0.009] },
  q8: { enc: 'encoder_model_quantized.onnx', dec: 'decoder_joint_model_quantized.onnx', ep: 'wasm', sizes: [0.004, 0.92, 0.07, 0.006] },
};
async function pickVariant(force) {
  if (force && VARIANTS[force]) return force;
  try { const a = await navigator.gpu?.requestAdapter(); if (a?.features.has('shader-f16')) return 'fp16'; } catch {}
  return 'q8';
}
const GEN = { blank: 8192, durations: [0, 1, 2, 3, 4], hidden: 640, layers: 2, maxSymbols: 10, eos: 3 };
const CACHE = 'tablefolk-asr-1';
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

let enc = null, dec = null, pieces = null, loading = null;
const say = m => postMessage(m);

// R2 takes uploads up to 300 MiB through wrangler, so the big file is stored as
// <name>.p000, .p001, ... and a <name>.parts.json ({ size, partSize, parts }),
// fetched four at a time from the bucket's four hostnames (one connection each).
const hostFor = (u, i) => u.replace('//geebr-models.mindroot.io', i % 4 ? `//geebr-models-${(i % 4) + 1}.mindroot.io` : '//geebr-models.mindroot.io');
const pathFor = u => (/huggingface\.co/.test(u) ? 'onnx/' : '');
async function readInto(resp, buf, at, onBytes) {
  const reader = resp.body.getReader();
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf.set(value, at); at += value.length; onBytes(value.length); }
}
async function download(cache, name, urls, weight, base) {
  const hit = await cache.match('/asr/' + name);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  let lastErr;
  for (const u0 of urls) {
    const u = u0.replace(/\/?$/, '/');
    try {
      let buf, got = 0, total = 0;
      const tick = n => { got += n; say({ type: 'progress', note: `downloading ${name}`, fraction: base + weight * (total ? got / total : 0) }); };
      const man = /huggingface\.co/.test(u) ? null : await fetch(u + name + '.parts.json').then(r => r.ok ? r.json() : null).catch(() => null);
      if (man) {
        total = man.size; buf = new Uint8Array(total);
        let next = 0;
        const lane = async () => { for (let i = next++; i < man.parts; i = next++) {
          const r = await fetch(hostFor(u, i) + name + '.p' + String(i).padStart(3, '0')); if (!r.ok) throw new Error(`${name} part ${i}: HTTP ${r.status}`);
          await readInto(r, buf, i * man.partSize, tick);
        } };
        await Promise.all([lane(), lane(), lane(), lane()]);
      } else {
        const r = await fetch(u + (name === 'tokenizer.json' ? '' : pathFor(u)) + name); if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        total = +r.headers.get('content-length') || 0; buf = total ? new Uint8Array(total) : null;
        if (buf) await readInto(r, buf, 0, tick);
        else { buf = new Uint8Array(await r.arrayBuffer()); }
      }
      await cache.put('/asr/' + name, new Response(buf));
      return buf;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no model source');
}

async function load(urls, force) {
  if (enc) return;
  const V = VARIANTS[await pickVariant(force)], files = [V.enc, V.enc + '_data', V.dec, 'tokenizer.json'];
  const cache = await caches.open(CACHE);
  let base = 0; const got = {};
  for (let i = 0; i < files.length; i++) { got[files[i]] = await download(cache, files[i], urls, V.sizes[i], base); base += V.sizes[i]; }
  say({ type: 'progress', note: 'starting the speech model', fraction: 1 });
  enc = await ort.InferenceSession.create(got[V.enc], { executionProviders: [V.ep], externalData: [{ path: V.enc + '_data', data: got[V.enc + '_data'] }] });
  dec = await ort.InferenceSession.create(got[V.dec], { executionProviders: ['wasm'] });
  const vocab = JSON.parse(new TextDecoder().decode(got['tokenizer.json'])).model.vocab;
  pieces = []; for (const [p, id] of Object.entries(vocab)) pieces[id] = p;
}

const f32 = t => t.type === 'float16' ? Float32Array.from(t.data, halfToFloat) : t.data;
function halfToFloat(h) { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 5.960464477539063e-8 * f : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024); }

async function transcribe(audio) {
  const { features, T, valid } = logMel(audio);
  const mask = new BigInt64Array(T); for (let t = 0; t < valid; t++) mask[t] = 1n;
  const out = await enc.run({ input_features: new ort.Tensor('float32', features, [1, T, 128]), attention_mask: new ort.Tensor('int64', mask, [1, T]) });
  const eo = out.encoder_outputs, len = Number(out.encoder_lengths.data[0]), E = f32(eo), Tp = eo.dims[1];
  let h = new Float32Array(GEN.layers * GEN.hidden), c = new Float32Array(GEN.layers * GEN.hidden);
  const toks = []; let last = GEN.blank, t = 0, steps = 0;
  const maxSteps = GEN.maxSymbols * Tp - 1;
  while (t < len && steps++ < maxSteps) {
    const r = await dec.run({
      encoder_outputs: new ort.Tensor('float32', E.slice(t * GEN.hidden, (t + 1) * GEN.hidden), [1, 1, GEN.hidden]),
      input_ids: new ort.Tensor('int64', BigInt64Array.of(BigInt(last)), [1, 1]),
      state_h: new ort.Tensor('float32', h, [GEN.layers, 1, GEN.hidden]), state_c: new ort.Tensor('float32', c, [GEN.layers, 1, GEN.hidden]),
    });
    const tl = f32(r.token_logits), dl = f32(r.duration_logits);
    let tok = 0; for (let i = 1; i < tl.length; i++) if (tl[i] > tl[tok]) tok = i;
    let di = 0; for (let i = 1; i < dl.length; i++) if (dl[i] > dl[di]) di = i;
    let d = GEN.durations[di];
    if (tok === GEN.blank) d = Math.max(d, 1); else { last = tok; h = Float32Array.from(f32(r.state_h_out)); c = Float32Array.from(f32(r.state_c_out)); toks.push(tok); }
    t += d;
    if (tok === GEN.eos) break;
  }
  return toks.filter(i => i !== GEN.blank && !(pieces[i].startsWith('<') && pieces[i].endsWith('>'))).map(i => pieces[i]).join('').replace(/▁/g, ' ').trim();
}

onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'load') { await (loading ||= load(m.urls, m.variant)); say({ type: 'ready' }); }
    else if (m.type === 'transcribe') { await loading; const t0 = performance.now(); const text = await transcribe(m.audio); say({ type: 'text', id: m.id, text, ms: Math.round(performance.now() - t0) }); }
  } catch (err) { loading = null; say({ type: 'error', id: m.id, message: String(err?.message || err) }); }
};
