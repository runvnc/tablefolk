// Close the test Chrome (frees GPU/RAM for the user's own tab).
import { chromium } from 'playwright-core';
try { const b = await chromium.connectOverCDP('http://127.0.0.1:9223'); const s = await b.newBrowserCDPSession(); await s.send('Browser.close'); console.log('test Chrome closed'); }
catch (e) { console.log('test Chrome not running'); }
