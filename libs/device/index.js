// @tablefolk/device -- what this device can run, so a model picker (and the
// voice and speech input beside it) can start with the best that fits and
// runs fast enough. Used by Tablefolk's picker; works on any page.
//
// No browser reports free graphics memory, and new devices come out all the
// time, so this leans on what can be measured and on broad signs, with the
// name tables only as hints:
//   - the graphics card by name (the WebGL renderer string, probed for the
//     fast GPU and the default one, the discrete one preferred), its memory
//     looked up in gpu-memory.json. The name parsing and lookup are ported
//     from onepunk/llmsizer (src/detection/parse-renderer.ts, detect.ts; MIT,
//     (c) 2026 onepunk); the table is its gpu-specs.ts, generated from
//     onepunk/open-gpu-db v1.2.0 (Apache-2.0);
//   - the WebGPU adapter (vendor, architecture, limits, shader-f16);
//   - User-Agent Client Hints (Chromium): the processor architecture (arm on
//     Windows on Arm) and the form factor (Desktop, Mobile, Tablet, XR);
//   - navigator.deviceMemory (rounded, a lower bound: older Chrome capped it
//     at 8, Chrome 155 reports 16 here) and hardwareConcurrency;
//   - the graphics memory's bandwidth, measured (measureBandwidth: a few
//     buffer copies, about 0.1 s, once per device and browser). It sets how
//     fast a model writes (each token reads all its weights), so it rates any
//     device, also one newer than every table; it also tells a big unified-
//     memory chip (Apple Pro/Max, RTX Spark, Strix Halo: 200+ GB/s) from an
//     ordinary integrated GPU (50-120);
//   - how fast each model really ran here (noteBrainSpeed, from agent-brain):
//     a model measured too slow is not picked by itself again.
//
//   import { detectHardware, recommendModel, usableGB, describeHardware } from '@tablefolk/device';
//   const hw = await detectHardware();   // { gpu, cls, arch, vramGB, shared, sharedGB, memWhy, bwGBs, ... }
//   recommendModel(hw, [{ key: 'small', needGB: 2, readGB: 1 }, { key: 'big', needGB: 6, readGB: 2.3 }], 'small')
//                                        // the biggest model that fits and is fast enough; hw.choiceWhy says why
//   noteBrainSpeed(key, chars, seconds)  // after a reply: a model measured too slow is not picked again
//   hw.vramOptions, hw.vramAsk           // a card sold with more than one memory size ([8, 16]): told
//   setCardMemory(hw.gpu, 16)            //   apart by a probe (probeHolds), else ask the player, keep it, reload
// Kept in localStorage (prefix from @tablefolk/models configure(), 'tablefolk'
// by default): GpuBandwidth (30 days), BrainSpeed, CardProbe and CardGB:<card name>.
import { local } from '../models/index.js';
let tablePromise = null;
const table = () => tablePromise ||= fetch(new URL('./gpu-memory.json', import.meta.url)).then(r => r.json()).catch(() => ({ vram: {}, aliases: {}, integrated: [] }));

function probeRenderer(attrs) {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', attrs) || c.getContext('webgl', attrs);
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const raw = ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return raw || null;
  } catch { return null; }
}

