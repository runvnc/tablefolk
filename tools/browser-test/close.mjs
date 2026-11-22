// Close the test Chrome (frees GPU/RAM for the user's own tab). Waits (up to
// 15 s) until its debugging port is closed: Browser.close returns before the
// process has gone, and a Chrome launched on the same profile right after it
// was handed to the dying one (a test then found no page or no app: 2026-11-22).
import { chromium } from 'playwright-core';
const port = process.env.CDP_PORT || 9223;
const up = () => fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
try { const b = await chromium.connectOverCDP('http://127.0.0.1:' + port); const s = await b.newBrowserCDPSession(); await s.send('Browser.close'); console.log('test Chrome closed'); }
catch (e) { console.log('test Chrome not running'); }
for (let i = 0; i < 30 && await up(); i++) await new Promise(r => setTimeout(r, 500));
await new Promise(r => setTimeout(r, 1000));   // the profile's lock goes with the last process
process.exit(0);
