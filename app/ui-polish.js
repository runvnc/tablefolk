/* ui-polish.js -- small generic UX upgrades for tablefolk.world.
 *
 * 1. Numeric readouts on every <input type=range> slider.
 * 2. Escape exits click-to-spawn mode (unchecks the toggle).
 * 3. Remembers which panel sections are open across reloads
 *    (World setup opens by default on first visit).
 */
(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    // 1. slider value readouts
    for (const input of document.querySelectorAll('input[type="range"]')) {
      const label = input.closest('label');
      if (!label) continue;
      const head = document.createElement('div');
      head.className = 'range-head';
      while (label.firstChild && label.firstChild !== input) head.appendChild(label.firstChild);
      const val = document.createElement('span');
      val.className = 'range-val';
      head.appendChild(val);
      label.insertBefore(head, input);
      const update = () => { val.textContent = input.value; };
      input.addEventListener('input', update);
      update();
    }

    // 2. Escape exits click-to-spawn
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const box = document.getElementById('spawnModeEnabled');
      if (box && box.checked) {
        box.checked = false;
        box.dispatchEvent(new Event('change'));
      }
    });

    // 3. persist open panel sections
    const KEY = 'character.ui.sections';
    const sections = [...document.querySelectorAll('details.panel-section')];
    const seen = localStorage.getItem(KEY);
    let saved = {};
    try { saved = JSON.parse(seen || '{}'); } catch {}
    sections.forEach((d, i) => {
      const name = (d.querySelector('summary')?.textContent || String(i)).trim();
      if (seen) {
        if (saved[name] === true) d.open = true;
        else if (saved[name] === false) d.open = false;
      } else if (i === 0) {
        d.open = true; // World setup open on first visit
      }
      d.addEventListener('toggle', () => {
        try {
          const cur = JSON.parse(localStorage.getItem(KEY) || '{}');
          cur[name] = d.open;
          localStorage.setItem(KEY, JSON.stringify(cur));
        } catch {}
      });
    });
  });
})();

/* chat dock: the "to:" picker lists the characters and follows the selected
   one; picking a name selects that character (clicking it in the world works
   too, and so does starting a message with @name). */
(() => {
  function ready2(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready2(() => {
    const pick = document.getElementById('chatTo');
    if (!pick) return;
    let shown = '';
    const update = () => {
      const w = window.tablefolk, ids = (w?.getAgents?.() || []).map(g => g.id), sel = w?.getSelectedAgent?.()?.id || '';
      const key = ids.join(',');
      if (key !== shown) {
        shown = key; pick.textContent = '';
        if (!ids.length) pick.add(new Option('no characters', ''));
        for (const id of ids) pick.add(new Option(id, id));
      }
      if (document.activeElement !== pick && sel && pick.value !== sel) pick.value = sel;
    };
    pick.addEventListener('change', () => {
      const w = window.tablefolk, g = w?.getAgents?.().find(a => a.id === pick.value);
      if (g) w.selectCharacter(g);
      document.getElementById('chatInput')?.focus();
    });
    setInterval(update, 700);
    update();
  });
})();
