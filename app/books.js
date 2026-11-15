/* books.js -- books characters read from: a knowledge base (a PDF or a text
 * file, cut into passages, with EmbeddingGemma vectors) that lives in the
 * scenario, is an item in someone's pack (its name is the book's title, so
 * give, take, chests and trades move it like any item) or a book on the
 * floor, and is drawn with its own cover and spine.
 *
 * Scenario:
 *   "books": { "herbal": { "title": "Herbal of the North", "author": "", "about": "healing plants",
 *               "cover": "<image URL or data URL>", "spine": "<image>", "color": "#6b2d2d",
 *               "chunks": ["passage", ...], "vectors": "<base64 int8, dim per passage>", "dim": 256,
 *               "model": "embeddinggemma-2", "source": "herbal.pdf" } }
 *   agent "readsBooks": true      answers from the books it carries
 *   agent "inventory": { "items": ["Herbal of the North"] }, or an object
 *   { "type": "book", "book": "herbal", "x": 2, "z": 1 } on the floor.
 *
 * A reader's turn (llm_js/world-integration.js): what was just said to it
 * (the player or another character) is the query; every book it carries is
 * searched by keywords (BM25) and by meaning (the passage vectors), the two
 * lists fused (reciprocal rank), the best eight re-ranked by a cross-encoder
 * (ms-marco MiniLM, embed-worker.js) whose score also decides whether a
 * passage is about the question at all, and the passages that pass go right
 * after the speech: "Your book "X" says about this: ...".
 * No vectors yet (a hand-written book) or no embedding model: keywords only,
 * and the vectors are worked out in the background once the model is ready.
 *
 * The world builder (builder.js) uses the same file without the game:
 * extract(file), chunk(text), embedDocs(chunks), encode(vectors), image().
 *
 *   window.tablefolkBooks.load(books)        scenario.js, at the start
 *   window.tablefolkBooks.prepare(g, cfg)    before a turn: search
 *   window.tablefolkBooks.urgentLines(g)     after the speech in the prompt
 *   window.tablefolkBooks.search(book, query) -> [{ i, text, score }]
 *   window.tablefolkBooks.make(scene, x, z, opts)   app.js makeObject('book', ...)
 */
