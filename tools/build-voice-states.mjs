// Precompute the Pocket-TTS (small engine) voice states of the designed voice
// library (assets/voices/) in a headless Chrome and write each as its own file in
// the format of the engine's own voices.bin (PTVB1 records), so a first visit needs
// no encoder and no prefill: work/voice-states/v6/<id>.bin and <id>@<mood>.bin (the
// voice "pack:<id>"). Upload them to R2 under pocket-tts/states-v6/ (docs: assets.md).
// Re-run for the voices whose samples changed and upload just those files.
//   node tools/build-voice-states.mjs [voice id ...] [--base=http://localhost:8001]   (needs launch-chrome.sh running)
import { chromium } from './browser-test/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2), base = (args.find(a => a.startsWith('--base=')) || '--base=http://localhost:8001').slice(7), only = args.filter(a => !a.startsWith('--')), out = new URL('../work/voice-states/v6/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9223'), page = await b.contexts()[0].newPage();
await page.goto(base + '/app/?norender=1&states=/none/&t=' + Date.now());   // states=/none/: never take a state from R2, compute it
await page.waitForFunction(() => window.tablefolkTTS && window.TABLEFOLK_PACK_VOICES, null, { timeout: 60000 });
const ids = await page.evaluate(async () => {
  indexedDB.deleteDatabase('tablefolk-pocket-tts-states'); await new Promise(r => setTimeout(r, 300));
  await window.tablefolkTTS.load(); return window.TABLEFOLK_PACK_VOICES.flatMap(v => [v.id, ...Object.keys(v.moods || {}).map(k => v.id + '@' + k)]);
}).then(all => only.length ? all.filter(i => only.includes(i.slice(5).split('@')[0])) : all);
let pos = 0;
for (const id of ids) {
  const b64 = await page.evaluate(async id => {
    const T = window.tablefolkTTS; T.telemetry.firstAudioMs = null;
    T.speak({ id: 'x', root: { position: { x: 0, y: 0, z: 0 } } }, 'Well met.', id);
    for (let i = 0; i < 300 && T.telemetry.firstAudioMs == null; i++) await new Promise(r => setTimeout(r, 200));
    const d = await T.stateDb(), key = [...T.custom.values()].find(r => 'pack:' + r.id.slice(5) === id).cacheKey;
    const tensors = await new Promise(r => { const q = d.transaction('states').objectStore('states').get(key); q.onsuccess = () => r(q.result); });
    // one PTVB1 record: name, then tensors (path, dtype 0 f32 / 1 i64, shape, bytes)
    const enc = new TextEncoder(), parts = [], u16 = n => new Uint8Array(new Uint16Array([n]).buffer), u32 = n => new Uint8Array(new Uint32Array([n]).buffer), str = s => { const e = enc.encode(s); parts.push(u16(e.length), e); };
    str(id); parts.push(u16(Object.keys(tensors).length));
    for (const [path, t] of Object.entries(tensors)) {
      str(path); parts.push(Uint8Array.of(t.dtype === 'int64' ? 1 : 0, t.shape.length)); for (const s of t.shape) parts.push(u32(s));
      const raw = new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength); parts.push(u32(raw.length), raw);
    }
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
  }, id);
  const buf = Buffer.from(b64, 'base64'); pos += buf.length; writeFileSync(out + id.slice(5) + '.bin', buf);
  console.log(id, Math.round(buf.length / 1024), 'KB');
}
console.log('wrote', out, Math.round(pos / 1048576), 'MB');
await page.close(); await b.close().catch(() => {});
