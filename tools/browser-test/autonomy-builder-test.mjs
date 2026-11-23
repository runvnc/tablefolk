// The world builder's "How much do characters decide for themselves?" (autonomy):
// the Story tab's five choices and a character's own select write the scenario's
// "autonomy", keep per-decision keys written in the JSON, and travel in the link.
// Needs the test Chrome and a server.
//   node autonomy-builder-test.mjs [base]          (default http://localhost:8000)
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8000';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
try {
  await page.goto(base + '/world/?t=' + Date.now());
  await page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); delete s.autonomy; window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
  await page.waitForTimeout(800);
  const S = () => page.evaluate(() => window.tfBuilder.scenario);
  const radios = await page.$$eval('input[name=scnAutonomy]', l => l.map(i => [i.value, i.checked, i.closest('label').innerText.replace(/\s+/g, ' ').trim()]));
  ok(radios.length === 5, 'five choices on the Story tab: ' + radios.map(r => r[0] || 'auto').join(', '));
  ok(radios[0][1] && /Auto \(recommended\)/.test(radios[0][2]), 'Auto is chosen for a world without "autonomy"');
  ok(radios.every(r => r[2].length > 30), 'each choice has its line');
  ok(await page.evaluate(() => /How much do characters decide for themselves/.test(document.querySelector('.autopick')?.innerText || '')), 'the question is asked in plain words');
  await page.click('input[name=scnAutonomy][value=free]'); await page.waitForTimeout(200);
  ok((await S()).autonomy === 'free', 'choosing Free writes "autonomy": "free"');
  ok(await page.$eval('input[name=scnAutonomy][value=free]', i => i.checked), 'Free stays checked after the redraw');
  await page.click('input[name=scnAutonomy][value=""]'); await page.waitForTimeout(200);
  ok(!('autonomy' in await S()), 'choosing Auto removes it');
  // the object form keeps its per-decision keys
  await page.evaluate(() => { const s = window.tfBuilder.scenario; s.autonomy = { preset: 'free', needs: 'code' }; window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
  await page.waitForTimeout(500);
  ok(await page.$eval('input[name=scnAutonomy][value=free]', i => i.checked), 'an object form shows its preset');
  ok(await page.evaluate(() => /needs by the game/.test(document.querySelector('.autopick')?.innerText || '')), 'and says what else the JSON sets');
  await page.click('input[name=scnAutonomy][value=guided]'); await page.waitForTimeout(200);
  ok(JSON.stringify((await S()).autonomy) === JSON.stringify({ preset: 'guided', needs: 'code' }), 'choosing Guided keeps "needs": "code"');
  // a character's own
  await page.click('[data-tab=characters]'); await page.waitForTimeout(200);
  const sel = await page.$('select[data-path="agents.0.autonomy"]');
  ok(!!sel, 'each character has "decides for itself"');
  if (sel) { await sel.selectOption('rails'); await page.waitForTimeout(200); }
  ok((await S()).agents[0].autonomy === 'rails', 'a character set to on rails writes its "autonomy"');
  // through the link: the play link carries it (decode #s=)
  const scn = await page.evaluate(async () => {
    const s = window.tfBuilder.scenario, cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(JSON.stringify(s))); w.close();
    const buf = await new Response(cs.readable).arrayBuffer(), ds = new DecompressionStream('deflate-raw'), w2 = ds.writable.getWriter();
    w2.write(new Uint8Array(buf)); w2.close();
    return JSON.parse(await new Response(ds.readable).text());
  });
  ok(JSON.stringify(scn.autonomy) === JSON.stringify({ preset: 'guided', needs: 'code' }) && scn.agents[0].autonomy === 'rails', 'kept in the encoded world');
  // the raw JSON tab shows it
  await page.click('[data-tab=raw]'); await page.waitForTimeout(200);
  ok(/"autonomy"/.test(await page.evaluate(() => JSON.stringify(window.tfBuilder.scenario))), 'in the JSON');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally { await page.close().catch(() => {}); }
console.log(fails.length ? `${fails.length} failed` : 'all passed'); process.exit(fails.length ? 1 : 0);
