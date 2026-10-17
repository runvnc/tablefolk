/* library.js -- saved world setups + saved character templates.
 *
 * Worlds: full snapshots of the current map (characters, props, brains, history)
 *   stored under localStorage 'character.library.worlds'.
 * Characters: the selected character's brain config (style/personality/voice/etc) +
 *   body traits, stored under 'character.library.characters'. Spawning a saved character
 *   gives it a fresh conversation (messages/recent/pendingChat are stripped).
 *
 * Uses the public window.tablefolk API; wires up once the world is ready.
 */
(() => {
  const WKEY = 'character.library.worlds';
  const GKEY = 'character.library.characters';
  const $ = id => document.getElementById(id);
  const toast = (m, o) => window.tablefolkToast?.(m, o);

  const load = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('library save failed: ' + e.message, { type: 'error' }); return false; }
  };

  function fill(sel, obj) {
    if (!sel) return;
    const cur = sel.value;
    sel.textContent = '';
    const names = Object.keys(obj);
    if (!names.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = '(none saved)';
      sel.appendChild(o);
      return;
    }
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    }
    if (names.includes(cur)) sel.value = cur;
  }

  function refresh() {
    fill($('worldPresetSelect'), load(WKEY));
    fill($('characterPresetSelect'), load(GKEY));
  }

  function init() {
    const world = window.tablefolk;

    $('saveWorldPreset').onclick = () => {
      const all = load(WKEY);
      const name = ($('worldPresetName').value || '').trim() || ('setup ' + (Object.keys(all).length + 1));
      world.saveWorldState();
      let data = null;
      try { data = JSON.parse(localStorage.getItem('tablefolkState')); } catch {}
      if (!data) return toast('nothing to save yet', { type: 'warn' });
      all[name] = { savedAt: Date.now(), data };
      if (!save(WKEY, all)) return;
      refresh();
      $('worldPresetSelect').value = name;
      toast('world setup saved as "' + name + '"', { type: 'success' });
    };

    $('loadWorldPreset').onclick = async () => {
      const name = $('worldPresetSelect').value;
      const entry = load(WKEY)[name];
      if (!entry) return toast('pick a saved setup first', { type: 'warn' });
      try {
        await world.restoreWorldState(JSON.parse(JSON.stringify(entry.data)));
        toast('loaded setup "' + name + '"', { type: 'success' });
      } catch (e) { toast('load failed: ' + (e?.message || e), { type: 'error' }); }
    };

    $('deleteWorldPreset').onclick = async () => {
      const name = $('worldPresetSelect').value;
      const all = load(WKEY);
      if (!all[name]) return toast('pick a saved setup first', { type: 'warn' });
      if (await window.confirmDialog('Delete saved setup "' + name + '"? The live world is not affected.', { title: 'Delete preset?', confirmText: 'delete', danger: true })) {
        delete all[name];
        save(WKEY, all);
        refresh();
        toast('deleted "' + name + '"', { type: 'info' });
      }
    };

    $('saveCharacterPreset').onclick = () => {
      const g = world.getSelectedAgent?.();
      if (!g) return toast('select a character first', { type: 'warn' });
      const name = ($('characterPresetName').value || '').trim() || g.id;
      const brain = world.getBrainConfig(g.id) || {};
      const all = load(GKEY);
      all[name] = {
        savedAt: Date.now(),
        body: { style: g.style || 'goblin', traits: g.traits || null },
        brain: JSON.parse(JSON.stringify(brain)),
      };
      if (!save(GKEY, all)) return;
      refresh();
      $('characterPresetSelect').value = name;
      toast('character saved as "' + name + '"', { type: 'success' });
    };

    $('spawnCharacterPreset').onclick = async () => {
      const name = $('characterPresetSelect').value;
      const entry = load(GKEY)[name];
      if (!entry) return toast('pick a saved character first', { type: 'warn' });
      const x = Math.round(Math.random() * 8 - 4);
      const z = Math.round(Math.random() * 8 - 4);
      try {
        const g = await world.spawnAt('critter', x, z);
        if (g && entry.brain) {
          const cfg = JSON.parse(JSON.stringify(entry.brain));
          delete cfg.messages; delete cfg.recent; delete cfg.pendingChat; // fresh conversation
          world.setBrainConfig(g.id, cfg);
        }
        if (g && entry.body?.traits) g.traits = entry.body.traits;
        world.saveWorldState();
        toast('spawned "' + name + '"', { type: 'success' });
      } catch (e) { toast('spawn failed: ' + (e?.message || e), { type: 'error' }); }
    };

    $('applyCharacterPreset').onclick = async () => {
      const name = $('characterPresetSelect').value;
      const entry = load(GKEY)[name];
      if (!entry) return toast('pick a saved character first', { type: 'warn' });
      const g = world.getSelectedAgent?.();
      if (!g) return toast('select a character first', { type: 'warn' });
      if (entry.brain) {
        const cfg = JSON.parse(JSON.stringify(entry.brain));
        delete cfg.messages; delete cfg.recent; delete cfg.pendingChat; // keep live conversation
        world.setBrainConfig(g.id, cfg);
      }
      if (entry.body?.traits) g.traits = entry.body.traits;
      if (entry.body?.style && g.style !== entry.body.style) {
        const bs = document.getElementById('bodyStyle');
        if (bs) { bs.value = entry.body.style; bs.dispatchEvent(new Event('change')); }
      }
      world.saveWorldState();
      toast('applied "' + name + '" to ' + g.id, { type: 'success' });
    };

    $('deleteCharacterPreset').onclick = async () => {
      const name = $('characterPresetSelect').value;
      const all = load(GKEY);
      if (!all[name]) return toast('pick a saved character first', { type: 'warn' });
      if (await window.confirmDialog('Delete saved character "' + name + '"? Any live copies stay in the world.', { title: 'Delete character?', confirmText: 'delete', danger: true })) {
        delete all[name];
        save(GKEY, all);
        refresh();
        toast('deleted "' + name + '"', { type: 'info' });
      }
    };

    refresh();
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (window.tablefolk?.ready) { clearInterval(timer); init(); }
    else if (++tries > 130) clearInterval(timer);
  }, 300);
})();
