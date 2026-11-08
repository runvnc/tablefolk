/* browser-check.js -- what this browser can do, and what that means here.
 *
 * Loaded by index.html before preflight.js. Preflight calls
 * TablefolkBrowserCheck.publish(adapter) with the adapter it already
 * requested (no second adapter, nothing awaited, no network), which sets
 *
 *   window.tablefolkBrowser = {
 *     name, version, major, os, mobile, ua,
 *     webgpu, adapter: {vendor, architecture, device, description, fallback},
 *     f16, limits: {maxBufferSize, maxStorageBufferBindingSize},
 *     jspi, isolated, sharedArrayBuffer, cores, deviceMemory,
 *     needs: {world, breezeWeb, wllamaGpu, barkGpu} -> '' or the reason,
 *     warnings: [short sentences], why(feature, overrides?) -> reason or ''
 *   }
 *
 * fills the Graphics pane's "This browser" section (detected values with
 * ✓/✗ and what each enables) and, after the world has loaded and the
 * welcome screen is closed, shows at most one warn toast (old Safari / Firefox / Chrome without JSPI), once per
 * browser version. The compatibility screen (no WebGPU) uses hint() and
 * line() for its text.
 *
 * What needs what: the 3D world and Gemma need WebGPU; Breeze in the
 * browser needs WebGPU + JSPI + shader-f16; wllama models (Qwen...) need
 * WebGPU + JSPI for the GPU, else the CPU; Bark speech input uses
 * shader-f16 when there, else the CPU. JSPI: Chrome/Edge 137+, Firefox 153+,
 * Safari 27+. The pure functions (parseUA, assess) run in node for tests.
 */
