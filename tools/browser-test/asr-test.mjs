// Speech input accuracy: the voice library's samples (assets/voices, each with
// its transcript in voices.json; the mood samples too) through the page's
// speech engines, with word error rates and times.
//   node asr-test.mjs [--engines=bark,gemma] [--set=main|moods|all] [--noisy] [--limit=N] [--base=http://localhost:8001]
//   node asr-test.mjs --clips=clips.json ...   other clips: [{ id, file (absolute path), text }]
// bark:  Underdog Bark 3.0 in the page (tablefolkSpeech.barkText; downloads 1.3 GB once into the test profile)
// gemma: the server's /api/transcribe (bun server/server.js 8001 --litert, gemma4-e2b-mm; 60 clips per 10 minutes)
// --noisy also runs each clip as a cheap laptop mic would hear it (ffmpeg:
// 300-3400 Hz, quieter, room noise at about 20 dB SNR, 2 s of noise around it).
// Writes results/asr-<ts>.json. The test Chrome must be running.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const engines = arg('engines', 'bark').split(','), set = arg('set', 'main'), base = arg('base', 'http://localhost:8001'), limit = +arg('limit', 999);
const noisy = process.argv.includes('--noisy');
const ROOT = new URL('../../', import.meta.url).pathname, tmp = `${process.env.ASR_TMP || tmpdir()}/tablefolk-asr`; mkdirSync(tmp, { recursive: true });

const voices = JSON.parse(readFileSync(ROOT + 'assets/voices/voices.json', 'utf8'));
let clips = [];
for (const v of voices) {
  if (set !== 'moods') clips.push({ id: v.id, file: `assets/voices/${v.id}.mp3`, text: v.text });
  if (set !== 'main') for (const [m, t] of Object.entries(v.mood_text || {})) if (existsSync(`${ROOT}assets/voices/mood/${v.id}.${m}.mp3`)) clips.push({ id: `${v.id}@${m}`, file: `assets/voices/mood/${v.id}.${m}.mp3`, text: t });
}
if (arg('clips')) clips = JSON.parse(readFileSync(arg('clips'), 'utf8'));   // [{ id, file (absolute), text }], e.g. LibriSpeech clips
const path = f => f.startsWith('/') ? f : ROOT + f;
clips = clips.filter(c => c.text && existsSync(path(c.file))).slice(0, limit);
const variants = noisy ? ['clean', 'laptop'] : ['clean'];
function audio(c, variant) {
  if (variant === 'clean') return readFileSync(path(c.file));
  const out = `${tmp}/${c.id.replace('@', '.')}.laptop.wav`;
  if (!existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path(c.file), '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.02:sample_rate=16000', '-filter_complex',
    '[0:a]aresample=16000,highpass=f=300,lowpass=f=3400,volume=0.6,adelay=1000|1000,apad=pad_dur=1[s];[s][1:a]amix=inputs=2:duration=first:normalize=0[o]', '-map', '[o]', '-ac', '1', out]);
  return readFileSync(out);
}

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\b(\w+)'(\w+)\b/g, '$1$2').split(/\s+/).filter(Boolean);
function wer(ref, hyp) {
  const r = norm(ref), h = norm(hyp), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], words: r.length };
}

const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0];
p.on('pageerror', e => console.log('  [pageerror]', e.message));
p.on('console', m => { if (/asr|bark|onnx|webgpu/i.test(m.text())) console.log('  [page]', m.text().slice(0, 200)); });
await p.goto(base + '/app/?art=1' + (arg('query') ? '&' + arg('query') : ''));   // --query=asrvariant=q8
await p.waitForFunction(() => window.tablefolkSpeech?.barkText, null, { timeout: 90000 });
await p.evaluate(() => localStorage.setItem('tablefolk.barkOk', '1'));
const info = await p.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return { gpu: !!a, f16: !!a?.features.has('shader-f16'), vendor: a?.info?.vendor, arch: a?.info?.architecture }; });
console.log('WebGPU:', JSON.stringify(info));

const results = { when: new Date().toISOString(), info, load: {}, clips: [] };
if (engines.includes('bark')) {
  const t0 = Date.now();
  await p.evaluate(() => window.tablefolkSpeech.barkText(new Float32Array(16000)));
  results.load.bark = Date.now() - t0; console.log(`bark loaded (and one second of silence read) in ${(results.load.bark / 1000).toFixed(1)} s`);
}
const sum = {};
for (const c of clips) for (const variant of variants) {
  const b64 = audio(c, variant).toString('base64'), type = variant === 'clean' ? 'audio/mpeg' : 'audio/wav';
  for (const eng of engines) {
    const r = await p.evaluate(async ([b64, type, eng]) => {
      const blob = new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], { type });
      const pcm = await tablefolkSpeech.toPcm16k(blob), secs = pcm.length / 16000, t0 = performance.now();
      try {
        if (eng === 'bark') return { text: await tablefolkSpeech.barkText(pcm), ms: performance.now() - t0, secs };
        const wav = await tablefolkSpeech.toWav16k(blob), t1 = performance.now();
        const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav }), d = await res.json();
        return res.ok ? { text: d.text, ms: performance.now() - t1, secs } : { error: d.error, secs };
      } catch (e) { return { error: e.message, secs }; }
    }, [b64, type, eng]);
    const w = wer(c.text, r.text), key = `${eng} ${variant}`;
    const s = sum[key] ??= { errors: 0, words: 0, ms: 0, secs: 0, n: 0, failed: 0 };
    if (r.error) s.failed++; else { s.errors += w.errors; s.words += w.words; s.ms += r.ms; s.secs += r.secs; s.n++; }
    results.clips.push({ id: c.id, variant, engine: eng, ref: c.text, ...r, ...w });
    console.log(`${key.padEnd(14)} ${c.id.padEnd(22)} ${r.error ? 'ERROR ' + r.error : `wer ${(100 * w.errors / w.words).toFixed(0).padStart(3)}%  ${(r.ms / 1000).toFixed(2)} s for ${r.secs.toFixed(1)} s  | ${r.text}`}`);
  }
}
console.log('\nengine/variant  WER     clips  failed  time per clip  real-time factor');
for (const [k, s] of Object.entries(sum)) console.log(`${k.padEnd(15)} ${(100 * s.errors / Math.max(1, s.words)).toFixed(1).padStart(5)}%  ${String(s.n).padStart(5)}  ${String(s.failed).padStart(6)}  ${(s.ms / Math.max(1, s.n) / 1000).toFixed(2).padStart(8)} s  ${(s.ms / 1000 / Math.max(1, s.secs)).toFixed(3).padStart(10)}`);
results.summary = sum;
mkdirSync(new URL('results/', import.meta.url).pathname, { recursive: true });
const file = new URL(`results/asr-${Date.now()}.json`, import.meta.url).pathname; writeFileSync(file, JSON.stringify(results, null, 1)); console.log('saved', file);
await b.close();
