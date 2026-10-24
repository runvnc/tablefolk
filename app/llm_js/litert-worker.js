// Dedicated Worker hosting the LiteRT-LM (Gemma 4 E2B) engine.
// Everything that used to run on the main thread in model-loader-litert.js /
// gpt-runner-litert.js now lives here: WASM instantiation, the engine's own
// WebGPU device, OPFS model caching, and conversation/KV-cache state. The
// library (@litert-lm/core) never used a Worker itself - it was profiled
// running single-threaded (engine.setSingleThreadedExecution(true)) directly
// on the main thread, sharing the same thread and GPU queue as Babylon's
// renderer.
//
// This is deliberately a CLASSIC worker (model-loader-litert.js constructs it
// without {type:'module'}), not a module worker, and the library is loaded
// via dynamic import() below rather than a static top-level import. The
// library's own WASM glue loader branches on `typeof importScripts ===
// 'function'` to decide how to fetch its Emscripten-generated glue script -
// that property exists but throws ("Module scripts don't support
// importScripts()") inside a module worker, so a module worker breaks it. A
// classic worker's importScripts really does work, which is what the library
// expects; dynamic import() is valid in classic scripts too, so we don't lose
// anything by not being a module worker.
// The library, by version: 0.14.0 for the text models (the tested one);
// the vision model needs the nightly, the first release whose main engine
// runs Gemma's vision encoder (0.14-0.18 say "images are not supported in
// JS yet"). Loaded when a model is, so a page that never sees pays nothing.
const LIB = '0.14.0';
const libs = new Map();
const libFor = ver => { if (!libs.has(ver)) libs.set(ver, import(`https://cdn.jsdelivr.net/npm/@litert-lm/core@${ver}/+esm`)); return libs.get(ver); };
let libVersion = null;
const engineLibReady = Promise.resolve();

const MODEL_CONFIG = {
  'gemma4-e2b-litert': {
    label: 'Gemma 4 E2B (LiteRT-LM)',
    // Mirrored on our R2 bucket (byte-identical to litert-community/gemma-4-E2B-it-litert-lm
    // on Hugging Face, sha256 3a08e8d9...); HF's download speeds were too slow.
    modelUrl: 'https://geebr-models.mindroot.io/gemma-4-E2B-it-web.litertlm',
    vram: '~0.8GB in-memory (PLE memory-mapped)',
  },
  // Gemma 4 E2B with sight: the full multimodal file (the web builds above
  // are text-only), 2.6 GB, its vision encoder run by the LiteRT-LM nightly.
  // Characters' look() sends what they see (tablefolkVision, world-integration.js).
  'gemma4-e2b-vision': {
    label: 'Gemma 4 E2B with sight (LiteRT-LM)',
    modelUrl: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm',
    vram: '~1.8 GB',
    lib: '0.19.0-nightly.20261023',
    vision: true,
  },
  'gemma4-e4b-litert': {
    label: 'Gemma 4 E4B (LiteRT-LM)',
    // Larger sibling (~3.0 GB web build), mirrored on R2 like E2B: same bytes
    // as litert-community/gemma-4-E4B-it-litert-lm on Hugging Face (sha256
    // 3904d826..., 2969059328 bytes; copied server-side, spot-checked).
    modelUrl: 'https://geebr-models.mindroot.io/gemma-4-E4B-it-web.litertlm',
    vram: 'larger; PLE memory-mapped',
  },
};

let engine = null, engineVision = false;
let currentModel = null;
let loading = false;

