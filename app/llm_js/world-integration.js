import { createAgentBrainManager } from './agent-brain.js?v=20261019a';
import { installDevConsole } from './dev-console.js?v=20261019a';
import { clearModelCache as clearLiteRTCache, hasModelCached as hasLiteRTCached } from './model-loader-litert.js?v=20261019a';
import { clearModelCache as clearTJSCache, hasModelCached as hasTJSCached } from './model-loader-tjs-v2.js?v=20261018a';
import { clearModelCache as clearWllamaCache, hasModelCached as hasWllamaCached } from './model-loader-wllama.js?v=20261018a';
import { clearModelCache as clearWllama3Cache, hasModelCached as hasWllama3Cached } from './model-loader-wllama3.js?v=20261018a';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForWorld() {
  for (let i = 0; i < 300; i++) {
    if (window.tablefolk?.ready) return window.tablefolk;
    await sleep(100);
  }
  throw new Error('tablefolk API did not appear');
}

function el(id) { return document.getElementById(id); }

let modelNoticeDismissTimer = null;
// Last real percent seen during the current load. Loaders interleave plain
// text updates ("Model: ...", "initializing...") with percent updates; without
// this, every text-only update snapped the bar back to the indeterminate
// shuttle mid-download.
let modelNoticePercent = null;

function normalizeProgress(status) {
  if (status && typeof status === 'object') {
    const percent = Number.isFinite(Number(status.percent))
      ? Math.max(0, Math.min(100, Number(status.percent)))
      : null;
    return { text: String(status.text || ''), percent, phase: status.phase || '' };
  }
  const text = String(status || '');
  const source = text;
  const match = source.match(/(?:caching model|download(?:ing)?[^:]*|model)[^%]*?([0-9]{1,3}(?:\.[0-9]+)?)\s*%/i)
    || source.match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/);
  return {
    text,
    percent: match ? Math.max(0, Math.min(100, Number(match[1]))) : null,
    phase: /download|caching/i.test(text) ? 'download' : '',
  };
}

