// Bake the sculpted floor tile, seen from above, into the flat textures the
// box tiles use (assets/textures/tile_top_{color,orm,n}.png: colour 256 px, occlusion/
// roughness/metal 512 px, normals at the bake size). See
// tools/bake-tile-top.html. Needs the server on :8000 and the test Chrome:
//   HEADLESS=1 tools/browser-test/launch-chrome.sh about:blank
//   node tools/bake-tile-top.mjs [size]        (default 1024)
//   node tools/browser-test/close.mjs
import { writeFileSync } from 'fs';
const size = +(process.argv[2] || 1024);
const list = await (await fetch('http://127.0.0.1:9223/json')).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: `http://localhost:8000/tools/bake-tile-top.html?size=${size}` });
await new Promise(r => setTimeout(r, 1500));
const r = await send('Runtime.evaluate', { expression: 'window.bakeResult', awaitPromise: true, returnByValue: true });
const out = r.result?.result?.value;
if (!out || out.error) { console.error('bake failed', out?.error || JSON.stringify(r).slice(0, 400)); process.exit(1); }
console.log('baked', JSON.stringify(out.info));
const dir = new URL('../assets/textures/', import.meta.url).pathname;
for (const [k, name] of [['color', 'tile_top_color'], ['orm', 'tile_top_orm'], ['normal', 'tile_top_n']]) {
  writeFileSync(dir + name + '.png', Buffer.from(out[k].split(',')[1], 'base64'));
  console.log('wrote', name + '.png');
}
ws.close();