// ---- OPFS cache helpers (identical to the old main-thread versions; OPFS
// and fetch() both work the same way, and access handles are actually
// faster, from inside a Worker). ----
async function getCachedModelFile(modelKey) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`);
    const file = await fileHandle.getFile();
    if (!file.size) {
      await root.removeEntry(`litert-${modelKey}.litertlm`);
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function makeProgressReporter(onProgress) {
  let lastReport = 0;
  return (received, total, startedAt, force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 150) return;
    lastReport = now;
    const elapsed = Math.max((now - startedAt) / 1000, 0.001);
    const speed = received / elapsed;
    if (total > 0) {
      const percent = Math.min(100, (received / total) * 100);
      const remaining = Math.max(0, total - received);
      const eta = speed > 0 ? Math.ceil(remaining / speed) : null;
      onProgress?.({
        phase: 'download',
        percent,
        receivedBytes: received,
        totalBytes: total,
        text: `Downloading model: ${percent.toFixed(1)}% · ${formatBytes(received)} / ${formatBytes(total)}${eta !== null ? ` · about ${eta}s left` : ''}`,
      });
    } else {
      onProgress?.({ phase: 'download', receivedBytes: received, totalBytes: null, text: `Downloading model: ${formatBytes(received)} received` });
    }
  };
}

// Model download. Chrome multiplexes every request to one host over a single
// HTTP/2 connection, and one connection to R2 tops out around 40 MB/s, so
// parallel Range requests to the same host are no faster (measured: slower).
// The bucket is therefore also served from extra hostnames (MODEL_MIRRORS);
// each gets its own connection (Chrome does not coalesce them), and one lane
// per host pulled ~95 MB/s against ~40 from a single host. Lanes take 64 MB
// pieces from a shared queue and write them at their offsets through a sync
// access handle (the async createWritable() capped the download near 34
// MB/s; it remains the fallback where sync handles are unavailable). A
// single-range Range header is CORS-safelisted, so there is no preflight. A
// request that errors or goes quiet for DOWNLOAD_STALL_MS is retried from the
// last byte written. Falls back to one plain stream if the server ignores Range.
const MODEL_MIRRORS = {
  'geebr-models.mindroot.io': ['geebr-models.mindroot.io', 'geebr-models-2.mindroot.io', 'geebr-models-3.mindroot.io', 'geebr-models-4.mindroot.io'],
};
const DOWNLOAD_PIECE_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_STALL_MS = 15000;
const DOWNLOAD_RETRIES = 5;

function mirrorUrls(modelUrl) {
  const url = new URL(modelUrl);
  return (MODEL_MIRRORS[url.host] || [url.host]).map((host) => { url.host = host; return url.href; });
}

// Fetches bytes [start, end] of `url` (end null: to EOF) and writes them at
// their offset, retrying from the last written byte. `onBytes(n)` reports progress.
async function downloadRange(out, url, start, end, onBytes, isCancelled) {
  let pos = start;
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    let timer = setTimeout(() => ctl.abort(), DOWNLOAD_STALL_MS);
    try {
      const response = await fetch(url, {
        // no-store: the HTTP cache would otherwise keep a second copy.
        cache: 'no-store',
        signal: ctl.signal,
        headers: { Range: `bytes=${pos}-${end ?? ''}` },
      });
      if (response.status !== 206 || !response.headers.get('Content-Range')?.startsWith(`bytes ${pos}-`)) {
        throw new Error(`Download failed: range ${pos}-${end ?? ''} returned ${response.status}`);
      }
      const reader = response.body.getReader();
      while (true) {
        clearTimeout(timer);
        timer = setTimeout(() => ctl.abort(), DOWNLOAD_STALL_MS);
        const { done, value } = await reader.read();
        if (done) break;
        await out.write(value, pos);
        pos += value.byteLength;
        onBytes(value.byteLength);
      }
      return pos;
    } catch (e) {
      if (isCancelled() || attempt >= DOWNLOAD_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

// {write(data, position), close(), abort()} over the OPFS file.
async function openModelWriter(fileHandle) {
  if (fileHandle.createSyncAccessHandle) {
    const handle = await fileHandle.createSyncAccessHandle();
    handle.truncate(0);
    return {
      write: (data, at) => { handle.write(data, { at }); },
      close: () => { handle.flush(); handle.close(); },
      abort: () => { handle.close(); },
    };
  }
  const writable = await fileHandle.createWritable();
  return {
    write: (data, position) => writable.write({ type: 'write', position, data }),
    close: () => writable.close(),
    abort: () => writable.abort(),
  };
}

async function downloadModelToOPFS(modelKey, modelUrl, onProgress) {
  let root = null;
  let writable = null;
  try {
    root = await navigator.storage.getDirectory();
    // Written as .part and renamed when complete: the sync handle writes in
    // place, and getCachedModelFile() must never see a half-downloaded model.
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm.part`, { create: true });
    writable = await openModelWriter(fileHandle);
    const startedAt = performance.now();
    const report = makeProgressReporter(onProgress);
    let received = 0;
    let total = 0;
    const onBytes = (n) => { received += n; report(received, total, startedAt); };

    // A 1-byte probe learns the size and whether Range is honoured.
    const probe = await fetch(modelUrl, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
    if (!probe.ok) throw new Error(`Download failed: ${probe.status}`);
    if (probe.status === 206) total = Number(probe.headers.get('Content-Range')?.split('/')[1]) || 0;

    if (!total) {
      // Range ignored (200 with the whole file): plain sequential stream.
      if (!probe.body) throw new Error('Download response has no readable body');
      total = Number(probe.headers.get('Content-Length') || 0);
      report(0, total, startedAt, true);
      const reader = probe.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value, received);
        onBytes(value.byteLength);
      }
    } else {
      await probe.body?.cancel();
      report(0, total, startedAt, true);
      const urls = mirrorUrls(modelUrl);
      // One host: a single ranged stream is fastest. Several: shared pieces.
      const pieceBytes = urls.length > 1 ? DOWNLOAD_PIECE_BYTES : total;
      const pieces = [];
      for (let s = 0; s < total; s += pieceBytes) pieces.push([s, Math.min(s + pieceBytes, total) - 1]);
      let failed = null;
      await Promise.all(urls.map(async (url) => {
        try {
          while (!failed && pieces.length) {
            const [start, end] = pieces.shift();
            const pos = await downloadRange(writable, url, start, end, onBytes, () => !!failed);
            if (pos !== end + 1) throw new Error(`Download failed: range ${start}-${end} ended at ${pos}`);
          }
        } catch (e) {
          failed ??= e;
        }
      }));
      if (failed) throw failed;
      if (received !== total) throw new Error(`Download incomplete: ${received} of ${total} bytes`);
    }
    await writable.close();
    writable = null;
    await fileHandle.move(`litert-${modelKey}.litertlm`);
    report(received, total || received, startedAt, true);
    onProgress?.({ phase: 'download', percent: 100, text: `Download complete · ${formatBytes(received)} cached on this device` });
    return await fileHandle.getFile();
  } catch (e) {
    try { await writable?.abort(); } catch {}
    try { await root?.removeEntry(`litert-${modelKey}.litertlm.part`); } catch {}
    throw e;
  }
}

