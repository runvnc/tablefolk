import { createAgentBrainManager } from './agent-brain.js';
import { getCacheBackend, setCacheBackend, clearModelCache, hasModelCached } from './model-loader.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForWorld() {
  for (let i = 0; i < 300; i++) {
    if (window.tablefolk?.ready) return window.tablefolk;
    await sleep(100);
  }
  throw new Error('tablefolk API did not appear');
}

function el(id) { return document.getElementById(id); }

function setStatus(text) {
  const node = el('brainStatus');
  if (node) node.textContent = text;
}

function appendLog(text) {
  window.tablefolk?.log?.(text);
}

// Transform a globalHistory entry like 'T3 folk1: folk1 walk n' into 'folk1 walks n'
// Also handles say entries like 'T3 folk1: folk1 say "hello" -> hello' into 'folk1 says hello'
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
  // Conjugate common verbs: walk->walks, say->says, look->looks, etc.
  const verbMap = { walk: 'walks', say: 'says', look: 'looks', touch: 'touches', push: 'pushes', pull: 'pulls', carry: 'carries', drop: 'drops', throw: 'throws', dig: 'digs', build: 'builds', repair: 'repairs', panic: 'panics', spell: 'casts', goal: 'sets goal', give_quest: 'gives quest' };
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
  if (el('brainStyle')) el('brainStyle').value = cfg.style || 'fireball goblin';
  if (el('agentPersonality')) el('agentPersonality').value = cfg.personality || '';
  if (el('fireballTemptation')) el('fireballTemptation').value = cfg.fireballTemptation ?? g.traits?.fireball ?? 50;
  if (el('chaosLevel')) el('chaosLevel').value = cfg.chaos ?? 55;
  if (el('agentQuest')) el('agentQuest').value = cfg.quest || '';
  if (el('agentGoal')) el('agentGoal').value = cfg.goal || '';
}

function saveSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  world.setBrainConfig(g.id, {
    enabled: el('brainEnabled')?.checked !== false,
    style: el('brainStyle')?.value || 'helpful idiot',
    personality: el('agentPersonality')?.value || 'goofy, curious, imperfect',
    fireballTemptation: Number(el('fireballTemptation')?.value || 50),
    chaos: Number(el('chaosLevel')?.value || 50),
    quest: el('agentQuest')?.value || '',
  });
}

