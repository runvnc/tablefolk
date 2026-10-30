// What this device can run: its graphics card and how much memory the card
// has, so the model picker can start with the best brain that fits.
//
// Browsers never report free GPU memory, so the card is found by name (the
// WebGL renderer string, probed for the fast GPU and the default one, the
// discrete one preferred) and its memory looked up in gpu-memory.json. The
// name parsing and lookup are ported from onepunk/llmsizer
// (src/detection/parse-renderer.ts, detect.ts; MIT, (c) 2026 onepunk); the
// table is its gpu-specs.ts, generated from onepunk/open-gpu-db v1.2.0
// (Apache-2.0). Integrated and Apple GPUs share system memory (0 in the
// table); navigator.deviceMemory gives that, capped at 8 by the browser.
//
//   const hw = await detectHardware();   // { gpu, vramGB, shared, ramGB, f16, maxBufferGB, webgpu }
//   recommendModel(hw, models)           // the biggest model whose needGB fits
let tablePromise = null;
const table = () => tablePromise ||= fetch(new URL('./gpu-memory.json?v=20261030a', import.meta.url)).then(r => r.json()).catch(() => ({ vram: {}, aliases: {}, integrated: [] }));

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
// (GB10, 128 GB). Apple chips by name, so later generations (M6, M7...) need
// no table entry: Ultra 64, Max 32, Pro 16, plain 16 from the M4 (8 before).
const SHARED_CHIPS = [[/\bRTX Spark\b|\bN1X\b/i, 24], [/\bGB10\b|\bDGX Spark\b/i, 128]];
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

let detected = null;
export function detectHardware() {
  return detected ||= (async () => {
    const t = await table();
    const seen = [...new Set([probeRenderer({ powerPreference: 'high-performance' }), probeRenderer()].filter(Boolean))];
    const parsed = seen.map(parseRenderer);
    const gpu = parsed.find(n => lookupVram(n, t) !== 0) || parsed[0] || null;
    const vram = gpu ? lookupVram(gpu, t) : null;
    const hw = { gpu, renderer: seen[parsed.indexOf(gpu)] || null, vramGB: vram || null, shared: vram === 0 || /apple/i.test(gpu || '') || !!sharedChipGB(gpu),
      ramGB: navigator.deviceMemory ?? null, webgpu: false, f16: false, maxBufferGB: null };
    try {
      const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      if (a) {
        hw.webgpu = true; hw.f16 = a.features.has('shader-f16');
        hw.maxBufferGB = +(a.limits.maxBufferSize / 2 ** 30).toFixed(2);
        hw.adapter = [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(' ');
      }
    } catch {}
    // shared memory: known chips by name (the browser reports at most 8 GB)
    if (hw.shared) hw.sharedGB = sharedChipGB(gpu) || hw.ramGB;
    return hw;
  })();
}

// Memory a model may use: the card's own, or about two thirds of shared memory.
export function usableGB(hw) {
  if (!hw?.webgpu) return 0;
  if (hw.vramGB) return hw.vramGB;
  if (hw.shared && hw.sharedGB) return Math.floor(hw.sharedGB * .66);
  return null;   // a card not in the table
}

// The biggest offered model (needGB, the graphics memory it wants with the
// game drawing beside it) that fits; for an unknown card the default one.
export function recommendModel(hw, models, fallback) {
  const gb = usableGB(hw);
  if (gb == null) return fallback;
  const fits = models.filter(m => m.needGB && !m.hidden && m.needGB <= gb && (!m.needF16 || hw.f16)).sort((a, b) => b.needGB - a.needGB);
  return fits[0]?.key || fallback;
}

export function describeHardware(hw) {
  if (!hw) return 'checking this device…';
  if (!hw.webgpu) return 'no WebGPU here';
  const mem = hw.vramGB ? `${hw.vramGB} GB` : hw.shared ? `shared memory${hw.sharedGB ? ' (~' + hw.sharedGB + ' GB)' : ''}` : 'memory unknown';
  return `${hw.gpu || 'graphics card unknown'}, ${mem}`;
}