function updateModelNotice(status, state = 'loading') {
  const notice = el('modelLoadNotice');
  if (!notice) return;
  const progress = normalizeProgress(status);
  const text = progress.text;
  clearTimeout(modelNoticeDismissTimer);
  notice.classList.remove('hidden', 'ready', 'error', 'determinate', 'consent', 'declined');
  if (state !== 'loading') notice.classList.add(state);
  if (state === 'loading') {
    if (progress.percent !== null) modelNoticePercent = progress.percent;
  } else {
    modelNoticePercent = null;
  }
  const percent = state === 'loading' ? modelNoticePercent : null;
  if (percent !== null) notice.classList.add('determinate');

  const title = el('modelLoadTitle');
  const detail = el('modelLoadText');
  const bar = el('modelProgressBar');
  const consent = el('modelConsent');
  if (consent) consent.hidden = true;
  if (title) title.textContent = state === 'ready' ? 'Local brain ready'
    : state === 'error' ? 'Local brain could not load'
    : progress.phase === 'download' || /download|caching/i.test(text) ? 'Downloading local brain'
    : 'Preparing local brain';
  if (detail) detail.textContent = text;

  if (bar) {
    bar.style.width = percent === null ? '' : `${percent}%`;
    const track = bar.parentElement;
    if (percent === null) track?.removeAttribute('aria-valuenow');
    else track?.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
  const pctLabel = el('modelProgressPct');
  if (pctLabel) pctLabel.textContent = percent === null ? '' : `${Math.floor(percent)}%`;
  if (state === 'ready') {
    modelNoticeDismissTimer = setTimeout(() => notice.classList.add('hidden'), 3500);
  }
}

function setStatus(status, noticeState = null) {
  const progress = normalizeProgress(status);
  const text = progress.text;
  const node = el('brainStatus');
  if (node) node.textContent = text;
  if (noticeState) updateModelNotice(status, noticeState);
  else if (/ready/i.test(text)) updateModelNotice(status, 'ready');
  else if (/fail|error|unavailable/i.test(text)) updateModelNotice(status, 'error');
  else if (progress.phase || /load|download|cache|initializ|prepar|checking/i.test(text)) updateModelNotice(status, 'loading');
}

function showDownloadConsent(modelLabel, modelSize) {
  const notice = el('modelLoadNotice');
  const consent = el('modelConsent');
  if (!notice || !consent) return;
  // The subtitle and consent blurb used to be hardcoded to MiniCPM5-1B in
  // index.html, so picking any other model still advertised a "~1.2 GB
  // MiniCPM5-1B download". Drive both from the model actually selected.
  if (el('modelLoadSubtitle')) el('modelLoadSubtitle').textContent = `${modelLabel} runs locally on this device`;
  if (el('modelConsentText')) {
    el('modelConsentText').innerHTML = '<strong>Run the characters locally?</strong> This needs a one-time '
      + (modelSize ? `<b>${modelSize}</b> ` : '') + `${modelLabel} download.`;
  }
  clearTimeout(modelNoticeDismissTimer);
  modelNoticePercent = null;
  notice.classList.remove('hidden', 'ready', 'error', 'determinate', 'declined');
  notice.classList.add('consent');
  consent.hidden = false;
  if (el('modelLoadTitle')) el('modelLoadTitle').textContent = 'Optional local AI';
  if (el('modelLoadText')) el('modelLoadText').textContent = `${modelLabel} is not downloaded yet.`;
  if (el('brainStatus')) el('brainStatus').textContent = 'waiting for model download permission';
}

function showDownloadDeclined() {
  const notice = el('modelLoadNotice');
  if (!notice) return;
  notice.classList.remove('consent', 'ready', 'error', 'determinate');
  notice.classList.add('declined');
  if (el('modelConsent')) el('modelConsent').hidden = true;
  if (el('modelLoadTitle')) el('modelLoadTitle').textContent = 'Model download skipped';
  if (el('modelLoadText')) el('modelLoadText').textContent = 'The world still works. Open Agent brains and click load whenever you want.';
  if (el('brainStatus')) el('brainStatus').textContent = 'local brain not loaded';
}

let pendingConsentResolve = null;
function waitForDownloadConsent(modelLabel, modelSize) {
  // A consent prompt from an earlier call may still be pending - e.g. startup
  // auto-load asked about the model remembered in localStorage, then the user
  // picked a different one from the dropdown and clicked load. The old
  // {once:true} listeners were never removed, so a SINGLE click on
  // "Download & run" resolved BOTH promises and started two concurrent
  // manager.load() calls (two models in memory at once - the near-crash), while
  // the stale path printed the old model's name. Settle any stale prompt as
  // declined before opening a new one.
  if (pendingConsentResolve) {
    pendingConsentResolve(false);
    pendingConsentResolve = null;
  }
  showDownloadConsent(modelLabel, modelSize);
  return new Promise(resolve => {
    const approve = el('approveModelDownload');
    const decline = el('declineModelDownload');
    const cleanup = () => {
      approve?.removeEventListener('click', onApprove);
      decline?.removeEventListener('click', onDecline);
    };
    function onApprove() { pendingConsentResolve = null; cleanup(); resolve(true); }
    function onDecline() { pendingConsentResolve = null; cleanup(); resolve(false); }
    pendingConsentResolve = (v) => { cleanup(); resolve(v); };
    approve?.addEventListener('click', onApprove);
    decline?.addEventListener('click', onDecline);
  });
}

// Hard guard against two model loads running at once, whatever the trigger.
// Loading two multi-hundred-MB models concurrently is what pushed the tab into
// OOM territory.
let loadInFlight = false;
async function loadModelOnce(manager, onBusy) {
  if (loadInFlight) {
    console.warn('[character] load already in progress - ignoring duplicate request');
    onBusy?.();
    return false;
  }
  loadInFlight = true;
  try {
    await manager.load();
    return true;
  } finally {
    loadInFlight = false;
  }
}

function appendLog(text) {
  window.tablefolk?.log?.(text);
}

// Transform a globalHistory entry like 'T3 folk1: folk1 walk n' into 'folk1 walks n'
// Also handles say entries like 'T3 folk1: folk1 say "hello" -> hello' into 'folk1 says hello'
// "RESULT OF YOUR LAST ACTION: sell("magic sword", 35) FAILED: ..." from the
// global history entries this turn added ('T5 mog: mog sell ... -> result').
const FAILURE = /\b(fail(ed|s)?|can'?t|cannot|unable|nothing|not enough|has only|no \w+ to|found no|no (object|target)|is disabled|unknown command|blocked|in the way|too (spiritually )?heavy)\b/i;
function ownActionResults(world, agentId, n) {
  const entries = (world.state?.globalHistory || []).slice(-Math.max(1, n)).filter(e => new RegExp('^T\\d+\\s+' + agentId + ':').test(e));
  const lines = [];
  for (const e of entries) {
    let body = e.replace(/^T\d+\s+[^:]+:\s*/, '');
    if (body.startsWith(agentId + ' ')) body = body.slice(agentId.length + 1);
    const arrow = body.indexOf(' -> ');
    const action = arrow >= 0 ? body.slice(0, arrow) : body, result = arrow >= 0 ? body.slice(arrow + 4) : '';
    if (/^(say|whisper)\b/.test(action)) continue;          // speech: nothing to report
    lines.push(result ? `${action} ${FAILURE.test(result) ? 'FAILED' : 'worked'}: ${result}` : `${action} done`);
  }
  return lines.length ? 'RESULT OF YOUR LAST ACTION: ' + lines.join('; ') : '';
}
function formatActionSummary(historyEntry) {
  if (!historyEntry) return 'turn resolved';
  // Strip the T# prefix: 'T3 folk1: folk1 walk n' -> 'folk1: folk1 walk n'
  let s = String(historyEntry).replace(/^T\d+\s+/, '');
  // Split into agent and action parts: 'folk1: folk1 walk n' -> agent='folk1', action='folk1 walk n'
  const colonIdx = s.indexOf(':');
  let agentId, action;
  if (colonIdx >= 0) {
    agentId = s.slice(0, colonIdx).trim();
    action = s.slice(colonIdx + 1).trim();
  } else {
    agentId = '';
    action = s;
  }
  // Remove redundant agent name from action if present: 'folk1 walk n' -> 'walk n'
  if (agentId && action.startsWith(agentId + ' ')) action = action.slice(agentId.length + 1);
  // Also strip the raw command form like 'folk1 walk(n)' -> 'walk(n)'
  if (agentId && action.startsWith(agentId)) action = action.slice(agentId.length).trim();
  // Results that are already a sentence about the actor ("give silk bundle ->
  // bram gives Traveller silk bundle") stand on their own; printing both
  // halves read "bram gives -> bram gives Traveller silk bundle".
  const arrow = action.indexOf(' -> ');
  if (agentId && arrow >= 0) {
    const result = action.slice(arrow + 4).trim();
    if (result.toLowerCase().startsWith(agentId.toLowerCase() + ' ')) return result;
  }
  // Conjugate common verbs: walk->walks, say->says, look->looks, etc.
  const verbMap = { walk: 'walks', say: 'says', whisper: 'whispers', look: 'looks', touch: 'touches', push: 'pushes', pull: 'pulls', carry: 'carries', drop: 'drops', throw: 'throws', dig: 'digs', build: 'builds', repair: 'repairs', panic: 'panics', spell: 'casts', goal: 'sets goal', give_quest: 'gives quest', give: 'gives', sell: 'sells', inventory: 'checks inventory' };
  const parts = action.split(/\s+/);
  if (parts.length > 0 && verbMap[parts[0]]) parts[0] = verbMap[parts[0]];
  action = parts.join(' ');
  // Clean up say text: 'says "hello" -> hello' -> 'says hello'
  action = action.replace(/"([^"]*)"\s*->\s*.*/, '$1');
  action = action.replace(/"([^"]*)"/, '$1');
  return agentId ? `${agentId} ${action}` : action;
}

