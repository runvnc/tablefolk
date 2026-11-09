(() => {
  const G = window.__gpu = { frames: [], on: true, keep: 600 };
  const rd = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (d = {}) {
    if (this.features.has('timestamp-query')) d = { ...d, requiredFeatures: [...new Set([...(d.requiredFeatures || []), 'timestamp-query'])] };
    const dev = await rd.call(this, d);
    if (!dev.features.has('timestamp-query')) return dev;
    const N = 128;
    const S = { dev, qs: dev.createQuerySet({ type: 'timestamp', count: N * 2 }), resolve: dev.createBuffer({ size: N * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), pool: [], idx: 0, passes: [], active: false };
    for (let i = 0; i < 4; i++) S.pool.push(dev.createBuffer({ size: N * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
    G.S = S; G.dev = dev;
    return dev;
  };
  const brp = GPUCommandEncoder.prototype.beginRenderPass;
  GPUCommandEncoder.prototype.beginRenderPass = function (desc) {
    const S = G.S;
    if (S && G.on && S.idx < 128 && (S.active || S.pool.length)) {
      S.active = true;
      const i = S.idx++, a = desc.colorAttachments?.[0], tex = a?.view?.texture || a?.resolveTarget?.texture;
      S.passes.push({ label: desc.label || '', fmt: '', samples: '', depth: !!desc.depthStencilAttachment, resolve: !!a?.resolveTarget, n: desc.colorAttachments?.length || 0 });
      desc = { ...desc, timestampWrites: { querySet: S.qs, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 } };
    }
    return brp.call(this, desc);
  };
  const sub = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (cbs) {
    const S = G.S;
    if (!S || !S.active || !S.idx) return sub.call(this, cbs);
    const n = S.idx, passes = S.passes, buf = S.pool.pop();
    const enc = S.dev.createCommandEncoder();
    enc.resolveQuerySet(S.qs, 0, n * 2, S.resolve, 0);
    enc.copyBufferToBuffer(S.resolve, 0, buf, 0, n * 16);
    const r = sub.call(this, [...cbs, enc.finish()]);
    S.idx = 0; S.passes = []; S.active = false;
    const t = performance.now();
    buf.mapAsync(GPUMapMode.READ, 0, n * 16).then(() => {
      const a = new BigInt64Array(buf.getMappedRange(0, n * 16));
      const out = passes.map((p, i) => ({ ...p, ms: Number(a[i * 2 + 1] - a[i * 2]) / 1e6, at: Number(a[i * 2] - a[0]) / 1e6 }));
      buf.unmap(); S.pool.push(buf);
      G.frames.push({ t, passes: out, total: out.reduce((s, p) => s + p.ms, 0), span: Number(a[n * 2 - 1] - a[0]) / 1e6 });
      if (G.frames.length > G.keep) G.frames.shift();
    }, () => S.pool.push(buf));
    return r;
  };
})();
