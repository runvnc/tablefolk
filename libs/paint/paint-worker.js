// The painting worker: text to image with ONNX Runtime Web on WebGPU, two models.
//   chitra   Chitra Tiny (Udgam Labs, Apache-2.0): flan-t5-base encoder + a 212M
//            diffusion transformer (rectified flow, Euler) + the SD VAE; 256x256.
//            Its three graphs and sampling follow mrfakename's Apache-2.0
//            chitra-tiny-webgpu Space (huggingface.co/spaces/mrfakename/chitra-tiny-webgpu).
//   tiny-sd  segmind/tiny-sd (a distilled Stable Diffusion 1.5) as ONNX by
//            danyalmalik (CreativeML Open RAIL-M): CLIP encoder + UNet (fp16) + VAE;
//            512x512, DPM-Solver++(2M) as its scheduler config asks; TAESD decodes.
// Files are kept in the Cache API (one download per browser).
//
// in:  { type: 'load', model }                      -> progress ..., { type: 'ready', model }
//      { type: 'paint', id, prompt, negative, steps, guidance, seed }
//                                                   -> step ..., { type: 'image', id, png: Blob, seconds }
// out: { type: 'progress', note, got, total }, { type: 'step', id, done, total }, { type: 'error', id?, message }
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.webgpu.min.mjs';
import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
ort.env.logLevel = 'error';
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
env.allowLocalModels = false;

export const MODELS = {
  chitra: {
    repo: 'mrfakename/Chitra-Tiny-ONNX', tokenizer: 'mrfakename/Chitra-Tiny-ONNX', size: 256, latent: 32, steps: 30, guidance: 7,
    files: [['text', 'onnx/text_encoder.onnx', 219487197], ['net', 'onnx/transformer.onnx', 425085665], ['vae', 'onnx/vae_decoder.onnx', 99180284]],
  },
  'tiny-sd': {
    repo: 'danyalmalik/tiny-sd-ONNX-WebGPU', tokenizer: 'Xenova/clip-vit-base-patch32', size: 512, latent: 64, steps: 20, guidance: 7.5,
    // the image decoder is TAESD (madebyollin, MIT; ONNX by julienkay): 5 MB and light on graphics
    // memory, where SD's own 512 px decoder ran a 6 GB card out of memory beside the UNet
    files: [['text', 'text_encoder/model.onnx', 246300000], ['net', 'unet/model.onnx', 647300000], ['vae', 'vae_decoder/model.onnx', 4900000, 'julienkay/taesd']],
  },
};
const CACHE = 'tablefolk-paint-1';
let S = null, tok = null, which = null;
const say = m => postMessage(m);

async function fetchFile(url, onBytes) {
  const c = self.caches ? await caches.open(CACHE) : null;
  const hit = c && await c.match(url);
  if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onBytes(b.byteLength); return b; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed (${r.status}): ${url.split('/').pop()}`);
  const size = Number(r.headers.get('content-length')) || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onBytes(value.length); }
  if (size && got !== size) throw new Error('the download was cut short: try again');
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  if (c) await c.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
  return buf;
}

async function load(model) {
  if (S && which === model) return;
  const M = MODELS[model]; if (!M) throw new Error('unknown painting model ' + model);
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter().catch(() => null))) throw new Error('no WebGPU in this browser');
  S = null; which = null;
  tok = await AutoTokenizer.from_pretrained(M.tokenizer);
  const total = M.files.reduce((a, f) => a + f[2], 0); let got = 0, last = 0;
  const onBytes = n => { got += n; const now = performance.now(); if (now - last > 200) { last = now; say({ type: 'progress', note: 'downloading', got, total }); } };
  const s = {};
  for (const [k, f, , repo] of M.files) {   // one at a time: the WebGPU provider dislikes concurrent session creation
    const buf = await fetchFile(`https://huggingface.co/${repo || M.repo}/resolve/main/${f}`, onBytes);
    say({ type: 'progress', note: 'preparing', got, total });
    s[k] = await ort.InferenceSession.create(buf, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
  }
  S = s; which = model;
}

function rng(seed) {   // mulberry32 + Box-Muller: the same picture for the same seed
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 1) / 4294967297; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const feeds = (sess, values) => Object.fromEntries(sess.inputNames.map((n, i) => [n, values[i]]));