async function main() {
  const world = await waitForWorld();
  const manager = createAgentBrainManager({
    onStatus: setStatus,
    onDebug: () => {},
  });
  let running = false;
  let stepIndex = 0;
  // Auto-load the brain on startup
  // Populate model selector
  const modelSelect = el('modelSelect');
  if (modelSelect) {
    for (const m of manager.getSupportedModels()) {
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
      setStatus('model switched to ' + newKey + ' - click load');
    });
  }
  // Initialize cache backend selector
  const backendSelect = el('cacheBackend');
  if (backendSelect) {
    backendSelect.value = getCacheBackend();
    backendSelect.addEventListener('change', () => {
      setCacheBackend(backendSelect.value);
      setCacheStatus('backend: ' + backendSelect.value);
    });
  }
  el('clearCache')?.addEventListener('click', async () => {
    setCacheStatus('clearing...');
    try {
      await clearModelCache();
      setCacheStatus('cache cleared');
      appendLog('model cache cleared');
    } catch (e) {
      setCacheStatus('clear failed: ' + e.message);
      appendLog('cache clear error: ' + e.message);
    }
  });
  // Check if model is already cached
  try {
    const cached = await hasModelCached();
    setCacheStatus(cached ? 'model cached' : 'not cached');
  } catch {}
  try {
    const modelLabel = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
    setStatus('auto-loading ' + modelLabel + '...');
    // Update load button text to match default model
    const loadBtn = el('loadBrains');
    if (loadBtn) loadBtn.textContent = 'load ' + modelLabel;
    console.log('[character] starting auto-load...');
    await manager.load();
    console.log('[character] auto-load completed, enabling buttons...');
    el('startBrains').disabled = false;
    el('stepBrains').disabled = false;
    el('loadBrains').disabled = true;
    world.state.nextAgentId = world.getAgents()[0]?.id || null;
    appendLog('local brain auto-loaded: ' + modelLabel);
  } catch (err) {
    console.error('[character] auto-load FAILED:', err);
    setStatus('auto-load failed: ' + err.message + ' (click load manually)');
    el('loadBrains').disabled = false;
    appendLog('auto-load failed: ' + err.message);
  }

  world.onAgentSelected = () => syncSelectedBrainUI(world);
  syncSelectedBrainUI(world);

  for (const id of ['brainEnabled', 'brainStyle', 'agentPersonality', 'fireballTemptation', 'chaosLevel', 'agentQuest']) {
    const node = el(id);
    if (node) node.addEventListener('change', () => saveSelectedBrainUI(world));
    if (node && (node.type === 'range' || node.type === 'text' || node.tagName === 'TEXTAREA')) node.addEventListener('input', () => saveSelectedBrainUI(world));
  }

  el('loadBrains')?.addEventListener('click', async () => {
    try {
      el('loadBrains').disabled = true;
      console.log('[character] manual load starting...');
      await manager.load();
      console.log('[character] manual load completed, enabling buttons...');
      el('startBrains').disabled = false;
      el('stepBrains').disabled = false;
     world.state.nextAgentId = world.getAgents()[0]?.id || null;
      const lbl = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
      appendLog('local brain loaded: ' + lbl);
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
        const { systemMessage, commandReminder } = world.buildAgentPrompt(g, cfg);
        // Build messages array: system + history + current command reminder
        // Merge consecutive same-role messages to help the small model
        messages = [{ role: 'system', content: systemMessage }];
        const hist = cfg.messages || [];
        for (const m of hist) {
          const last = messages[messages.length - 1];
          if (last && last.role === m.role) {
            last.content += '\n' + m.content;
          } else {
            messages.push({ role: m.role, content: m.content });
          }
        }
        // Merge command reminder with last user message if it's also user role
        const lastMsg = messages[messages.length - 1];
         if (cfg.pendingChat && cfg.pendingChat.length > 0) {
          chatSuffix = '\n\nNEW SPEECH ADDRESSED TO YOU:\n' + cfg.pendingChat.join('\n') + '\nRespond to its meaning; do not repeat or quote the message.';
          cfg.pendingChat = [];
          world.setBrainConfig(g.id, cfg);
        }
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.content += '\n\n' + commandReminder + chatSuffix;
        } else {
          messages.push({ role: 'user', content: commandReminder + chatSuffix });
        }
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
      console.log('[' + g.id + '] Full prompt messages:', JSON.stringify(messages, null, 2));
      const line = await manager.decide({
        agentId: g.id,
        messages,
        useGrammar: !chatTestMode,
        allowedCommands: world.getAllowedCommands(),
        enableThinking: !!el('enableThinking')?.checked,
        temperature: cfg.chaos > 70 ? 0.8 : (cfg.chaos > 40 ? 0.5 : 0.3),
       onToken: (text) => {
         if (window.showStreamingBubble && g) {
           window.showStreamingBubble(g, text);
         }
       },
      });
      if (window.clearStreamingBubble && g) {
        window.clearStreamingBubble(g);
      }
      const cmd = world.parseLLMCommandLine(line) || { kind: 'look' };
      // Persist chat messages to history so they're remembered in future turns
      if (chatSuffix) {
        const chatLines = chatSuffix.trim().split('\n').filter(l => l.trim() && !l.startsWith('NEW SPEECH') && !l.startsWith('Respond to its meaning'));
        for (const cl of chatLines) {
          cfg.messages = (cfg.messages || []).concat([{ role: 'user', content: cl }]);
        }
      }
      // A new human utterance should not be drowned by old action chatter.
      // Keep it as the latest conversational event after generation as well.
      if(chatSuffix && cfg.messages?.length>12) cfg.messages=cfg.messages.slice(-12);
      // Add agent's action as assistant message
      cfg.messages = (cfg.messages || []).concat([{ role: 'assistant', content: line || 'look()' }]);
      cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
      world.setBrainConfig(g.id, cfg);
      appendLog(`${g.id} brain -> ${line || 'look()'}`);
      await world.stepAgentTurn(g.id, cmd, 'llm');
      // After turn resolves, add system result as user message
      const resultDesc = world.state?.globalHistory?.slice(-1)?.[0] || 'turn resolved';
      const summary = formatActionSummary(resultDesc);
      cfg.messages = cfg.messages.concat([{ role: 'user', content: summary }]);
      // Keep only last 20 messages
      if (cfg.messages.length > 20) cfg.messages = cfg.messages.slice(-20);
      world.setBrainConfig(g.id, cfg);
      // Add this agent's action and result to ALL OTHER agents' message histories
      const actionMsg = `${g.id} ${formatActionSummary(g.id + ' ' + (line || 'look()'))}`;
      const resultMsg = summary;
      for (const other of world.getAgents()) {
        if (other.id === g.id) continue;
        const ocfg = world.getBrainConfig(other.id);
        ocfg.messages = (ocfg.messages || []).concat([
          { role: 'user', content: actionMsg },
          { role: 'user', content: resultMsg },
        ]);
        if (ocfg.messages.length > 20) ocfg.messages = ocfg.messages.slice(-20);
        world.setBrainConfig(other.id, ocfg);
      }
      return true;
    } catch (err) {
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
      for (const g of agents) {
        if (!running) break;
        if (!world.isTurnReady()) { await sleep(150); continue; }
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
    setStatus(manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready' : 'local brain not loaded');
  });

  el('stopBrains')?.addEventListener('click', () => {
    running = false;
    el('startBrains').disabled = !manager.isLoaded();
    el('stepBrains').disabled = !manager.isLoaded();
    el('stopBrains').disabled = true;
    setStatus(manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready; agents stopped' : 'local brain not loaded');
    appendLog('agent brains stopped');
  });

  el('spawnCharacter')?.addEventListener('click', () => world.spawnCharacter());
  el('spawnCrate')?.addEventListener('click', () => world.spawnProp('crate'));
  el('spawnBarrel')?.addEventListener('click', () => world.spawnProp('barrel'));
  el('spawnWall')?.addEventListener('click', () => world.spawnProp('wall'));

  function sendChatToAgent() {
    const input = el('chatInput');
    const name = el('chatName')?.value || 'God';
    const text = input?.value?.trim();
    if (!text) return;
    const g = world.getSelectedAgent?.();
    if (!g) { appendLog('no agent selected'); return; }
    const cfg = world.getBrainConfig(g.id);
    // Store chat separately so it can be appended at the end of the next prompt (after perception)
    cfg.pendingChat = (cfg.pendingChat || []).concat([`${name} says: ${text}`]);
    if (cfg.pendingChat.length > 5) cfg.pendingChat = cfg.pendingChat.slice(-5);
    world.setBrainConfig(g.id, cfg);
    appendLog(name + ' -> ' + g.id + ': ' + text);
    input.value = '';
    // Auto-step the agent so it responds immediately
    const stepBtn = el('stepBrains');
    if (stepBtn && !stepBtn.disabled) stepBtn.click();
  }
  el('chatSend')?.addEventListener('click', sendChatToAgent);
  el('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatToAgent(); });
}

main().catch(err => {
  setStatus('integration error: ' + err.message);
  console.error(err);
});
