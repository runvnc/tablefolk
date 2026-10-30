// Prism ML's Ternary Bonsai 2 27B (prism-ml/Ternary-Bonsai-2-27B-gguf, the
// 5.95 GB PTQ1_0 file) on WebGPU, run by the webml-community kernel engine.
//
// That engine is published only inside its demo page
// (huggingface.co/spaces/webml-community/ternary-bonsai-2-webgpu-kernels):
// the page's second module script starts with it and ends its engine part
// with `export{... as TernaryBonsai2 ...}`. We fetch the page at a pinned
// revision, cut the module there and import it from a blob URL (the way
// xen0bit/smolbox runs it), so nothing of it is copied into this repository.
// The engine streams the weights from Hugging Face and keeps them in
// IndexedDB.
//
//   const model = await loadBonsai2(status => ...);
//   const text = await generateBonsai2(model, '', { messages, maxTokens, onToken });
const SPACE_REV = '94320c9da2b7aeac5b5807c9e61d696a3c09edb5';
const SPACE_URL = `https://huggingface.co/spaces/webml-community/ternary-bonsai-2-webgpu-kernels/resolve/${SPACE_REV}/index.html`;
export const BONSAI2_FILE = 'Ternary-Bonsai-2-27B-PTQ1_0.gguf';
const LOADED = 'tablefolk_bonsai2_loaded';
const CONTEXT = 8192;   // tokens; the engine's default is 16384

let modulePromise = null;
export function bonsai2Module() {
  return modulePromise ||= (async () => {
    const res = await fetch(SPACE_URL);
    if (!res.ok) throw new Error(`Bonsai 2 engine page: HTTP ${res.status}`);
    const html = await res.text();
    const src = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]).find(t => t.includes('as TernaryBonsai2'));
    if (!src) throw new Error('Bonsai 2 engine not found in its page');
    const at = src.indexOf('as TernaryBonsai2'), end = src.indexOf('}', at) + 1;
    const url = URL.createObjectURL(new Blob([src.slice(0, end) + ';'], { type: 'text/javascript' }));
    try { return await import(url); } finally { URL.revokeObjectURL(url); }
  })().catch(e => { modulePromise = null; throw e; });
}

export async function loadBonsai2(onStatus = () => {}) {
  const { TernaryBonsai2 } = await bonsai2Module();
  const check = await TernaryBonsai2.checkAvailability(null, { file: BONSAI2_FILE }).catch(() => null);
  if (check && check.ok === false) throw new Error('Bonsai 2 27B cannot run here: ' + (check.reason || 'unsupported GPU'));
  const gb = n => (n / 2 ** 30).toFixed(2);
  const model = await TernaryBonsai2.load(null, {
    file: BONSAI2_FILE, maxLength: CONTEXT, chatTemplateArgs: { enable_thinking: false },
    onProgress: e => {
      if (e.status === 'weights' && e.kind === 'bytes' && e.total > 0) onStatus(`${e.fromCache ? 'reading cached' : 'downloading'} Bonsai 2 27B ${Math.floor(100 * e.loaded / e.total)}% (${gb(e.loaded)} / ${gb(e.total)} GB)`);
      else if (e.status === 'weights' && e.kind === 'tensors') onStatus(/warm|compil|tuning/i.test(e.message || '') ? 'compiling WebGPU kernels…' : `packing weights ${e.loaded || 0} / ${e.total || '?'}`);
      else onStatus(e.message || e.status || 'loading Bonsai 2');
    },
  });
  try { localStorage.setItem(LOADED, '1'); } catch {}
  return { model, queue: Promise.resolve(), unload() { try { model.dispose?.(); } catch {} } };
}

const plain = c => typeof c === 'string' ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

// One turn at a time (the engine leases its single cache); it reuses the
// cached prefix when the next prompt starts the same way.
export function generateBonsai2(engine, _prompt, opts = {}) {
  const run = async () => {
    if (opts.dryRun) return '';
    const messages = (opts.messages || []).map(m => ({ role: m.role, content: plain(m.content) }));
    let text = '';
    for await (const c of engine.model.generate(messages, { maxNewTokens: opts.maxTokens || 256 })) {
      if (c.delta) { text += c.delta; opts.onToken?.(text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart()); }
    }
    return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  };
  const p = engine.queue.then(run, run); engine.queue = p.catch(() => {});
  return p;
}

export const hasBonsai2Cached = () => { try { return localStorage.getItem(LOADED) === '1'; } catch { return false; } };
export async function clearBonsai2Cache() {
  try { localStorage.removeItem(LOADED); } catch {}
  for (const d of await indexedDB.databases?.() || []) if (/bonsai|gguf|kernel/i.test(d.name || '')) indexedDB.deleteDatabase(d.name);
}