// ---- conversations ----
// The LiteRT-LM web engine keeps ONE working KV cache. Two live conversations
// used alternately corrupt each other. Measured in the test browser: agent A
// told a secret number forgot it as soon as agent B spoke in between (and
// remembered it when nobody did), and a shopkeeper degenerated into
// mixed-language prose once a second conversation interleaved. Several characters
// taking turns, thinking turns and console llm() calls all interleave.
//
// So exactly one conversation is live at a time. The worker keeps every
// conversation's text history itself; when a different one is needed it
// disposes the live one and rebuilds the new one from that history (paying a
// re-prefill on every switch of speaker, but staying correct). All generate
// requests also run strictly one at a time (see serialize()).
const histories = new Map();          // key -> {agentId, system, messages:[{role,content}]}
const MAX_HISTORY_MESSAGES = 24;      // kept per conversation for rebuilds
const MAX_TURNS_PER_CONVERSATION = 12;
let live = null;                      // {key, conv, turns}
let lastDispose = Promise.resolve();

function hashSystemPrompt(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return String(h);
}

async function disposeConversation(conv) {
  if (!conv) return;
  for (const method of ['delete', 'dispose', 'close']) {
    try {
      if (typeof conv[method] === 'function') { await conv[method](); return; }
    } catch (error) {
      console.warn('[litert-worker] conversation disposal failed', error);
      return;
    }
  }
}
function dropLive() {
  if (!live) return lastDispose;
  const conv = live.conv; live = null;
  lastDispose = lastDispose.then(() => disposeConversation(conv));
  return lastDispose;
}

function clearConversations(agentId = null) {
  for (const [key, h] of [...histories]) {
    if (agentId === null || h.agentId === String(agentId)) histories.delete(key);
  }
  if (live && (agentId === null || !histories.has(live.key))) dropLive();
}

// History as a preface: bounded, and opening with a user turn (Gemma expects it).
// The engine holds 8192 tokens (maxNumTokens). Each turn's prompt is long
// (what the character sees, its mind, the rules), so a few turns of history
// filled it ("Input token ids are too long: 8302 >= 8192") and every turn after
// failed. History is kept to a budget in characters (about 3 to a token),
// leaving room for the new prompt and the answer.
const CHAR_BUDGET = 19000;
const sizeOf = list => list.reduce((n, m) => n + String(m.content || '').length, 0);
function prefaceMessages(system, messages, reserve = 0) {
  const hist = messages.slice(-MAX_HISTORY_MESSAGES).filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }));
  while (hist.length && String(system || '').length + sizeOf(hist) + reserve > CHAR_BUDGET) hist.shift();
  while (hist.length && hist[0].role !== 'user') hist.shift();
  return [...(system ? [{ role: 'system', content: system }] : []), ...hist];
}

