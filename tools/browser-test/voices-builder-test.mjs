// World builder Voices tab: a voice from a file (Opus sample, ZONOS3-Mini embedding when it
// is downloaded in this Chrome), given to a character, tried; then the world in the game,
// the voice spoken by ZONOS3-Mini and by Pocket-TTS small.
// Usage: [ZONOS=1] PORT=8001 CDP_PORT=9224 node voices-builder-test.mjs [sample.mp3] [out.png]
import { chromium } from 'playwright-core';
const base = 'http://localhost:' + (process.env.PORT || 8000);
const sample = process.argv[2] || '../../app/assets/voices/captain_m.mp3', out = process.argv[3] || 'results/voices-builder.png';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
for (const p of b.contexts()[0].pages()) if (p !== page) await p.close();
page.on('console', m => { if (/voice|zonos|tts|error/i.test(m.text())) console.log('[page]', m.text().slice(0, 200)); });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const wait = async (f, ms, what) => { const t0 = Date.now(); for (;;) { const r = await page.evaluate(f).catch(() => null); if (r) return r; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await page.waitForTimeout(300); } };
await page.setViewportSize({ width: 1300, height: 1300 });
await page.goto(base + '/world/?t=' + Date.now());
if (process.env.ZONOS === '1') await page.evaluate(() => localStorage.setItem('tablefolkZonosWebReady', '1'));   // its weights are cached in this Chrome already
const zonosHere = await page.evaluate(() => localStorage.getItem('tablefolkZonosWebReady') === '1');
console.log('ZONOS3-Mini downloaded in this Chrome:', zonosHere);
await page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
await page.waitForTimeout(800);
await page.click('[data-tab="voices"]');
await page.fill('#vNewName', 'Old Captain'); await page.selectOption('#vNewGender', 'male');
let t0 = Date.now();
await page.setInputFiles('#vNewFile', sample);
const v = await wait(() => { const v = tfBuilder.scenario.voices?.[0]; return v && (v.zonos || !tablefolkVoiceSample.zonosReady()) ? v : null; }, 120000, 'the voice');
console.log(`voice added in ${Date.now() - t0} ms:`, { id: v.id, name: v.name, sampleKB: Math.round(v.sample.length / 1024), type: v.sample.slice(0, 20), zonos: v.zonos ? v.zonos.length + ' chars' : 'none' });
const back = await page.evaluate(async () => { const a = await tablefolkVoiceSample.decode(tfBuilder.scenario.voices[0].sample); let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x)); return { seconds: a.length / 24000, peak: pk }; });
console.log('sample decodes back:', back);
const agent = await page.evaluate(() => tfBuilder.scenario.agents[0].id);
await page.selectOption('[data-voice="0"] select[data-vfield="assign"]', agent);
console.log('assigned:', await page.evaluate(() => tfBuilder.scenario.agents[0].ttsVoiceId));
if (zonosHere) { t0 = Date.now(); await page.click('[data-voice="0"] [data-vact="try"]'); const m = await wait(() => /spoken|failed/.test(document.getElementById('voiceMsg')?.textContent || '') && document.getElementById('voiceMsg').textContent, 120000, 'try it'); console.log('try it:', m, Date.now() - t0, 'ms'); }
await page.click('[data-tab="characters"]'); await page.waitForTimeout(300);
console.log('character dropdown shows:', await page.evaluate(() => { const s = document.querySelector('select[data-path="agents.0.ttsVoiceId"]'); return s.options[s.selectedIndex].text + ' | ' + s.options.length + ' options'; }));
await page.click('[data-tab="voices"]'); await page.waitForTimeout(300);
await (await page.$('[data-panel="voices"]')).screenshot({ path: out });
// the AI's view: no sample
console.log("voice fields:", await page.evaluate(() => JSON.stringify(tfBuilder.scenario.voices.map(v => Object.keys(v)))));
// save to my voices
await page.click('[data-voice="0"] [data-vact="save"]'); await page.waitForTimeout(500);
console.log('my voices:', await page.evaluate(async () => (await tablefolkVoiceSample.myVoices.list()).map(v => v.name)));
// the world in the game
const scn = await page.evaluate(() => tfBuilder.scenario);
const enc = await page.evaluate(async s => { const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(JSON.stringify(s))); w.close(); const u = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, scn);
console.log('link length:', enc.length);
for (const engine of [...(zonosHere ? ['zonos-web'] : []), 'pocket-18m']) {
  await page.evaluate(e => localStorage.setItem('tablefolkTtsEngine', e), engine);
  await page.goto(base + '/app/?play=1&t=' + Date.now() + '#s=' + enc);
  await wait(() => window.TABLEFOLK_SCENARIO_VOICES?.length && window.tablefolkTTS, 60000, 'the world');
  t0 = Date.now();
  const r = await page.evaluate(async id => {
    const tts = window.tablefolkTTS; await tts.load();
    const done = new Promise(res => { tts.addEventListener('speechend', e => res('end'), { once: true }); setTimeout(() => res('timeout'), 90000); });
    tts.speakTest('Ahoy there. The tide turns at dawn, and we sail with it, whether you are aboard or not.', id);
    const how = await done; return { how, engine: tts.engine, voice: tts.current?.voice, telemetry: { audio: tts.telemetry.audioDuration, first: tts.telemetry.firstAudioMs, rtfx: tts.telemetry.rtfx }, custom: [...tts.custom.keys()] };
  }, 'pack:' + v.id);
  console.log(engine, Date.now() - t0, 'ms:', JSON.stringify(r));
}
console.log('errors:', errs.length ? errs : 'none');
await page.close(); await b.close();
