/* tabletop.js -- ?tabletop=1: the board from straight above, for a
 * tabletop role-playing game, printed or shown on a screen laid flat.
 *
 *   /app/?tabletop=1#s=<scenario>
 *
 * - An orthographic camera looking straight down (north up), the whole board
 *   in view at the screen's full resolution; plain bright light, no shadows,
 *   fog or post effects (preflight.js / graphics-settings.js / app.js).
 * - Name labels under the characters, a square grid, and a list to show or
 *   hide each character (a game master can keep the monsters hidden).
 * - Save PNG at a chosen size per square, and print at one inch per square
 *   (tiled over pages) or fitted to one page.
 * - Move things: drag a character or object to another square, R turns the
 *   selected one, Delete removes it. "Use this layout" sends the scenario with
 *   every position fixed (tablefolkScenario.freezeLayout) to the world
 *   builder that opened this page in a frame (postMessage
 *   {type:'tablefolk-layout', scenario}); opened on its own it downloads it.
 * Game input is off: nobody walks, fights or takes turns here.
 */
(function () {
  if (!window.TABLEFOLK_TABLETOP) return;
  const W = () => window.tablefolk;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const embedded = window.parent !== window;
  // outside: what shows where there is no floor (the sea around a dungeon):
  // paper (saves ink), black, or the sea as rendered
  const opt = { grid: true, labels: true, bright: true, outside: 'paper', edit: false, hidden: new Set() };
  const OUTSIDE = { paper: '#f3eee3', black: '#111214' };
  try { const h = JSON.parse(localStorage.getItem('tablefolk.tabletop') || '{}'); for (const k of ['grid', 'labels', 'bright']) if (typeof h[k] === 'boolean') opt[k] = h[k]; if (h.outside) opt.outside = h.outside; } catch {}
  const saveOpts = () => { try { localStorage.setItem('tablefolk.tabletop', JSON.stringify({ grid: opt.grid, labels: opt.labels, bright: opt.bright, outside: opt.outside })); } catch {} };
  let cam = null, view = null, overlay = null, sel = null, drag = null, edited = false, flat = null, origLight = null;
  document.documentElement.classList.add('tabletop');

  // ---- the camera: straight down, north up (board +z is south, +x west) ----
  function bounds() { const { cols, rows } = W().WORLD; return { cols, rows, cx: 0, cz: 0 }; }
  function fit(cw, ch, margin = .6) {
    const b = bounds(), bw = b.cols + margin * 2, bh = b.rows + margin * 2, aspect = cw / ch;
    let hw = bw / 2, hh = bh / 2;
    if (bw / bh > aspect) hh = hw / aspect; else hw = hh * aspect;
    return { ...b, hw, hh, cw, ch };
  }
  function setCam(v) {
    view = v;
    cam.orthoLeft = -v.hw; cam.orthoRight = v.hw; cam.orthoTop = v.hh; cam.orthoBottom = -v.hh;
    cam.position.set(v.cx, 60, v.cz);
  }
  // world <-> pixels of a view (screen right is -x, screen down is +z)
  const toPx = (v, x, z) => [(v.hw - (x - v.cx)) / (2 * v.hw) * v.cw, (v.hh + (z - v.cz)) / (2 * v.hh) * v.ch];
  const toWorld = (v, px, py) => [v.cx + v.hw - px / v.cw * 2 * v.hw, v.cz + py / v.ch * 2 * v.hh - v.hh];

  function setup() {
    const w = W(), st = w.state, scene = st.scene, engine = scene.getEngine();
    try { st.camera.detachControl(); } catch {}
    cam = new BABYLON.FreeCamera('tabletopCam', new BABYLON.Vector3(0, 60, 0), scene);
    cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA; cam.rotation.set(Math.PI / 2, Math.PI, 0); cam.minZ = .5; cam.maxZ = 200;
    scene.activeCamera = cam;
    engine.setHardwareScalingLevel(1 / Math.min(3, devicePixelRatio || 1));
    overlay = document.createElement('canvas'); overlay.id = 'ttOverlay'; document.body.appendChild(overlay);
    buildBar();
    origLight = st.lighting || 'bright';
    const resize = () => {
      const top = document.fullscreenElement ? 0 : $('ttBar').offsetHeight;
      document.documentElement.style.setProperty('--tt-top', top + 'px');
      engine.resize(); const c = engine.getRenderingCanvas(); setCam(fit(c.clientWidth, c.clientHeight)); draw();
    };
    addEventListener('resize', () => setTimeout(resize, 30));
    document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));
    resize();
    look();
    // characters' idle animations keep the labels where they are: redraw a few times a second
    setInterval(draw, 500);
  }
  function look() {
    const w = W(), scene = w.state.scene;
    // bright: the scenario's bright light plus an even light from above, so
    // the corners of a printed map are as readable as the middle
    w.setLighting?.(opt.bright ? 'bright' : origLight);
    if (!flat) { flat = new BABYLON.HemisphericLight('tabletopFlat', new BABYLON.Vector3(0, 1, 0), scene); flat.groundColor = new BABYLON.Color3(.35, .35, .35); }
    flat.intensity = opt.bright ? .55 : 0; flat.setEnabled(opt.bright);
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
    for (const g of chars()) g.root?.setEnabled(!opt.hidden.has(g.id));
    draw();
  }
  function chars() { const w = W(), av = w.getPlayerAvatar?.(); return [...w.getAgents(), ...(av ? [av] : [])]; }
  const nameOf = g => g === W().getPlayerAvatar?.() ? (window.tablefolkScenario?.active?.scn?.player?.name || 'you') : g.id;
  const posOf = g => g.logicalPos || g.root.position;
  function isHostile(g) { try { return !!window.tablefolkPlay?.isHostile(g); } catch { return false; } }

  // ---- overlay: grid, labels, selection ----
  function paintOverlay(ctx, v, scale) {
    const b = v, w = W(), x0 = -(b.cols - 1) / 2, z0 = -(b.rows - 1) / 2;
    const ground = []; for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) { const x = x0 + i, z = z0 + j; if (w.hasGroundAt(x, z)) ground.push([x, z]); }
    const sq = (x, z) => { const [px, py] = toPx(v, x + .5, z - .5); return [px, py, scale, scale]; };
    if (OUTSIDE[opt.outside]) {
      // everything that is not floor: the margin and the sea cells
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, v.cw, v.ch);
      for (const [x, z] of ground) { const [px, py] = sq(x, z); ctx.rect(px + scale, py, -scale - .5, scale + .5); }
      ctx.fillStyle = OUTSIDE[opt.outside]; ctx.fill('evenodd'); ctx.restore();
    }
    if (opt.grid) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, scale * .012);
      ctx.beginPath(); for (const [x, z] of ground) { const [px, py] = sq(x, z); ctx.rect(px, py, scale, scale); } ctx.stroke();
    }
    if (opt.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = Math.max(10, scale * .26); ctx.font = `700 ${fs}px system-ui, sans-serif`;
      for (const g of chars()) {
        if (opt.hidden.has(g.id) || g.defeated || !g.root) continue;
        const p = posOf(g), [px, py] = toPx(v, p.x, p.z + .42), name = nameOf(g), tw = ctx.measureText(name).width + fs * .7, th = fs * 1.35;
        ctx.fillStyle = g === W().getPlayerAvatar?.() ? 'rgba(120,90,10,.88)' : isHostile(g) ? 'rgba(130,24,20,.88)' : 'rgba(20,24,30,.85)';
        roundRect(ctx, px - tw / 2, py - th / 2, tw, th, th / 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(name, px, py + 1);
      }
    }
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw() {
    if (!overlay || !view) return;
    const dpr = Math.min(3, devicePixelRatio || 1);
    overlay.width = Math.round(view.cw * dpr); overlay.height = Math.round(view.ch * dpr);
    const ctx = overlay.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.cw, view.ch);
    paintOverlay(ctx, view, view.cw / (2 * view.hw));
    if (opt.edit) {
      const cell = view.cw / (2 * view.hw);
      const box = (x, z, color, dash) => { const [px, py] = toPx(view, x, z); ctx.setLineDash(dash ? [6, 4] : []); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(px - cell / 2, py - cell / 2, cell, cell); ctx.setLineDash([]); };
      if (sel) box(sel.x, sel.z, '#ffd34d');
      if (drag?.to) box(drag.to[0], drag.to[1], '#7fe08a', true);
    }
  }

  // ---- export: PNG and print ----
  async function render(ppc) {
    const w = W(), scene = w.state.scene, engine = scene.getEngine(), b = bounds();
    const max = engine.getCaps().maxTextureSize || 8192;
    ppc = Math.max(20, Math.min(ppc, Math.floor(max / Math.max(b.cols, b.rows))));
    const width = b.cols * ppc, height = b.rows * ppc, v = { ...b, hw: b.cols / 2, hh: b.rows / 2, cw: width, ch: height };
    const keep = view; setCam(v);
    let url;
    try { url = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(engine, cam, { width, height }, 'image/png', 4, true); }
    finally { setCam(keep); }
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
    paintOverlay(ctx, v, ppc);
    return { canvas: c, ppc };
  }
  const fileName = ext => (window.tablefolkScenario?.active?.scn?.title || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + ext;
  async function savePng() {
    status('rendering…');
    const { canvas, ppc } = await render(+$('ttPpc').value || 150);
    canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(`-${ppc}px.png`); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
    status(`saved ${canvas.width}×${canvas.height} (${ppc} px per square)`);
  }
  // One inch per square, tiled over letter pages (7.5 x 10 in printable),
  // or the whole map fitted to one page.
  async function print(fitPage) {
    const win = window.open('', '_blank'); if (!win) { status('allow pop-ups to print'); return; }
    win.document.write('<p style="font:14px system-ui">rendering the map…</p>');
    status('rendering…');
    const b = bounds(), { canvas, ppc } = await render(fitPage ? 200 : 150);
    const land = b.cols > b.rows, pw = land ? 10 : 7.5, ph = land ? 7.5 : 10;
    const pages = [];
    if (fitPage) pages.push({ src: canvas.toDataURL('image/png'), w: Math.min(pw, ph * b.cols / b.rows), label: '' });
    else {
      const tc = Math.floor(pw), tr = Math.floor(ph), nx = Math.ceil(b.cols / tc), ny = Math.ceil(b.rows / tr);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cw = Math.min(tc, b.cols - i * tc), chh = Math.min(tr, b.rows - j * tr), t = document.createElement('canvas');
        t.width = cw * ppc; t.height = chh * ppc;
        t.getContext('2d').drawImage(canvas, i * tc * ppc, j * tr * ppc, cw * ppc, chh * ppc, 0, 0, cw * ppc, chh * ppc);
        pages.push({ src: t.toDataURL('image/png'), w: cw, label: nx * ny > 1 ? `page ${String.fromCharCode(65 + j)}${i + 1} of ${ny} rows × ${nx} columns` : '' });
      }
    }
    const title = esc(window.tablefolkScenario?.active?.scn?.title || 'map');
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: letter ${land ? 'landscape' : 'portrait'}; margin: .5in; }
      body { margin: 0; font: 9pt system-ui, sans-serif; color: #444; }
      .pg { page-break-after: always; break-after: page; } .pg:last-child { page-break-after: auto; break-after: auto; }
      img { display: block; } .tip { margin: 0 0 4pt; } @media screen { body { padding: 16px; background: #888; } .pg { background: #fff; padding: 8px; margin-bottom: 16px; display: inline-block; } }
      </style></head><body>
      ${pages.map(p => `<div class="pg">${p.label ? `<div class="tip">${title} · ${p.label}</div>` : ''}<img src="${p.src}" style="width:${p.w}in"></div>`).join('')}
      <script>addEventListener('load', () => setTimeout(() => print(), 300));<\/script></body></html>`);
    win.document.close();
    status(fitPage ? 'printing the map on one page' : `printing ${pages.length} page(s) at one inch per square (print at 100% / actual size)`);
  }

  // ---- moving things ----
  function cellAt(e) {
    const r = overlay.getBoundingClientRect(), [x, z] = toWorld(view, e.clientX - r.left, e.clientY - r.top);
    return [Math.round(x), Math.round(z)];
  }
  // what stands on a square: a character first, then an object (walls and
  // doors last), skipping the floor
  function thingAt(x, z) {
    for (const g of chars()) { const p = posOf(g); if (Math.round(p.x) === x && Math.round(p.z) === z && !opt.hidden.has(g.id)) return { kind: 'char', g, x, z }; }
    const objs = W().getObjects().filter(o => !o.rim && Math.round(o.x) === x && Math.round(o.z) === z && !['light'].includes(o.type));
    objs.sort((a, b) => (['wall', 'door'].includes(a.type) ? 1 : 0) - (['wall', 'door'].includes(b.type) ? 1 : 0));
    return objs[0] ? { kind: 'obj', o: objs[0], x, z } : null;
  }
  function moveTo(t, x, z) {
    const w = W();
    if (t.kind === 'char') w.setCharacterLogicalPosition(t.g, { x, z });
    else {
      const o = t.o, opts = { ...(o.opts || {}), ...(o.ry ? { ry: o.ry } : {}), ...(o.noteText ? { text: o.noteText } : {}), ...(o.noteHtml ? { html: o.noteHtml } : {}) };
      w.disposeWorldObject(o.mesh); w.makeObject(o.type, x + (o.x - Math.round(o.x)), z + (o.z - Math.round(o.z)), opts);
    }
    changed();
  }
  function turn(t) {
    const w = W();
    if (t.kind === 'char') { const d = t.g.dir || { x: 0, z: 1 }; t.g.dir = new BABYLON.Vector3(-d.z, 0, d.x); try { t.g.root.rotation.y += Math.PI / 2; } catch {} }
    else { const o = t.o, ry = ((o.ry || 0) + Math.PI / 2) % (Math.PI * 2); w.disposeWorldObject(o.mesh); w.makeObject(o.type, o.x, o.z, { ...(o.opts || {}), ry: +ry.toFixed(3), ...(o.noteText ? { text: o.noteText } : {}), ...(o.noteHtml ? { html: o.noteHtml } : {}) }); }
    changed();
  }
  function remove(t) {
    if (t.kind === 'char') { opt.hidden.add(t.g.id); look(); buildList(); status(`${nameOf(t.g)} hidden (characters are hidden, not deleted)`); return; }
    W().disposeWorldObject(t.o.mesh); sel = null; changed();
  }
  function changed() { edited = true; const b = $('ttUse'); if (b) b.classList.add('hot'); setTimeout(draw, 60); }
  function onDown(e) {
    if (!opt.edit || e.button !== 0) return;
    const [x, z] = cellAt(e), t = thingAt(x, z);
    sel = t; drag = t ? { t, to: null } : null;
    status(t ? `${t.kind === 'char' ? nameOf(t.g) : t.o.type}: drag to move · R turn · Delete remove` : '');
    draw(); e.preventDefault();
  }
  function onMove(e) { if (!drag) return; const [x, z] = cellAt(e); drag.to = x === drag.t.x && z === drag.t.z ? null : [x, z]; draw(); }
  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.to) { moveTo(d.t, d.to[0], d.to[1]); sel = thingAt(d.to[0], d.to[1]); }
    draw();
  }
  function useLayout() {
    let s; try { s = window.tablefolkScenario.freezeLayout(); } catch (e) { status(e.message); return; }
    if (embedded) { window.parent.postMessage({ type: 'tablefolk-layout', scenario: s }, location.origin); status('layout sent to the builder'); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })); a.download = fileName('.json'); a.click(); status('downloaded the scenario with this layout'); }
    edited = false; $('ttUse')?.classList.remove('hot');
  }

  // ---- toolbar ----
  const status = t => { const s = $('ttStatus'); if (s) s.textContent = t; };
  function buildList() {
    const box = $('ttChars'); if (!box) return;
    box.innerHTML = chars().map(g => `<label><input type="checkbox" data-char="${esc(g.id)}" ${opt.hidden.has(g.id) ? '' : 'checked'}> <span class="${isHostile(g) ? 'hostile' : ''}">${esc(nameOf(g))}</span></label>`).join('')
      + `<div class="row"><button type="button" data-tt="allOn">all</button><button type="button" data-tt="allOff">none</button><button type="button" data-tt="monstersOff">hide hostile</button></div>`;
  }
  function buildBar() {
    const bar = document.createElement('div'); bar.id = 'ttBar';
    bar.innerHTML = `<b>tabletop map</b>
      <label><input type="checkbox" id="ttGrid" ${opt.grid ? 'checked' : ''}> grid</label>
      <label><input type="checkbox" id="ttLabels" ${opt.labels ? 'checked' : ''}> names</label>
      <label><input type="checkbox" id="ttBright" ${opt.bright ? 'checked' : ''}> bright light</label>
      <label>outside <select id="ttOutside">${[['paper', 'paper'], ['black', 'black'], ['sea', 'as rendered']].map(([k, t]) => `<option value="${k}"${opt.outside === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <details id="ttCharsBox"><summary>characters</summary><div id="ttChars"></div></details>
      <label><input type="checkbox" id="ttEdit"> move things</label>
      <span class="sep"></span>
      <select id="ttPpc" title="pixels per square"><option value="100">PNG 100 px/square</option><option value="150" selected>PNG 150 px/square</option><option value="300">PNG 300 px/square (print quality)</option></select>
      <button type="button" data-tt="png">save PNG</button>
      <button type="button" data-tt="print">print 1" squares</button>
      <button type="button" data-tt="printFit">print on one page</button>
      <button type="button" data-tt="full">full screen</button>
      <button type="button" id="ttUse" data-tt="use">${embedded ? 'use this layout in the builder' : 'download scenario with this layout'}</button>
      <span id="ttStatus"></span>`;
    document.body.appendChild(bar);
    buildList();
    bar.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'ttGrid') { opt.grid = t.checked; saveOpts(); draw(); }
      else if (t.id === 'ttLabels') { opt.labels = t.checked; saveOpts(); draw(); }
      else if (t.id === 'ttBright') { opt.bright = t.checked; saveOpts(); look(); }
      else if (t.id === 'ttOutside') { opt.outside = t.value; saveOpts(); draw(); }
      else if (t.id === 'ttEdit') { opt.edit = t.checked; sel = null; document.documentElement.classList.toggle('tt-edit', opt.edit); status(opt.edit ? 'click a character or object, drag it to another square' : ''); draw(); }
      else if (t.dataset.char) { if (t.checked) opt.hidden.delete(t.dataset.char); else opt.hidden.add(t.dataset.char); look(); }
    });
    bar.addEventListener('click', e => {
      const b = e.target.closest('button[data-tt]'); if (!b) return;
      const a = b.dataset.tt;
      if (a === 'png') savePng().catch(err => status('PNG failed: ' + err.message));
      else if (a === 'print' || a === 'printFit') print(a === 'printFit').catch(err => status('print failed: ' + err.message));
      else if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
      else if (a === 'use') useLayout();
      else if (a === 'allOn') { opt.hidden.clear(); look(); buildList(); }
      else if (a === 'allOff') { for (const g of chars()) opt.hidden.add(g.id); look(); buildList(); }
      else if (a === 'monstersOff') { for (const g of chars()) if (isHostile(g)) opt.hidden.add(g.id); look(); buildList(); }
    });
  }

  // Game input off: keys and clicks stop here unless they belong to the toolbar.
  const mine = e => e.target?.closest?.('#ttBar');
  addEventListener('keydown', e => {
    if (mine(e)) return;
    if (opt.edit && sel && (e.key === 'r' || e.key === 'R')) { const s = sel; turn(s); sel = thingAt(s.x, s.z); draw(); }
    else if (opt.edit && sel && (e.key === 'Delete' || e.key === 'Backspace')) { remove(sel); sel = null; draw(); }
    else if (e.key === 'Escape') { sel = null; draw(); }
    e.stopImmediatePropagation(); if (!e.ctrlKey && !e.metaKey && e.key !== 'F11' && e.key !== 'F5') e.preventDefault();
  }, true);
  addEventListener('keyup', e => { if (!mine(e)) e.stopImmediatePropagation(); }, true);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu']) {
    addEventListener(type, e => {
      if (mine(e)) return;
      if (type === 'pointerdown') onDown(e); else if (type === 'pointermove') onMove(e); else if (type === 'pointerup') onUp(e);
      e.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
  addEventListener('beforeunload', e => { if (edited && !embedded) { e.preventDefault(); e.returnValue = ''; } });

  // The scenario builds after the scene; set up once both are there (and
  // again when a new scenario starts).
  let ready = false;
  const start = () => { if (!ready) { ready = true; setup(); } else { opt.hidden.clear(); look(); buildList(); setCam(fit(view.cw, view.ch)); } };
  addEventListener('tablefolk-scenario-started', () => setTimeout(start, 300));
  // no scenario in the link: show the board as it is
  const fallback = () => setTimeout(() => { if (!ready && !/[#&]s(cenario)?=/.test(location.hash) && !new URLSearchParams(location.search).get('scenario')) start(); }, 1500);
  if (window.TABLEFOLK_SCENE_READY) fallback(); else addEventListener('tablefolk-scene-ready', fallback, { once: true });
  window.tablefolkTabletop = { render, freeze: () => window.tablefolkScenario.freezeLayout(), toPx: (x, z) => toPx(view, x, z), get options() { return opt; } };
})();
