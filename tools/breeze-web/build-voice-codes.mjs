// Encode every library voice natively, into assets/voices/breeze-codes/<name>.bin, so Breeze in the
// browser needn't: its encoder's codes differ from native's (README.md here) and take time on the card.
//   start a native breeze-server on 8137 with a voices dir, then:
//   node tools/breeze-web/build-voice-codes.mjs <its voices dir>
// A .bin is the codes as little-endian int16, 16 per frame, read by pocket-tts-manager.js.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'), VOICES = path.join(ROOT, 'assets/voices'), OUT = path.join(VOICES, 'breeze-codes'), B = 'http://127.0.0.1:8137';
const dir = process.argv[2]; if (!dir) { console.log('usage: build-voice-codes.mjs <server voices dir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-')), list = JSON.parse(fs.readFileSync(path.join(VOICES, 'voices.json'))); const jobs = [];
for (const v of list) { jobs.push([v.file, v.text]); for (const [m, f] of Object.entries(v.moods || {})) jobs.push([f, v.mood_text[m]]); }
const stem = f => path.basename(f).replace(/\.[^.]+$/, ''); let done = 0, bytes = 0; const T = Date.now();
for (const [file, text] of jobs) {
  const name = 'vc_' + stem(file).replace(/\W/g, '_'), wav = path.join(tmp, 'r.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(VOICES, file), '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav]);
  const fd = new FormData(); fd.append('ref_audio', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'ref.wav'); fd.append('ref_text', text); fd.append('name', name); fd.append('description', 'library');
  const r = await fetch(B + '/v1/voices', { method: 'POST', body: fd }); if (!r.ok) { console.log('FAILED', file, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const d = fs.readFileSync(path.join(dir, name + '.breeze')), frames = d.readUInt32LE(16), n = frames * d.readUInt32LE(12), out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) out.writeInt16LE(d.readInt32LE(d.length - (n - i) * 4), i * 2);
  fs.writeFileSync(path.join(OUT, stem(file) + '.bin'), out); bytes += out.length; fs.unlinkSync(path.join(dir, name + '.breeze'));
  if (++done % 20 === 0 || done === jobs.length) console.log(`${((Date.now() - T) / 1000).toFixed(0)}s ${done}/${jobs.length} clips, ${(bytes / 1024).toFixed(0)} KB`);
}
console.log('CODES DONE');
