/* asr/mel.js -- the log-mel frontend of Parakeet-TDT speech models (Underdog
 * Bark 3.0), in plain JS: a port of export/tdt.py from
 * ai-ecoverse/Underdog-Bark-3.0-ONNX (transformers' ParakeetFeatureExtractor).
 * One utterance: mono 16 kHz Float32Array -> { features [T*128], T, valid }.
 * ES module; runs in the worker and in Node (the test compares it with the
 * model card's fixture).
 */
export const PP = { sr: 16000, nFft: 512, hop: 160, win: 400, mels: 128, preemph: 0.97, lead: 0.25, fmin: 0, fmax: 8000, guard: 5.960464477539063e-08, eps: 1e-5 };

// librosa.filters.mel(norm='slaney', htk=False): [mels][nFft/2+1]
export function melFilters(p = PP) {
  const hz2mel = f => f < 1000 ? f / (200 / 3) : 15 + Math.log(f / 1000) / (Math.log(6.4) / 27);
  const mel2hz = m => m < 15 ? m * (200 / 3) : 1000 * Math.exp((m - 15) * (Math.log(6.4) / 27));
  const bins = p.nFft / 2 + 1, lo = hz2mel(p.fmin), hi = hz2mel(p.fmax);
  const pts = Array.from({ length: p.mels + 2 }, (_, i) => mel2hz(lo + (hi - lo) * i / (p.mels + 1)));
  const out = [];
  for (let m = 0; m < p.mels; m++) {
    const row = new Float32Array(bins), l = pts[m], c = pts[m + 1], r = pts[m + 2], en = 2 / (r - l);
    for (let k = 0; k < bins; k++) {
      const f = k * p.sr / p.nFft, w = Math.max(0, Math.min((f - l) / (c - l), (r - f) / (r - c)));
      row[k] = w * en;
    }
    out.push(row);
  }
  return out;
}

// in-place radix-2 FFT of re/im (length a power of two)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

let cached = null;
export function logMel(wave, p = PP) {
  const filters = cached ||= melFilters(p);
  const lead = Math.round(p.lead * p.sr), L = wave.length + lead, x = new Float32Array(L);
  x.set(wave, lead);
  // pre-emphasis (first sample kept), then zero padding by nFft/2 each side (centre)
  const pe = new Float32Array(L); pe[0] = x[0];
  for (let i = 1; i < L; i++) pe[i] = x[i] - p.preemph * x[i - 1];
  const half = p.nFft / 2, xp = new Float32Array(L + p.nFft); xp.set(pe, half);
  const T = 1 + Math.floor(L / p.hop), valid = Math.floor(L / p.hop), bins = half + 1;
  const w = new Float32Array(p.nFft), off = (p.nFft - p.win) / 2;
  for (let i = 0; i < p.win; i++) w[off + i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (p.win - 1));
  const out = new Float32Array(T * p.mels), re = new Float64Array(p.nFft), im = new Float64Array(p.nFft), power = new Float32Array(bins);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < p.nFft; i++) { re[i] = xp[t * p.hop + i] * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let m = 0; m < p.mels; m++) { const f = filters[m]; let s = 0; for (let k = 0; k < bins; k++) s += power[k] * f[k]; out[t * p.mels + m] = Math.log(s + p.guard); }
  }
  // per-feature normalisation over the valid frames (unbiased), padding zeroed
  for (let m = 0; m < p.mels; m++) {
    let mean = 0; for (let t = 0; t < valid; t++) mean += out[t * p.mels + m]; mean /= valid;
    let v = 0; for (let t = 0; t < valid; t++) { const d = out[t * p.mels + m] - mean; v += d * d; }
    const std = Math.sqrt(v / (valid - 1));
    for (let t = 0; t < T; t++) out[t * p.mels + m] = t < valid ? (out[t * p.mels + m] - mean) / (std + p.eps) : 0;
  }
  return { features: out, T, valid };
}