async function encodeT5(text) {
  const e = tok(text, { padding: 'max_length', max_length: 77, truncation: true });
  const ids = BigInt64Array.from(e.input_ids.data, BigInt), am = BigInt64Array.from(e.attention_mask.data, BigInt);
  const out = await S.text.run({ input_ids: new ort.Tensor('int64', ids, [1, 77]), attention_mask: new ort.Tensor('int64', am, [1, 77]) });
  return { h: out.last_hidden_state.data.slice(), mask: Uint8Array.from(e.attention_mask.data, Number) };
}
async function encodeCLIP(text) {
  if (!encodeCLIP.seen) { encodeCLIP.seen = 1; console.info('[paint] text encoder', JSON.stringify(S.text.inputNames), JSON.stringify(S.text.inputMetadata), JSON.stringify(S.net.inputNames), JSON.stringify(S.net.inputMetadata)); }
  const e = tok(text, { padding: 'max_length', max_length: 77, truncation: true });
  const name = S.text.inputNames[0], type = S.text.inputMetadata?.[0]?.type || 'int32';
  const ids = type === 'int64' ? BigInt64Array.from(e.input_ids.data, BigInt) : Int32Array.from(e.input_ids.data, Number);
  const out = await S.text.run({ [name]: new ort.Tensor(type === 'int64' ? 'int64' : 'int32', ids, [1, 77]) });
  return out[S.text.outputNames[0]].data.slice();
}

async function toPng(im, size) {
  const HW = size * size, rgba = new Uint8ClampedArray(HW * 4);
  for (let p = 0; p < HW; p++) {
    rgba[p * 4] = im[p] * 127.5 + 127.5; rgba[p * 4 + 1] = im[HW + p] * 127.5 + 127.5; rgba[p * 4 + 2] = im[2 * HW + p] * 127.5 + 127.5; rgba[p * 4 + 3] = 255;
  }
  const cv = new OffscreenCanvas(size, size); cv.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0);
  return cv.convertToBlob({ type: 'image/png' });
}

// Chitra: Euler from t = 1 (noise) to 0, classifier-free guidance, one batch of [cond, uncond]
async function paintChitra({ id, prompt, negative, steps, guidance, seed }) {
  const M = MODELS.chitra, G = M.latent, C = 4, D = 768, T = 77, P = C * G * G;
  const cond = await encodeT5(prompt), unc = await encodeT5(negative || '');
  const txt = new Float32Array(2 * T * D); txt.set(cond.h, 0); txt.set(unc.h, T * D);
  const mask = new Uint8Array(2 * T); mask.set(cond.mask, 0); mask.set(unc.mask, T);
  const txtT = new ort.Tensor('float32', txt, [2, T, D]), maskT = new ort.Tensor('bool', mask, [2, T]);
  const g = rng(seed), x = new Float32Array(P); for (let i = 0; i < P; i++) x[i] = g();
  const xx = new Float32Array(2 * P), tt = new Float32Array(2);
  for (let s = 0; s < steps; s++) {
    const ti = 1 - s / steps, tn = 1 - (s + 1) / steps;
    xx.set(x, 0); xx.set(x, P); tt.fill(ti);
    const out = await S.net.run({ x: new ort.Tensor('float32', xx, [2, C, G, G]), t: new ort.Tensor('float32', tt, [2]), txt: txtT, txt_mask: maskT });
    const v = out.v.data, dt = tn - ti;
    for (let i = 0; i < P; i++) x[i] += dt * (v[P + i] + guidance * (v[i] - v[P + i]));
    out.v.dispose?.();
    say({ type: 'step', id, done: s + 1, total: steps });
  }
  const out = await S.vae.run({ latent: new ort.Tensor('float32', x, [1, C, G, G]) });
  return toPng(out.image.data, M.size);
}

