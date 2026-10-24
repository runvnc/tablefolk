/* locks.js -- locked doors and the keys that open them.
 *
 * Scenario: "locked": [{"in": "treasure", "key": "silver key"}] locks every
 * door into that place (a generated map's room or building), and
 * {"at": [x, z], "key": "iron key"} one door. "key" is the item that opens
 * it (default "key"; any item with "key" in its name that matches).
 *
 * A locked door blocks everyone (isBlocked in app.js) and stays shut. The
 * player opens it by walking into it, or with E, while carrying the key: it
 * stays unlocked. Without the key a note says what it needs.
 *
 *   window.tablefolkLocks.apply(scn, places)   scenario.js, after building
 *   window.tablefolkLocks.lockedAt(x, z)       the locked door on that square
 *   window.tablefolkLocks.tryOpen(door)        the player tries it: true when it opens
 * Loaded after app.js; uses its globals (state, meta).
 */
(function () {
  const doors = () => state.blocks.filter(b => b && !b.isDisposed?.() && meta(b)?.type === 'door');
  const posOf = m => m.getAbsolutePosition?.() || m.position;
  function lockedAt(x, z) {
    for (const d of doors()) { const mm = meta(d), p = posOf(d); if (mm.locked && Math.round(p.x) === Math.round(x) && Math.round(p.z) === Math.round(z)) return d; }
    return null;
  }
  function apply(scn, places = []) {
    for (const rule of Array.isArray(scn?.locked) ? scn.locked : []) {
      const key = String(rule?.key || 'key').trim() || 'key';
      if (Array.isArray(rule.at)) { const d = doors().find(d => { const p = posOf(d); return Math.round(p.x) === Math.round(+rule.at[0]) && Math.round(p.z) === Math.round(+rule.at[1]); }); if (d) meta(d).locked = key; continue; }
      const want = String(rule.in || '').toLowerCase();
      const pl = places.filter(p => p.id?.toLowerCase() === want || p.id?.toLowerCase().replace(/\s+\d+$/, '') === want);
      if (!pl.length) { console.warn('[locks] no place', rule.in); continue; }
      // the doors on (or just outside) the place's edge
      for (const p of pl) for (const d of doors()) {
        const q = posOf(d), x = Math.round(q.x), z = Math.round(q.z);
        if (x >= p.x0 - 1 && x <= p.x1 + 1 && z >= p.z0 - 1 && z <= p.z1 + 1) meta(d).locked = key;
      }
    }
  }
  function keyFor(lock) {
    const want = lock.toLowerCase();
    return (state.player?.items || []).find(i => {
      if ((i.qty ?? 1) <= 0) return false;
      const n = String(i.name).toLowerCase();
      return n === want || (/key/.test(n) && (n.includes(want) || want.includes(n)));
    });
  }
  let lastNote = 0;
  function tryOpen(door) {
    const mm = meta(door); if (!mm?.locked) return true;
    const p = posOf(door), k = keyFor(mm.locked);
    if (!k) {
      if (performance.now() - lastNote > 1500) { lastNote = performance.now(); window.tablefolkToast?.(`The door is locked. It needs ${/^(a|an|the) /i.test(mm.locked) ? mm.locked : 'the ' + mm.locked}.`); window.tablefolkSfx?.play('step', p); }
      return false;
    }
    mm.locked = null;
    window.tablefolkToast?.(`You unlock the door with the ${k.name}.`, { type: 'success' });
    window.tablefolkSfx?.play('chestOpen', p);
    try { state.globalHistory = (state.globalHistory || []).concat([`player unlocks a door with the ${k.name}`]).slice(-20); } catch {}
    return true;
  }
  window.tablefolkLocks = { apply, lockedAt, tryOpen, keyFor };
})();
