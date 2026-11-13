// Plays scenarios/willow-lane.json (a world with no language model) through
// its menus, flags, inventory checks and the riddle workflow, in the test
// Chrome (port 9223). The page must already show the world:
//   node eval.mjs "(location.href='http://localhost:8001/willow-lane',1)"; then
//   node willow-lane-test.mjs        prints ok/FAIL lines; exits 1 on a failure
// EmbeddingGemma must be on (localStorage tablefolkEmbed not 'off') for the
// "meaning" check.
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => /willow-lane|scenario=/.test(p.url())) || b.contexts()[0].pages()[0];
const out = await page.evaluate(async () => {
  const res = [], ok = (name, cond, extra = '') => res.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  const W = window.tablefolk, M = window.tablefolkMenu, S = window.tablefolkStory;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const settle = async () => { await sleep(300); for (let i = 0; i < 100 && !W.isTurnReady?.(); i++) await sleep(100); await sleep(200); };
  const agent = id => W.getAgents().find(a => a.id === id);
  // stand next to a character (give/sell want the player in earshot)
  const near = id => { const a = agent(id), p = W.state.playerAvatar; if (!a || !p) return; p.root.position.x = a.root.position.x; p.root.position.z = a.root.position.z + 1.2; if (p.logicalPos) { p.logicalPos.x = p.root.position.x; p.logicalPos.z = p.root.position.z; } };
  const said = id => (W.state.globalHistory || []).filter(l => l.includes(id + ':')).slice(-1)[0] || '';
  const items = () => (W.state.player.items || []).filter(i => (i.qty ?? 1) > 0).map(i => i.name);
  const menuOf = id => W.getBrainConfig(id).menu;
  const talk = async (id, words) => { near(id); W.selectCharacter?.(agent(id)); M.open(menuOf(id), { agentId: id }); await sleep(100); const shown = [...document.querySelectorAll('#menuBox [data-menu-item]')].map(b => b.textContent.replace(/^\d+/, '')); if (words != null) { await M.offer(words); await settle(); } return shown; };
  document.querySelectorAll('dialog[open]').forEach(d => d.close());

  ok('no model', window.tablefolkBrainInfo?.().key === 'none' && /scripted world\) ready/.test(document.getElementById('brainStatus')?.textContent || ''));
  ok('flags start', S.get('cat_found') === false && S.get('riddle_solved') === false);

  // Pell, before: no "here she is" (the player has no cat)
  let shown = await talk('pell', null);
  ok('pell: cat choice hidden without the cat', !shown.some(t => /found Whiskers/.test(t)), shown.join(' | '));
  const m1 = await M.match(M.resolve(menuOf('pell'), 'pell'), 'I could try to track her down for you');
  ok('pell: words by meaning', m1.item?.id === 'help', `${m1.item?.id} by ${m1.by} ${m1.score ?? ''}`);
  await M.offer('I will search for her'); await settle();
  ok('pell: scripted reply', /sheds and warm places/.test(said('pell')), said('pell'));

  // Hobb, before: pie refused
  await talk('hobb', 'can I get some pie');
  ok('hobb refuses a stranger', /Not to strangers/.test(said('hobb')), said('hobb'));

  // Bert sells the cat; the next menu opens by itself
  await talk('bert', 'seen a cat around?');
  ok('bert: reply', /Five gold/.test(said('bert')), said('bert'));
  await sleep(200);
  shown = [...document.querySelectorAll('#menuBox [data-menu-item]')].map(b => b.textContent.replace(/^\d+/, ''));
  ok('bert: next menu, paying offered (gold >= 5)', shown.some(t => /Pay 5 gold/.test(t)) && !shown.some(t => /don't have/.test(t)), shown.join(' | '));
  await M.offer('I will pay the 5 gold'); await settle();
  ok('bert sells the cat', items().includes('lost cat') && W.state.player.gold === 5, `items ${items()}, gold ${W.state.player.gold}`);

  // Pell, after: the cat is handed over, a flag set, a reward given
  shown = await talk('pell', null);
  ok('pell: cat choice shown with the cat', shown.some(t => /found Whiskers/.test(t)), shown.join(' | '));
  const close = await M.match(M.resolve(menuOf('pell'), 'pell'), 'I have something for you');
  ok('pell: close call is "unsure" (no model to decide)', close.none && (close.unsure?.length > 1 || close.by === 'no match'), `${close.by} ${(close.unsure || []).map(i => i.id)}`);
  await M.offer('I found your cat'); await settle();
  ok('cat handed over', !items().includes('lost cat') && (W.getBrainConfig('pell').inventory.items || []).some(i => i.name === 'lost cat'), `items ${items()}`);
  ok('flag set', S.get('cat_found') === true);
  ok('reward given', items().includes('silver locket'), `items ${items()}`);
  ok('pell: menu changes with the flag', /purring/.test(M.resolve(menuOf('pell'), 'pell')?.text || ''));
  const card = (window.tablefolkMind.cardLines?.(agent('hobb')) || []).join(' ');
  ok('hobb knows (a fact for the model)', /found Mrs\. Pell's lost cat/.test(card), card.slice(0, 160));

  // Hobb, after: friendly, gives a pie
  shown = await talk('hobb', 'a pie please');
  ok('hobb friendly menu', shown.some(t => /Could I have a pie/.test(t)), shown.join(' | '));
  ok('hobb gives the pie', items().includes('blackberry pie'), `items ${items()}`);
  ok('pie choice gone once given (hobb lacks it)', !(M.resolve(menuOf('hobb'), 'hobb').items.some(i => i.id === 'pie')));

  // the riddle workflow: answers typed in the chat box
  await talk('hobb', 'ask me a riddle');
  ok('workflow starts: riddle asked', /spout, a lid/.test(said('hobb')) && window.tablefolkWorkflows.active('hobb'), said('hobb'));
  const chat = async t => { document.getElementById('chatInput').value = t; document.getElementById('chatSend').click(); await settle(); await sleep(400); };
  await chat('a teapot');
  ok('workflow: wrong answer', /Think again/.test(said('hobb')), said('hobb'));
  await chat('is it a kettle?');
  ok('workflow: right answer sets a world flag', S.get('riddle_solved') === true && /Clever/.test(said('hobb')) && !window.tablefolkWorkflows.active('hobb'), said('hobb'));
  await talk('hobb', 'another riddle');
  ok('workflow: checks the flag next time', /solved my riddle already/.test(said('hobb')), said('hobb'));
  ok('conditions', S.check('player has silver locket and world.cat_found') && S.check('player lacks lost cat') && S.check('not world.nope or player.gold == 5') && !S.check('player.gold > 5'));
  return res;
});
console.log(out.join('\n'));
await b.close().catch(() => {});
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