(() => {
  'use strict';
  const JSPI_FROM = { Chrome: 137, Edge: 137, Firefox: 153, Safari: 27 };
  const SEEN_KEY = 'tablefolk.browserWarned';

  function parseUA(ua = '', platform = '', touch = 0) {
    let name = 'Unknown browser', version = '';
    let m;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
    if (ios && (m = ua.match(/(CriOS|FxiOS|EdgiOS)\/([\d.]+)/))) {
      // every iOS browser is WebKit: its abilities follow the system's Safari
      name = { CriOS: 'Chrome', FxiOS: 'Firefox', EdgiOS: 'Edge' }[m[1]];
      version = m[2];
    } else if ((m = ua.match(/Edg(?:e|A)?\/([\d.]+)/))) { name = 'Edge'; version = m[1]; }
    else if ((m = ua.match(/OPR\/([\d.]+)/))) { name = 'Opera'; version = m[1]; }
    else if ((m = ua.match(/Firefox\/([\d.]+)/))) { name = 'Firefox'; version = m[1]; }
    else if ((m = ua.match(/(?:Chrome|Chromium)\/([\d.]+)/))) { name = 'Chrome'; version = m[1]; }
    else if ((m = ua.match(/Version\/([\d.]+).*Safari\//))) { name = 'Safari'; version = m[1]; }
    const os = ios ? (/iPad/.test(ua) || /Macintosh/.test(ua) ? 'iPadOS' : 'iOS')
      : /Windows/.test(ua) ? 'Windows'
      : /Android/.test(ua) ? 'Android'
      : /CrOS/.test(ua) ? 'ChromeOS'
      : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
      : /Linux/.test(ua) ? 'Linux' : (platform || 'unknown OS');
    // iOS browsers follow Safari's version (the system's)
    // Opera follows its Chromium version, browsers on iOS the system's WebKit
    const engine = ios ? 'Safari' : name === 'Opera' ? 'Chrome' : name;
    const short = String(version).split('.').slice(0, 2).join('.');
    const major = parseInt(version, 10) || 0;
    const iosMajor = parseInt((ua.match(/OS (\d+)[_.]\d+/) || [])[1], 10) || 0;
    const engineMajor = name === 'Opera' ? (parseInt((ua.match(/Chrome\/(\d+)/) || [])[1], 10) || 0)
      : ios && name !== 'Safari' ? iosMajor : major;
    return { name, version: short, major, engineMajor, os, mobile: ios || os === 'Android', engine };
  }

  // the browser to suggest for JSPI, by engine
  function upgradeFor(b) {
    if (b.engine === 'Safari') return b.mobile ? 'iOS / iPadOS 27 or later' : 'Safari 27 or later';
    if (b.engine === 'Firefox') return 'Firefox 153 or later';
    if (b.engine === 'Edge') return 'Edge 137 or later';
    if (b.engine === 'Chrome') return 'Chrome or Edge 137 or later';
    return 'Chrome or Edge 137+, Safari 27+ or Firefox 153+';
  }

  // env: { ua, platform, touch, gpu (navigator.gpu present), adapter (GPUAdapter or a plain
  // {features: [...], limits, info, isFallbackAdapter}), jspi, isolated, sab, cores, deviceMemory }
  function assess(env) {
    const b = parseUA(env.ua, env.platform, env.touch);
    const a = env.adapter || null;
    const has = f => !!a && (typeof a.features?.has === 'function' ? a.features.has(f) : Array.isArray(a.features) && a.features.includes(f));
    const info = (a && (a.info || {})) || {};
    const lim = (a && a.limits) || {};
    const r = {
      ...b, ua: env.ua || '',
      webgpu: !!a, gpuApi: !!env.gpu,
      adapter: a ? { vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '', description: info.description || '', fallback: !!(a.isFallbackAdapter || info.isFallbackAdapter) } : null,
      f16: has('shader-f16'),
      limits: a ? { maxBufferSize: lim.maxBufferSize || 0, maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize || 0 } : null,
      jspi: !!env.jspi, isolated: !!env.isolated, sharedArrayBuffer: !!env.sab,
      cores: env.cores || 0, deviceMemory: env.deviceMemory || 0,
    };
    const nvidiaLinux = r.os === 'Linux' && /nvidia/i.test(r.adapter?.vendor || '');
    const noGpu = r.gpuApi ? 'WebGPU is present but found no usable graphics adapter' : 'this browser has no WebGPU';
    const noJspi = `this browser has no JSPI (WebAssembly.Suspending); it needs ${upgradeFor(r)}`;
    const noF16 = 'the graphics card offers no WebGPU shader-f16' + (nvidiaLinux && r.engine === 'Chrome' ? ' (Chrome on Linux with NVIDIA: start it with --enable-dawn-features=vulkan_enable_f16_on_nvidia)' : '');
    r.reasons = { noGpu, noJspi, noF16 };
    r.why = (feature, o = {}) => {
      const webgpu = o.webgpu ?? r.webgpu, jspi = o.jspi ?? r.jspi, f16 = o.f16 ?? r.f16;
      if (!webgpu) return noGpu;
      if ((feature === 'breezeWeb' || feature === 'breeze-web' || feature === 'wllamaGpu') && !jspi) return noJspi;
      if ((feature === 'breezeWeb' || feature === 'breeze-web' || feature === 'barkGpu') && !f16) return noF16;
      return '';
    };
    r.needs = { world: r.why('world'), breezeWeb: r.why('breezeWeb'), wllamaGpu: r.why('wllamaGpu'), barkGpu: r.why('barkGpu') };

    // the warnings worth a toast: a WebGPU browser too old for JSPI
    r.warnings = [];
    if (r.webgpu && !r.jspi) {
      const from = JSPI_FROM[r.engine];
      const who = `${r.name} ${r.version}`.trim();
      if (from && r.engineMajor && r.engineMajor < from)
        r.warnings.push(`${who} has WebGPU but not JSPI: voices in the browser (Breeze) and GPU speed for Qwen models need ${upgradeFor(r)}. Characters still work.`);
      else
        r.warnings.push(`${who} has no JSPI (WebAssembly.Suspending; it may be turned off): voices in the browser (Breeze) and GPU speed for Qwen models need it. Characters still work.`);
    }
    return r;
  }

  // the compatibility screen's advice for a browser without WebGPU
  function hint(r) {
    const v = `${r.name} ${r.version}`.trim();
    if (r.engine === 'Firefox') {
      if (r.os === 'Linux' || r.os === 'Android') return `Firefox has no WebGPU on ${r.os} yet (only in Nightly). Use Chrome or Edge 137 or newer.`;
      if (r.os === 'macOS') return `Firefox on a Mac has WebGPU only on Apple Silicon Macs (Firefox 147 or newer), not on Intel Macs. Update Firefox, or use Safari 27 or Chrome.`;
      return `${v} has no WebGPU here. Update to Firefox 153 or newer, or use Chrome or Edge.`;
    }
    if (r.engine === 'Safari') return r.engineMajor && r.engineMajor < 26 ? `${v} has no WebGPU: it arrived in Safari 26 (Safari 27 or newer runs everything). Update the system.` : `${v} reports no WebGPU: check that it is not turned off (Safari > Settings > Advanced > Feature Flags).`;
    if (r.engine === 'Chrome' || r.engine === 'Edge') {
      if (r.os === 'Linux') return `${v} on Linux: WebGPU is on by default from about version 144; older versions need chrome://flags/#enable-unsafe-webgpu and a Vulkan driver. Update Chrome, or check chrome://gpu.`;
      return `${v}: WebGPU may be blocked for this graphics card or driver. Update the browser and graphics driver, and check chrome://gpu.`;
    }
    return 'Use Chrome or Edge 137 or newer, Safari 27 or newer, or Firefox 153 or newer on Windows or an Apple Silicon Mac.';
  }

  const yn = x => (x ? 'yes' : 'no');
  function line(r) {
    return `Detected: ${r.name} ${r.version} on ${r.os} · WebGPU API: ${yn(r.gpuApi)} · adapter: ${yn(r.webgpu)} · JSPI: ${yn(r.jspi)} · threads (cross-origin isolated): ${yn(r.isolated)}`;
  }

  const mb = n => (n ? `${Math.round(n / 2 ** 20)} MB` : '?');
  // rows for the pane: [what, detected value, ok (true/false/null = info), what it enables]
  function rows(r) {
    const ad = r.adapter;
    const gpuName = ad ? [ad.vendor, ad.architecture, ad.description].filter(Boolean).join(' · ') || 'unnamed adapter' : (r.gpuApi ? 'no adapter' : 'not in this browser');
    return [
      ['Browser', `${r.name} ${r.version} on ${r.os}`, null, 'Chrome/Edge 137+, Safari 27+ or Firefox 153+ run everything'],
      ['WebGPU', gpuName + (ad?.fallback ? ' (software fallback)' : ''), r.webgpu, 'the 3D world and the characters (Gemma)'],
      ['shader-f16', r.webgpu ? yn(r.f16) : '—', r.f16, 'Breeze in the browser; speech input on the GPU (else the CPU, slower)'],
      ['JSPI', yn(r.jspi), r.jspi, 'Breeze in the browser; Qwen and other wllama models on the GPU (else the CPU)'],
      ['Threads', r.isolated ? `cross-origin isolated, ${r.cores || '?'} cores` : 'not isolated: one thread', r.isolated, 'faster CPU voices (Pocket-TTS) and CPU models'],
      ['GPU buffers', r.limits ? `largest ${mb(r.limits.maxBufferSize)}, storage binding ${mb(r.limits.maxStorageBufferBindingSize)}` : '—', null, 'larger models need larger buffers'],
      ['Memory', r.deviceMemory ? `about ${r.deviceMemory} GB (rounded by the browser)` : 'not reported', null, 'browsers never report graphics memory'],
    ];
  }
  function runs(r) {
    return [
      ['3D world and characters (Gemma)', r.needs.world, ''],
      ['Voices in the browser (Breeze)', r.needs.breezeWeb, 'the voices on the CPU (Pocket-TTS) or a Breeze server still work'],
      ['Qwen models on the GPU', r.needs.wllamaGpu, 'they run on the CPU, slower'],
      ['Speech input on the GPU', r.needs.barkGpu, 'it runs on the CPU, slower'],
    ];
  }

  function render(r) {
    const pane = document.getElementById('pane-graphics');
    if (!pane || document.getElementById('browserCheck')) return;
    const box = document.createElement('div');
    box.id = 'browserCheck';
    const h = document.createElement('div'); h.className = 'section-subtitle'; h.textContent = 'This browser';
    const t = document.createElement('table'); t.className = 'browser-check';
    const add = (cells, cls) => { const tr = t.insertRow(); if (cls) tr.className = cls; for (const c of cells) { const td = tr.insertCell(); td.textContent = c; } return tr; };
    for (const [what, val, ok, enables] of rows(r)) {
      const tr = add([ok === null ? '·' : ok ? '✓' : '✗', what, val]);
      tr.className = ok === null ? 'bc-info' : ok ? 'bc-ok' : 'bc-no';
      const en = document.createElement('div'); en.className = 'bc-enables'; en.textContent = enables;
      tr.cells[2].appendChild(en);
    }
    const sub = document.createElement('div'); sub.className = 'section-subtitle'; sub.textContent = 'What runs here';
    const list = document.createElement('ul'); list.className = 'browser-runs';
    for (const [what, why, instead] of runs(r)) {
      const li = document.createElement('li'); li.className = why ? 'bc-no' : 'bc-ok';
      li.textContent = (why ? '✗ ' : '✓ ') + what + (why ? `: no, ${why}${instead ? `; ${instead}` : ''}` : '');
      list.appendChild(li);
    }
    const note = document.createElement('small'); note.className = 'pane-note';
    note.textContent = r.warnings.length ? r.warnings.join(' ') : 'Detected when the page started; also in window.tablefolkBrowser.';
    box.append(h, t, sub, list, note);
    const reset = document.getElementById('gfxResetDefaults');
    if (reset && reset.parentNode === pane) pane.insertBefore(box, reset); else pane.appendChild(box);
  }

  // one warn toast after the world has loaded, once per browser version
  function toastLater(r) {
    if (!r.warnings.length || window.TABLEFOLK_TABLETOP) return;
    const id = `${r.name} ${r.version}`;
    try { if (localStorage.getItem(SEEN_KEY) === id) return; } catch {}
    // after the world has loaded and the welcome screen (which covers toasts) is closed
    const tryShow = () => {
      if (document.documentElement.classList.contains('welcome-open')) return setTimeout(tryShow, 1000);
      try { localStorage.setItem(SEEN_KEY, id); } catch {}
      window.tablefolkToast?.(r.warnings[0] + ' Details: Graphics pane, "This browser".', {
        type: 'warn', duration: 12000,
        action: { label: 'details', onClick: () => { window.tablefolkTabs?.show('graphics'); document.getElementById('browserCheck')?.scrollIntoView({ block: 'start' }); } },
      });
    };
    window.addEventListener('tablefolk-scene-ready', () => setTimeout(tryShow, 2500), { once: true });
  }

  function envNow(adapter) {
    const n = typeof navigator !== 'undefined' ? navigator : {};
    return {
      ua: n.userAgent || '', platform: n.userAgentData?.platform || n.platform || '', touch: n.maxTouchPoints || 0,
      gpu: !!n.gpu, adapter: adapter || null,
      jspi: typeof WebAssembly !== 'undefined' && typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function',
      isolated: typeof crossOriginIsolated !== 'undefined' && !!crossOriginIsolated,
      sab: typeof SharedArrayBuffer !== 'undefined', cores: n.hardwareConcurrency || 0, deviceMemory: n.deviceMemory || 0,
    };
  }

  // called by preflight with its adapter (or null); synchronous
  function publish(adapter) {
    let r;
    try { r = assess(envNow(adapter)); } catch (e) { console.warn('[browser-check]', e); return null; }
    window.tablefolkBrowser = r;
    console.info('[browser-check]', line(r), r.adapter || '', r.warnings[0] || '');
    try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(r), { once: true }); else render(r); } catch (e) { console.warn('[browser-check] render', e); }
    if (r.webgpu) toastLater(r);
    return r;
  }

  const api = { parseUA, assess, hint, line, rows, runs, publish, JSPI_FROM };
  if (typeof window !== 'undefined') window.TablefolkBrowserCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
