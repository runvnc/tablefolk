/* diagnostics.js -- what this device is, what runs, and why: for players.
 *
 *   window.tablefolkDiag.note(area, text)   record a decision or a fallback
 *       ('device', 'brain', 'voice', 'speech', 'graphics'); also console.info
 *   window.tablefolkDiag.notes()            the list so far
 *
 * Settings shows "Running now" (#runningNow): the characters' brain, the
 * voice, the speech input and the graphics, each with its state and why it
 * was chosen, plus the offer of the better voice when it fits here. The
 * "This device" pane (#deviceReport) shows everything detected (graphics
 * card and its memory, what is left beside the brain, this browser's
 * abilities, storage) and every decision with its time. Both refresh while
 * open. Sources: window.tablefolkDevice (libs/device/index.js through
 * world-integration.js), window.tablefolkBrowser (browser-check.js),
 * window.tablefolkTTS (pocket-tts-manager.js), window.tablefolkSpeech
 * (speech-input.js), window.TABLEFOLK_GFX (graphics-settings.js).
 */
(() => {
  'use strict';
  const list = [];
  const t0 = performance.now();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function note(area, text) {
    const n = { t: performance.now(), area, text: String(text) };
    // the same line again (a retry) only once
    if (list.length && list[list.length - 1].area === area && list[list.length - 1].text === n.text) return;
    list.push(n); if (list.length > 300) list.shift();
    try { console.info('[tablefolk ' + area + ']', text); } catch {}
    if (visible()) render();
  }
  const visible = () => document.getElementById('pane-settings')?.classList.contains('active') || document.getElementById('pane-device')?.classList.contains('active');

  const brainStatus = () => (document.getElementById('brainStatus')?.textContent || '').trim();
  function rows() {
    const out = [];
    // the characters' brain
    const b = window.tablefolkBrainInfo?.(), st = brainStatus();
    out.push(['Characters', b ? b.label : 'none yet', st || '', /fail|error/i.test(st) ? 'bad' : /ready/i.test(st) ? 'ok' : 'busy', window.tablefolkBrainWhy || '']);
    // the voice
    const tts = window.tablefolkTTS;
    if (tts) {
      const label = tts.engineLabel?.() || tts.engine || 'not loaded yet';
      const state = localStorage.getItem('tablefolkTtsEnabled') === '0' ? 'off (🔇)' : tts.ready ? 'ready' : tts.loading ? 'loading' : tts.lastStatus || 'not loaded yet';
      out.push(['Voice', label, (tts.upgrade?.state === 'downloading' ? 'Breeze downloading: ' + (tts.upgrade.text || '') + ' · ' : '') + state, tts.ready ? 'ok' : /fail|error/i.test(state) ? 'bad' : 'busy', tts.why || '']);
    }
    // speech input
    const sp = window.tablefolkSpeech?.state?.();
    if (sp) out.push(['Speech input', sp.engine || 'none', sp.status || '', sp.ready ? 'ok' : sp.error ? 'bad' : 'busy', sp.why || '']);
    // graphics
    const g = window.TABLEFOLK_GFX, e = window.TABLEFOLK_STATE?.engine;
    out.push(['Graphics', (g?.quality || '?') + ' quality', e ? `${e.getRenderWidth()}×${e.getRenderHeight()} · ${Math.round(e.getFps?.() || 0)} fps` : '', 'ok', 'change it in Graphics']);
    return out;
  }
  function renderRunning() {
    const box = document.getElementById('runningNow'); if (!box) return;
    const tts = window.tablefolkTTS;
    const offer = tts?.canOfferBreeze?.() ? `<button type="button" class="diag-offer" data-diag="breeze">Get the better voice: Breeze TTS 2 (2.5 GB, runs on this graphics card)</button>` : '';
    box.innerHTML = rows().map(([what, val, st, cls, why]) => `<div class="diag-row ${cls}"><b>${esc(what)}</b><span>${esc(val)}</span><small>${esc(st)}${why ? ` · <i>${esc(why)}</i>` : ''}</small></div>`).join('') + offer;
  }
  const gb = n => n == null ? '?' : (Math.round(n * 10) / 10) + ' GB';
  let storage = null;
  function renderDevice() {
    const box = document.getElementById('deviceReport'); if (!box) return;
    const d = window.tablefolkDevice, hw = d?.hw, B = window.tablefolkBrowser || {};
    const kv = pairs => '<table class="diag-table">' + pairs.filter(Boolean).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</table>';
    const yes = v => v ? 'yes' : 'no';
    const sections = [
      ['Graphics card', kv([
        ['Detected', hw?.gpu || B.adapter?.description || 'unknown'],
        ['Renderer string', hw?.renderer || ''],
        ['WebGPU adapter', hw?.adapter || [B.adapter?.vendor, B.adapter?.architecture].filter(Boolean).join(' ') || (B.webgpu === false ? 'none' : '')],
        ['Device', hw ? [{ phone: 'phone', tablet: 'tablet', xr: 'headset', computer: 'computer' }[hw.cls], hw.model, hw.os, hw.arch].filter(Boolean).join(', ') : 'checking…'],
        ['Graphics memory', hw ? (hw.vramGB ? hw.vramGB + ' GB (' + (hw.memWhy || 'from the card\'s name') + ')' : hw.shared ? 'shared with the system' + (hw.sharedGB ? ', about ' + hw.sharedGB + ' GB (' + hw.memWhy + ')' : '') : 'unknown (card not in the table)') : 'checking…'],
        ['Memory bandwidth (measured)', hw?.bwGBs ? hw.bwGBs + ' GB/s' : hw ? 'not measured' : '?'],
        ['Model choice', hw?.choiceWhy || ''],
        ['Measured model speed here', Object.entries((() => { try { return JSON.parse(localStorage.getItem('tablefolkBrainSpeed') || '{}'); } catch { return {}; } })()).map(([k, v]) => `${k} ${Math.round(v.cps)} chars/s (${v.turns} turns)`).join('; ') || 'none yet'],
        ['Left beside the characters\' model', d ? gb(d.freeGB) : '?'],
        ['Largest buffer', hw?.maxBufferGB ? hw.maxBufferGB + ' GB' : ''],
        ['shader-f16 (Breeze, fast speech input)', hw ? yes(hw.f16) : B.f16 != null ? yes(B.f16) : '?'],
      ])],
      ['This browser', kv([
        ['Browser', [B.name, B.version, B.os && 'on ' + B.os].filter(Boolean).join(' ') || navigator.userAgent],
        ['JSPI (Breeze, Qwen on the graphics card)', B.jspi != null ? yes(B.jspi) : '?'],
        ['Cross-origin isolated (threads)', yes(window.crossOriginIsolated)],
        ['Processor threads', navigator.hardwareConcurrency || '?'],
        ['System memory (as the browser reports it, rounded)', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '?'],
        ['Stored by this site', storage ? `${gb(storage.usage / 2 ** 30)} of ${gb(storage.quota / 2 ** 30)} allowed` : 'checking…'],
      ])],
      ['Running now', '<div class="running-now">' + rows().map(([what, val, st, cls, why]) => `<div class="diag-row ${cls}"><b>${esc(what)}</b><span>${esc(val)}</span><small>${esc(st)}${why ? ` · <i>${esc(why)}</i>` : ''}</small></div>`).join('') + '</div>'],
      ['Decisions and fallbacks', list.length ? '<ol class="diag-log">' + list.map(n => `<li><span>${((n.t - t0) / 1000).toFixed(1)} s</span><b>${esc(n.area)}</b> ${esc(n.text)}</li>`).join('') + '</ol>' : '<p class="pane-note">none yet</p>'],
    ];
    box.innerHTML = sections.map(([h, body]) => `<div class="section-subtitle">${esc(h)}</div>${body}`).join('')
      + '<button type="button" class="diag-copy" data-diag="copy">copy this report</button>';
  }
  function render() { try { renderRunning(); renderDevice(); } catch (e) { console.warn('[diag]', e); } }
  function text() {
    const box = document.getElementById('deviceReport');
    return box ? box.innerText : '';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-diag]'); if (!b) return;
    if (b.dataset.diag === 'breeze') window.tablefolkTTS?.upgradeToBreezeWeb?.();
    if (b.dataset.diag === 'copy') navigator.clipboard?.writeText(text()).then(() => window.tablefolkToast?.('report copied'), () => {});
  });
  setInterval(() => { if (visible()) render(); }, 1500);
  navigator.storage?.estimate?.().then(s => { storage = s; }).catch(() => {});
  window.tablefolkDiag = { note, notes: () => list.slice(), render };
})();
