// node shot.mjs <out.png> [query] [WxH]  — screenshot the harness canvas (clean, frozen time)
import { chromium } from 'playwright';
const [out, query = 't=0', size = '1200x775'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => m.type() === 'error' && errs.push(m.text()));
await page.goto(`http://127.0.0.1:5160/shaders/harness/index.html?clean&${query}`);
await page.waitForFunction(() => window.__frames > 3);
const err = await page.$eval('#err', e => e.style.display === 'block' ? e.textContent : '');
if (err) { console.error(err); process.exit(1); }
await page.locator('#c').screenshot({ path: out });
if (errs.length) console.error(errs.join('\n'));
await browser.close();
