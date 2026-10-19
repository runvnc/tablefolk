// node itchdl.mjs <itch page url> <file name substring> <out path>
// Free ("name your own price") itch.io download through the test Chrome.
import { chromium } from 'playwright-core';
const [url, pat, out] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0], page = await ctx.newPage();
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('a.buy_btn, .download_btn, a:has-text("Download Now"), a:has-text("Download")', { timeout: 15000 });
  const skip = page.locator('a.direct_download_btn, a:has-text("No thanks, just take me to the downloads")');
  await skip.first().click({ timeout: 15000 });
  await page.waitForSelector('.upload', { timeout: 20000 });
  const row = page.locator('.upload', { hasText: pat }).first();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), row.locator('a.download_btn').click()]);
  await dl.saveAs(out);
  console.log('saved', out, dl.suggestedFilename());
} finally { await page.close(); }
