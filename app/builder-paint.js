/* builder-paint.js -- pictures for the world builder: signs, paintings,
 * tapestries, notes with a picture and book covers, painted in this browser
 * by @tablefolk/paint (libs/paint). tiny-sd (512 px, ~0.9 GB once) on the
 * graphics card; if the card has no room, Chitra Tiny, then Chitra on the
 * processor (the painting skill's steps). Nothing is sent anywhere.
 *
 *   window.tfPaint.paint(prompt, { kind, onStatus })  -> a JPEG data URL
 *       kind: painting | tapestry | sign | poster (a note) | cover (a book)
 *   window.tfPaint.fromFile(file, { kind })           -> the same from an image file
 *   window.tfPaint.agreed()                           true once the download was agreed
 *
 * The download is asked about once (localStorage 'tablefolk.paintOk', shared
 * with the game's painting skill). Pictures are kept small (JPEG, 320 px)
 * because they travel inside the world's link.
 */
(function () {
  const OK = 'tablefolk.paintOk';
  // what each kind of picture adds to the words (tiny-sd cannot write letters:
  // a sign's name is drawn by the game under its picture)
  const STYLE = {
    painting: ', oil painting, rich colours, detailed brushwork',
    tapestry: ', medieval woven tapestry, embroidered, flat rich colours, ornate border',
    sign: ', emblem for a painted wooden shop sign, simple bold shapes, centered',
    poster: ', ink drawing on old parchment, simple lines',
    cover: ', ornate fantasy book cover illustration, centered emblem',
  };
  const NEGATIVE = 'text, letters, words, writing, watermark, signature, blurry, deformed';
  // output sizes [w, h]: covers are book-shaped, tapestries tall
  const SIZE = { painting: [320, 320], tapestry: [256, 448], sign: [384, 240], poster: [320, 320], cover: [256, 360] };
  let painter = null, loading = null;

  const agreed = () => { try { return localStorage.getItem(OK) === '1'; } catch { return false; } };
  async function consent() {
    if (agreed()) return true;
    const text = 'Pictures are painted by a small image model (tiny-sd) in this browser: a one-time download of about 0.9 GB, kept afterwards. Nothing is sent anywhere. Download it?';
    const yes = await (window.confirmDialog ? window.confirmDialog(text, { title: 'Download the painter?', confirmText: 'download' }) : Promise.resolve(confirm(text)));
    try { localStorage.setItem(OK, yes ? '1' : '0'); } catch {}
    return yes;
  }
  async function getPainter(onStatus, pick) {
    if (painter && !pick) return painter;
    if (loading && !pick) return loading;
    const lib = await import('/libs/paint/index.js');
    pick ||= navigator.gpu ? { model: 'tiny-sd' } : { model: 'chitra', cpu: true };
    loading = lib.createPainter({ ...pick, onStatus: s => onStatus?.(s) })
      .then(p => (painter = p))
      .catch(e => { loading = null; throw e; });
    return loading;
  }
  async function toJpeg(blob, [w, h]) {
    const bmp = await createImageBitmap(blob), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const k = Math.max(w / bmp.width, h / bmp.height), sw = w / k, sh = h / k;
    cv.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.82);
  }
  async function paint(prompt, { kind = 'painting', onStatus = () => {}, seed } = {}) {
    prompt = String(prompt || '').trim(); if (!prompt) throw new Error('nothing to paint');
    if (!(await consent())) throw new Error('the painter was not downloaded');
    let p = await getPainter(onStatus);
    for (;;) {
      try {
        onStatus(`painting with ${p.label}…`);
        const r = await p.paint(prompt + (STYLE[kind] || STYLE.painting), { negative: NEGATIVE, seed, onStep: (d, t) => onStatus(`painting ${d}/${t}`) });
        const url = await toJpeg(r.blob, SIZE[kind] || SIZE.painting);
        URL.revokeObjectURL(r.url);
        window.tablefolkDiag?.note?.('paint', `painted "${prompt.slice(0, 60)}" in ${r.seconds.toFixed(1)} s (${r.model})`);
        return url;
      } catch (e) {
        // the graphics card has no room: tiny-sd -> Chitra -> Chitra on the processor
        if (p.cpu || !/webgpu|buffer|OrtRun|memory|adapter/i.test(e.message)) throw e;
        const next = p.model === 'tiny-sd' ? { model: 'chitra' } : { model: 'chitra', cpu: true };
        onStatus(`${p.label} ran out of graphics memory: trying ${next.cpu ? 'the processor' : 'Chitra Tiny'}`);
        p.unload(); painter = null;
        p = await getPainter(onStatus, next);
      }
    }
  }
  const fromFile = (file, { kind = 'painting' } = {}) => toJpeg(file, SIZE[kind] || SIZE.painting);

  window.tfPaint = { paint, fromFile, agreed, SIZE };
})();
