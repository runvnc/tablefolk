// Injected before page scripts. Lets an outside caller grab the last WebGPU
// frame: window.__gpuCapture() -> Promise<dataURL>.
(() => {
  if (!window.GPUCanvasContext) return;
  const ctxInfo = new Map(); // context -> {device, format, canvas}
  let lastTex = null, lastCtx = null, pending = null;
  const origConfigure = GPUCanvasContext.prototype.configure;
  GPUCanvasContext.prototype.configure = function (cfg) {
    cfg = { ...cfg, usage: (cfg.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC };
    ctxInfo.set(this, { device: cfg.device, format: cfg.format });
    return origConfigure.call(this, cfg);
  };
  const origGet = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function () {
    const t = origGet.call(this); lastTex = t; lastCtx = this; return t;
  };
  const origSubmit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (bufs) {
    const r = origSubmit.call(this, bufs);
    if (pending && lastTex && lastCtx) {
      const info = ctxInfo.get(lastCtx); if (!info) return r;
      const p = pending; pending = null;
      const { device, format } = info, w = lastTex.width, h = lastTex.height;
      const bpr = Math.ceil(w * 4 / 256) * 256;
      const buf = device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: lastTex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
      origSubmit.call(this, [enc.finish()]);
      buf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Uint8Array(buf.getMappedRange());
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const c2 = c.getContext('2d'), img = c2.createImageData(w, h), bgra = format.startsWith('bgra');
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const s = y * bpr + x * 4, d = (y * w + x) * 4;
          img.data[d] = src[s + (bgra ? 2 : 0)]; img.data[d + 1] = src[s + 1];
          img.data[d + 2] = src[s + (bgra ? 0 : 2)]; img.data[d + 3] = 255;
        }
        c2.putImageData(img, 0, 0); buf.unmap(); p.resolve(c.toDataURL('image/png'));
      }, p.reject);
    }
    return r;
  };
  window.__gpuCapture = () => new Promise((resolve, reject) => { pending = { resolve, reject }; });
  window.__gpuCaptureArmNow = () => { window.__gpuCapPromise = window.__gpuCapture(); };
})();
