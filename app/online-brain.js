/* online-brain.js -- the characters' brain on OpenRouter, for players: a
 * fallback when this device cannot run the in-browser model (no WebGPU, too
 * little memory, a failed load), or a bigger model on demand.
 *
 * Settings ("Characters' brain online", #onlineBrain): "Sign in with
 * OpenRouter" (OAuth PKCE, worldgen-own.js: OpenRouter sends the browser back
 * here with a code, traded for a key of the player's own; no secret on our
 * side) or a pasted API key; then the endpoint brain (agent-brain.js,
 * 'tablefolk_llm_endpoint') uses OpenRouter with that key and a quick model
 * (worldgen-own.js PLAY_MODEL, editable here). The key stays in this
 * browser's localStorage and goes only to OpenRouter. "Back to the in-browser
 * model" forgets the choice (the device's pick again); "Forget the key"
 * removes it. Each switch reloads the page so the brain starts cleanly.
 *
 * When the in-browser brain fails, a toast offers this (once a session).
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const OR = /openrouter\.ai/;
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
  const own = () => window.tfOwnModel?.get() || {};
  const usingOnline = () => { try { return localStorage.getItem('tablefolk_model') === 'endpoint' && OR.test(read('tablefolk_llm_endpoint').baseURL || ''); } catch { return false; } };

  // use OpenRouter with this key (and model) for the characters, then reload
  function useKey(key, model) {
    const M = window.tfOwnModel; if (!M) return;
    M.set({ provider: 'openrouter', apiKey: key, useForPlay: true });
    if (model) { const e = read('tablefolk_llm_endpoint'); try { localStorage.setItem('tablefolk_llm_endpoint', JSON.stringify({ ...e, model })); } catch {} }
    window.tablefolkDiag?.note('brain', 'switching to OpenRouter (' + (model || M.PLAY_MODEL) + ')');
    location.reload();
  }
  function backToBrowser(forget) {
    try {
      localStorage.removeItem('tablefolk_model');
      if (OR.test(read('tablefolk_llm_endpoint').baseURL || '')) localStorage.removeItem('tablefolk_llm_endpoint');
    } catch {}
    window.tfOwnModel?.set({ useForPlay: false, ...(forget ? { apiKey: '' } : {}) });
    location.reload();
  }

  function render() {
    const box = $('onlineBrain'); if (!box) return;
    const o = own(), on = usingOnline(), model = read('tablefolk_llm_endpoint').model || window.tfOwnModel?.PLAY_MODEL || '';
    if (on) {
      box.innerHTML = `<p class="pane-note">The characters think on OpenRouter with your own key: <b>${esc(model)}</b>. You pay OpenRouter for what they say; the key stays in this browser.</p>
        <label class="online-model">Model <input id="onlineModel" type="text" value="${esc(model)}" spellcheck="false" /></label>
        <div class="online-row"><button type="button" data-online="model">use this model</button>
        <button type="button" data-online="back">back to the in-browser model</button>
        <button type="button" data-online="forget">forget the key</button></div>`;
      return;
    }
    box.innerHTML = `<p class="pane-note">If this device can't run the characters' model, or you want a bigger one, they can think on <b>OpenRouter</b> with your own account (pay as you go; nothing goes through Tablefolk).</p>
      <div class="online-row"><button type="button" data-online="signin">${o.apiKey ? 'use OpenRouter (signed in)' : 'sign in with OpenRouter'}</button></div>
      <div class="online-row"><input id="onlineKey" type="password" placeholder="or paste an OpenRouter API key (sk-or-...)" autocomplete="off" spellcheck="false" /> <button type="button" data-online="key">use</button></div>`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-online]'); if (!b) return;
    const what = b.dataset.online, o = own();
    if (what === 'signin') { if (o.apiKey) useKey(o.apiKey); else window.tfOwnModel?.signIn(); }
    if (what === 'key') { const k = $('onlineKey')?.value.trim(); if (!k) { window.tablefolkToast?.('paste a key first', { type: 'error' }); return; } useKey(k); }
    if (what === 'model') { const m = $('onlineModel')?.value.trim(); if (m && o.apiKey) useKey(o.apiKey, m); }
    if (what === 'back') backToBrowser(false);
    if (what === 'forget') backToBrowser(true);
  });

  // back from OpenRouter's sign-in (?code=...): the key, then the characters on it
  async function finish() {
    if (!new URLSearchParams(location.search).has('code') || !window.tfOwnModel) return;
    try {
      if (await window.tfOwnModel.finishSignIn()) { window.tablefolkDiag?.note('brain', 'signed in with OpenRouter'); useKey(own().apiKey); }
    } catch (e) { window.tablefolkToast?.(e.message, { type: 'error', duration: 9000 }); }
  }

  // the in-browser brain failed: offer this, once a session
  function watchFailure() {
    const st = $('brainStatus'); if (!st) return;
    const check = () => {
      if (usingOnline() || !/fail|error|can't run|cannot run|no WebGPU/i.test(st.textContent || '')) return;
      try { if (sessionStorage.getItem('tablefolkOnlineOffered')) return; sessionStorage.setItem('tablefolkOnlineOffered', '1'); } catch {}
      window.tablefolkDiag?.note('brain', 'the in-browser model did not load: OpenRouter offered');
      window.tablefolkToast?.('The characters\' model could not run on this device. They can think on OpenRouter with your own account instead.', { type: 'info', duration: 20000, action: { label: 'Set it up', onClick: () => { window.tablefolkTabs?.show('settings'); setTimeout(() => $('onlineBrain')?.scrollIntoView({ block: 'center' }), 100); } } });
    };
    new MutationObserver(check).observe(st, { childList: true, characterData: true, subtree: true });
    check();
  }

  const init = () => {
    render(); finish(); watchFailure();
    // re-render when Settings opens (the key may have changed in the world builder)
    document.addEventListener('click', e => { if (e.target.closest?.('[data-pane="settings"], [data-open="settings"]')) setTimeout(render, 0); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.tablefolkOnlineBrain = { render, useKey, backToBrowser, usingOnline };
})();
