import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import path from 'path';
const steps = JSON.parse(process.argv[2] || '[]'); const out = process.argv[3] || 'shot';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
await pg.goto('file://' + path.resolve(process.env.PAGE || 'dist/index.html') + '#test'); await pg.waitForTimeout(+(process.env.BOOT || 1500));
let n = 0;
for (const s of steps) {
  if (s.eval) { const r = await pg.evaluate(s.eval); if (r !== undefined) console.log('eval>', JSON.stringify(r)); }
  if (s.wait) await pg.waitForTimeout(s.wait);
  if (s.key) await pg.keyboard.press(s.key);
  if (s.shot) { await pg.screenshot({ path: `/tmp/${out}-${s.shot}.png`, timeout: 120000 }); n++; }
}
if (!n) await pg.screenshot({ path: `/tmp/${out}.png` });
console.log(errs.slice(0, 12).join('\n') || 'no console errors'); await b.close();
