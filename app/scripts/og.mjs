// Renders public/og.png (1200x630). Run: npm run og -w app  (or `npm run og` in app/)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const icon = readFileSync(new URL('public/icons/icon.svg', root));
const iconUri = `data:image/svg+xml;base64,${icon.toString('base64')}`;
const lines = [['1', '#E4002B', '#fff'], ['2', '#0072CE', '#fff'], ['3', '#00965E', '#fff'], ['7', '#F2A900', '#000'], ['9', '#7A3E9D', '#fff'], ['91', '#4A5560', '#fff'], ['92', '#A05A2C', '#fff']];
const badges = lines.map(([n, bg, fg]) => `<span style="background:${bg};color:${fg}">${n}</span>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:linear-gradient(135deg,#0b5cad,#0a4a8c);font-family:system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;color:#fff;display:flex;align-items:center;padding:0 90px;gap:60px}
img{width:300px;height:300px;border-radius:66px;flex:none;box-shadow:0 20px 50px rgba(0,0,0,.35)}
h1{font-size:90px;white-space:nowrap;margin:0 0 18px;line-height:1.05;font-weight:800}
p{font-size:38px;margin:0 0 42px;opacity:.92;line-height:1.3}
.b{display:flex;gap:14px}.b span{min-width:78px;height:78px;padding:0 14px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;border:4px solid #fff}
</style><img src="${iconUri}"><div><h1>Říčany zdarma</h1><p>Spojení jen bezplatnými autobusy MHD Říčany</p><div class="b">${badges}</div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: fileURLToPath(new URL('public/og.png', root)) });
await browser.close();
