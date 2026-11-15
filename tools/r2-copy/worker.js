// A throwaway Worker that copies public files (Hugging Face) into the R2 bucket, so nothing
// goes through the maintainer's line (tools/r2-copy/README.md). Deploy, run copy.mjs, delete.
//   POST /small {src, key}                 one request: fetched and put (up to 64 MiB)
//   POST /mpu/create {key}                 -> {uploadId}
//   POST /mpu/part {src, key, uploadId, part, start, end}   bytes [start, end) as part number `part`
//   POST /mpu/complete {key, uploadId, parts: [{partNumber, etag}]}
//   GET  /verify?key=                      -> {size, sha256} (the R2 copy, hashed here)
// Every request needs the header x-token: env.TOKEN.
const UA = { 'user-agent': 'tablefolk-r2-copy/1' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export default {
  async fetch(req, env) {
    if (!env.TOKEN || req.headers.get('x-token') !== env.TOKEN) return json({ error: 'no' }, 403);
    const url = new URL(req.url), b = req.method === 'POST' ? await req.json() : {};
    try {
      if (url.pathname === '/small') {
        const r = await fetch(b.src, { headers: UA }); if (!r.ok) return json({ error: 'source ' + r.status }, 502);
        const buf = await r.arrayBuffer(); await env.BUCKET.put(b.key, buf);
        return json({ size: buf.byteLength, sha256: hex(await crypto.subtle.digest('SHA-256', buf)) });
      }
      if (url.pathname === '/mpu/create') return json({ uploadId: (await env.BUCKET.createMultipartUpload(b.key)).uploadId });
      if (url.pathname === '/mpu/part') {
        const len = b.end - b.start, r = await fetch(b.src, { headers: { ...UA, range: `bytes=${b.start}-${b.end - 1}` } });
        if (r.status !== 206 && !(r.status === 200 && b.start === 0 && Number(r.headers.get('content-length')) === len)) return json({ error: 'source ' + r.status }, 502);
        const fl = new FixedLengthStream(len); r.body.pipeTo(fl.writable);
        const up = env.BUCKET.resumeMultipartUpload(b.key, b.uploadId), p = await up.uploadPart(b.part, fl.readable);
        return json({ partNumber: p.partNumber, etag: p.etag });
      }
      if (url.pathname === '/mpu/complete') { const o = await env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).complete(b.parts); return json({ size: o.size }); }
      if (url.pathname === '/verify') {
        const o = await env.BUCKET.get(url.searchParams.get('key')); if (!o) return json({ error: 'missing' }, 404);
        const d = new crypto.DigestStream('SHA-256'); await o.body.pipeTo(d);
        return json({ size: o.size, sha256: hex(await d.digest) });
      }
      return json({ error: 'unknown' }, 404);
    } catch (e) { return json({ error: String(e?.message || e) }, 500); }
  },
};