// The live conversation for key, rebuilt from history if another one was live.
// The vision model's own sampler defaults ran hot (garbled lines: "I't",
// "you's"): it gets the game's temperature, top-p. The web text models keep
// the defaults they were tuned and tested with.
const samplerFor = temperature => engineVision ? { sessionConfig: { samplerParams: { type: 2, p: .95, k: 64, temperature: Number.isFinite(+temperature) ? Math.max(.05, +temperature) : .5 } } } : {};
async function liveConversation(key, agentId, system, historyOverride = null, temperature, reserve = 0, slim = false) {
  if (live && live.key === key && live.turns < MAX_TURNS_PER_CONVERSATION && !historyOverride && !slim && live.chars + reserve < CHAR_BUDGET) {
    live.turns += 1; live.chars += reserve;
    return live.conv;
  }
  await dropLive();
  let h = histories.get(key);
  if (!h) { h = { agentId: String(agentId || 'default'), system, messages: [] }; histories.set(key, h); }
  const preface = prefaceMessages(system, slim ? [] : (historyOverride || h.messages), reserve);
  const conv = await engine.createConversation({ preface: { messages: preface }, ...samplerFor(temperature) });
  live = { key, conv, turns: 1, chars: sizeOf(preface) + reserve };
  return conv;
}

// One generate at a time: overlapping sends on the shared engine stalled for
// minutes in testing.
let queue = Promise.resolve();
function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Gemma 4 thinking output is "<|channel>thought\n...reasoning...<channel|>answer"
// (note the asymmetric bars). LiteRT-LM normally parses that channel into
// message.channels and leaves only the answer in content, but if the markers
// reach the text (or generation stops mid-thought) split them out here.
// Returns { text, thinking }.
function splitThinking(text) {
  let thinking = '';
  const keep = (_, t) => { thinking += (thinking ? '\n' : '') + String(t || '').trim(); return ''; };
  text = String(text || '')
    .replace(/<\|channel\|?>\s*thought\b([\s\S]*?)<\|?channel\|>/gi, keep)
    .replace(/<\|channel\|?>\s*thought\b([\s\S]*)$/i, keep)      // unterminated: still thinking
    .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, keep)
    .replace(/<\|think\|>([\s\S]*?)<\/think>/gi, keep)
    .replace(/<\/?think(?:ing)?>/gi, '')
    .replace(/<\/?\|think\|>/gi, '')
    .replace(/<\|?channel\|?>/gi, '')
    .trimStart();
  return { text, thinking };
}

// Text of a LiteRT-LM Message: content is either a string or content parts.
function messageText(msg) {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => p?.text ?? p?.content ?? '').join('');
  return '';
}
// Any channel text (e.g. channels.thought) carried separately from content.
function messageChannels(msg) {
  const ch = msg?.channels;
  return ch && typeof ch === 'object' ? Object.values(ch).filter(Boolean).join('\n') : '';
}

async function generateText(messages, opts, onToken) {
  const systemMessages = messages.filter(m => m.role === 'system');
  let systemContent = systemMessages.map(m => m.content).join('\n\n');
  const thinking = !!opts.extra_body?.enable_thinking;
  if (thinking) systemContent = '<|think|>' + (systemContent || '');
  const chatMessages = messages.filter(m => m.role !== 'system');
  // Send everything the game added since this character's last reply, not
  // just the last message: action results, other characters' actions and
  // feedback notes sit between them and were silently dropped before (the
  // conversation only ever saw the final prompt).
  let lastAssistant = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) if (chatMessages[i].role === 'assistant') { lastAssistant = i; break; }
  const fresh = chatMessages.slice(lastAssistant + 1).filter(m => m.role === 'user');
  const promptText = (fresh.length ? fresh : chatMessages.slice(-1)).map(m => String(m.content || '')).join('\n\n');
  try {
    return await runTurn(systemContent, chatMessages, promptText, opts, onToken, thinking);
  } catch (err) {
    // A conversation that errored is unusable; retry once on a rebuilt one.
    console.warn('[litert-worker] generation failed, retrying on a rebuilt conversation', err);
    await dropLive();
    // too long even so: once more with no history at all
    return await runTurn(systemContent, chatMessages, promptText, /too long/i.test(err?.message || '') ? { ...opts, _slim: true } : opts, onToken, thinking);
  }
}

