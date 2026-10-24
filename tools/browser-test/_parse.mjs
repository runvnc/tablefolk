import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
await page.goto('http://localhost:8000/app/?art=1&play=1'); await page.waitForTimeout(9000);
console.log(JSON.stringify(await page.evaluate(() => ['carry(note)', 'carry("the note")', 'walk()', 'walk(note)', 'dig(wall)', 'build(wall, north)', 'touch(chest)', 'throw(barrel)', 'eat(pie)'].map(l => [l, tablefolk.parseLLMCommandLine(l)]))));
await page.close(); await b.close();