function setCacheStatus(text) {
  const node = el('cacheStatus');
  if (node) node.textContent = text;
}

function getActiveEngine(manager) {
  return manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.engine;
}

async function clearActiveModelCache(manager) {
  const engine = getActiveEngine(manager);
  if (engine === 'litert-lm') return clearLiteRTCache(manager.getModelKey());
  if (engine === 'wllama') return clearWllamaCache(manager.getModelKey());
  if (engine === 'wllama3') return clearWllama3Cache(manager.getModelKey());
  return clearTJSCache(manager.getModelKey());
}

async function hasActiveModelCached(manager) {
  const engine = getActiveEngine(manager);
  if (engine === 'litert-lm') return hasLiteRTCached(manager.getModelKey());
  if (engine === 'wllama') return hasWllamaCached(manager.getModelKey());
  if (engine === 'wllama3') return hasWllama3Cached(manager.getModelKey());
  return hasTJSCached(manager.getModelKey());
}

function showPrompt(agentId, prompt, systemMessage) {
  const out = document.getElementById('promptOut');
  if (!out) return;
  out.textContent = `[AGENT: ${agentId}]\n\n[SYSTEM]\n${systemMessage}\n\n[USER]\n${prompt}`;
}

function syncSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  const cfg = world.getBrainConfig(g.id);
  if (el('brainEnabled')) el('brainEnabled').checked = cfg.enabled !== false;
  if (el('brainStyle')) el('brainStyle').value = cfg.style || 'helpful character';
  if (el('agentPersonality')) el('agentPersonality').value = cfg.personality || '';
  if (el('fireballTemptation')) el('fireballTemptation').value = cfg.fireballTemptation ?? g.traits?.fireball ?? 50;
  if (el('chaosLevel')) el('chaosLevel').value = cfg.chaos ?? 1;
  if (el('agentQuest')) el('agentQuest').value = cfg.quest || '';
  if (el('agentGoal')) el('agentGoal').value = cfg.goal || '';
  if (el('agentTtsEnabled')) el('agentTtsEnabled').checked = cfg.ttsEnabled !== false;
  if (el('agentThinking')) el('agentThinking').checked = cfg.thinking === true;
  if (el('agentShowThoughts')) el('agentShowThoughts').checked = cfg.showThoughts !== false;
  if (el('agentGold')) el('agentGold').value = cfg.inventory?.gold ?? 0;
  if (el('agentItems') && document.activeElement !== el('agentItems')) el('agentItems').value = world.formatInventoryItems?.(cfg.inventory?.items) || '';
  if (el('agentTtsVoice')) el('agentTtsVoice').value = cfg.ttsVoiceId || 'builtin:alba';
}

function saveSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  world.setBrainConfig(g.id, {
    enabled: el('brainEnabled')?.checked !== false,
    style: el('brainStyle')?.value || 'helpful character',
    personality: el('agentPersonality')?.value || 'helpful and friendly',
    fireballTemptation: Number(el('fireballTemptation')?.value || 50),
    chaos: Number(el('chaosLevel')?.value || 50),
    quest: el('agentQuest')?.value || '',
    ttsEnabled: el('agentTtsEnabled')?.checked !== false,
    thinking: el('agentThinking')?.checked === true,
    showThoughts: el('agentShowThoughts')?.checked !== false,
    inventory: { gold: Math.max(0, parseInt(el('agentGold')?.value, 10) || 0), items: world.parseInventoryItems?.(el('agentItems')?.value) || [] },
    ttsVoiceId: el('agentTtsVoice')?.value || 'builtin:alba',
  });
}

// Build the full agent prompt messages (system + history + command reminder +
// pending chat), reusing world.buildAgentPrompt. Extracted from runOneAgentTurn
// so the demo chat can build the same prompt without duplicating code.
// Earshot: characters only hear and see what happens closer than this many cells
// of them (scenario "earshot", default 6). Whispers reach only the player.
function earshot(world) { const e = +world.state?.earshot; return e > 0 ? e : 6; }
function within(a, b, r) { return a && b && Math.hypot(a.x - b.x, a.z - b.z) < r; }
// The player's words to one character are overheard by the others in
// earshot (of the player's avatar, or of the one spoken to): kept as context,
// marked as said to someone else, so they don't feel they must answer.
function overhear(world, g, who, text) {
  const src = world.getPlayerAvatar?.()?.root?.position || g.root.position, r = earshot(world);
  for (const other of world.getAgents()) {
    if (other.id === g.id || !within(other.root.position, src, r)) continue;
    const ocfg = world.getBrainConfig(other.id);
    ocfg.messages = (ocfg.messages || []).concat([{ role: 'user', content: `[${who}] (to ${g.id}) ${text}` }]).slice(-40);
    world.setBrainConfig(other.id, ocfg);
  }
}

