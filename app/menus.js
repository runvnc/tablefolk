/* menus.js -- the game's JRPG-style menus, on @tablefolk/menus (libs/menus:
 * the matching and the menu box); this file wires them into the game.
 *
 * A menu (in a scenario: a character's "menu", or the scenario's "menus" by
 * id; or from code):
 *   { id: 'smith', title: 'Brakka', text: 'What do you need?',
 *     items: [ { id: 'buy',  label: 'Buy a sword (30 gold)', say: 'I would like to buy a sword.' },
 *              { id: 'ask',  label: 'Ask about the wolves', keywords: ['wolf', 'wolves'] },
 *              { id: 'more', label: 'Something else…', menu: 'smith-more' },
 *              { id: 'hit',  label: 'Attack!', do: '/attack brakka' },
 *              { id: 'bye',  label: 'Leave' } ],
 *     other: true }
 *   item.say    what the player says to the character when it is picked
 *               (default: the label, unless the item has do or menu)
 *   item.do     a player command instead (/attack, /wield, /cast...: combat.js, skills.js)
 *   item.menu   open another menu (an id, or a menu object) after it
 *   item.keywords  words that pick it outright when typed or said
 *   item.id 'bye' / 'leave' / 'close' with nothing else: just closes
 *   menu.other  true: words that fit no choice go to the character as
 *               ordinary chat (and the menu closes); false (default): the
 *               menu says it did not understand and stays open
 *
 * Scripted choices (no model needed; story.js has the flags and conditions):
 *   item.if        shown only when it holds: "world.cat_found", "player has
 *                  lost cat", "player.gold >= 10", "not world.paid", "... and ..."
 *   item.take      the player hands the character this item (shown only when
 *                  the player carries it)
 *   item.set       world flags: { "cat_found": true, "favours": "+1" }
 *   item.reply     what the character says back (a scripted line)
 *   item.act       command lines the character runs: "give(rusty key)",
 *                  "sell(\"bread\", 3)", "walk(well)", "emote(dance)" (a string or a list)
 *   item.workflow  starts one of the scenario's workflows on the character
 *                  (story.js, @tablefolk/script), run until it waits (also "start");
 *                  item.give: the character hands the player an item; item.stop: ends its workflow
 *   With reply/act/set/take/workflow the choice is scripted: the player's
 *   line (item.say) is shown but the model is not asked; without them it is
 *   sent to the character as before. Order: take, set, say, reply, act,
 *   workflow, then the next menu. Texts take {{player}}, {{me}},
 *   {{world.flag}}, {{player.gold}}.
 *   A character's "menu" can be a list, the first that holds is used:
 *   [ { "if": "world.cat_found", "menu": "pell-grateful" }, { "menu": "pell" } ]
 *
 * Matching (libs/menus match()): a number, the label or a keyword, shared
 * words, meaning (EmbeddingGemma, embed.js) when its best choice is clear,
 * then the characters' model asked to pick a number (greedy) when loaded.
 *
 *   window.tablefolkMenu = {
 *     open(menu, { agentId })  show it (a menu object or a scenario menu id);
 *                              resolves { item, how, text } when one is chosen,
 *                              { other: true, text } for words that fit none, null when closed
 *     close(), active          the open menu (or null)
 *     match(menu, text)        -> { item, by, score } | { none: true, by }
 *     pick(question, options, { context }) -> { index, by } | null: the
 *                              characters' model chooses one (index -1: none)
 *     offer(text)              the chat box's words while a menu is open:
 *                              true when the menu took them (world-integration.js)
 *   }
 * Each choice also fires 'tablefolk-menu' on window: { menu, item, agentId, how, text }.
 */
import { match as libMatch, modelChooser, createMenuBox } from '../libs/menus/index.js';

const $ = id => document.getElementById(id);
const log = (...a) => console.info('[menu]', ...a);

// a scenario's menus by id; a list: the first whose "if" holds; choices whose
// "if" fails (or that take what the player lacks) are left out
// (@tablefolk/script pickMenu / visibleMenu through story.js)
const scnMenus = () => window.tablefolkScenario?.active?.scn?.menus || {};
const S = () => window.tablefolkStory;
function resolve(menu, me = null) {
  if (!S()) return typeof menu === 'string' ? (scnMenus()[menu] && { id: menu, ...scnMenus()[menu] }) : menu;
  return S().visibleMenu(S().pickMenu(menu, me), me);
}
const scripted = i => i.reply != null || i.act != null || i.set != null || i.take != null || i.workflow != null || i.start != null || i.give != null || i.stop != null;

