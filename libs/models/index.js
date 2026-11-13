// @tablefolk/models -- what the other @tablefolk libraries share for model
// files: where to download them from (the Tablefolk mirror or Hugging Face),
// a quick reachability probe, workers that load from a CDN, and the
// localStorage keys they keep.
//
// The mirror: Tablefolk keeps byte-identical copies of the models it uses on
// its own Cloudflare R2 bucket (geebr-models.mindroot.io and three more
// hostnames), because Hugging Face can be slow. It is for tablefolk.world:
// pages elsewhere download from Hugging Face, unless they call
// setMirror(true). A few files exist only on the mirror (our own conversions,
// noted where they are listed); those always come from there.
//
//   import { mirrorAllowed, setMirror, sources, firstReachable, workerUrl, configure } from '@tablefolk/models';
//   sources({ mirror: 'https://geebr-models.mindroot.io/x.gguf', hf: 'https://huggingface.co/.../x.gguf' })
//     -> ['https://huggingface.co/...']                 (not on tablefolk.world)
//     -> ['https://geebr-models.mindroot.io/x.gguf', 'https://huggingface.co/...']   (on tablefolk.world)

export const MIRROR_HOSTS = ['geebr-models.mindroot.io', 'geebr-models-2.mindroot.io', 'geebr-models-3.mindroot.io', 'geebr-models-4.mindroot.io'];
export const MIRROR = 'https://' + MIRROR_HOSTS[0] + '/';
const TABLEFOLK_SITE = /(^|\.)tablefolk\.world$/i;

let mirrorOverride = null;
// true / false forces it; null goes back to the rule (tablefolk.world only)
export function setMirror(on) { mirrorOverride = on == null ? null : !!on; }
export function mirrorAllowed(hostname = globalThis.location?.hostname || '') {
  return mirrorOverride ?? TABLEFOLK_SITE.test(hostname);
}

// The URLs to try for a file, in order. `mirror` alone (a file only we host)
// is always returned; `hf` alone too.
export function sources({ mirror, hf } = {}, allowed = mirrorAllowed()) {
  if (mirror && hf) return allowed ? [mirror, hf] : [hf];
  return [mirror || hf].filter(Boolean);
}

// Is this URL answering? (one byte, no caching)
export async function reachable(url, timeoutMs = 8000) {
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout?.(timeoutMs) });
    await r.body?.cancel();
    return r.ok;
  } catch { return false; }
}
// The first of urls that answers (the last one is not probed: it is the fallback)
export async function firstReachable(urls) {
  for (const u of urls.slice(0, -1)) if (await reachable(u)) return u;
  return urls[urls.length - 1];
}

// A worker script next to a library module. Same origin: its own URL (a
// shared worker then matches across pages). From a CDN: browsers refuse
// cross-origin workers, so a small same-origin blob loads it.
export function workerUrl(url, { module = true } = {}) {
  const u = new URL(url, globalThis.location?.href);
  if (!globalThis.location || u.origin === globalThis.location.origin) return u.href;
  const src = module ? `import ${JSON.stringify(u.href)};` : `importScripts(${JSON.stringify(u.href)});`;
  return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
}
export function createWorker(url, { module = true, name } = {}) {
  return new Worker(workerUrl(url, { module }), { type: module ? 'module' : 'classic', name });
}

// ---- settings kept in the browser: localStorage keys start with a prefix
// ('tablefolk' by default, which the Tablefolk game relies on); another app
// can name its own, or give a storage object (getItem/setItem/removeItem).
let prefix = 'tablefolk', storage = null;
export function configure(opts = {}) {
  if (opts.prefix != null) prefix = String(opts.prefix);
  if (opts.storage !== undefined) storage = opts.storage;
  if (opts.mirror !== undefined) setMirror(opts.mirror);
}
const store = () => storage || globalThis.localStorage || null;
export const key = name => prefix + name;
export const local = {
  get(name) { try { return store()?.getItem(key(name)) ?? null; } catch { return null; } },
  set(name, value) { try { store()?.setItem(key(name), value); } catch {} },
  remove(name) { try { store()?.removeItem(key(name)); } catch {} },
  json(name, fallback = null) { try { return JSON.parse(this.get(name) || 'null') ?? fallback; } catch { return fallback; } },
  setJson(name, value) { this.set(name, JSON.stringify(value)); },
};

// ---- a small event bus each library reports on (status lines, choices and
// why): listen with on(fn); the Tablefolk game forwards them to its
// diagnostics pane.  fn({ lib, topic, text, ...extra })
const listeners = new Set();
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function note(lib, text, extra = {}) {
  for (const fn of listeners) { try { fn({ lib, text, ...extra }); } catch {} }
}