// "ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 (0x00001F08) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 2060"
export function parseRenderer(renderer) {
  let name = String(renderer || '').trim();
  const metal = name.match(/^ANGLE\s*\([^,]+,\s*ANGLE\s+Metal\s+Renderer:\s*(.+?),\s*(?:Unspecified Version|Version\b.*)\)$/i);
  if (metal) name = metal[1].trim();
  else {
    const angle = name.match(/^ANGLE\s*\(([^,]+),\s*(.+?)(?:\s+(?:Direct3D|OpenGL|Metal|Vulkan|D3D)\S*.*?)?,\s*[^,)]+\)$/);
    if (angle) name = angle[2].trim().replace(/\s+(Direct3D\d*|OpenGL|Metal|Vulkan|D3D\d*)\s*.*$/i, '').trim();
  }
  // Linux: "Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 2060 (0x00001F15))"
  const vk = name.match(/^Vulkan [\d.]+ \((.+)\)$/); if (vk) name = vk[1];
  name = name.replace(/\s*\(0x[0-9A-Fa-f]+\)/g, '').replace(/^(\w+) \1\b/i, '$1');
  return name.replace(/\/PCIe\/SSE2\b.*$/, '').replace(/\/SSE2\b.*$/, '').replace(/\/PCIe\b.*$/, '')
    .replace(/\(R\)|\(TM\)/g, '').replace(/\s*\(0x[0-9A-Fa-f]+\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

// Chips that share system memory, newer than the table or listed there as
// dedicated, with the least memory they ship with (GB): NVIDIA's RTX Spark
// (N1X, Windows on Arm, Oct 2026: 24 GB in the smallest laptop) and DGX Spark
// (GB10, 128 GB); AMD Strix Halo (Radeon 8060S/8050S, 32); Intel Lunar Lake
// (Arc 130V/140V, 16). Apple chips by name, so later generations (M6, M7...)
// need no table entry: Ultra 64, Max 32, Pro 16, plain 16 from the M4 (8 before).
// An NVIDIA GPU on an Arm computer is taken for a Spark whatever its name
// (memoryEstimate), so a renamed or newer one is still seen.
const SHARED_CHIPS = [[/\bRTX Spark\b|\bN1X\b/i, 24], [/\bGB10\b|\bDGX Spark\b/i, 128], [/\bRadeon 80[56]0S\b/i, 32], [/\bArc 1[34]0V\b/i, 16]];
export function sharedChipGB(name) {
  for (const [re, gb] of SHARED_CHIPS) if (re.test(name || '')) return gb;
  const m = String(name || '').match(/\bApple M(\d+)(?:\s+(Pro|Max|Ultra))?\b/i); if (!m) return null;
  const tier = (m[2] || '').toLowerCase();
  return tier === 'ultra' ? 64 : tier === 'max' ? 32 : tier === 'pro' ? 16 : +m[1] >= 4 ? 16 : 8;
}

// GB of the card's own memory; 0 when it shares system memory; null unknown.
export function lookupVram(name, t) {
  const lower = name.toLowerCase(), keys = Object.keys(t.vram);
  if (!lower) return null;
  if (sharedChipGB(name)) return 0;
  if (t.integrated.some(p => lower.includes(p.toLowerCase()))) return 0;
  for (const k of keys) if (k.toLowerCase() === lower) return t.vram[k];
  for (const [a, k] of Object.entries(t.aliases)) if (a.toLowerCase() === lower) return t.vram[k] ?? null;
  // the longest name inside this one ("RTX 3090 Ti" before "RTX 3090"),
  // else the shortest name that contains this one
  let best = null;
  for (const k of keys) if (lower.includes(k.toLowerCase()) && (!best || k.length > best.length)) best = k;
  if (!best && lower.length >= 4) for (const k of keys) if (k.toLowerCase().includes(lower) && (!best || k.length < best.length || (k.length === best.length && k < best))) best = k;
  return best ? t.vram[best] : null;
}

// The memory sizes a card is sold with when its name alone does not say
// ("GeForce RTX 4060 Ti": 8 or 16 GB; "RTX 3060": 8 or 12; "RTX 5060 Ti": 8 or
// 16): the table's "<name> <n> GB" entries and the plain name's. [] when the
// name settles it. No browser reports a card's memory.
export function cardVariants(name, t) {
  const lower = String(name || '').toLowerCase(); if (!lower || !t?.vram) return [];
  const gbs = new Set(), is = b => lower === b || lower.endsWith(' ' + b);   // "NVIDIA GeForce RTX 3060" is "GeForce RTX 3060"
  for (const [k, v] of Object.entries(t.vram)) {
    const kl = k.toLowerCase(), base = kl.replace(/ \d+ gb( [a-z]{2}\d{3})?$/, '');
    if (is(kl) || (base !== kl && is(base))) gbs.add(v);
  }
  return gbs.size > 1 ? [...gbs].sort((a, b) => a - b) : [];
}
// Variants told apart by bus width: the card's rated GB/s (measured x1.6) at
// or above which it is the bigger one (RTX 3060: 8 GB on a 128-bit bus, 240
// GB/s; 12 GB on 192-bit, 360)
const VARIANT_BW = { 'geforce rtx 3060': [300, 12] };
// What the player said their card has (Settings, or the download prompt): kept per card name
const CARD_KEY = 'CardGB:';
// ?memprobe=0 (or localStorage <prefix>NoMemProbe '1'): no probe, the smaller size and the question
const noProbe = () => { try { return new URLSearchParams(globalThis.location?.search || '').get('memprobe') === '0' || local.get('NoMemProbe') === '1'; } catch { return false; } };
export function setCardMemory(gpu, gb) { if (gpu) { if (gb) local.set(CARD_KEY + gpu, String(gb)); else local.remove(CARD_KEY + gpu); } }

// Whether the card holds more than `gb` GB: allocate that much in 256 MB
// buffers, clear each (so it really lands on the card) and copy through the
// last. On Vulkan (Linux, Android) a card that is full refuses the buffer
// (out-of-memory); on Windows the driver may page it out to system memory
// instead, and copies through it fall to bus speed (~25 GB/s against the
// card's 150+). true: it held; false: refused, spilled, lost or too slow;
// null: not measured. Under a second on the card, and freed at once. Kept per
// card and browser like the bandwidth (CardProbe).
const PROBE_KEY = 'CardProbe';
export async function probeHolds(adapter, gb, sig, bwGBs = null) {
  try { const c = local.json(PROBE_KEY); if (c?.sig === sig && c.gb === gb && typeof c.holds === 'boolean') return c.holds; } catch {}
  const CH = 256 * 2 ** 20, n = Math.ceil(gb * 2 ** 30 / CH), bufs = [];
  let dev = null, holds = null, lost = false;
  try {
    dev = await adapter.requestDevice();
    dev.lost.then(() => { lost = true; });
    const t0 = performance.now();
    holds = true;
    for (let i = 0; i < n; i++) {
      dev.pushErrorScope('out-of-memory');
      const b = dev.createBuffer({ size: CH, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      const e = dev.createCommandEncoder(); e.clearBuffer(b); dev.queue.submit([e.finish()]);
      bufs.push(b);
      if (await dev.popErrorScope() || lost) { holds = false; break; }
      if (i % 8 === 7) await dev.queue.onSubmittedWorkDone();
      if (performance.now() - t0 > 6000) { holds = false; break; }   // paging: far slower than the card
    }
    if (holds) {
      await dev.queue.onSubmittedWorkDone();
      // copies between the first and the last buffer: still at the card's speed?
      const t = performance.now(), e = dev.createCommandEncoder();
      for (let k = 0; k < 4; k++) e.copyBufferToBuffer(bufs[k % 2 ? 0 : bufs.length - 1], 0, bufs[k % 2 ? bufs.length - 1 : 0], 0, CH);
      dev.queue.submit([e.finish()]); await dev.queue.onSubmittedWorkDone();
      const gbs = 2 * 4 * CH / ((performance.now() - t) / 1000) / 1e9;
      if (lost || gbs < Math.max(40, (bwGBs || 0) * .3)) holds = false;
    }
  } catch (e) { console.warn('[hardware] memory probe:', e?.message); holds = lost ? false : null; }
  finally { for (const b of bufs) try { b.destroy(); } catch {} try { dev?.destroy(); } catch {} }
  if (holds !== null) local.setJson(PROBE_KEY, { sig, gb, holds, at: Date.now() });
  return holds;
}

// phone | tablet | computer | xr, from the client hints' form factors, else
// the user agent (an iPad passes for a Mac but has a touch screen)
export function deviceClass(ch, ua = '', touch = 0) {
  const ff = (ch?.formFactors || []).map(f => String(f).toLowerCase());
  if (ff.includes('xr')) return 'xr';
  if (ff.includes('tablet') || /iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || (/Macintosh/.test(ua) && touch > 1)) return 'tablet';
  if (ff.includes('mobile') || ch?.mobile || /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) return 'phone';
  return 'computer';
}

// The graphics memory's bandwidth in GB/s as a buffer copy sees it (about 60%
// of the card's rated figure: an RTX 2060 measures ~200 of its 336), best of
// three runs of ten copies. Kept per device and browser for 30 days.
const BW_KEY = 'GpuBandwidth';
export async function measureBandwidth(adapter, sig, maxMB = 256) {
  try { const c = local.json(BW_KEY); if (c?.sig === sig && Date.now() - c.at < 30 * 864e5 && c.gbs > 0) return c.gbs; } catch {}
  let dev = null;
  try {
    const size = Math.min(maxMB * 2 ** 20, Math.floor(adapter.limits.maxBufferSize / 2 / 4) * 4);
    dev = await adapter.requestDevice({ requiredLimits: { maxBufferSize: size } });
    const use = GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const x = dev.createBuffer({ size, usage: use }), y = dev.createBuffer({ size, usage: use });
    const run = n => { const e = dev.createCommandEncoder(); for (let i = 0; i < n; i++) e.copyBufferToBuffer(i % 2 ? y : x, 0, i % 2 ? x : y, 0, size); dev.queue.submit([e.finish()]); return dev.queue.onSubmittedWorkDone(); };
    await run(2);
    let best = Infinity;
    for (let k = 0; k < 3; k++) { const t = performance.now(); await run(10); best = Math.min(best, performance.now() - t); }
    x.destroy(); y.destroy();
    const gbs = Math.round(2 * 10 * size / (best / 1000) / 1e9);
    local.setJson(BW_KEY, { sig, gbs, at: Date.now() });
    return gbs;
  } catch (e) { console.warn('[hardware] bandwidth not measured:', e?.message); return null; }
  finally { try { dev?.destroy(); } catch {} }
}

// NVIDIA graphics in an Arm computer (Windows or Linux): RTX Spark or DGX
// Spark, both unified memory (not an Android device with a Tegra)
const sparkLike = hw => hw.vendor === 'nvidia' && hw.arch === 'arm' && hw.cls === 'computer' && /windows|linux/i.test(hw.os || '');

// Shared (unified) memory in GB and why: the most the signs show, each a
// lower bound. The browser's figure; a known chip's least configuration; an
// NVIDIA GPU on Arm (RTX Spark / DGX Spark); a wide memory bus (measured
// bandwidth: only big unified-memory chips reach 180+ GB/s, and none ships
// with less than 16 GB; 400+ means a Max/Ultra/DGX class chip, 32+); the
// largest buffer the adapter allows (Metal ties it to the memory).
export function memoryEstimate(hw) {
  let gb = hw.ramGB || 0, why = hw.ramGB ? `the browser reports ${hw.ramGB} GB` : '';
  const raise = (n, reason) => { if (n > gb) { gb = n; why = reason; } };
  const chip = sharedChipGB(hw.gpu); if (chip) raise(chip, `${hw.gpu} ships with at least ${chip} GB`);
  if (sparkLike(hw)) raise(24, 'NVIDIA graphics on an Arm computer (an RTX Spark or DGX Spark): at least 24 GB');
  if (hw.cls === 'computer' && hw.bwGBs >= 400) raise(32, `${hw.bwGBs} GB/s measured: a Max/Ultra-class unified-memory chip, at least 32 GB`);
  else if (hw.cls === 'computer' && hw.bwGBs >= 180) raise(16, `${hw.bwGBs} GB/s measured: a wide unified-memory chip, at least 16 GB`);
  if (hw.maxBufferGB && hw.maxBufferGB < 64) raise(Math.floor(hw.maxBufferGB), `the graphics adapter allows ${Math.floor(hw.maxBufferGB)} GB buffers`);
  return { gb: gb || null, why: why || 'unknown' };
}

// A dedicated card missing from the table (likely newer than it): a lower
// bound on its memory from the measured bandwidth (x1.6 is about its rating).
// Cards rated 650+ GB/s carry 10 GB or more (the 3070 Ti, 608, has 8);
// 250+ GB/s, 6 or more; else 4.
export function vramFromBandwidth(gbs) {
  if (!gbs) return null;
  const rated = gbs * 1.6;
  return rated >= 650 ? 10 : rated >= 250 ? 6 : 4;
}

let detected = null;
export function detectHardware() {
  return detected ||= (async () => {
    const t = await table();
    const seen = [...new Set([probeRenderer({ powerPreference: 'high-performance' }), probeRenderer()].filter(Boolean))];
    const parsed = seen.map(parseRenderer);
    const gpu = parsed.find(n => lookupVram(n, t) !== 0) || parsed[0] || null;
    let vram = gpu ? lookupVram(gpu, t) : null;
    const ch = await navigator.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness', 'model', 'platformVersion', 'formFactors']).catch(() => null) ?? null;
    const ua = navigator.userAgent || '';
    const hw = { gpu, renderer: seen[parsed.indexOf(gpu)] || null,
      cls: deviceClass(ch, ua, navigator.maxTouchPoints || 0),
      os: ch?.platform || navigator.userAgentData?.platform || (/Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''),
      arch: ch?.architecture || (/arm|aarch64/i.test(ua) ? 'arm' : ''), model: ch?.model || '',
      cores: navigator.hardwareConcurrency || null, ramGB: navigator.deviceMemory ?? null,
      webgpu: false, f16: false, maxBufferGB: null, vendor: '', bwGBs: null };
    let adapter = null;
    try {
      adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        hw.webgpu = true; hw.f16 = adapter.features.has('shader-f16');
        hw.maxBufferGB = +(adapter.limits.maxBufferSize / 2 ** 30).toFixed(2);
        hw.maxBindingGB = +(adapter.limits.maxStorageBufferBindingSize / 2 ** 30).toFixed(2);
        hw.vendor = (adapter.info?.vendor || '').toLowerCase();
        hw.adapter = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.description].filter(Boolean).join(' ');
      }
    } catch {}
    // NVIDIA on Arm (RTX Spark, DGX Spark) shares memory, whatever its name
    // says; a phone's or tablet's GPU always does
    if (sparkLike(hw)) vram = 0;
    if (hw.cls === 'phone' || hw.cls === 'tablet') vram = 0;
    hw.shared = vram === 0 || /apple/i.test(gpu || '') || hw.vendor === 'apple' || !!sharedChipGB(gpu);
    hw.vramGB = hw.shared ? null : vram || null;
    if (adapter) hw.bwGBs = await measureBandwidth(adapter, [hw.renderer, hw.adapter, hw.maxBufferGB].join('|'), hw.cls === 'computer' ? 256 : 128);
    if (hw.shared) { const m = memoryEstimate(hw); hw.sharedGB = m.gb; hw.memWhy = m.why; }
    else if (hw.vramGB) {
      hw.memWhy = 'from the card\'s name';
      const opts = cardVariants(gpu, t);
      if (opts.length) {
        hw.vramOptions = opts;
        const said = +local.get(CARD_KEY + gpu), bw = VARIANT_BW[String(gpu).toLowerCase()]; let held;
        if (opts.includes(said)) { hw.vramGB = said; hw.memWhy = 'as you said (it comes with ' + opts.join(' or ') + ' GB)'; }
        else if (adapter && hw.cls === 'computer' && !noProbe() && typeof (held = await probeHolds(adapter, opts[0] + Math.min(1, (opts[1] - opts[0]) / 3), [hw.renderer, hw.adapter].join('|'), hw.bwGBs)) === 'boolean') {
          hw.vramGB = held ? opts[1] : opts[0]; hw.memProbed = true;
          hw.memWhy = `measured: it ${held ? 'holds more than' : 'does not hold'} ${opts[0]} GB (it comes with ${opts.join(' or ')} GB)`;
          if (opts.length > 2 && held) hw.vramAsk = true;
        }
        else if (bw && hw.bwGBs) { hw.vramGB = hw.bwGBs * 1.6 >= bw[0] ? bw[1] : opts[0]; hw.memWhy = `from its measured bandwidth (${hw.bwGBs} GB/s; it comes with ${opts.join(' or ')} GB)`; }
        else { hw.vramGB = opts[0]; hw.vramAsk = true; hw.memWhy = `it comes with ${opts.join(' or ')} GB; ${opts[0]} assumed until you say which`; }
      }
    }
    else if (adapter && (hw.vramGB = vramFromBandwidth(hw.bwGBs))) hw.memWhy = `at least, from its measured bandwidth (${hw.bwGBs} GB/s; the card is not in the table)`;
    return hw;
  })();
}

// Memory a model may use: the card's own, or a share of shared memory: two
// thirds on a Mac (Metal's working-set limit), half elsewhere (Windows gives
// the GPU half the RAM as shared graphics memory), 40% on a phone or tablet
// (the system and the browser's per-tab limit keep most of it).
export function usableGB(hw) {
  if (!hw?.webgpu) return 0;
  if (hw.vramGB) return hw.vramGB;
  const share = hw.cls === 'phone' || hw.cls === 'tablet' || hw.cls === 'xr' ? .4 : /mac/i.test(hw.os || '') || hw.vendor === 'apple' ? .66 : .5;
  if (hw.shared && hw.sharedGB) return Math.floor(hw.sharedGB * share * 10) / 10;
  return null;   // a card not in the table and no measurement
}

// ---- how fast each model really ran here (agent-brain notes every turn)
const SPEED_KEY = 'BrainSpeed';
export function brainSpeeds() { return local.json(SPEED_KEY, {}) || {}; }
// chars of reply per second of the whole turn (reading the prompt included);
// the first turn after loading (kernels compiling) is not counted
export function noteBrainSpeed(key, chars, seconds) {
  if (!key || !(seconds > 0) || chars < 20) return;
  const all = brainSpeeds(), r = all[key] || { cps: 0, turns: 0 }, cps = chars / seconds;
  r.cps = r.turns ? r.cps * .7 + cps * .3 : cps; r.turns++; all[key] = r;
  local.setJson(SPEED_KEY, all);
}
// Slower than this a character's turn drags (a 120-character reply in 10+ s).
export const MIN_CPS = 12;
// Tokens per second a model should reach from the measured bandwidth: each
// token reads the model's weights (readGB) once; engines reach about half of
// what a buffer copy does.
const MIN_TOKS = 8;
export const predictedToks = (hw, m) => hw?.bwGBs && m.readGB ? hw.bwGBs * .5 / m.readGB : null;

// The biggest offered model (needGB, the graphics memory it wants with the
// game drawing beside it) that fits, is predicted fast enough here, and was
// not measured too slow here; for an unknown card the default one.
// hw.choiceWhy says why, in words.
export function recommendModel(hw, models, fallback) {
  const gb = usableGB(hw);
  if (gb == null) { if (hw) hw.choiceWhy = 'graphics memory unknown: the default'; return fallback; }
  const speeds = brainSpeeds(), skipped = [];
  // biggest first; at the same size the one marked prefer (Bonsai 2 27B over
  // Gemma 4 12B: 12/12 against 9/12 on the hard set); failed: it could not run here
  const fits = models.filter(m => m.needGB && !m.hidden && !m.failed && m.needGB <= gb && (!m.needF16 || hw.f16)).sort((a, b) => b.needGB - a.needGB || (b.prefer || 0) - (a.prefer || 0));
  for (const m of fits) {
    const s = speeds[m.key], toks = predictedToks(hw, m);
    if (s?.turns >= 3 && s.cps < MIN_CPS) { skipped.push(`${m.key}: measured ${s.cps.toFixed(0)} chars/s here`); continue; }
    if (toks != null && toks < MIN_TOKS && !(s?.turns >= 3)) { skipped.push(`${m.key}: about ${toks.toFixed(0)} tokens/s predicted`); continue; }
    hw.choiceWhy = `${gb} GB usable${hw.bwGBs ? `, ${hw.bwGBs} GB/s` : ''}${skipped.length ? '; too slow: ' + skipped.join(', ') : ''}`;
    return m.key;
  }
  hw.choiceWhy = `${gb} GB usable: nothing larger fits${skipped.length ? ' fast enough (' + skipped.join(', ') + ')' : ''}`;
  return fallback;
}

const CLASS_NAME = { phone: 'phone', tablet: 'tablet', xr: 'headset', computer: '' };
export function describeHardware(hw) {
  if (!hw) return 'checking this device…';
  if (!hw.webgpu) return 'no WebGPU here';
  const mem = hw.vramGB ? `${hw.vramGB} GB` : hw.shared ? `shared memory${hw.sharedGB ? ' (~' + hw.sharedGB + ' GB)' : ''}` : 'memory unknown';
  const what = [CLASS_NAME[hw.cls], hw.model].filter(Boolean).join(' ');
  return `${what ? what + ': ' : ''}${hw.gpu || 'graphics card unknown'}, ${mem}${hw.bwGBs ? `, ${hw.bwGBs} GB/s` : ''}`;
}
