// Ad-hoc LLM access for the browser DevTools console: llm(prompt) and
// genmap(prompt). Deliberately independent of the per-agent brain manager in
// world-integration.js (that one tracks whatever model the UI has loaded for
// the characters) - these console helpers always default to Gemma 4 E2B so
// switching a character's brain model never changes what a console call does.
import { createAgentBrainManager } from './agent-brain.js?v=20261019a';

const DEFAULT_MODEL = 'gemma4-e2b-litert';

// Same glyph vocabulary buildVisiblePerception() uses in app.js, so a
// generated map reads like the real vision ASCII map.
const MAP_LEGEND = {
  '.': 'bare ground', ',': 'grass', ':': 'dirt/path', '~': 'water', '^': 'stone',
  '#': 'wall', 'D': 'door', '=': 'bridge', 'C': 'crate', 'B': 'barrel', 'M': 'mushroom', 'L': 'lamp',
  '*': 'crystal/magic', 'H': 'house/building', 'r': 'rock', 'x': 'rubble', 'f': 'fence',
  'h': 'chest', 'w': 'workbench', 't': 'table', 'n': 'bench', 's': 'stool', 'o': 'cauldron',
  'a': 'anvil', 'W': 'weapon stand', '/': 'axe', 'p': 'pickaxe', 'u': 'bucket', 'b': 'bag',
  'P': 'potion', 'S': 'scroll', '$': 'coins', 'g': 'character (character)', '@': 'player character',
};