// the characters' model, when it is loaded
const brainReady = () => /ready/i.test($('brainStatus')?.textContent || '') && !!window.tablefolkLLM && window.tablefolkBrainInfo?.()?.engine !== 'none';
const modelPick = modelChooser(async (messages, { maxTokens, temperature }) => {
  const r = await window.tablefolkLLM.chat.completions.create({ messages, max_tokens: maxTokens, temperature, agentId: 'menu' });
  return r?.choices?.[0]?.message?.content || '';
}, { log });
const pick = (question, options, opts) => brainReady() ? modelPick(question, options, opts) : Promise.resolve(null);
// EmbeddingGemma (embed.js), when it is loaded
const embed = (q, texts) => window.tablefolkEmbed?.state === 'ready' ? window.tablefolkEmbed.similar(q, texts) : null;
const matchOptions = () => ({ embed, choose: pick });

// talk to the menu's character, or run a player command, as the chat box does
let bypass = false;
function sendLine(line) {
  const input = $('chatInput'), send = $('chatSend'); if (!input || !send) return;
  input.value = line; bypass = true;
  try { send.click(); } finally { bypass = false; }
}
const fire = detail => { try { window.dispatchEvent(new CustomEvent('tablefolk-menu', { detail })); } catch {} };

const box = createMenuBox({
  styles: true, log, matchOptions,
  onOpen: (menu) => window.tablefolkDiag?.note?.('menu', `opened ${menu.id || menu.title || 'a menu'} (${menu.items.length} choices)`),
  onChoose(item, { menu, how, text, agentId, flow }) {
    fire({ menu, item, agentId, how, text });
    window.tablefolkDiag?.note?.('menu', `${menu.id || 'menu'}: ${item.id} (${how}${text ? ': "' + String(text).slice(0, 60) + '"' : ''})`);
    // a workflow's menu step: the workflow does the choice's actions and branches
    if (flow) return;
    perform(item, agentId).catch(e => console.warn('[menu] choice failed', e));
  },
  onOther(text, menu, { agentId, flow }) {
    fire({ menu, item: null, agentId, how: 'other', text });
    if (!flow) sendLine((agentId ? '@' + agentId + ' ' : '') + text);
  },
});

// what a choice does (the order is in the header; @tablefolk/script perform)
async function perform(item, agentId) {
  const leaving = /^(bye|leave|close|exit|goodbye)$/i.test(item.id) && !item.say && !item.do && !item.menu && !scripted(item);
  if (item.do && typeof item.do === 'string') sendLine(String(item.do));
  else if (scripted(item) && S()) {
    const r = await S().perform(item, agentId);
    if (r?.ok === false && r.missing) { window.tablefolkToast?.(`you don't have ${r.missing}`, { type: 'error' }); return; }
    if (r?.started && agentId) await window.tablefolkWorkflows?.drive(agentId);
  }
  else if (!leaving && (item.say || !item.menu)) sendLine((agentId ? '@' + agentId + ' ' : '') + (item.say || item.label));
  if (item.menu) setTimeout(() => open(item.menu, { agentId }), 50);
}

// opts.flow: a workflow's menu step (story.js): the workflow does the rest.
// Otherwise a menu on a character in the middle of a workflow pauses it: the
// menu's words are not heard by it, and it goes on after the menu closes.
function open(menuIn, opts = {}) {
  const menu = resolve(menuIn, opts.agentId || null);
  if (!menu || !menu.items?.length) { console.warn('[menu] no such menu (or no choice shows)', menuIn); return Promise.resolve(null); }
  const agentId = opts.agentId || menu.agentId || null, WF = window.tablefolkWorkflows;
  // a workflow's menu: words that fit no choice go back to it (its "other" step, or it asks again)
  const shown = box.open(opts.flow ? { ...menu, other: true } : menu, { agentId, title: agentId || '', flow: !!opts.flow });
  if (opts.flow || !agentId || !WF?.active(agentId)) return shown;
  WF.pause(agentId);
  const W = window.tablefolk, heard = (W.getBrainConfig(agentId).pendingChat || []).length;
  return shown.then(async r => {
    // the choice's actions start first (onChoose), then what the menu said is dropped
    await new Promise(res => setTimeout(res, 50));
    const cfg = W.getBrainConfig(agentId); if (cfg.pendingChat?.length > heard) W.setBrainConfig(agentId, { pendingChat: cfg.pendingChat.slice(0, heard) });
    WF.resume(agentId);
    return r;
  });
}

window.tablefolkMenu = {
  open, close: () => box.close(), pick,
  match: (menu, text) => libMatch(resolve(menu), text, { log, ...matchOptions() }),
  resolve, perform,
  offer: text => bypass ? Promise.resolve(false) : box.offer(text),
  get active() { return box.active; },
};