function buildAgentMessages(world, g, cfg) {
  const { systemMessage, commandReminder } = world.buildAgentPrompt(g, cfg);
  const messages = [{ role: 'system', content: systemMessage }];
  // Seed the conversation with a real example of responding to speech with say()
  // (teaches the small model not to echo the speaker attribution). Only prepend
  // if the history doesn't already start with it.
  const hist = cfg.messages || [];
  const alreadySeeded = hist.some(m => m.role === 'user' && String(m.content).includes('Are you ready my son?'));
  if (!alreadySeeded) {
    messages.push({ role: 'user', content: 'God says: Are you ready my son?' });
    messages.push({ role: 'assistant', content: 'say("Yes I am ready")' });
  }
  for (const m of hist) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n' + m.content;
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }
  let chatSuffix = '';
  if (cfg.pendingChat && cfg.pendingChat.length > 0) {
    // Convert 'God says: <text>' -> '[God] <text>' so the model has no 'says'
    // pattern to echo back (small models echo the prompt format).
    const speech = cfg.pendingChat.map(line => {
      const m = String(line).match(/^(.+?)\s+says:\s*(.*)$/);
      return m ? `[${m[1].trim()}] ${m[2]}` : line;
    }).join('\n');
    // No "answer with say()" here: pointing the model at say() made it talk
    // and forget the rest of its brief (a password it should react to with
    // give()). The system prompt already lists the commands.
    chatSuffix = '\n\nNEW SPEECH ADDRESSED TO YOU:\n' + speech;
    cfg.pendingChat = [];
    world.setBrainConfig(g.id, cfg);
  }
  // Whatever happened since this character's last reply (its action results,
  // other characters' actions, notes) goes after the map and right before the
  // new speech, where it's read in context, instead of ahead of the map.
  const lastMsg = messages[messages.length - 1];
  const since = (lastMsg && lastMsg.role === 'user' && hist.length && hist[hist.length - 1].role === 'user') ? messages.pop().content : '';
  messages.push({ role: 'user', content: commandReminder + (since ? '\n\nSINCE YOUR LAST TURN:\n' + since : '') + chatSuffix });
  return { messages, chatSuffix };
}

