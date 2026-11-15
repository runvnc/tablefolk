// pictures in the 3D game: four walls and standing, with a test image
import { chromium } from 'playwright-core';
const out = process.argv[2] || '.';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('http://localhost:8000/world/?t=' + Date.now());
const code = await page.evaluate(async () => {
  const s = await (await fetch('/scenarios/goblin-bakery.json')).json();
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#c33'); g.addColorStop(1, '#33c'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); c.fillStyle = '#fd3'; c.beginPath(); c.arc(64, 50, 30, 0, 7); c.fill(); c.fillStyle='#fff'; c.fillRect(10,100,40,20);
  const img = cv.toDataURL('image/jpeg', .8);
  s.objects = [...(s.objects || []).filter(o => !(o.x === 1 && o.z === -4) && !(o.x === -1 && o.z === -4)),
    { type: 'picture', style: 'painting', x: 1, z: -4, image: img },
    { type: 'picture', style: 'tapestry', x: -1, z: -4, image: img, title: 'Grub' },
    { type: 'picture', style: 'sign', x: -5, z: -1, image: img, title: 'The Goblin Loaf' },
    { type: 'picture', style: 'painting', x: 5, z: -1, image: img },
    { type: 'picture', style: 'sign', x: 3, z: 3, title: 'Fresh Bread', image: img },
    { type: 'note', x: -3, z: -4, wall: 'north', text: 'WANTED: the pie thief', image: img },
  ];
  s.showIntro = false;
  return window.tfBuilder.encode(s);
});
await page.goto('http://localhost:8000/app/?art=1&play=1#s=' + code);
await page.waitForFunction(() => window.TABLEFOLK_SCENE_READY, null, { timeout: 40000 });
await page.waitForTimeout(4000);
const u = await page.evaluate(() => document.getElementById('renderCanvas').toDataURL('image/jpeg', .85)); (await import('node:fs')).writeFileSync(out + '/pic3d.jpg', Buffer.from(u.split(',')[1], 'base64'));
const objs = await page.evaluate(() => window.tablefolk?.getObjects?.().filter(o => o.type === 'picture').map(o => ({ x: o.x, z: o.z, wall: o.wall, style: o.style, img: !!o.image })));
console.log(JSON.stringify(objs));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
if (!process.env.KEEP) await page.close();
process.exit(0);
