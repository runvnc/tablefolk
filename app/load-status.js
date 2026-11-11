/* load-status.js -- what is downloading or loading, on the screen.
 *
 * The big helpers (Breeze TTS 2, the voice; Underdog Bark, speech input) take
 * minutes the first time. Their progress used to show only in the Voice pane
 * and on the 🎤 button's tooltip; this puts a small card per job under the top
 * bar (top right): its name, what it is doing and a progress bar when the
 * text carries a percentage. A finished job says "ready" for a few seconds
 * and goes; a failed one stays a little longer.
 *
 *   window.tablefolkLoad.set(key, { label, text, state })   state: loading | ready | error
 *   window.tablefolkLoad.clear(key)
 *
 * Fed by: tablefolkTTS 'status' (Breeze engines only: Pocket loads in a moment)
 * and 'upgrade' (Breeze downloading in the background while another voice
 * talks), and window 'tablefolk-load' events from speech-input.js.
 */
(function () {
  const jobs = new Map();
  let box = null;
  function el() {
    if (box) return box;
    box = document.createElement('div'); box.id = 'loadStatus'; box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box); return box;
  }
  function render() {
    const b = el(); b.textContent = '';
    for (const [key, j] of jobs) {
      const card = document.createElement('div'); card.className = 'load-card ' + (j.state || 'loading'); card.dataset.key = key;
      const head = document.createElement('div'); head.className = 'load-head';
      const name = document.createElement('strong'); name.textContent = j.label;
      const txt = document.createElement('span'); txt.textContent = j.text || '';
      head.append(name, txt); card.appendChild(head);
      const pct = j.state === 'loading' ? /(\d{1,3})\s*%/.exec(j.text || '')?.[1] : null;
      if (j.state === 'loading') {
        const bar = document.createElement('div'); bar.className = 'load-bar' + (pct == null ? ' busy' : '');
        const fill = document.createElement('i'); if (pct != null) fill.style.width = Math.min(100, +pct) + '%';
        bar.appendChild(fill); card.appendChild(bar);
      }
      card.title = 'Settings → Voice has the details';
      card.onclick = () => { if (j.state !== 'loading') clear(key); };
      b.appendChild(card);
    }
    b.hidden = !jobs.size;
  }
  function set(key, { label, text, state = 'loading' } = {}) {
    const old = jobs.get(key); clearTimeout(old?.timer);
    const j = { label: label || old?.label || key, text: String(text || '').replace(/^Breeze TTS 2[:\s]*/, '').trim(), state };
    if (state !== 'loading') j.timer = setTimeout(() => clear(key), state === 'error' ? 12000 : 4000);
    jobs.set(key, j); render();
  }
  function clear(key) { const j = jobs.get(key); if (!j) return; clearTimeout(j.timer); jobs.delete(key); render(); }
  window.tablefolkLoad = { set, clear, get jobs() { return [...jobs].map(([k, j]) => ({ key: k, label: j.label, text: j.text, state: j.state })); } };

  window.addEventListener('tablefolk-load', e => { const d = e.detail || {}; if (d.key) d.clear ? clear(d.key) : set(d.key, d); });

  const hook = () => {
    const tts = window.tablefolkTTS; if (!tts) return;
    const breeze = () => /breeze/.test(tts.engine || '');
    const onStatus = ({ text, state }) => {
      if (!breeze()) return;
      if (state === 'loading' || state === 'ready' || state === 'error') set('voice', { label: '🔊 Voice', text: state === 'ready' ? tts.engineLabel() + ' ready' : String(text || '').replace(/\s*\([^)]*\)/g, ''), state });
    };
    tts.addEventListener('status', e => onStatus(e.detail || {}));
    tts.addEventListener('upgrade', e => { const u = e.detail || {}; set('voice-upgrade', { label: '🔊 Better voice', text: u.text, state: u.state === 'failed' ? 'error' : 'loading' }); });
    // a background upgrade ends in a switch: its card goes when the new voice reports
    tts.addEventListener('status', e => { if (e.detail?.state === 'ready' && jobs.has('voice-upgrade')) clear('voice-upgrade'); });
    if (tts.loading && tts.lastStatus) onStatus({ text: tts.lastStatus, state: 'loading' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
