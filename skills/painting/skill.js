// Painting: paint(subject) makes a real picture with @tablefolk/paint (libs/paint)
// in this browser, then hangs it up as a note (on the wall the painter faces, else
// on the ground) with the title and the painter's name. The painting happens in
// the background: the turn ends at once ("starts painting..."), and when the
// picture is done the painter hangs it and is told, so it can boast about it.
//
// The models download once (tiny-sd ~0.9 GB, or Chitra Tiny ~0.75 GB on a smaller
// graphics card), after the player agrees. The choice follows the graphics memory
// left beside the characters' model (window.tablefolkDevice.freeGB). Pictures are
// stored in the note as a small JPEG, so they are saved with the world.
import { createPainter, choosePainter } from '../../libs/paint/index.js';

let painter = null, loading = null;
const OK = 'tablefolk.paintOk';
async function getPainter(narrate, g) {
  if (painter) return painter;
  if (loading) return loading;
  const freeGB = window.tablefolkDevice?.freeGB ?? null;
  const pick = await choosePainter({ freeGB });
  if (!pick.model) throw new Error(pick.why);
  pick.cpu = !!pick.cpu;
  let ok = null; try { ok = localStorage.getItem(OK); } catch {}
  if (ok !== '1') {
    const size = pick.model === 'tiny-sd' ? 'about 0.9 GB' : 'about 0.75 GB';
    const text = `Painting characters draw real pictures with a small image model in this browser: a one-time download of ${size}, kept afterwards. Download it?`;
    const yes = await (window.confirmDialog ? window.confirmDialog(text, { title: 'Download the painter?', confirmText: 'download' }) : Promise.resolve(confirm(text)));
    try { localStorage.setItem(OK, yes ? '1' : '0'); } catch {}
    if (!yes) throw new Error('the painting model was not downloaded');
  }
  const ev = d => window.dispatchEvent(new CustomEvent('tablefolk-load', { detail: { key: 'paint', label: '🎨 Painter', state: 'loading', ...d } }));
  loading = createPainter({ model: pick.model, cpu: pick.cpu, freeGB, onStatus: s => ev({ text: s }) })
    .then(p => { painter = p; ev({ text: 'ready', state: 'ready' }); window.tablefolkDiag?.note?.('paint', `${p.label}: ${p.why}`); return p; })
    .catch(e => { loading = null; ev({ text: e.message, state: 'error' }); throw e; });
  return loading;
}

// a smaller JPEG for the note (saved with the world)
async function toJpeg(blob, size = 320) {
  const bmp = await createImageBitmap(blob), cv = new OffscreenCanvas(size, size);
  cv.getContext('2d').drawImage(bmp, 0, 0, size, size);
  const out = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(out); });
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function painting(api) {
  return {
    commands: {
      paint(g, args, { narrate, data }) {
        const subject = args.filter(a => a && a !== 'paint').join(', ').replace(/^["']|["']$/g, '').trim();
        if (!subject) return narrate(g, `${g.id} raises the brush, then wonders what to paint`), false;
        if (data.state.busy) return narrate(g, `${g.id} is still busy with the last painting`), false;
        data.state.busy = true;
        const style = data.params?.style || 'oil painting';
        narrate(g, `${g.id} sets up an easel and starts painting ${subject}`);
        (async () => {
          try {
            let p = await getPainter(narrate, g), r;
            for (;;) {
              try { r = await p.paint(`${subject}, ${style}`); break; }
              catch (e) {
                // the graphics card has no room (beside the characters' model and the world): step
                // down, tiny-sd -> Chitra -> Chitra on the processor, and paint it again
                if (p.cpu || !/webgpu|buffer|OrtRun|memory/i.test(e.message)) throw e;
                const next = p.model === 'tiny-sd' ? { model: 'chitra' } : { model: 'chitra', cpu: true };
                p.unload(); painter = null;
                window.tablefolkDiag?.note?.('paint', `${p.label} ran out of graphics memory: ${next.cpu ? 'the processor' : 'Chitra Tiny'} instead`);
                const ev = d => window.dispatchEvent(new CustomEvent('tablefolk-load', { detail: { key: 'paint', label: '🎨 Painter', state: 'loading', ...d } }));
                loading = createPainter({ ...next, onStatus: s => ev({ text: s }) }).then(x => (painter = x));
                p = await loading;
              }
            }
            window.dispatchEvent(new CustomEvent('tablefolk-load', { detail: { key: 'paint', label: '🎨 Painter', state: 'ready', text: `painted in ${Math.round(r.seconds)} s` } }));
            const img = await toJpeg(r.blob, Math.min(r.size, 320));
            URL.revokeObjectURL(r.url);
            const W = window.tablefolk;
            while (!W.isTurnReady()) await sleep(150);
            // the picture fills the page; a small caption under it (inline sizes: notes scale short text up)
            const html = `<img src="${img}" style="width:100%;display:block"/><p style="font-size:24px;line-height:1.2;margin:10px 0 0;text-align:center"><b>${esc(subject)}</b><br/><i>by ${esc(g.id)}</i></p>`;
            await W.stepAgentTurn(g.id, { kind: 'note', html }, 'painting');
            const cfg = api.getBrainConfig(g.id);
            api.setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] You finished your painting of ${subject} and hung it up. It took ${Math.round(r.seconds)} seconds.`]).slice(-5) });
            window.tablefolkDiag?.note?.('paint', `${g.id} painted "${subject}" in ${r.seconds.toFixed(1)} s (${r.model})`);
            window.dispatchEvent(new CustomEvent('tablefolk-painting', { detail: { agentId: g.id, subject, seconds: r.seconds, model: r.model } }));
          } catch (e) {
            narrate(g, `${g.id} stares at the canvas: the painting didn't work (${e.message})`);
            window.tablefolkDiag?.note?.('paint', 'failed: ' + e.message);
          } finally { data.state.busy = false; }
        })();
        return true;
      },
    },
  };
}
