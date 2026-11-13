// @tablefolk/paint -- pictures from a sentence, in the browser (WebGPU), nothing
// sent anywhere. Two small models, chosen for the device:
//   'tiny-sd'  segmind/tiny-sd (a distilled Stable Diffusion 1.5): 512x512, about
//              0.9 GB once, recognisable pictures. CreativeML Open RAIL-M: commercial
//              use allowed, with use restrictions you must pass on.
//   'chitra'   Chitra Tiny (Udgam Labs, 212M, trained only on public-domain and CC0
//              images): 256x256, about 745 MB once, rough and dreamy. Apache-2.0.
//
//   import { createPainter, choosePainter } from '@tablefolk/paint';
//   const p = await createPainter({ model: 'auto', onStatus: s => console.log(s) });
//   p.model, p.why                               // 'chitra', 'about 2 GB free on the graphics card: the small painter'
//   const { blob, url, seconds } = await p.paint('a lighthouse at sunset, oil painting', { seed: 7 })
//   img.src = url                                // an object URL of the PNG
//   p.unload()
//
// 'auto' takes tiny-sd on a computer whose graphics card has room for it (freeGB:
// the memory your other models leave; default all of what @tablefolk/device finds),
// else Chitra, else nothing (no WebGPU). Files come from Hugging Face and are kept
// in the browser's cache.
import { createWorker, note } from '../models/index.js';
import { detectHardware, usableGB } from '../device/index.js';

export const PAINTERS = {
  'tiny-sd': { label: 'tiny-sd (512 px)', size: 512, download: '0.9 GB', needGB: 2, licence: 'CreativeML Open RAIL-M (use restrictions apply)' },
  chitra: { label: 'Chitra Tiny (256 px)', size: 256, download: '745 MB', needGB: 1.5, licence: 'Apache-2.0' },
};

export async function choosePainter({ freeGB = null, prefer = null } = {}) {
  if (prefer && PAINTERS[prefer]) return { model: prefer, why: 'asked for' };
  if (typeof navigator === 'undefined' || !navigator.gpu) return { model: null, why: 'no WebGPU in this browser' };
  const hw = await detectHardware().catch(() => null);
  const free = freeGB ?? usableGB(hw);
  const phone = hw && (hw.cls === 'phone' || hw.cls === 'tablet');
  if (!phone && free != null && free >= PAINTERS['tiny-sd'].needGB) return { model: 'tiny-sd', why: `${free} GB free on the graphics card: the 512 px painter` };
  if (free == null || free >= PAINTERS.chitra.needGB) return { model: 'chitra', why: `${free == null ? 'graphics memory unknown' : free + ' GB free'}${phone ? ' on a phone or tablet' : ''}: the small 256 px painter` };
  return { model: null, why: `${free} GB free on the graphics card: too little for a painter (${PAINTERS.chitra.needGB} GB)` };
}

export async function createPainter({ model = 'auto', freeGB = null, onStatus = () => {} } = {}) {
  const pick = model === 'auto' ? await choosePainter({ freeGB }) : await choosePainter({ prefer: model });
  if (!pick.model) throw new Error('no painter here: ' + pick.why);
  note('paint', `${PAINTERS[pick.model].label}: ${pick.why}`);
  const w = createWorker(new URL('./paint-worker.js', import.meta.url));
  const wait = new Map(); let id = 0;
  const ready = new Promise((resolve, reject) => {
    w.onmessage = ({ data: m }) => {
      if (m.type === 'progress') onStatus(`${m.note} ${PAINTERS[pick.model].label} ${m.total ? Math.round(100 * m.got / m.total) + '%' : ''}`.trim());
      else if (m.type === 'ready') resolve();
      else if (m.type === 'step') { onStatus(`painting ${m.done}/${m.total}`); wait.get(m.id)?.onStep?.(m.done, m.total); }
      else if (m.type === 'image') { const p = wait.get(m.id); wait.delete(m.id); p?.resolve({ blob: m.png, url: URL.createObjectURL(m.png), seconds: m.seconds, model: m.model, size: m.size }); }
      else if (m.type === 'error') { if (m.id != null && wait.has(m.id)) { wait.get(m.id).reject(new Error(m.message)); wait.delete(m.id); } else reject(new Error(m.message)); }
    };
    w.onerror = e => reject(new Error(e.message || 'painting worker failed'));
  });
  w.postMessage({ type: 'load', model: pick.model });
  await ready;
  onStatus(`${PAINTERS[pick.model].label} ready`);
  let queue = Promise.resolve();
  function paint(prompt, { negative = '', steps, guidance, seed, onStep } = {}) {
    const run = () => new Promise((resolve, reject) => { const n = ++id; wait.set(n, { resolve, reject, onStep }); w.postMessage({ type: 'paint', id: n, prompt, negative, steps, guidance, seed }); });
    const p = queue.then(run, run); queue = p.catch(() => {});
    return p;
  }
  return { model: pick.model, why: pick.why, ...PAINTERS[pick.model], paint, unload() { w.terminate(); } };
}
