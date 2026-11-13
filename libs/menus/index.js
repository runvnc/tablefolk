// @tablefolk/menus -- JRPG-style menus: a list of choices a player clicks,
// presses a number for, types, or says. This module is the matching (no DOM);
// box.js is the menu box on screen.
//
// A menu:
//   { id: 'smith', title: 'Brakka', text: 'What do you need?',
//     items: [ { id: 'buy', label: 'Buy a sword (30 gold)', say: 'I would like to buy a sword.' },
//              { id: 'ask', label: 'Ask about the wolves', keywords: ['wolf', 'wolves'] },
//              { id: 'bye', label: 'Leave' } ],
//     other: true }          // words that fit no choice are passed on (else "not understood")
// Items may carry any other fields (the Tablefolk game uses say, do, menu).
//
// Words are matched to a choice in steps, cheapest first: a number ("2",
// "two", "the second one", "the last"), the label or a keyword, shared words,
// then meaning (an embedding model, when given and its best choice is clear),
// then a language model asked to pick a number. Every step can answer "none".
//
//   import { match, normalizeMenu, modelChooser } from '@tablefolk/menus';
//   await match(menu, 'can you fix my blade', {
//     embed: async (query, texts) => texts.map(t => cosine(...)),     // optional
//     choose: modelChooser(async (messages, opts) => text),           // optional: any chat model
//   })  -> { item, by: 'number'|'label'|'keyword'|'words'|'meaning'|'model', score } | { none: true, by }
//          (none with unsure: [items]: meaning found a few close choices and nothing decided between them)

export const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an the to of and or i im me my you your we us it is are be do can could would will want like please some about for with on in at this that these those what whats one just get got let lets go ok okay yes no have need'.split(' '));
// content words, roughly stemmed ("repaired", "repairs", "repairing" -> "repair")
const stem = w => w.length > 5 && /(ing|ed)$/.test(w) ? w.replace(/(ing|ed)$/, '') : w.length > 3 ? w.replace(/ies$/, 'y').replace(/(es|s)$/, '') : w;
export const words = s => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)).map(stem);
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, last: -1 };
// embedding cosine (calibrated on EmbeddingGemma, a query against "label. say"):
// the best must reach EMBED_MIN and lead the next by EMBED_GAP, else the model decides
export const EMBED_MIN = 0.74, EMBED_GAP = 0.06;   // unrelated choices score 0.6-0.7 (2026-11-12: right picks 0.76-0.91)

// a usable copy: items with ids and labels, at most 24
export function normalizeMenu(menu) {
  if (!menu || !Array.isArray(menu.items) || !menu.items.length) return null;
  return { ...menu, items: menu.items.filter(i => i && (i.label || i.say)).slice(0, 24).map((i, n) => ({ ...i, id: String(i.id || 'item' + (n + 1)), label: String(i.label || i.say) })) };
}
export const itemText = i => [i.label, i.say].filter(Boolean).join('. ');

export async function match(menuIn, text, { embed = null, choose = null, embedMin = EMBED_MIN, embedGap = EMBED_GAP, log = null } = {}) {
  const menu = normalizeMenu(menuIn); if (!menu) return { none: true, by: 'no menu' };
  const items = menu.items, t = norm(text);
  if (!t) return { none: true, by: 'empty' };
  // a number: "2", "number 2", "option two", "the second one", "the last"
  const num = t.match(/^(?:(?:number|option|choice|the)\s+)?(\d+|[a-z]+)(?:\s+(?:one|option|choice|please))?$/);
  if (num) {
    let n = /^\d+$/.test(num[1]) ? +num[1] : NUM[num[1]];
    if (n === -1) n = items.length;
    if (n >= 1 && n <= items.length) return { item: items[n - 1], by: 'number', score: 1 };
  }
  // the label itself, or one of its keywords
  for (const i of items) if (norm(i.label) === t || norm(i.say) === t) return { item: i, by: 'label', score: 1 };
  const kw = items.filter(i => (i.keywords || []).some(k => new RegExp('\\b' + norm(k).replace(/ /g, '\\s+') + '\\b').test(t)));
  if (kw.length === 1) return { item: kw[0], by: 'keyword', score: 1 };
  // shared words: most of a choice's words said, and more than any other choice
  const tw = new Set(words(t));
  const overlap = items.map(i => { const iw = [...new Set(words(i.label))]; return iw.length ? iw.filter(w => tw.has(w)).length / iw.length : 0; });
  const best = Math.max(...overlap), at = overlap.indexOf(best);
  if (best >= 0.6 && overlap.filter(v => v === best).length === 1) return { item: items[at], by: 'words', score: best };
  // meaning: an embedding model, when its pick is clear
  let unsure = null;
  if (embed) {
    try {
      const texts = items.map(itemText), r = await embed(text, texts);
      if (r) {
        const sims = r instanceof Map ? texts.map(x => r.get(x) ?? 0) : [...r];
        const scored = sims.map((s, n) => [s, n]).sort((a, b) => b[0] - a[0]);
        const [s1, n1] = scored[0], s2 = scored[1]?.[0] ?? 0;
        log?.('meaning', text, scored.map(([s, n]) => items[n].id + ' ' + s.toFixed(2)).join(', '));
        if (s1 >= embedMin && s1 - s2 >= embedGap) return { item: items[n1], by: 'meaning', score: +s1.toFixed(3) };
        // close between the best few: the model decides, or (without one) the player is asked
        if (s1 >= embedMin) unsure = scored.filter(([s]) => s >= embedMin && s1 - s < embedGap).slice(0, 3).map(([, n]) => items[n]);
      }
    } catch (e) { log?.('embedding failed', e); }
  }
  // a language model picks a number
  if (choose) {
    const p = await choose(menu.text || menu.title || 'Which choice?', items.map(i => i.label), { context: 'The player said: "' + String(text).slice(0, 300) + '"' });
    if (p && p.index >= 0) return { item: items[p.index], by: p.by || 'model', score: p.confidence ?? null };
    return { none: true, by: p ? p.by || 'model' : 'no match', ...(unsure && !p ? { unsure } : {}) };
  }
  return unsure ? { none: true, by: 'unsure', unsure } : { none: true, by: 'no match' };
}

// A chooser from any chat model: generate(messages, { maxTokens, temperature })
// resolves the reply's text. It asks for one number, greedily.
//   choose(question, options, { context, none = true }) -> { index (-1: none), by } | null on failure
export function modelChooser(generate, { log = null } = {}) {
  return async function choose(question, options, { context = '', none = true } = {}) {
    if (!options?.length) return null;
    const list = options.map((o, n) => `${n + 1}. ${o}`).join('\n') + (none ? '\n0. None of these' : '');
    const prompt = `${context ? context + '\n\n' : ''}${question}\nChoices:\n${list}\n\nWhich choice is meant? Answer with the number only.`;
    try {
      const out = String(await generate([
        { role: 'system', content: 'You match what a player said to one choice of a game menu. Answer with one number and nothing else.' },
        { role: 'user', content: prompt }], { maxTokens: 6, temperature: 0 }) || '');
      log?.('model', JSON.stringify(out));
      const m = out.match(/\d+/);
      if (!m) return { index: -1, by: 'model (no number)' };
      const n = +m[0];
      return { index: n >= 1 && n <= options.length ? n - 1 : -1, by: 'model' };
    } catch (e) { log?.('model failed', e); return null; }
  };
}

export { createMenuBox, injectMenuStyles } from './box.js';
