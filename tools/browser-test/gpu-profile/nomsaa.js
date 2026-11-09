(() => {
  const ct = GPUDevice.prototype.createTexture;
  GPUDevice.prototype.createTexture = function (d) { if (d.sampleCount > 1) d = { ...d, sampleCount: 1 }; return ct.call(this, d); };
  const fix = d => d?.multisample?.count > 1 ? { ...d, multisample: { ...d.multisample, count: 1 } } : d;
  const cp = GPUDevice.prototype.createRenderPipeline; GPUDevice.prototype.createRenderPipeline = function (d) { return cp.call(this, fix(d)); };
  const cpa = GPUDevice.prototype.createRenderPipelineAsync; GPUDevice.prototype.createRenderPipelineAsync = function (d) { return cpa.call(this, fix(d)); };
  const brp = GPUCommandEncoder.prototype.beginRenderPass;
  GPUCommandEncoder.prototype.beginRenderPass = function (d) { if (d.colorAttachments?.some(a => a?.resolveTarget)) d = { ...d, colorAttachments: d.colorAttachments.map(a => a?.resolveTarget ? { ...a, view: a.resolveTarget, resolveTarget: undefined } : a) }; return brp.call(this, d); };
})();