// Normal turns continue the agent's own conversation (its history lives in
// this worker). Thinking turns are rebuilt from the game's chat history, which
// never contains thoughts, and dropped afterwards so the thoughts don't stay in
// the KV cache.
async function runTurn(systemContent, chatMessages, promptText, opts, onToken, thinking) {
  const agentId = String(opts.agentId || 'default');
  const key = agentId + ':' + (thinking ? 'think:' : '') + hashSystemPrompt(systemContent || '');
  // room for the prompt and about 1000 characters of answer
  const conversation = await liveConversation(key, agentId, systemContent, thinking ? chatMessages.slice(0, -1) : null, opts.temperature, promptText.length + 1000, !!opts._slim);
  try {
    const out = await sendTurn(conversation, promptText, opts, onToken);
    if (!thinking) {
      const h = histories.get(key);
      if (h) {
        h.messages.push({ role: 'user', content: promptText }, { role: 'assistant', content: out.text });
        if (h.messages.length > MAX_HISTORY_MESSAGES * 2) h.messages = h.messages.slice(-MAX_HISTORY_MESSAGES * 2);
      }
    }
    return out;
  } finally {
    if (thinking) { histories.delete(key); await dropLive(); }
  }
}

// Debug/test hook: exactly what the last turn sent (window.__tablefolkLiteRT.lastPrompt()).
let lastSent = null;
async function sendTurn(conversation, promptText, opts, onToken) {
  lastSent = { agentId: opts.agentId || 'default', thinking: !!opts.extra_body?.enable_thinking, promptText, at: Date.now() };
  let fullText = '', channelText = '';
  console.log('[litert-worker] SENDING PROMPT TO LiteRT conversation', {
    agentId: opts.agentId || 'default', streaming: !!onToken, thinking: !!opts.extra_body?.enable_thinking, promptText,
  });

  try {
    if (onToken) {
      const stream = conversation.sendMessageStreaming(promptText);
      for await (const chunk of stream) {
        channelText += messageChannels(chunk);
        const text = messageText(chunk);
        if (text) fullText += text;
        // Show only the answer while streaming; a placeholder while thinking.
        const visible = splitThinking(fullText).text;
        onToken(visible || ((channelText || /<\|channel/i.test(fullText)) ? '(thinking...)' : ''));
      }
    } else {
      const response = await conversation.sendMessage(promptText);
      fullText = messageText(response);
      channelText = messageChannels(response);
    }
  } catch (err) {
    console.error('[litert-worker] ERROR FROM LiteRT conversation:', err);
    throw err;
  }

  console.log('[litert-worker] RAW LiteRT OUTPUT:', fullText);
  const { text, thinking } = splitThinking(fullText);
  const allThinking = [channelText.trim(), thinking].filter(Boolean).join('\n');
  if (allThinking) console.log('[litert-worker] THINKING:', allThinking);
  return { text, thinking: allThinking };
}

