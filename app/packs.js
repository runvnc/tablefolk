/* packs.js -- asset packs: where models and textures come from.
 *
 * The assets base is ?assets=<url>, else window.TABLEFOLK_ASSETS, else the
 * local ./assets/ folder. Its pack.json is the core pack. A pack is a folder
 * with a pack.json manifest; its "items" become object types (scenarios,
 * map lines, click-to-spawn). Files resolve relative to the manifest, so a
 * pack can live on any static host that allows CORS. Packs are data only.
 *
 *   window.tablefolkPacks.base           assets base URL (trailing slash)
 *   window.tablefolkPacks.ready          promise: the core pack is loaded
 *   window.tablefolkPacks.load(url)      load another pack; resolves to its new item types
 *   window.tablefolkPacks.items          { type: { url, pack, w, h, d, ... } }
 */
(function () {
  const param = new URLSearchParams(location.search).get('assets');
  const raw = param || window.TABLEFOLK_ASSETS || './assets/';
  const base = new URL(raw.endsWith('/') ? raw : raw + '/', location.href).href;
  const items = {}, loaded = new Map(), listeners = [];

  const NUM = ['w', 'h', 'd', 'mass', 'scale', 'visualYOffset', 'visualRy'];
  function cleanItem(type, it, packUrl, packId) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(type)) throw new Error(`item type "${type}": use lowercase letters, digits and _`);
    if (!it || typeof it.file !== 'string') throw new Error(`item "${type}" needs a "file"`);
    const out = { url: new URL(it.file, packUrl).href, pack: packId };
    for (const k of NUM) if (it[k] != null) { if (!Number.isFinite(+it[k])) throw new Error(`item "${type}": ${k} must be a number`); out[k] = +it[k]; }
    for (const k of ['static', 'flammable', 'decor', 'clay']) if (it[k] != null) out[k] = !!it[k];
    if (it.fit === 'height' || it.fit === 'footprint') out.fit = it.fit;
    if (typeof it.material === 'string') out.material = it.material;
    if (typeof it.shape === 'string') out.shape = it.shape.toUpperCase();
    out.aliases = Array.isArray(it.aliases) ? it.aliases.map(String).filter(a => /^[a-z][a-z0-9_]*$/.test(a)) : [];
    out.tags = Array.isArray(it.tags) ? it.tags.map(String) : [];
    return out;
  }

  function load(url) {
    const packUrl = new URL(url, base).href;
    if (loaded.has(packUrl)) return loaded.get(packUrl);
    const p = (async () => {
      const r = await fetch(packUrl);
      if (!r.ok) throw new Error(`asset pack ${packUrl}: HTTP ${r.status}`);
      const pack = await r.json();
      const id = String(pack.id || packUrl);
      const added = [];
      for (const [type, it] of Object.entries(pack.items || {})) {
        // The first pack to define a type keeps it (the core pack loads first).
        if (items[type]) { if (items[type].pack !== id) console.warn(`[packs] ${id}: "${type}" already defined by ${items[type].pack}; skipped`); continue; }
        items[type] = cleanItem(type, it, packUrl, id);
        added.push(type);
      }
      console.log(`[packs] ${id}: ${added.length} item types from ${packUrl}`);
      for (const fn of listeners) try { fn(added, id); } catch (e) { console.error(e); }
      return added;
    })();
    loaded.set(packUrl, p);
    p.catch(() => loaded.delete(packUrl));
    return p;
  }

  window.tablefolkPacks = {
    base, items, load,
    ready: load('pack.json?v=20261022a'),
    onItems: fn => listeners.push(fn),
  };
})();
