/* cutaway.js -- walls between the camera and the player drop to a low stub,
 * the way Diablo-like games keep the hero in sight under a high, fixed
 * camera. Used by app.js's "follow" camera (the default with an avatar).
 *
 * It works on the wall geometry itself, for every wall style: in merged
 * meshes (the walls' cores, door frames) the vertices in the cut area are
 * pushed down to the stub height; thin-instanced stones there are hidden;
 * door leaves there are hidden. Recomputed only when the player changes
 * square (or the walls are rebuilt), so it costs nothing per frame.
 *
 *   window.tablefolkCutaway.update(x, z)   cut around this square (camera to the south)
 *   window.tablefolkCutaway.clear()        walls back to full height
 * Loaded after app.js; uses its globals (state).
 */
(function () {
  const STUB = .45, AHEAD = .35, DEPTH = 7, WIDE = 8;
  const orig = new WeakMap();   // mesh -> original positions or matrices
  let key = '', cut = new Set();

  // the area that hides the player from a camera standing to the south (+z)
  const inside = (x, z, px, pz) => z > pz + AHEAD && z < pz + DEPTH && Math.abs(x - px) < WIDE - (z - pz) * .3;

  function meshes() { return (state.wallVisuals || []).filter(m => m && !m.isDisposed?.() && m.getTotalVertices); }
  function apply(m, px, pz, top, on) {
    if (m.metadata?.proxy && !m.thinInstanceCount) {
      // a door leaf: hide it while it is in the way
      const p = m.getAbsolutePosition(); m.isVisible = !(on && inside(p.x, p.z, px, pz));
      return;
    }
    if (m.thinInstanceCount > 0) {
      let o = orig.get(m);
      if (!o) { const b = m._thinInstanceDataStorage?.matrixData; if (!b) return; o = { matrices: new Float32Array(b) }; orig.set(m, o); }
      const out = new Float32Array(o.matrices), n = out.length / 16;
      if (on) for (let i = 0; i < n; i++) {
        const x = out[i * 16 + 12], y = out[i * 16 + 13], z = out[i * 16 + 14];
        if (y > top + STUB && inside(x, z, px, pz)) for (let k = 0; k < 15; k++) out[i * 16 + k] = 0;
      }
      m.thinInstanceSetBuffer('matrix', out, 16, false);
      return;
    }
    let o = orig.get(m);
    if (!o) {
      const p = m.getVerticesData(BABYLON.VertexBuffer.PositionKind); if (!p) return;
      // positions are in the mesh's local space; walls sit at the origin
      o = { positions: Float32Array.from(p) }; orig.set(m, o);
      m.markVerticesDataAsUpdatable?.(BABYLON.VertexBuffer.PositionKind, true);
    }
    const out = Float32Array.from(o.positions), lim = top + STUB;
    if (on) for (let i = 0; i < out.length; i += 3) if (out[i + 1] > lim && inside(out[i], out[i + 2], px, pz)) out[i + 1] = lim;
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind, out, false, false);
    m.refreshBoundingInfo?.();
  }
  function update(x, z) {
    const px = Math.round(x), pz = Math.round(z), list = meshes(), k = px + ',' + pz + '|' + list.reduce((a, m) => a + m.uniqueId, 0);
    if (k === key) return;
    key = k;
    const top = state.terrainTopY ?? 0;
    for (const m of list) try { apply(m, px, pz, top, true); } catch (e) { console.warn('[cutaway]', m.name, e); }
    cut = new Set(list);
  }
  function clear() {
    if (!cut.size) return;
    const top = state.terrainTopY ?? 0;
    for (const m of cut) if (!m.isDisposed?.()) try { apply(m, 0, 0, top, false); } catch {}
    cut = new Set(); key = '';
  }
  window.tablefolkCutaway = { update, clear };
})();
