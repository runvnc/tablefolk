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
 *   window.tablefolkPacks.add(pack, url)  add a pack's items given inline (a package's "items")
 *   window.tablefolkPacks.items          { type: { url, pack, w, h, d, ... } }
 * A pack.json may also carry "bodies" (bodies.js) and "sounds" (sfx.js
 * registerAll): characters' bodies and named sounds, files relative to it.
 */
(function () {
  const param = new URLSearchParams(location.search).get('assets');
  const raw = param || window.TABLEFOLK_ASSETS || './assets/';
  const base = new URL(raw.endsWith('/') ? raw : raw + '/', location.href).href;
  const items = {}, loaded = new Map(), listeners = [];

  const NUM = ['w', 'h', 'd', 'mass', 'scale', 'visualYOffset', 'visualRy', 'nourish'];
  function cleanItem(type, it, packUrl, packId) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(type)) throw new Error(`item type "${type}": use lowercase letters, digits and _`);
    if (!it || typeof it.file !== 'string') throw new Error(`item "${type}" needs a "file"`);
    const out = { url: new URL(it.file, packUrl).href, pack: packId };
    for (const k of NUM) if (it[k] != null) { if (!Number.isFinite(+it[k])) throw new Error(`item "${type}": ${k} must be a number`); out[k] = +it[k]; }
    for (const k of ['static', 'flammable', 'decor', 'clay']) if (it[k] != null) out[k] = !!it[k];
    if (it.fit === 'height' || it.fit === 'footprint') out.fit = it.fit;
    // "tier": a lighter copy for light quality next to the file ("med": name.med.gltf, "1k": name.1k.glb);
    // "variants": other files of the same thing, one chosen per placed copy by its square
    if (it.tier === 'med' || it.tier === '1k') out.tier = it.tier;
    if (Array.isArray(it.variants)) out.variantUrls = it.variants.filter(f => typeof f === 'string').map(f => new URL(f, packUrl).href);
    if (typeof it.material === 'string') out.material = it.material;
    if (typeof it.shape === 'string') out.shape = it.shape.toUpperCase();
    out.aliases = Array.isArray(it.aliases) ? it.aliases.map(String).filter(a => /^[a-z][a-z0-9_]*$/.test(a)) : [];
    out.tags = Array.isArray(it.tags) ? it.tags.map(String) : [];
    // "loop": an animation clip of the model to play on a loop (true: the first)
    if (typeof it.loop === 'string' || it.loop === true) out.loop = it.loop;
    // "use": what pressing E on it does: a behaviour a package module adds
    // ("lever_pull"), or data: { anim, text, sound, give, gold, once, state }
    if (typeof it.use === 'string' || (it.use && typeof it.use === 'object')) out.use = it.use;
    // living worlds (uses.js): what it holds and gives until spent, how it
    // grows back; how gathering from it looks; a kind of station it is
    if (it.stock && typeof it.stock === 'object' && it.stock.item) out.stock = { item: String(it.stock.item), count: Math.max(0, Math.round(+it.stock.count || 1)), regrow: Math.max(0, +it.stock.regrow || 0), ...(typeof it.stock.spent === 'string' ? { spent: it.stock.spent } : {}) };
    if (it.gather && typeof it.gather === 'object') out.gather = Object.fromEntries(['gives', 'anim', 'verb'].filter(k => typeof it.gather[k] === 'string').map(k => [k, it.gather[k]]).concat(Number.isFinite(+it.gather.time) ? [['time', +it.gather.time]] : []));
    if (typeof it.station === 'string' && /^[a-z][a-z0-9_]*$/.test(it.station)) out.station = it.station;
    return out;
  }

  // Add a pack's items (fetched, or a package's "items"); returns the new types.
  function add(pack, packUrl) {
    const id = String(pack.id || packUrl), added = [];
    for (const [type, it] of Object.entries(pack.items || {})) {
      // The first pack to define a type keeps it (the core pack loads first).
      if (items[type]) { if (items[type].pack !== id) console.warn(`[packs] ${id}: "${type}" already defined by ${items[type].pack}; skipped`); continue; }
      try { items[type] = cleanItem(type, it, packUrl, id); added.push(type); } catch (e) { console.warn(`[packs] ${id}: ${e.message}`); }
    }
    // bodies (bodies.js) and sounds (sfx.js) a pack.json brings (a package's go through packages.js)
    if (pack.bodies && !pack._pkg) window.tablefolkBodies?.addAll(pack.bodies, packUrl, id);
    if (pack.sounds && !pack._pkg) window.tablefolkSfx?.registerAll?.(pack.sounds, packUrl, id);
    console.log(`[packs] ${id}: ${added.length} item types from ${packUrl}`);
    for (const fn of listeners) try { fn(added, id); } catch (e) { console.error(e); }
    return added;
  }
  function load(url) {
    const packUrl = new URL(url, base).href;
    if (loaded.has(packUrl)) return loaded.get(packUrl);
    const p = (async () => {
      const r = await fetch(packUrl);
      if (!r.ok) throw new Error(`asset pack ${packUrl}: HTTP ${r.status}`);
      return add(await r.json(), packUrl);
    })();
    loaded.set(packUrl, p);
    p.catch(() => loaded.delete(packUrl));
    return p;
  }

  window.tablefolkPacks = {
    base, items, load, add,
    ready: load('pack.json?v=20261114b'),
    onItems: fn => listeners.push(fn),
  };
})();