// tiny-sd: epsilon prediction, DPM-Solver++(2M) on the scaled-linear schedule (k-diffusion's sample_dpmpp_2m)
async function paintSD({ id, prompt, negative, steps, guidance, seed }) {
  const T0 = performance.now();
  const M = MODELS['tiny-sd'], G = M.latent, C = 4, P = C * G * G;
  const stage = async (name, f) => { try { return await f(); } catch (e) { throw new Error(`${name}: ${e.message}`); } };
  const ec = await stage('text encoder', () => encodeCLIP(prompt)), eu = await stage('text encoder', () => encodeCLIP(negative || ''));
  const D = ec.length / 77;
  const betas = Array.from({ length: 1000 }, (_, i) => (Math.sqrt(0.00085) + (Math.sqrt(0.012) - Math.sqrt(0.00085)) * i / 999) ** 2);
  const acp = []; betas.reduce((a, b, i) => (acp[i] = a * (1 - b)), 1);
  const ts = Array.from({ length: steps }, (_, i) => Math.round(999 - i * 999 / (steps - 1 || 1)));   // "linspace" spacing
  const sig = ts.map(t => Math.sqrt((1 - acp[t]) / acp[t])).concat([0]);
  const g = rng(seed), x = new Float32Array(P); for (let i = 0; i < P; i++) x[i] = g() * sig[0];
  // inputs by name (diffusers' export: sample, timestep, encoder_hidden_states); the
  // timestep's type is found by trying (float32, then int64)
  const nm = S.net.inputNames, find = re => nm.find(n => re.test(n));
  const nSample = find(/sample/) || nm[0], nTime = find(/time/) || nm[1], nHid = find(/hidden|encoder/) || nm[2];
  let tType = 'float32';
  // both guidance passes in one batch of two: [cond, uncond]
  const hs2 = new Float32Array(2 * 77 * D); hs2.set(ec, 0); hs2.set(eu, 77 * D);
  const hsT = new ort.Tensor('float32', hs2, [2, 77, D]);
  const run = async (inp, t) => {
    const x2 = new Float32Array(2 * P); x2.set(inp, 0); x2.set(inp, P);
    const tv = tType === 'int64' ? new ort.Tensor('int64', BigInt64Array.from([BigInt(t), BigInt(t)]), [2]) : new ort.Tensor('float32', Float32Array.from([t, t]), [2]);
    let out;
    try { out = await S.net.run({ [nSample]: new ort.Tensor('float32', x2, [2, C, G, G]), [nTime]: tv, [nHid]: hsT }); }
    catch (e) { if (tType === 'float32' && /expected: \(tensor\(int64\)\)/.test(e.message)) { tType = 'int64'; return run(inp, t); } throw e; }
    const d = out[S.net.outputNames[0]].data; return [d.slice(0, P), d.slice(P, 2 * P)];
  };
  let old = null;
  for (let s = 0; s < steps; s++) {
    const sg = sig[s], sn = sig[s + 1], cin = 1 / Math.sqrt(sg * sg + 1);
    const inp = x.map(v => v * cin);
    const [epsC, epsU] = await stage('unet', () => run(inp, ts[s]));
    const den = new Float32Array(P);
    for (let i = 0; i < P; i++) den[i] = x[i] - sg * (epsU[i] + guidance * (epsC[i] - epsU[i]));
    if (sn === 0) x.set(den);
    else {
      const t = -Math.log(sg), tn = -Math.log(sn), h = tn - t, a = sn / sg, b = -Math.expm1(-h);
      if (!old) for (let i = 0; i < P; i++) x[i] = a * x[i] + b * den[i];
      else {
        const r = (t + Math.log(sig[s - 1])) / h, k1 = 1 + 1 / (2 * r), k2 = 1 / (2 * r);
        for (let i = 0; i < P; i++) x[i] = a * x[i] + b * (k1 * den[i] - k2 * old[i]);
      }
    }
    old = den;
    say({ type: 'step', id, done: s + 1, total: steps });
  }
  console.info('[paint] tiny-sd sampling done', ((performance.now() - T0) / 1000).toFixed(1), 's');
  // TAESD takes the UNet's latents as they are (no 1/0.18215); its output is [0, 1] or [-1, 1]
  const out = await stage('vae', () => S.vae.run(feeds(S.vae, [new ort.Tensor('float32', x, [1, C, G, G])])));
  const im = out[S.vae.outputNames[0]].data;
  let lo = Infinity; for (let i = 0; i < im.length; i += 97) lo = Math.min(lo, im[i]);
  for (let i = 0; i < im.length; i++) im[i] = Math.max(-1, Math.min(1, lo >= -0.05 ? im[i] * 2 - 1 : im[i]));
  return toPng(im, M.size);
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await load(data.model); say({ type: 'ready', model: which }); return; }
    if (data.type === 'paint') {
      if (!S) throw new Error('no painting model loaded');
      const M = MODELS[which], t0 = performance.now();
      const args = { id: data.id, prompt: String(data.prompt || ''), negative: data.negative || '', steps: data.steps || M.steps, guidance: data.guidance ?? M.guidance, seed: data.seed ?? (Math.random() * 2 ** 31) | 0 };
      const png = which === 'chitra' ? await paintChitra(args) : await paintSD(args);
      say({ type: 'image', id: data.id, png, seconds: (performance.now() - t0) / 1000, model: which, size: M.size });
    }
  } catch (e) { say({ type: 'error', id: data?.id, message: String(e?.message || e) }); }
};
