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

// a scenario's menus by id
const scnMenus = () => window.tablefolkScenario?.active?.scn?.menus || {};
const resolve = menu => typeof menu === 'string' ? (scnMenus()[menu] && { id: menu, ...scnMenus()[menu] }) : menu;

// the characters' model, when it is loaded
const brainReady = () => /ready/i.test($('brainStatus')?.textContent || '') && !!window.tablefolkLLM;
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
  onChoose(item, { menu, how, text, agentId }) {
    fire({ menu, item, agentId, how, text });
    window.tablefolkDiag?.note?.('menu', `${menu.id || 'menu'}: ${item.id} (${how}${text ? ': "' + String(text).slice(0, 60) + '"' : ''})`);
    const leaving = /^(bye|leave|close|exit|goodbye)$/i.test(item.id) && !item.say && !item.do && !item.menu;
    if (item.do) sendLine(String(item.do));
    else if (!leaving && (item.say || !item.menu)) sendLine((agentId ? '@' + agentId + ' ' : '') + (item.say || item.label));
    if (item.menu) setTimeout(() => open(item.menu, { agentId }), 50);
  },
  onOther(text, menu, { agentId }) {
    fire({ menu, item: null, agentId, how: 'other', text });
    sendLine((agentId ? '@' + agentId + ' ' : '') + text);
  },
});

function open(menuIn, opts = {}) {
  const menu = resolve(menuIn);
  if (!menu) { console.warn('[menu] no such menu', menuIn); return Promise.resolve(null); }
  const agentId = opts.agentId || menu.agentId || null;
  return box.open(menu, { agentId, title: agentId || '' });
}

window.tablefolkMenu = {
  open, close: () => box.close(), pick,
  match: (menu, text) => libMatch(resolve(menu), text, { log, ...matchOptions() }),
  offer: text => bypass ? Promise.resolve(false) : box.offer(text),
  get active() { return box.active; },
};
