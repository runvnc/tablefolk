/* world-file.js -- a world as a file to share: a picture (PNG) or a .zip,
 * read back by the game and the world builder (drop it on the page, or "open
 * a world file"). Links can be cut short or stripped by chat apps; a file
 * keeps the whole world (its voices and pictures too).
 *
 * The picture: a card (the map or a view, the title, how to open it) with
 * the world inside twice: in a private PNG chunk "tfWd" (deflated JSON),
 * and in the pixels' two low bits of red, green and blue (header "TFW1",
 * length, CRC-32), which survives services that strip metadata but keep the
 * PNG (a lossless re-save). Recompressed to JPEG it is lost: then the .zip.
 *
 * The .zip: world.json, its voices as voices/<id>.ogg and its pictures as
 * media/<n>.<ext> (a "zip:<path>" string in world.json), and a README.txt.
 *
 *   window.tablefolkWorldFile = { toImage(scn, { picture }), toZip(scn), read(file),
 *     pick(), download(blob, name), fileName(scn, ext), isWorldFile(file) }
 */
(function () {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u, c = 0xffffffff) => { for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const deflate = async u => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const inflate = async u => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  const MAGIC = enc.encode('TFW1');
  const fileName = (scn, ext) => (String(scn?.title || 'tablefolk world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world') + '.' + ext;
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const check = scn => { if (!scn || typeof scn !== 'object' || Array.isArray(scn)) throw new Error('no world in it'); return scn; };

  // ---- the picture
  const W = 1200, MIN_H = 675;
  const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('picture')); im.src = url; });
  function wrap(x, text, maxW) { const words = String(text).split(/\s+/), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
  async function toImage(scn, { picture } = {}) {
    check(scn);
    const payload = await deflate(enc.encode(JSON.stringify(scn)));
    const head = new Uint8Array(12), dv = new DataView(head.buffer);
    head.set(MAGIC); dv.setUint32(4, payload.length); dv.setUint32(8, crc32(payload));
    const bits = (head.length + payload.length) * 8, H = Math.max(MIN_H, Math.ceil(bits / 6 / W) + 1);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    // the card: the picture on the right, the words on the left
    x.fillStyle = '#1b1712'; x.fillRect(0, 0, W, H);
    const split = 520;
    if (picture) try { const im = await loadImg(picture), s = Math.max((W - split) / im.width, H / im.height); x.drawImage(im, split + (W - split - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); } catch {}
    const g = x.createLinearGradient(split - 60, 0, split + 80, 0); g.addColorStop(0, '#1b1712'); g.addColorStop(1, 'rgba(27,23,18,0)'); x.fillStyle = g; x.fillRect(split - 60, 0, 140, H);
    x.fillStyle = '#d9ae6f'; x.font = '600 22px system-ui, sans-serif'; x.fillText('TABLEFOLK WORLD', 48, 70);
    x.fillStyle = '#f3ece0'; x.font = '700 46px Georgia, serif'; let y = 130;
    for (const l of wrap(x, scn.title || 'A world', split - 90).slice(0, 3)) { x.fillText(l, 48, y); y += 54; }
    x.fillStyle = '#c9bca8'; x.font = '22px system-ui, sans-serif'; y += 6;
    for (const l of wrap(x, scn.subtitle || scn.intro || '', split - 90).slice(0, 5)) { x.fillText(l, 48, y); y += 30; }
    const who = (scn.agents || []).map(a => a.id).filter(Boolean);
    if (who.length) { y += 14; x.fillStyle = '#a39886'; x.font = '18px system-ui, sans-serif'; for (const l of wrap(x, 'With ' + who.slice(0, 8).join(', ') + (who.length > 8 ? ' and ' + (who.length - 8) + ' more' : ''), split - 90).slice(0, 3)) { x.fillText(l, 48, y); y += 25; } }
    x.fillStyle = '#d9ae6f'; x.font = '600 19px system-ui, sans-serif';
    const foot = ['To play: open tablefolk.world and drop', 'this picture on the page. The whole world', 'is inside it: share the file itself.'];
    foot.forEach((l, i) => x.fillText(l, 48, H - 100 + i * 26));
    // the world in the two low bits of red, green and blue
    const img = x.getImageData(0, 0, W, H), d = img.data, all = new Uint8Array(head.length + payload.length); all.set(head); all.set(payload, head.length);
    let p = 0, ch = 0;
    for (let i = 0; i < all.length; i++) for (let s = 6; s >= 0; s -= 2) { if (ch === 3) { d[p + 3] = 255; p += 4; ch = 0; } d[p + ch] = (d[p + ch] & 0xfc) | ((all[i] >> s) & 3); ch++; }
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    x.putImageData(img, 0, 0);
    const png = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
    // and in a chunk of its own, before IEND
    const chunk = new Uint8Array(12 + payload.length), cv = new DataView(chunk.buffer);
    cv.setUint32(0, payload.length); chunk.set(enc.encode('tfWd'), 4); chunk.set(payload, 8); cv.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
    const end = png.length - 12, out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, end)); out.set(chunk, end); out.set(png.subarray(end), end + chunk.length);
    return new Blob([out], { type: 'image/png' });
  }
  async function fromImage(u, blob) {
    if (u[0] === 0x89 && u[1] === 0x50) {
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      for (let o = 8; o + 12 <= u.length;) { const n = dv.getUint32(o), t = dec.decode(u.subarray(o + 4, o + 8)); if (t === 'tfWd') return JSON.parse(dec.decode(await inflate(u.subarray(o + 8, o + 8 + n)))); if (t === 'IEND') break; o += 12 + n; }
    }
    // no chunk (stripped): the pixels
    let bm; try { bm = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); } catch { throw new Error('not a picture this browser can read'); }
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bm, 0, 0);
    const d = x.getImageData(0, 0, bm.width, bm.height).data;
    let p = 0, ch = 0;
    const bytes = n => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { let b = 0; for (let s = 0; s < 4; s++) { if (ch === 3) { p += 4; ch = 0; } if (p >= d.length) throw new Error('cut short'); b = (b << 2) | (d[p + ch] & 3); ch++; } out[i] = b; } return out; };
    const head = bytes(12), hv = new DataView(head.buffer);
    if (!MAGIC.every((m, i) => head[i] === m)) throw new Error(u[0] === 0xff && u[1] === 0xd8 ? 'this picture was recompressed (as a JPEG) on the way and lost the world inside it: ask for the original file, or the .zip' : 'no world in this picture');
    const n = hv.getUint32(4); if (n > 8e6) throw new Error('no world in this picture');
    const payload = bytes(n); if (crc32(payload) !== hv.getUint32(8)) throw new Error('the world in this picture is damaged (it was changed on the way): ask for the original file, or the .zip');
    return JSON.parse(dec.decode(await inflate(payload)));
  }

  // ---- the .zip
  const EXT = { 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
  const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
  const fromDataUrl = s => { const m = /^data:([^;,]+)(;base64)?,/.exec(s); if (!m) return null; const body = s.slice(m[0].length); return { type: m[1], bytes: m[2] ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : enc.encode(decodeURIComponent(body)) }; };
  const toDataUrl = (bytes, type) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return `data:${type};base64,` + btoa(s); };
  async function toZip(scn) {
    check(scn);
    const files = [], used = new Set();
    let n = 0;
    const take = (s, name) => { const f = fromDataUrl(s); if (!f) return s; let path = name ? `voices/${name}.${EXT[f.type] || 'bin'}` : `media/${++n}.${EXT[f.type] || 'bin'}`; while (used.has(path)) path = path.replace(/(\.\w+)$/, '_' + (++n) + '$1'); used.add(path); files.push({ path, bytes: f.bytes, store: true }); return 'zip:' + path; };
    const walk = (v, key, parent) => {
      if (typeof v === 'string') return v.startsWith('data:') && v.length > 200 ? take(v, key === 'sample' && parent?.id ? String(parent.id).replace(/[^\w-]/g, '_') : null) : v;
      if (Array.isArray(v)) return v.map(x => walk(x, null, v));
      if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x, k, v); return o; }
      return v;
    };
    const light = walk(scn);
    const readme = `${scn.title || 'A Tablefolk world'}\n\nTo play it, open https://tablefolk.world/app/ and drop this .zip on the page\n(or the world builder at https://tablefolk.world/world/ to change it).\n\nworld.json is the world (the scenario format: https://github.com/runvnc/tablefolk);\nits voices and pictures are in voices/ and media/, named there as "zip:<path>".\n`;
    files.unshift({ path: 'world.json', bytes: enc.encode(JSON.stringify(light, null, 2)) }, { path: 'README.txt', bytes: enc.encode(readme) });
    // a plain zip: deflated text, stored media
    const parts = [], central = []; let off = 0;
    const now = new Date(), dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.path), crc = crc32(f.bytes), data = f.store ? f.bytes : await deflate(f.bytes), method = f.store ? 0 : 8;
      const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(8, method, true); v.setUint16(10, dosT, true); v.setUint16(12, dosD, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, f.bytes.length, true); v.setUint16(26, name.length, true); h.set(name, 30);
      const cdr = new Uint8Array(46 + name.length), cv = new DataView(cdr.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, method, true); cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, f.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, off, true); cdr.set(name, 46);
      parts.push(h, data); central.push(cdr); off += h.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0), e = new Uint8Array(22), ev = new DataView(e.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
    return new Blob([...parts, ...central, e], { type: 'application/zip' });
  }
  async function fromZip(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let eo = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('not a zip file');
    const count = dv.getUint16(eo + 10, true), files = new Map(); let o = dv.getUint32(eo + 16, true);
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(o, true) !== 0x02014b50) throw new Error('a damaged zip file');
      const method = dv.getUint16(o + 10, true), size = dv.getUint32(o + 20, true), nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true), lo = dv.getUint32(o + 42, true);
      const name = dec.decode(u.subarray(o + 46, o + 46 + nl)); o += 46 + nl + xl + cl;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      files.set(name, { method, data: u.subarray(start, start + size) });
    }
    const get = async name => { const f = files.get(name); if (!f) return null; if (f.method === 0) return f.data; if (f.method === 8) return inflate(f.data); throw new Error('a zip packed in a way this page cannot read'); };
    // world.json, else the only JSON in it (a folder zipped by hand)
    const jsonName = files.has('world.json') ? 'world.json' : [...files.keys()].filter(n => /\.json$/i.test(n) && !/(^|\/)__MACOSX\//.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!jsonName) throw new Error('no world.json in this zip');
    const root = jsonName.includes('/') ? jsonName.slice(0, jsonName.lastIndexOf('/') + 1) : '';
    const scn = JSON.parse(dec.decode(await get(jsonName)));
    const fill = async v => {
      if (typeof v === 'string' && v.startsWith('zip:')) { const p = v.slice(4), b = await get(root + p) || await get(p); if (!b) return ''; return toDataUrl(b, MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream'); }
      if (Array.isArray(v)) return Promise.all(v.map(fill));
      if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await fill(x); return o; }
      return v;
    };
    return fill(scn);
  }

  // ---- any of them: a picture, a zip, a .json, or a text with a link in it
  async function read(file) {
    const u = new Uint8Array(await file.arrayBuffer());
    if (u[0] === 0x50 && u[1] === 0x4b) return check(await fromZip(u));
    if ((u[0] === 0x89 && u[1] === 0x50) || (u[0] === 0xff && u[1] === 0xd8) || /^image\//.test(file.type)) return check(await fromImage(u, file));
    const text = dec.decode(u).trim();
    const code = text.match(/[#&]s=([A-Za-z0-9_-]+)/)?.[1];
    if (code && window.tablefolkScenario?.decodeScenario) return check(await window.tablefolkScenario.decodeScenario(code));
    if (code) return check(JSON.parse(dec.decode(await inflate(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))))));
    try { return check(JSON.parse(text)); } catch { throw new Error('not a world file (a Tablefolk picture, .zip or .json)'); }
  }
  const isWorldFile = f => !!f && (/\.(png|zip|json|txt)$/i.test(f.name) || /^(image\/png|application\/(zip|x-zip-compressed|json))$/.test(f.type));
  const pick = () => new Promise((res, rej) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.png,.zip,.json,.txt,image/png,application/zip,application/json';
    i.onchange = () => i.files?.[0] ? read(i.files[0]).then(res, rej) : rej(new Error('no file chosen'));
    i.click();
  });

  window.tablefolkWorldFile = { toImage, toZip, read, pick, download, fileName, isWorldFile };
})();