(function () {
  const DIM = 256, MODEL = 'embeddinggemma-2', CE_PASS = -1;
  const STOP = new Set('the and you your for are was were with that this have has had not but what who how why where when can will would could should about there their them they then than its it\'s i\'m me my mine our out all any some just very much more most into from over under also only does did doing been being here like want wants know think tell said says say yes okay please thanks hello hey book does which these those such each other one two use used using make made may might must shall upon onto off his her him she himself herself itself whose whom while because so too again further once same own both few nor'.split(' '));
  let books = {};            // id -> book (with .vec: Float32Array[], .idx: keyword index)
  const found = new Map();   // agent id -> { q, hits: [{ book, text }] }

  // ---- words ----
  const stem = w => {
    if (w.length < 5) return w;
    if (/ies$/.test(w)) w = w.slice(0, -3) + 'y'; else if (/(sses|xes|ches|shes|zes)$/.test(w)) w = w.slice(0, -2); else if (/[^su]s$/.test(w)) w = w.slice(0, -1);
    if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3); else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2);
    return w;
  };
  const terms = t => String(t || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).map(w => w.replace(/'s$|'/g, '')).filter(w => w.length > 2 && !STOP.has(w)).map(stem);

  // ---- cutting a text into passages (~110 words, whole sentences, one sentence of overlap) ----
  function chunk(text, size = 110) {
    const clean = String(text || '').replace(/\r/g, '').replace(/-\n(?=[a-z])/g, '').replace(/[ \t]+/g, ' ');
    const paras = clean.split(/\n\s*\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
    const sents = [];
    for (const p of paras) { const ss = p.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [p]; ss.forEach((s, j) => { s = s.trim(); if (s) sents.push({ s, start: j === 0 }); }); }
    const out = []; let cur = [], n = 0;
    const wc = s => s.split(/\s+/).length;
    for (const { s } of sents) {
      // a very long "sentence" (a table, a list without stops) is cut by words
      if (wc(s) > size * 1.5) { if (cur.length) out.push(cur.join(' ')); cur = []; n = 0; const w = s.split(/\s+/); for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(' ')); continue; }
      if (n + wc(s) > size && cur.length) { out.push(cur.join(' ')); const last = cur[cur.length - 1]; cur = wc(last) < size / 3 ? [last] : []; n = cur.length ? wc(last) : 0; }
      cur.push(s); n += wc(s);
    }
    if (cur.length) out.push(cur.join(' '));
    return out.filter(c => c.replace(/\W/g, '').length > 20);
  }

  // ---- text out of a file (PDF through pdf.js, else plain text) ----
  async function extract(file, onProgress) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        let s = ''; for (const it of tc.items) { s += it.str; s += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : ''); }
        pages.push(s.replace(/\n{2,}/g, '\n\n')); onProgress?.(p / doc.numPages);
      }
      // a line that ends a sentence and starts the next with a capital is a paragraph break
      return pages.join('\n\n').replace(/([.!?:])\n(?=[A-Z])/g, '$1\n\n');
    }
    return await file.text();
  }

  // ---- vectors: int8, one scale per passage (re-normalised when read) ----
  function encode(vecs) {
    const out = new Int8Array(vecs.length * DIM);
    vecs.forEach((v, i) => { let m = 1e-9; for (let k = 0; k < DIM; k++) m = Math.max(m, Math.abs(v[k])); for (let k = 0; k < DIM; k++) out[i * DIM + k] = Math.round(v[k] / m * 127); });
    let s = ''; const b = new Uint8Array(out.buffer); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function decode(b64, dim = DIM) {
    const bin = atob(b64), b = new Int8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = (bin.charCodeAt(i) << 24) >> 24;
    const out = [];
    for (let i = 0; i + dim <= b.length; i += dim) { const v = new Float32Array(dim); let n = 0; for (let k = 0; k < dim; k++) { v[k] = b[i + k]; n += v[k] * v[k]; } n = Math.sqrt(n) || 1; for (let k = 0; k < dim; k++) v[k] /= n; out.push(v); }
    return out;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  // ---- the embedding model: the game's (embed.js), or a worker of our own in the builder ----
  const D = t => 'title: none | text: ' + t, Q = t => 'task: search result | query: ' + t;
  let own = null, ownSeq = 0; const ownWait = new Map();
  function ownWorker(onProgress) {
    if (own) return own.ready;
    const w = new Worker(new URL('/app/embed-worker.js?v=20261115a', location.href), { type: 'module' });
    own = { w, ready: null };
    own.ready = new Promise(res => {
      w.onmessage = e => {
        const d = e.data;
        if (d.type === 'progress') { onProgress?.(d.total ? d.loaded / d.total : 0); return; }
        if (d.type === 'ready') return res(true);
        if (d.type === 'error') return res(false);
        const p = ownWait.get(d.id); if (p) { ownWait.delete(d.id); d.error ? p.reject(new Error(d.error)) : p.resolve(d.vectors); }
      };
      w.onerror = () => res(false);
      w.postMessage({ type: 'load' });
    });
    return own.ready;
  }
  async function rawVectors(texts) {
    const E = window.tablefolkEmbed;
    if (E?.vectors && E.state === 'ready') return E.vectors(texts);
    if (!own) return null;
    if (!await own.ready) return null;
    return new Promise((resolve, reject) => { const id = ++ownSeq; ownWait.set(id, { resolve, reject }); own.w.postMessage({ id, texts }); });
  }
  // the builder: every passage, 16 at a time
  async function embedDocs(chunks, onProgress, onModel) {
    if (!(window.tablefolkEmbed?.state === 'ready') && !await ownWorker(onModel)) throw new Error('could not load the embedding model');
    const out = [];
    for (let i = 0; i < chunks.length; i += 16) { const v = await rawVectors(chunks.slice(i, i + 16).map(D)); if (!v) throw new Error('the embedding model stopped'); out.push(...v); onProgress?.(out.length / chunks.length); }
    return out;
  }

  // ---- the books of this world ----
  function load(defs) {
    books = {}; found.clear();
    for (const [id, b] of Object.entries(defs && typeof defs === 'object' ? defs : {})) {
      if (!b || !Array.isArray(b.chunks) || !b.title) continue;
      const bk = { ...b, id, chunks: b.chunks.map(String) };
      try { if (b.vectors && (b.dim || DIM) === DIM && (!b.model || b.model === MODEL)) bk.vec = decode(b.vectors); if (bk.vec && bk.vec.length !== bk.chunks.length) bk.vec = null; } catch { bk.vec = null; }
      books[id] = bk;
    }
  }
  const all = () => Object.values(books);
  const byName = name => { const n = String(name || '').toLowerCase().trim(); return all().find(b => b.title.toLowerCase() === n || b.id.toLowerCase() === n) || null; };
  function heldBy(g) {
    if (typeof getBrainConfig !== 'function') return [];
    const items = getBrainConfig(g.id)?.inventory?.items || [], out = new Set();
    for (const it of items) { const b = byName(typeof it === 'string' ? it : it?.name); if (b && (it.qty ?? 1) > 0) out.add(b); }
    // a book it is carrying in its arms
    const held = state.held?.get?.(g.id), hb = held && meta(held)?.opts?.book; if (hb && books[hb]) out.add(books[hb]);
    return [...out];
  }
  const reads = cfg => cfg && (cfg.readsBooks === true || cfg.readsBooks === 'true');

  // keyword index (BM25), built once per book
  function index(b) {
    if (b.idx) return b.idx;
    const docs = b.chunks.map(c => { const tf = new Map(), ts = terms(c); for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1); return { tf, len: ts.length }; });
    const df = new Map(); for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return b.idx = { docs, df, avg: docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1) };
  }
  function bm25(b, qt) {
    const { docs, df, avg } = index(b), N = docs.length, k1 = 1.2, bb = .75;
    return docs.map(d => { let s = 0; for (const t of qt) { const f = d.tf.get(t); if (!f) continue; const idf = Math.log(1 + (N - df.get(t) + .5) / (df.get(t) + .5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - bb + bb * d.len / avg)); } return s; });
  }
  const coverage = (text, qt) => { if (!qt.length) return 0; const have = new Set(terms(text)); return qt.filter(t => have.has(t)).length / qt.length; };

  // Search one book: keywords and meaning, fused, re-ranked. Each hit: { i, text, score }.
  async function search(b, query, k = 3, opts = {}) {
    const qt = [...new Set(terms(query))];
    const kw = bm25(b, qt), N = b.chunks.length;
    const E = window.tablefolkEmbed, semantic = !!(b.vec && E?.state === 'ready' && E.vectors);
    let cos = null, mu = 0, sd = 1, qv = null;
    if (semantic) {
      try { [qv] = await E.vectors([Q(query)]); } catch {}
      if (qv) {
        cos = b.vec.map(v => dot(qv, v));
        if (N >= 8) { mu = cos.reduce((a, c) => a + c, 0) / N; sd = Math.max(.02, Math.sqrt(cos.reduce((a, c) => a + (c - mu) ** 2, 0) / N)); } else { mu = .55; sd = .06; }
      }
    }
    // reciprocal rank fusion of the two lists (top 40 of each)
    const rrf = new Map(), add = (order, w = 1) => order.slice(0, 40).forEach((i, r) => rrf.set(i, (rrf.get(i) || 0) + w / (60 + r)));
    add([...kw.keys()].filter(i => kw[i] > 0).sort((x, y) => kw[y] - kw[x]));
    if (cos) add([...cos.keys()].sort((x, y) => cos[y] - cos[x]));
    const cands = [...rrf.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([i]) => i);
    if (!cands.length) return [];
    // re-rank: a cross-encoder reads the question with each passage (embed-worker.js);
    // its logit is also the gate (> CE_PASS, or well above the other candidates)
    let ce = null;
    if (E?.rerank && E.state === 'ready' && opts.rerank !== false) { try { ce = await E.rerank(query, cands.map(i => b.chunks[i])); } catch (e) { console.warn('[books] rerank', e); } }
    // indirect questions ("my son broke his arm" -> the comfrey passage) score low
    // (-9 .. -3) but stand clear of the rest (-11): measured in books-test.mjs
    const ceMid = ce ? [...ce].sort((x, y) => x - y)[Math.floor(ce.length / 2)] : 0;
    const hits = cands.map((i, j) => {
      const c = cos ? cos[i] : 0, zc = cos ? (c - mu) / sd : 0, cov = coverage(b.chunks[i], qt), x = ce ? ce[j] : null;
      // without the cross-encoder: close in meaning (EmbeddingGemma at 256 numbers:
      // passages about the question .70-.89, small talk below .65) or holding most of its words
      const pass = x != null ? x > CE_PASS || c >= .8 || (x > -9.6 && x - ceMid >= 1.4 && c >= .66) : cos ? (c >= .70 && zc >= 1.2) || (c >= .66 && cov >= .5) || c >= .78 : cov >= .5 && kw[i] > 1;
      const score = x != null ? x + .5 * zc : cos ? zc + 1.5 * cov : kw[i] / 4 + 2 * cov;
      return { i, text: b.chunks[i], score, pass, cos: +c.toFixed(3), zc: +zc.toFixed(2), cov: +cov.toFixed(2), ce: x == null ? null : +x.toFixed(2) };
    }).filter(h => h.pass || opts.all).sort((x, y) => y.score - x.score);
    return hits.slice(0, k);
  }

  // what was just said to it: the speech lines waiting for its turn
  function heardNow(cfg) {
    const lines = (cfg.pendingChat || []).map(l => String(l).match(/^(.+?)\s+says:\s*(.*)$/)).filter(Boolean).map(m => m[2]);
    return lines.slice(-2).join(' ').trim();
  }
  async function prepare(g, cfg) {
    cfg ||= getBrainConfig(g.id);
    if (!reads(cfg)) return;
    const mine = heldBy(g), q = heardNow(cfg);
    if (!mine.length || !q || !terms(q).length) { found.delete(g.id); return; }
    const E = window.tablefolkEmbed;
    if (E && E.state !== 'ready' && E.state !== 'off') E.start?.();
    if (E?.state === 'ready') for (const b of mine) if (!b.vec) fillVectors(b);
    const tierK = { basic: 2, capable: 3, ambitious: 4 }[window.tablefolkMind?.tier?.(g)] || 2;
    const per = await Promise.all(mine.map(b => search(b, q, tierK).then(hs => hs.map(h => ({ ...h, book: b }))).catch(() => [])));
    const hits = per.flat().sort((x, y) => y.score - x.score).slice(0, tierK);
    found.set(g.id, { q, hits });
    window.tablefolkDiag?.note?.('books', `${g.id} looked up "${q.slice(0, 60)}": ${hits.length ? hits.map(h => `${h.book.title} #${h.i}`).join(', ') : 'nothing that fits'}`);
  }
  // passages longer than this are cut at a sentence (small prompts)
  const clip = (t, n = 700) => t.length <= n ? t : t.slice(0, n).replace(/[^.!?]*$/, '') || t.slice(0, n);
  function urgentLines(g) {
    const f = found.get(g.id); if (!f?.hits.length) return [];
    found.delete(g.id);
    const by = new Map(); for (const h of f.hits) (by.get(h.book) || by.set(h.book, []).get(h.book)).push(h);
    return [...by.entries()].map(([b, hs]) => `Your book "${b.title}"${b.author ? ' by ' + b.author : ''} says about this: ${hs.sort((x, y) => x.i - y.i).map(h => '"' + clip(h.text) + '"').join(' ... ')} Answer from it, in your own words and in character; say so if it does not cover the question.`);
  }
  // a hand-written book without vectors: worked out once the model is ready (16 at a time)
  async function fillVectors(b) {
    if (b.vec || b.filling) return; b.filling = true;
    try { const out = []; for (let i = 0; i < b.chunks.length; i += 16) { const v = await window.tablefolkEmbed.vectors(b.chunks.slice(i, i + 16).map(D)); if (!v) return; out.push(...v); } b.vec = out; }
    catch (e) { console.warn('[books] vectors', e); } finally { b.filling = false; }
  }

  // ---- pictures: a file downscaled to a JPEG data URL (cover 256x360, spine 64x360) ----
  function image(file, w = 256, h = 360) {
    return new Promise((res, rej) => {
      const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const s = Math.max(w / img.width, h / img.height); x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', .82)); };
      img.onerror = () => rej(new Error('not an image')); img.src = URL.createObjectURL(file);
    });
  }

  // ---- the book in 3D: the catalogue book's size, with this book's cover, back and spine ----
  // Stands upright like the catalogue book (w: thickness along x, h tall, d deep); the
  // covers face +x and -x, the spine +z.
  function face(scene, name, w, h, draw) {
    const tex = new BABYLON.DynamicTexture(name, { width: Math.round(256 * Math.min(1, w / h) * 2) || 64, height: 512 }, scene, true);
    const ctx = tex.getContext(), W = tex.getSize().width, H = tex.getSize().height;
    draw(ctx, W, H, () => tex.update()); tex.update();
    const mat = new BABYLON.StandardMaterial(name + '_m', scene); mat.diffuseTexture = tex; mat.specularColor = new BABYLON.Color3(.06, .06, .06); mat.emissiveColor = new BABYLON.Color3(.3, .3, .3);   // the art still reads on the shaded side
    const p = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h }, scene); p.material = mat; p.isPickable = false;
    return p;
  }
  function picture(ctx, W, H, src, done, fallback) {
    fallback();
    if (!src) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { const tall = img.height >= img.width, wantTall = H >= W; ctx.save(); if (tall !== wantTall && W !== H) { ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, -H / 2, -W / 2, H, W); } else ctx.drawImage(img, 0, 0, W, H); ctx.restore(); done(); };
    img.src = src;
  }
  function make(scene, x, z, opts = {}) {
    const b = books[opts.book] || byName(opts.name); if (!b || typeof makePropProxy !== 'function') return null;
    const base = ITEM_CATALOG?.book?.[1] || { w: .08, h: .3, d: .22 };
    const w = base.w * 1.4, h = base.h, d = base.d;
    const proxy = makePropProxy(scene, 'book', { ...base, w, type: 'book', x, z, ry: opts.ry || 0, y: (state.terrainTopY ?? 0) + (typeof floorLiftAt === 'function' ? floorLiftAt(x, z) : 0) + h / 2 });
    const color = /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : '#6b2d2d';
    const pages = BABYLON.MeshBuilder.CreateBox('book_pages', { width: w * .9, height: h * .96, depth: d * .97 }, scene);
    const pm = new BABYLON.StandardMaterial('book_pages_m', scene); pm.diffuseColor = new BABYLON.Color3(.93, .89, .78); pm.specularColor = new BABYLON.Color3(0, 0, 0); pages.material = pm; pages.parent = proxy; pages.position.z = -d * .015; pages.isPickable = false;
    const titleArt = (ctx, W, H, big) => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(230,200,120,.8)'; ctx.lineWidth = Math.max(2, W / 60); ctx.strokeRect(W * .06, H * .04, W * .88, H * .92); ctx.fillStyle = '#f0dca0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (big) { const words = b.title.split(/\s+/), lines = []; let l = ''; ctx.font = `bold ${Math.round(W / 9)}px Georgia, serif`; for (const wd of words) { if (ctx.measureText(l + ' ' + wd).width > W * .78 && l) { lines.push(l); l = wd; } else l = (l ? l + ' ' : '') + wd; } lines.push(l); lines.forEach((t, i) => ctx.fillText(t, W / 2, H * .3 + i * W / 7.5)); if (b.author) { ctx.font = `${Math.round(W / 14)}px Georgia, serif`; ctx.fillText(b.author, W / 2, H * .82); } }
      else { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI / 2); ctx.font = `bold ${Math.round(W * .45)}px Georgia, serif`; ctx.fillText(b.title.slice(0, 40), 0, 0, H * .9); ctx.restore(); } };
    const front = face(scene, 'book_cover', d, h, (ctx, W, H, done) => picture(ctx, W, H, b.cover, done, () => titleArt(ctx, W, H, true)));
    front.parent = proxy; front.rotation.y = -Math.PI / 2; front.position.x = w / 2 + .001;
    const back = face(scene, 'book_back', d, h, (ctx, W, H) => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); });
    back.parent = proxy; back.rotation.y = Math.PI / 2; back.position.x = -w / 2 - .001;
    const spine = face(scene, 'book_spine', w, h, (ctx, W, H, done) => picture(ctx, W, H, b.spine, done, () => titleArt(ctx, W, H, false)));
    spine.parent = proxy; spine.rotation.y = Math.PI; spine.position.z = d / 2 + .001;
    const mm = meta(proxy); mm.opts = { ...(mm.opts || {}), book: b.id, name: b.title }; mm.ownsMaterial = true;
    return proxy;
  }

  window.tablefolkBooks = { load, all, byName, heldBy, reads, prepare, urgentLines, search, chunk, extract, encode, decode, embedDocs, image, make, terms, DIM, MODEL, get books() { return books; } };
})();
