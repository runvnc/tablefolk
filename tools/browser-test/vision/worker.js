// Vision test worker: can Gemma 4 (the web .litertlm already cached for the
// game) see an image with @litert-lm/core's vision encoder? Classic worker,
// like app/llm_js/litert-worker.js.
const VER = new URL(location.href).searchParams.get('v') || '0.19.0-nightly.20261023';
let lib;
const ready = (async () => { lib = await import(`https://cdn.jsdelivr.net/npm/@litert-lm/core@${VER}/+esm`); })();
let engine = null;
const log = (...a) => postMessage({ type: 'log', text: a.join(' ') });
onmessage = async e => {
  const d = e.data;
  try {
    await ready;
    if (d.type === 'load') {
      let stream;
      if (d.url) { const r = await fetch(d.url); log('model url', r.status, r.headers.get('content-length')); stream = r.body; }
      else { const root = await navigator.storage.getDirectory(); const fh = await root.getFileHandle(`litert-${d.key}.litertlm`); const file = await fh.getFile(); log('model file', file.size); stream = file.stream(); }
      self.Module = { locateFile: p => `https://cdn.jsdelivr.net/npm/@litert-lm/core@${VER}/wasm/` + p };
      const t0 = performance.now();
      engine = await lib.Engine.create({ model: stream, mainExecutorSettings: { maxNumTokens: 4096 }, visionBackend: lib.Backend[d.vision || 'GPU'], maxVisionTokensPerImage: d.tokens || 256 });
      log('engine in', Math.round(performance.now() - t0), 'ms');
      postMessage({ type: 'loaded' });
    } else if (d.type === 'text') {
      const t0 = performance.now(); const conv = await engine.createConversation({});
      let first = 0, n = 0, text = '';
      for await (const ch of conv.sendMessageStreaming(d.text)) { if (!first) first = performance.now(); const t = typeof ch === 'string' ? ch : (ch?.content || []).map(p => p.text || '').join(''); text += t; n++; }
      postMessage({ type: 'answer', text: `chunks ${n}, chars ${text.length}, first ${Math.round(first - t0)} ms, total ${Math.round(performance.now() - t0)} ms: ${text.slice(0, 120)}`, ms: Math.round(performance.now() - t0) });
    } else if (d.type === 'ask') {
      const t0 = performance.now();
      const conv = await engine.createConversation({});
      const r = await conv.sendMessage({ role: 'user', content: [{ type: 'image', data: d.blob }, { type: 'text', text: d.text }] });
      const text = typeof r === 'string' ? r : (r?.content || []).map(p => p.text || '').join('') || JSON.stringify(r);
      try { conv.delete?.(); } catch {}
      postMessage({ type: 'answer', text, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) { postMessage({ type: 'error', text: String(err?.stack || err) }); }
};
