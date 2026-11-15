// Copy Hugging Face files into the R2 bucket through the throwaway Worker (worker.js), checked
// against Hugging Face's SHA-256 (LFS files) or size (small ones). Skips files already there.
//   WORKER=https://tablefolk-r2-copy.<account>.workers.dev TOKEN=... node copy.mjs list.json
// list.json: [{ "repo": "owner/name", "rev": "<commit>", "dest": "paint/hf/", "include": "<regex>", "exclude": "<regex>" }]
// Files land at <dest><repo>/resolve/<rev>/<path> (Hugging Face's own layout, so a library's
// remote host can point at the mirror).
import { readFileSync } from 'fs';
const { WORKER, TOKEN } = process.env, MIRROR = 'https://geebr-models.mindroot.io/';
const PART = 64 * 1024 * 1024, PAR = 4, UA = { 'user-agent': 'tablefolk-r2-copy/1' };
if (!WORKER || !TOKEN) throw new Error('WORKER and TOKEN');
const call = async (path, body, tries = 4) => {
  for (let i = 1; ; i++) {
    const r = await fetch(WORKER + path, { method: body ? 'POST' : 'GET', headers: { 'x-token': TOKEN, 'content-type': 'application/json', ...UA }, body: body && JSON.stringify(body) }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const d = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
    if (r.ok) return d;
    if (i >= tries) throw new Error(path + ': ' + d.error);
    await new Promise(res => setTimeout(res, 2000 * i));
  }
};
const have = async key => { const r = await fetch(MIRROR + key, { method: 'HEAD', headers: UA }); return r.ok ? Number(r.headers.get('content-length')) : -1; };
let bytes = 0; const t0 = Date.now();
for (const job of JSON.parse(readFileSync(process.argv[2], 'utf8'))) {
  const tree = await (await fetch(`https://huggingface.co/api/models/${job.repo}/tree/${job.rev}?recursive=1`, { headers: UA })).json();
  const files = tree.filter(f => f.type === 'file' && (!job.include || new RegExp(job.include).test(f.path)) && !(job.exclude && new RegExp(job.exclude).test(f.path)));
  for (const f of files) {
    const key = `${job.dest}${job.repo}/resolve/${job.rev}/${f.path}`, src = `https://huggingface.co/${job.repo}/resolve/${job.rev}/${f.path}`, sha = f.lfs?.oid;
    if (await have(key) === f.size) { console.log('have', key); continue; }
    const s = Date.now();
    if (f.size <= PART) {
      const d = await call('/small', { src, key });
      if (d.size !== f.size || (sha && d.sha256 !== sha)) throw new Error(`${key}: got ${d.size} ${d.sha256}, want ${f.size} ${sha}`);
    } else {
      const { uploadId } = await call('/mpu/create', { key }), n = Math.ceil(f.size / PART), parts = new Array(n);
      let next = 0;
      await Promise.all(Array.from({ length: PAR }, async () => { for (let i; (i = next++) < n;) parts[i] = await call('/mpu/part', { src, key, uploadId, part: i + 1, start: i * PART, end: Math.min(f.size, (i + 1) * PART) }); }));
      await call('/mpu/complete', { key, uploadId, parts });
      const v = await call('/verify?key=' + encodeURIComponent(key));
      if (v.size !== f.size || (sha && v.sha256 !== sha)) throw new Error(`${key}: got ${v.size} ${v.sha256}, want ${f.size} ${sha}`);
    }
    bytes += f.size;
    console.log(`put ${key} (${(f.size / 1e6).toFixed(1)} MB${sha ? ', SHA-256 ok' : ''}) in ${((Date.now() - s) / 1000).toFixed(1)} s`);
  }
}
console.log(`done: ${(bytes / 1e9).toFixed(2)} GB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