// ---- message protocol ----
// In:  {id, type:'load'|'unload'|'clearCache'|'hasCached'|'capabilityInfo'|'generate'|'clearConversations', ...payload}
// Out: {id, type:'progress'|'token', ...}  (0+ times)
//      {id, type:'result', data}            (exactly once, success)
//      {id, type:'error', message}          (exactly once, failure)
//
// Runs as a dedicated worker or as a shared one (model-loader-litert.js):
// shared, every page of the site talks to one engine, and Chrome keeps it
// 30 s after the last page goes (extendedLifetime), so a reload or the step
// from the world builder into the game finds the model still loaded. Each
// page's conversations are kept apart by a tag on their agent ids.
let pages = 0;
// Shared: pages hold a Web Lock (tablefolk-litert-page-*) while they use the
// engine. With none held for 2 minutes the model is unloaded and the worker
// ends, so a closed or frozen tab never keeps GBs of GPU memory for long.
// (Chrome itself may end the worker sooner, when the last page of the site
// closes: Chrome 155 did, within seconds.)
const IDLE_MS = 120000;
if (typeof SharedWorkerGlobalScope !== 'undefined' && self instanceof SharedWorkerGlobalScope && self.navigator?.locks) {
  let idleSince = null;
  setInterval(async () => {
    const held = ((await navigator.locks.query()).held || []).filter(l => String(l.name).startsWith('tablefolk-litert-page-')).length;
    if (held) { idleSince = null; return; }
    idleSince ??= Date.now();
    if (Date.now() - idleSince < IDLE_MS || loading) return;
    console.log('[litert-worker] no page for 2 minutes: unloading');
    clearConversations();
    if (engine) { try { engine.delete(); } catch {} }
    engine = null; currentModel = null;
    self.close();
  }, 5000);
}
self.onconnect = (ev) => {
  const port = ev.ports[0], tag = 'p' + (++pages) + ':';
  port.onmessage = (e) => handle({ data: tagged(e.data, tag) }, (msg) => port.postMessage(msg), tag);
  port.start?.();
};
function tagged(d, tag) {
  if (d?.type === 'generate') return { ...d, opts: { ...(d.opts || {}), agentId: tag + String(d.opts?.agentId || 'default') } };
  if (d?.type === 'clearConversations' && d.agentId != null) return { ...d, agentId: tag + d.agentId };
  return d;
}
self.onmessage = (e) => handle(e, (msg) => self.postMessage(msg), '');
async function handle(e, post, tag) {
  const { id, type } = e.data;
  const reply = (msg) => post({ id, ...msg });
  try {
    await engineLibReady;
    if (type === 'load') {
      const { modelKey } = e.data;
      const cfg = MODEL_CONFIG[modelKey];
      if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
      if (engine && currentModel === modelKey) { reply({ type: 'result', data: { alreadyLoaded: true } }); return; }
      if (loading) { reply({ type: 'result', data: { busy: true } }); return; }
      // Switching models: conversations belong to the old engine.
      clearConversations(); await lastDispose;
      if (engine) { try { engine.delete(); } catch {} engine = null; }
      currentModel = null;
      loading = true;
      const onProgress = (p) => reply({ type: 'progress', data: p });
      try {
        onProgress('Loading LiteRT-LM...');
        onProgress(`Model: ${cfg.label}`);
        onProgress('Checking OPFS cache...');
        let modelFile = await getCachedModelFile(modelKey);
        if (modelFile) {
          onProgress({ phase: 'initialize', text: `Loading ${formatBytes(modelFile.size)} from device cache...` });
        } else {
          onProgress({ phase: 'download', percent: 0, text: 'Starting first-time model download...' });
          // a test or a self-hosted copy can name its own URL (localStorage tablefolk_model_url:<key>)
          modelFile = await downloadModelToOPFS(modelKey, e.data.url || cfg.modelUrl, onProgress);
        }
        onProgress({ phase: 'initialize', percent: 100, text: 'Download complete · initializing local brain...' });
        // The Emscripten glue that Engine.create() loads underneath tries to
        // auto-detect its own directory (to find its companion .wasm file)
        // via self.location.href when running in a worker. Loaded here via
        // importScripts() from inside litert-worker.js, that resolves to
        // OUR worker's own URL, not the CDN path the glue actually came
        // from - it then 404s on our dev server (an HTML error page, which
        // is why the error looks like "magic word ... found 3c 21 44 4f",
        // i.e. the bytes for "<!DO..."). @litert-lm/core never exposes a way
        // to pass Module.locateFile through its public API, but the loader
        // (@litertjs/wasm-utils' createWasmLib) checks for a pre-existing
        // self.Module and honors self.Module.locateFile when set - so we
        // seed it ourselves, matching the CDN version pinned above.
        const ver = cfg.lib || LIB;
        // one library per worker: a model on another version needs a fresh
        // worker (model-loader-litert.js starts one when it sees this)
        if (libVersion && libVersion !== ver) throw new Error('RESTART_WORKER: ' + modelKey + ' needs LiteRT-LM ' + ver);
        const { Engine, Backend } = await libFor(ver); libVersion = ver;
        self.Module = { locateFile: (path) => `https://cdn.jsdelivr.net/npm/@litert-lm/core@${ver}/wasm/` + path };
        engine = await Engine.create({ model: modelFile.stream(), mainExecutorSettings: { maxNumTokens: 8192 },
          ...(cfg.vision ? { visionBackend: Backend.GPU, maxVisionTokensPerImage: 256 } : {}) });
        engineVision = !!cfg.vision;
        // Warm up before saying "ready": the first generation sets up the
        // GPU kernels, and that work held up the game's own GPU calls (the
        // page froze for seconds just after "ready"). Here it happens while
        // the page still shows the model loading.
        onProgress({ phase: 'initialize', percent: 100, text: 'Warming up the local brain...' });
        try {
          const t0 = performance.now();
          const conv = await engine.createConversation({ preface: { messages: [{ role: 'system', content: 'Answer in one word.' }] } });
          const r = await conv.sendMessage('Say ok.');
          console.log('[litert-worker] warm-up in', Math.round(performance.now() - t0), 'ms:', messageText(r));
          await disposeConversation(conv);
        } catch (err) { console.warn('[litert-worker] warm-up failed:', err?.message || err); }
        currentModel = modelKey;
        onProgress(`${cfg.label} ready`);
        reply({ type: 'result', data: { loaded: true, modelKey } });
      } finally {
        loading = false;
      }
    } else if (type === 'unload') {
      clearConversations();
      if (engine) { try { engine.delete(); } catch {} }
      engine = null;
      currentModel = null;
      reply({ type: 'result', data: {} });
    } else if (type === 'clearCache') {
      const key = e.data.modelKey || 'gemma4-e2b-litert';
      try {
        const root = await navigator.storage.getDirectory();
        // An interrupted download leaves a .part behind (the next one reuses it).
        await root.removeEntry(`litert-${key}.litertlm.part`).catch(() => {});
        await root.removeEntry(`litert-${key}.litertlm`);
      } catch (err) {
        console.warn('[litert-worker] cache clear failed', err);
      }
      reply({ type: 'result', data: {} });
    } else if (type === 'hasCached') {
      const key = e.data.modelKey || 'gemma4-e2b-litert';
      let has = false;
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(`litert-${key}.litertlm`);
        const file = await fileHandle.getFile();
        has = file.size > 0;
      } catch {}
      reply({ type: 'result', data: has });
    } else if (type === 'capabilityInfo') {
      const webgpu = !!self.navigator.gpu;
      let shaderF16 = false;
      if (webgpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          shaderF16 = !!adapter?.features?.has('shader-f16');
        } catch {}
      }
      reply({ type: 'result', data: { webgpu, shaderF16 } });
    } else if (type === 'generate') {
      if (!engine) throw new Error('LiteRT-LM engine not loaded');
      const { messages, opts, streaming } = e.data;
      const onToken = streaming ? (fullText) => reply({ type: 'token', text: fullText }) : null;
      const { text, thinking } = await serialize(() => generateText(messages, opts || {}, onToken));
      reply({ type: 'result', data: { text, thinking } });
    } else if (type === 'see') {
      // One picture, one question, its own short conversation (the live one
      // is dropped first: one KV cache): what a character sees when it looks.
      if (!engine || !engineVision) throw new Error('the loaded model cannot see');
      const text = await serialize(async () => {
        await dropLive();
        const conv = await engine.createConversation({ preface: { messages: e.data.system ? [{ role: 'system', content: e.data.system }] : [] }, ...samplerFor(.6) });
        try {
          const r = await conv.sendMessage({ role: 'user', content: [{ type: 'image', data: e.data.image }, { type: 'text', text: e.data.prompt || 'What do you see?' }] });
          return splitThinking(messageText(r)).text;
        } finally { await disposeConversation(conv); }
      });
      reply({ type: 'result', data: { text } });
    } else if (type === 'canSee') {
      reply({ type: 'result', data: { vision: !!(engine && engineVision) } });
    } else if (type === 'debugLastPrompt') {
      reply({ type: 'result', data: lastSent });
    } else if (type === 'clearConversations') {
      // a shared page clears only its own
      if (tag && e.data.agentId == null) { for (const h of [...histories.values()]) if (h.agentId.startsWith(tag)) clearConversations(h.agentId); }
      else clearConversations(e.data.agentId ?? null);
      reply({ type: 'result', data: {} });
    } else if (type === 'currentModel') {
      reply({ type: 'result', data: currentModel });
    } else if (type === 'isLoaded') {
      reply({ type: 'result', data: engine !== null });
    } else {
      throw new Error('Unknown message type: ' + type);
    }
  } catch (err) {
    reply({ type: 'error', message: err?.message || String(err) });
  }
}
