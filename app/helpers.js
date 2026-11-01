/* helpers.js -- find the local helpers on the player's own computer:
 * breeze-server (Breeze TTS 2, tools/breeze-server.sh, port 8137) and
 * llama.cpp's llama-server (tools/llama-server.sh, port 8080, LFM3-1.7B).
 *
 * On tablefolk.world the page cannot reach them through a Tablefolk server,
 * so it talks to 127.0.0.1 directly (both servers send CORS headers). Chrome
 * asks the player for local network access the first time, so this never
 * probes by itself on a first visit: the "find helpers on this computer"
 * buttons (.find-helpers) do. Once a probe has run, later visits probe again
 * quietly (tablefolkHelpers in localStorage), since the permission is kept.
 *
 * Breeze found: when the Breeze client cannot reach it through this server's
 * proxy, its URL is set to the direct address (the Voice pane's "Breeze
 * server" field), and the engine's own auto-pick does the rest. llama.cpp
 * found: it asks once whether to use it as the brain, then fills the
 * endpoint panel through its preset picker and picks the endpoint brain.
 *
 *   window.tablefolkHelpers.find({ quiet })  -> { breeze, llama, models }
 */
(function () {
  const BREEZE = 'http://127.0.0.1:8137', LLAMA = 'http://127.0.0.1:8080/v1', KEY = 'tablefolkHelpers';
  const get = (url, ms = 2500) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.json() : null).catch(() => null);
  const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const say = (text, type) => { document.querySelectorAll('.helpers-status').forEach(e => { e.textContent = text; }); if (type) window.tablefolkToast?.(text, { type }); };

  async function find({ quiet = false } = {}) {
    say('looking for helpers on this computer…');
    const [h, m] = await Promise.all([get(BREEZE + '/health'), get(LLAMA + '/models')]);
    const breeze = h?.status === 'ok', models = (m?.data || []).map(x => x.id).filter(Boolean), llama = models.length > 0;
    store(KEY, '1');
    if (breeze) await useBreeze();
    const found = [breeze && 'Breeze TTS 2 (speech)', llama && `llama.cpp (${models[0]})`].filter(Boolean);
    say(found.length ? 'found: ' + found.join(', ') : 'no helpers answer on this computer (start tools/breeze-server.sh or tools/llama-server.sh)', quiet ? null : found.length ? 'info' : 'warn');
    if (llama && !quiet) await offerLlama(models[0]);
    return { breeze, llama, models };
  }

  // Breeze: keep this server's proxy when it works, else talk to it directly
  async function useBreeze() {
    const client = window.tablefolkBreeze; if (!client) return;
    client.reset?.();
    if (await client.available()) return;
    store('tablefolkBreezeUrl', BREEZE);
    const box = document.getElementById('breezeUrl'); if (box) { box.value = BREEZE; box.dispatchEvent(new Event('change')); }
    client.reset?.();
  }

  async function offerLlama(model) {
    const pick = document.getElementById('modelSelect'), preset = document.getElementById('llmPreset');
    if (!pick || !preset || pick.value === 'endpoint') return;
    const yes = await (window.confirmDialog?.(`llama.cpp answers on this computer with ${model}. Use it as the characters' brain? (The model menu can switch back any time.)`, { title: 'Use llama.cpp?', confirmText: 'use it' }) ?? confirm(`Use ${model} on llama.cpp as the brain?`));
    if (!yes) return;
    let opt = [...preset.options].find(o => o.value.startsWith(LLAMA + '|') && o.value.endsWith('|' + model));
    if (!opt) { opt = new Option(`${model}: llama.cpp on this computer`, `${LLAMA}|${model}`); preset.add(opt); }
    preset.value = opt.value; preset.dispatchEvent(new Event('change'));
    pick.value = 'endpoint'; pick.dispatchEvent(new Event('change'));
  }

  function init() {
    document.querySelectorAll('.find-helpers').forEach(b => b.addEventListener('click', () => find()));
    if (read(KEY) === '1' && !window.TABLEFOLK_ART_MODE) find({ quiet: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.tablefolkHelpers = { find };
})();