async function main() {
  const world = await waitForWorld();
  el('dismissModelLoad')?.addEventListener('click', () => {
    el('modelLoadNotice')?.classList.add('hidden');
  });
  world.buildAgentMessages = (g, cfg) => buildAgentMessages(world, g, cfg);
  const manager = createAgentBrainManager({
    onStatus: setStatus,
    onDebug: () => {},
  });
  // Let the console's llm()/genmap() piggyback on this manager when it's
  // already sitting on the model they want, instead of loading a redundant
  // second copy of the same multi-GB weights.
  installDevConsole(() => manager);
  let running = false;
  let stepIndex = 0;
  window.addEventListener('tablefolk:clear-conversations', event => manager.clearConversations(event.detail?.agentId ?? null));
  window.addEventListener('tablefolk-thinking', event => {
    const { agentId, thinking } = event.detail || {};
    const t = String(thinking || '').replace(/\s+/g, ' ').trim();
    if (t) appendLog(`${agentId} thought: ${t.length > 400 ? t.slice(0, 400) + '…' : t}`);
    // The pending "thinking…" bubble always shows; the text only if enabled
    // (otherwise the pending bubble is cleared when the turn finishes).
    if (t && world.getBrainConfig(agentId)?.showThoughts !== false) world.showThought?.(agentId, t);
  });
  // Auto-load the brain on startup
  // Populate model selector
  const modelSelect = el('modelSelect');
  if (modelSelect) {
    modelSelect.textContent = '';
    for (const m of manager.getSupportedModels()) {
      // Hidden models only appear if one was picked explicitly via ?model=.
      if (m.hidden && m.key !== manager.getModelKey()) continue;
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = manager.getModelKey();
    modelSelect.addEventListener('change', async () => {
      const newKey = modelSelect.value;
      appendLog('switching model to ' + newKey);
      // Stop agents if running
      if (running) {
        running = false;
        el('stopBrains').disabled = true;
      }
      manager.setModel(newKey);
      // Update load button text
      const loadBtn = el('loadBrains');
      if (loadBtn) loadBtn.textContent = 'load ' + (manager.getSupportedModels().find(m => m.key === newKey)?.label || newKey);
      // Disable controls until loaded
      el('startBrains').disabled = true;
      el('stepBrains').disabled = true;
      el('stopBrains').disabled = true;
      el('loadBrains').disabled = false;
      // Go straight into the load flow (download prompt if needed, then real
      // progress). This used to set "model switched ... - click load", which
      // the notice read as "loading" and showed as an endless busy bar while
      // nothing was happening.
      el('brainStatus') && (el('brainStatus').textContent = 'switching to ' + (manager.getSupportedModels().find(m => m.key === newKey)?.label || newKey) + '…');
      el('loadBrains').click();
    });
  }
  // Initialize cache backend selector
  const backendSelect = el('cacheBackend');
  if (backendSelect) {
    backendSelect.value = 'opfs';
    backendSelect.disabled = true;
  }
  el('clearCache')?.addEventListener('click', async () => {
    setCacheStatus('clearing...');
    try {
      await clearActiveModelCache(manager);
      setCacheStatus('cache cleared');
      appendLog('model cache cleared');
      el('loadBrains').disabled = false;
    } catch (e) {
      setCacheStatus('clear failed: ' + e.message);
      appendLog('cache clear error: ' + e.message);
    }
  });
  // Check if model is already cached
  let cached = false;
  try {
    cached = await hasActiveModelCached(manager);
    setCacheStatus(cached ? 'model cached' : 'not cached');
  } catch {}

  const modelLabel = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
  const loadBtn = el('loadBrains');
  if (loadBtn) loadBtn.textContent = 'load ' + modelLabel;
  let shouldLoad = cached;
  if (window.TABLEFOLK_ART_MODE) {
    // Art review mode: never touch the multi-GB model, the renderer is what we
    // are looking at. Buttons stay disabled.
    shouldLoad = false;
    setStatus('local brain disabled (art review mode)');
    el('modelLoadNotice')?.classList.add('hidden');
    appendLog('art review mode: LLM load skipped');
  } else if (getActiveEngine(manager) === 'transformers.js' || getActiveEngine(manager) === 'wllama3') {
    // GPU/WebGPU engines never auto-load, even if cached and even if this model
    // was the last one selected (localStorage remembers it). WebGPU inference
    // competes with the 3D renderer's own WebGPU context for GPU resources and
    // has caused hard browser crashes on some hardware - always require an
    // explicit click so a page refresh never silently triggers it.
    shouldLoad = false;
    setStatus(modelLabel + ' selected - click load to start (GPU engine, never auto-loads)');
    appendLog('GPU engine selected: skipping auto-load, click load manually');
  } else if (!cached) {
    shouldLoad = await waitForDownloadConsent(modelLabel, manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.size);
    if (!shouldLoad) {
      showDownloadDeclined();
      appendLog('local model download skipped');
    }
  }

  if (shouldLoad) try {
    // Re-read the label HERE rather than reusing the one captured before the
    // consent prompt: the user may have changed the dropdown while it was open.
    const liveLabel = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
    setStatus('auto-loading ' + liveLabel + '...');
    console.log(cached ? '[character] loading cached model...' : '[character] starting approved download...', liveLabel);
    if (!await loadModelOnce(manager)) return;
    console.log('[character] auto-load completed, enabling buttons...');
    el('startBrains').disabled = false;
    el('stepBrains').disabled = false;
    el('loadBrains').disabled = true;
    world.state.nextAgentId = world.getAgents()[0]?.id || null;
    appendLog('local brain auto-loaded: ' + modelLabel);
    setStatus(modelLabel + ' ready', 'ready');
  } catch (err) {
    console.error('[character] auto-load FAILED:', err);
    setStatus('Auto-load failed: ' + err.message + ' Open Agent brains to retry.', 'error');
    el('loadBrains').disabled = false;
    appendLog('auto-load failed: ' + err.message);
  }

  world.onAgentSelected = () => syncSelectedBrainUI(world);
  // A sale changes gold/stock; refresh the character setup fields.
  world.onInventoryChanged = () => syncSelectedBrainUI(world);
  syncSelectedBrainUI(world);

  for (const id of ['brainEnabled', 'brainStyle', 'agentPersonality', 'fireballTemptation', 'chaosLevel', 'agentQuest', 'agentTtsEnabled', 'agentTtsVoice', 'agentThinking', 'agentShowThoughts', 'agentGold', 'agentItems']) {
    const node = el(id);
    if (node) node.addEventListener('change', () => saveSelectedBrainUI(world));
    if (node && (node.type === 'range' || node.type === 'text' || node.tagName === 'TEXTAREA')) node.addEventListener('input', () => saveSelectedBrainUI(world));
  }

  el('loadBrains')?.addEventListener('click', async () => {
    try {
      const cachedNow = await hasActiveModelCached(manager).catch(() => false);
      if (!cachedNow) {
        const cur = manager.getSupportedModels().find(m => m.key === manager.getModelKey());
        const approved = await waitForDownloadConsent(cur?.label || manager.getModelKey(), cur?.size);
        if (!approved) { showDownloadDeclined(); return; }
      }
      el('loadBrains').disabled = true;
      console.log('[character] manual load starting...');
      setStatus(cachedNow ? 'loading cached local brain...' : 'starting approved model download...');
      if (!await loadModelOnce(manager, () => setStatus('a model load is already running - wait for it to finish'))) {
        el('loadBrains').disabled = false;
        return;
      }
      console.log('[character] manual load completed, enabling buttons...');
      el('startBrains').disabled = false;
      el('stepBrains').disabled = false;
     world.state.nextAgentId = world.getAgents()[0]?.id || null;
      const lbl = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
      appendLog('local brain loaded: ' + lbl);
      setStatus(lbl + ' ready', 'ready');
    } catch (err) {
      el('loadBrains').disabled = false;
      setStatus('brain load error: ' + err.message);
      el('stepBrains').disabled = true;
      appendLog('brain load error: ' + err.message);
    }
  });

  async function runOneAgentTurn(g) {
    const cfg = world.getBrainConfig(g.id);
    if (cfg.enabled === false) return false;
    if (!world.isTurnReady()) { return false; }
    try {
      world.state.nextAgentId = g.id;
      updatePerceptionUI();
      const chatTestMode = el('chatTestMode')?.checked;
      let messages;
     let chatSuffix = '';
      if (chatTestMode) {
        // Bare conversation mode: minimal system message, only user/assistant messages
        messages = [{ role: 'system', content: 'have a conversation. use the say command' }];
        const hist = cfg.messages || [];
        for (const m of hist) {
          // Only include user and assistant messages, skip SYSTEM RESULT and TABLEFOLK ACTION
          if (m.role === 'assistant' || (m.role === 'user' && !m.content.startsWith('SYSTEM RESULT:') && !m.content.startsWith('TABLEFOLK ') && !m.content.startsWith('SYSTEM:'))) {
            const last = messages[messages.length - 1];
            if (last && last.role === m.role) {
              last.content += '\n' + m.content;
            } else {
              messages.push({ role: m.role, content: m.content });
            }
          }
        }
        // Add a simple prompt if last message is not user
        const lastM = messages[messages.length - 1];
        if (!lastM || lastM.role !== 'user') {
          messages.push({ role: 'user', content: 'respond' });
        }
      } else {
        const built = buildAgentMessages(world, g, cfg);
        messages = built.messages;
        chatSuffix = built.chatSuffix;
      }
      // Show in prompt panel
      let displayText = `[AGENT: ${g.id}]

`;
      for (const m of messages) displayText += `[${m.role.toUpperCase()}] ${m.content}

`;
      showPrompt(g.id, displayText, messages[0]?.content || '');
      // Save base text for streaming overlay
      const promptOut = document.getElementById('promptOut');
      if (promptOut) promptOut.dataset.baseText = displayText;
      appendLog(g.id + ' sending ' + messages.length + ' messages to LLM (' + (cfg.messages||[]).length + ' history)' + (chatTestMode ? ' [CHAT TEST]' : ''));
      console.log('[tablefolk-world] ABOUT TO CALL manager.decide for agent', g.id, 'with', messages.length, 'messages', 'at', new Date().toISOString());
      const decideT0 = performance.now();
      window.TABLEFOLK_PAUSE_RENDER = true;
      console.log('[tablefolk-world] render paused at', new Date().toISOString());
      let line;
      if (cfg.thinking === true) world.showThought?.(g.id, '', true);
      try {
        line = await manager.decide({
          agentId: g.id,
          messages,
          useGrammar: !chatTestMode,
          allowedCommands: world.getAllowedCommands(),
          // Per-character (Character setup). Reasoning needs room before the
          // command lines, so raise the token budget too.
          enableThinking: cfg.thinking === true,
          maxTokens: cfg.thinking === true ? 1024 : undefined,
          temperature: cfg.chaos > 70 ? 0.8 : (cfg.chaos > 40 ? 0.5 : 0.3),
        });
      } finally {
        world.clearPendingThought?.(g.id);
        window.TABLEFOLK_PAUSE_RENDER = false;
        console.log('[tablefolk-world] render resumed at', new Date().toISOString());
      }
      console.log('[tablefolk-world] RAW LLM OUTPUT for agent', g.id, 'at', new Date().toISOString(), 'elapsed ms:', Math.round(performance.now() - decideT0), ':', line);
      const planLines = (typeof window.splitPlanLines==='function' ? window.splitPlanLines(line) : String(line || '').split('\n').map(l => l.trim()).filter(Boolean));
      // A line that isn't shaped like a command, name(...), is speech: small
      // models often answer in plain text ("I am tired. State your
      // business."), which used to fail as an unknown command. (With thinking
      // on, plain lines are leftover reasoning and are dropped below.)
      const looksLikeCommand = l => /^[A-Za-z_][\w.-]*\s*\(/.test(l);
      const speakPlain = cfg.thinking !== true && world.getAllowedCommands().includes('say');
      let saidPlain = false;
      const planCmds = planLines.map(l => {
        if (speakPlain && !looksLikeCommand(l)) {
          const text = l.replace(/^["'\u201c]+|["'\u201d]+$/g, '').trim();
          if (!text) return null;
          saidPlain = true;
          return { kind: 'say', text };
        }
        return world.parseLLMCommandLine(l);
      }).filter(Boolean);
      // With thinking on, reasoning prose that slipped past the worker's split
      // (e.g. markers stripped by the runtime) must not become speech.
      if (cfg.thinking === true) for (let i = planCmds.length - 1; i >= 0; i--) if (planCmds[i].kind === 'unknown') planCmds.splice(i, 1);
      if (!planCmds.length) planCmds.push({ kind: 'look' });
      // Persist chat messages to history so they're remembered in future turns
      if (chatSuffix) {
        // Only the speech itself goes into the history, never instructions.
        const chatLines = chatSuffix.trim().split('\n').filter(l => /^\[[^\]]+\]\s/.test(l));
        for (const cl of chatLines) {
          cfg.messages = (cfg.messages || []).concat([{ role: 'user', content: cl }]);
        }
      }
      // A new human utterance should not be drowned by old action chatter.
      // Keep it as the latest conversational event after generation as well.
      if(chatSuffix && cfg.messages?.length>30) cfg.messages=cfg.messages.slice(-30);
      // Add agent's action as assistant message
      // Its own reply goes into its history as commands: plain text that was
      // spoken is stored as say("..."), so it learns the format from itself.
      const histLine = saidPlain ? planLines.map(l => looksLikeCommand(l) ? l : `say(${JSON.stringify(l.replace(/^["'\u201c]+|["'\u201d]+$/g, '').trim())})`).join('\n') : line;
      cfg.messages = (cfg.messages || []).concat([{ role: 'assistant', content: histLine || 'look()' }]);
      cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
      world.setBrainConfig(g.id, cfg);
      appendLog(`${g.id} brain -> ${line || 'look()'}`);
      // One brain decision = one scenario turn (scenario.js counts these).
      try { window.dispatchEvent(new CustomEvent('tablefolk-agent-turn', { detail: { agentId: g.id, line } })); } catch {}
      for (const planCmd of planCmds) await world.stepAgentTurn(g.id, planCmd, 'llm');
      // After turn resolves, add system result as user message
      const resultDesc = world.state?.globalHistory?.slice(-1)?.[0] || 'turn resolved';
      const summary = formatActionSummary(resultDesc);
      // For the acting character: what its own actions did, worded so it can't
      // be mistaken for someone else's, with failures flagged. ("mog sells ->
      // sale failed: ..." was in the prompt but the model still claimed the
      // sale worked.) Speech-only turns keep the plain summary.
      const ownResults = ownActionResults(world, g.id, planCmds.length);
      // A speech-only turn reports nothing back: "bram says <what it just
      // said>" right after its own say(...) only repeated it.
      const ownReport = ownResults || (planCmds.every(c => c.kind === 'say' || c.kind === 'whisper') ? '' : summary);
      if (ownReport) cfg.messages = cfg.messages.concat([{ role: 'user', content: ownReport }]);
      // Said it handed something over but issued no give()/sell(): tell it,
      // so the next turn can actually do it (small models often narrate the
      // hand-over instead of using the command).
      const allowedNow = world.getAllowedCommands();
      const saidNow = planCmds.filter(c => c.kind === 'say').map(c => c.text || '').join(' ');
      const handedOver = planCmds.some(c => c.kind === 'give' || c.kind === 'sell');
      if (!handedOver && (allowedNow.includes('give') || allowedNow.includes('sell'))
          && /\b(here(?:'?s| is| it is| you (?:go|are)| ya go)\b|take (?:it|this|the)\b|(?:it'?s|it is|they'?re|they are) (?:all |now )?yours|(?:i'?ll|i will|let me|i'?m going to) (?:give|hand)|giving (?:it|you|the)|handing (?:it|you|the|over)|have it\b|hands? (?:it|you|over))/i.test(saidNow)) {
        const how = [allowedNow.includes('give') ? 'give("item")' : '', allowedNow.includes('sell') ? 'sell("item", price)' : ''].filter(Boolean).join(' or ');
        cfg.messages = cfg.messages.concat([{ role: 'user', content: `SYSTEM: You said you would hand something over, but nothing changed hands. Saying it does nothing; use ${how} to actually do it.` }]);
      }
      if (saidPlain) cfg.messages = cfg.messages.concat([{ role: 'user', content: 'SYSTEM: Your plain text was spoken for you. Write speech as say("...") and actions as commands.' }]);
      // Retain enough ordinary conversation for multi-turn instructions to remain salient.
      if (cfg.messages.length > 40) cfg.messages = cfg.messages.slice(-40);
      world.setBrainConfig(g.id, cfg);
      // Tell every other character what this one did, once, in readable form
      // ("hale says ..."); the raw command line ("hale say(...)") used to go
      // in as well, so each turn showed up twice.
      // Every entry this turn added (say + give is two), not just the last;
      // whispers are for the player only.
      const turnEntries = (world.state?.globalHistory || []).slice(-Math.max(1, planCmds.length)).filter(e => new RegExp('^T\\d+\\s+' + g.id + ':').test(e))
        .filter(e => !new RegExp('^T\\d+\\s+[^:]+:\\s*' + g.id + ' whisper\\b').test(e));
      const onlyWhispers = planCmds.length && planCmds.every(c => c.kind === 'whisper');
      const resultMsg = turnEntries.length ? turnEntries.map(formatActionSummary).join('\n') : (onlyWhispers ? '' : summary);
      const r = earshot(world);
      for (const other of world.getAgents()) {
        if (other.id === g.id || !resultMsg || !within(other.root.position, g.root.position, r)) continue;
        const ocfg = world.getBrainConfig(other.id);
        ocfg.messages = (ocfg.messages || []).concat([{ role: 'user', content: resultMsg }]);
        if (ocfg.messages.length > 40) ocfg.messages = ocfg.messages.slice(-40);
        world.setBrainConfig(other.id, ocfg);
      }
      return true;
    } catch (err) {
      console.error('[tablefolk-world] ERROR in runOneAgentTurn for agent', g.id, ':', err);
      console.error('[tablefolk-world] STACK TRACE:', err && err.stack);
      appendLog(`${g.id} brain error: ${err.message}`);
      return false;
    }
  }

  el('startBrains')?.addEventListener('click', async () => {
    if (running) return;
    if (!manager.isLoaded()) await manager.load();
    running = true;
    el('startBrains').disabled = true;
    el('stepBrains').disabled = true;
    el('stopBrains').disabled = false;
    setStatus('agents thinking round-robin...');
    appendLog('agent brains started');
    while (running) {
      const agents = world.getAgents();
      for (const g0 of agents) {
        if (!running) break;
        if (!world.isTurnReady()) { await sleep(150); continue; }
        // Someone was just spoken to: they answer before the round continues.
        const g = agents.find(a => world.getBrainConfig(a.id).pendingChat?.length) || g0;
        world.state.nextAgentId = g.id;
        await runOneAgentTurn(g);
      }
    }
  });

  el('stepBrains')?.addEventListener('click', async () => {
    if (running) return;
    if (!manager.isLoaded()) await manager.load();
    el('stepBrains').disabled = true;
    setStatus('stepping one agent turn...');
    const agents = world.getAgents();
    const g = agents[stepIndex % agents.length];
    world.state.nextAgentId = g.id;
    await runOneAgentTurn(g);
    stepIndex++;
    const nextG = agents[stepIndex % agents.length];
    world.state.nextAgentId = nextG ? nextG.id : g.id;
    el('stepBrains').disabled = false;
    const brainNode = el('brainStatus');
    if (brainNode) brainNode.textContent = manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready' : 'local brain not loaded';
  });

  el('stopBrains')?.addEventListener('click', () => {
    running = false;
    el('startBrains').disabled = !manager.isLoaded();
    el('stepBrains').disabled = !manager.isLoaded();
    el('stopBrains').disabled = true;
    const brainNode2 = el('brainStatus');
    if (brainNode2) brainNode2.textContent = manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready; agents stopped' : 'local brain not loaded';
    appendLog('agent brains stopped');
  });

  el('spawnCharacter')?.addEventListener('click', () => world.spawnCharacter());
  el('spawnCrate')?.addEventListener('click', () => world.spawnProp('crate'));
  el('spawnBarrel')?.addEventListener('click', () => world.spawnProp('barrel'));
  el('spawnWall')?.addEventListener('click', () => world.spawnProp('wall'));
  el('spawnMushroom')?.addEventListener('click', () => world.spawnProp('mushroom'));
  el('spawnLamp')?.addEventListener('click', () => world.spawnProp('lamp'));

  function sendChatToAgent() {
    const input = el('chatInput');
    const name = el('chatName')?.value || 'God';
    let text = input?.value?.trim();
    if (!text) return;
    // "@bram hello" talks to bram (and selects him) whoever is selected.
    const at = text.match(/^@([A-Za-z0-9_-]+)[\s,:]+(.*)$/s);
    if (at) {
      const who = world.getAgents().find(a => a.id.toLowerCase() === at[1].toLowerCase());
      if (!who) { appendLog('no character called ' + at[1]); window.tablefolkToast?.('no character called ' + at[1], { type: 'error' }); return; }
      world.selectCharacter(who); text = at[2].trim(); if (!text) return;
    }
    const g = world.getSelectedAgent?.();
    if (!g) { appendLog('no agent selected'); return; }
    // Listeners (scenario safety check) may add a note to this agent's prompt first.
    try { window.dispatchEvent(new CustomEvent('tablefolk-player-chat', { detail: { agentId: g.id, text } })); } catch {}
    const cfg = world.getBrainConfig(g.id);
    // Store chat separately so it can be appended at the end of the next prompt (after perception)
    cfg.pendingChat = (cfg.pendingChat || []).concat([`${name} says: ${text}`]);
    if (cfg.pendingChat.length > 5) cfg.pendingChat = cfg.pendingChat.slice(-5);
    world.setBrainConfig(g.id, cfg);
    overhear(world, g, name, text);
    appendLog(name + ' -> ' + g.id + ': ' + text);
    input.value = '';
    // The character you spoke to answers now. (This used to press "step",
    // which runs characters in turn order: you'd talk to Bram and Hale would
    // answer, while your words waited for Bram's turn.) With the brains
    // running, the loop takes characters with new speech first instead.
    if (!running && manager.isLoaded()) replyNow(g);
  }
  let replying = false;
  async function replyNow(g) {
    if (replying) return;
    replying = true;
    try {
      while (!world.isTurnReady()) await sleep(100);
      if (world.getBrainConfig(g.id).pendingChat?.length) await runOneAgentTurn(g);
    } finally { replying = false; }
  }
  // Programmatic chat for the scenario tactic tester (scenario.js): queue a
  // message exactly like the chat box does, run that character's turn, and
  // resolve once the turn (and any walking) has settled.
  world.chatAndStep = async (agentId, text, name) => {
    if (running) throw new Error('stop the running brains first');
    if (!manager.isLoaded()) await manager.load();
    const g = world.getAgents().find(a => a.id === agentId) || world.getSelectedAgent?.();
    if (!g) throw new Error('no character to talk to');
    if (text) {
      try { window.dispatchEvent(new CustomEvent('tablefolk-player-chat', { detail: { agentId: g.id, text } })); } catch {}
      const who = name || el('chatName')?.value || 'God';
      const cfg = world.getBrainConfig(g.id);
      cfg.pendingChat = (cfg.pendingChat || []).concat([`${who} says: ${text}`]).slice(-5);
      world.setBrainConfig(g.id, cfg);
      overhear(world, g, who, text);
      appendLog(who + ' -> ' + g.id + ': ' + text);
    }
    while (!world.isTurnReady()) await sleep(100);
    world.state.nextAgentId = g.id;
    const ok = await runOneAgentTurn(g);
    while (!world.isTurnReady()) await sleep(100);
    return ok;
  };
  world.isBrainLoopRunning = () => running;
  world.ensureBrainLoaded = async () => { if (!manager.isLoaded()) await manager.load(); };
  el('chatSend')?.addEventListener('click', sendChatToAgent);
  el('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatToAgent(); });
}

main().catch(err => {
  setStatus('integration error: ' + err.message);
  console.error(err);
});