// getMainManager: optional () => AgentBrainManager, the manager the main UI
// already auto-loads for the characters' own brains. If it happens to already be
// sitting on DEFAULT_MODEL and loaded, reuse it instead of paying to load a
// redundant second copy of the same multi-GB weights.
export function installDevConsole(getMainManager) {
  let manager = null;
  let loadingPromise = null;

  function getManager(modelKey) {
    const key = modelKey || DEFAULT_MODEL;
    if (!modelKey) {
      // Reuse whatever the game has loaded (E2B or E4B): the LiteRT worker holds
      // one engine, so loading a different default here would swap it out.
      const main = getMainManager?.();
      if (main && main.isLoaded()) return main;
    }
    if (!manager || manager.getModelKey() !== key) {
      manager = createAgentBrainManager({
        modelKey: key,
        onStatus: s => console.log('[llm]', typeof s === 'string' ? s : (s.text || JSON.stringify(s))),
        onDebug: () => {},
      });
    }
    return manager;
  }

  async function ensureLoaded(modelKey) {
    const mgr = getManager(modelKey);
    if (mgr.isLoaded()) return mgr;
    if (!loadingPromise) {
      console.log(`[llm] loading ${mgr.getModelKey()}... (first call - may download a model file)`);
      loadingPromise = mgr.load().finally(() => { loadingPromise = null; });
    }
    await loadingPromise;
    return mgr;
  }

  // Model output with thinking on looks like "<thinking>...</thinking>answer".
  // Split it so callers get just the answer, with the reasoning available
  // separately for inspection instead of polluting the grid/text output.
  function splitThinking(text) {
    const s = String(text ?? '');
    const m = s.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
    if (!m) return { thinking: '', answer: s };
    return { thinking: m[1].trim(), answer: (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim() };
  }

  // llm("your prompt") -> logs and returns the model's reply as a string.
  // Options: { system, model, maxTokens, temperature, raw, thinking }
  // thinking:true lets the model reason in <thinking> tags before answering -
  // slower, but can help on tasks it otherwise botches (off by default, same
  // as the main UI's "thinking mode" checkbox).
  async function llm(prompt, opts = {}) {
    const mgr = await ensureLoaded(opts.model);
    const messages = [
      { role: 'system', content: opts.system || 'You are a helpful assistant embedded in a 3D game console. Reply in plain text, no markdown code fences unless asked for code.' },
      { role: 'user', content: String(prompt ?? '') },
    ];
    const out = await mgr.decide({
      agentId: 'console',
      messages,
      maxTokens: opts.maxTokens ?? (opts.thinking ? 1024 : 512),
      temperature: opts.temperature ?? 0,
      enableThinking: opts.thinking ?? false,
      raw: opts.raw ?? false,
    });
    const { thinking, answer } = splitThinking(out);
    if (opts.thinking && thinking) console.log('%c[llm thinking]\n' + thinking, 'color:#888');
    if (!opts.silent) console.log(answer);
    return answer;
  }

  function legendFor(chars) {
    return chars.map(c => `${c}=${MAP_LEGEND[c] || 'object'}`).join(', ');
  }
  // Plain object names, no glyphs - for the word-only planning stage, which
  // has no business thinking in ASCII symbols yet.
  function namesFor(chars) {
    return [...new Set(chars.map(c => MAP_LEGEND[c] || 'object'))].join(', ');
  }

  // Two-shot examples baked into the system prompt so the model has a
  // concrete pattern to imitate instead of guessing at the task cold - these
  // are fixed at 8x8 purely to illustrate the mapping/format; the instruction
  // line still states the real requested size.
  const MAP_EXAMPLES = [
    {
      prompt: 'a small dungeon room with a chest and a torch',
      grid: ['########', '#::::::#', '#:h::L:#', '#::::::#', '#::::x:#', '#::::::#', '#::::::#', '###D####'],
    },
    {
      prompt: 'an outdoor clearing with a pond, a mushroom, a rock, and a fence',
      grid: [',,,,,,,,', ',,~~,,,,', ',,~~,,M,', ',,,,,,,,', ',,r,,,,,', ',,,,,,f,', ',,,,,,f,', ',,,,,,,,'],
    },
  ];
  function exampleBlock() {
    return MAP_EXAMPLES
      .map(ex => `Example - prompt: "${ex.prompt}"\n${ex.grid.join('\n')}`)
      .join('\n\n');
  }

  // genmap("a small village square with a well and market stalls") -> logs and
  // returns a fixed-size ASCII grid, in the same glyph vocabulary as the live
  // character vision map. Options: { rows, cols, size (sets both), chars, model, plan }
  // plan:true (default) does a first text-only pass planning the layout in
  // words before drawing the grid - a poor-man's chain-of-thought that a 2B
  // model handles more reliably than reasoning inline while also drawing.
  async function genmap(prompt, opts = {}) {
    const rows = opts.rows ?? opts.size ?? 16;
    const cols = opts.cols ?? opts.size ?? 32;
    const chars = opts.chars || Object.keys(MAP_LEGEND);
    const usePlan = opts.plan ?? true;
    let plan = '';
    if (usePlan) {
      const planSystem = [
        'You are planning a small top-down game map before drawing it as ASCII.',
        `The map will be ${rows} rows tall and ${cols} columns wide.`,
        `The only tiles/objects available to place are: ${namesFor(chars)}.`,
        'Only use objects from that list - do not invent object types that are not in it.',
        'First write 1-2 short sentences of scene-setting exposition, like a text adventure\'s room description, purely to help you decide what would plausibly be here (do not mention rows, columns, or ASCII).',
        'Then write a short structured plan (4-6 short lines, no ASCII grid): the floor/ground type, any walls or boundary and roughly where, and each notable object (from the available list) with an approximate position (e.g. "top-left", "center", "along the right wall").',
      ].join('\n');
      plan = await llm(prompt, { ...opts, system: planSystem, maxTokens: opts.planMaxTokens ?? 260, raw: true, silent: true });
      console.log('%c[genmap plan]\n' + plan, 'color:#7fd4c1');
    }
    const system = [
      'You generate ASCII top-down maps for a small 3D game called tablefolk.world.',
      `Output ONLY the grid: exactly ${rows} lines, each exactly ${cols} characters wide, padding with '.' if needed.`,
      'No row/column numbers, no legend, no commentary, no markdown code fences - just the raw grid.',
      `Use only these characters: ${chars.join('')}`,
      `Legend: ${legendFor(chars)}`,
      "'.' is bare empty ground. Keep most of the map '.', ',' or ':' and scatter a handful of objects that match the scene described.",
      '',
      "The examples below are illustrative only - they are 8x8, but your actual output must be the requested size and use only the requested prompt's scene.",
      exampleBlock(),
      plan ? `\nFollow this plan when drawing the grid:\n${plan}` : '',
    ].join('\n');
    const text = await llm(prompt, {
      ...opts,
      system,
      maxTokens: opts.maxTokens ?? (rows * (cols + 4) + 64 + (opts.thinking ? 512 : 0)),
      raw: true,
      silent: true,
    });
    const grid = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0).slice(0, rows);
    const rendered = grid.join('\n');
    console.log(rendered);
    const used = [...new Set(grid.join(''))];
    console.log('legend:', legendFor(used));
    return rendered;
  }

  window.llm = llm;
  window.genmap = genmap;
  window.tablefolkLLM = {
    setModel: key => { getManager(key); },
    getModel: () => manager?.getModelKey() || DEFAULT_MODEL,
    isLoaded: () => !!manager?.isLoaded(),
  };
  console.log(`[character] dev console ready — llm(prompt), genmap(prompt, {rows, cols}) — default model: ${DEFAULT_MODEL}`);
}
