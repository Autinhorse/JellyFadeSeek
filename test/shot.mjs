// 无头浏览器截图。路径用环境变量配置：
//   PW      playwright 或 playwright-core 的入口（index.mjs），默认找项目里装的 playwright-core
//   CHROME  浏览器路径，默认 Windows 上的 Chrome
//   OUTDIR  截图目录，默认系统临时目录
//   PAGE    页面，默认 dist/index.html；W/H 视口大小；BOOT 加载后等待毫秒数；SOFT=1 用软件渲染（没有显卡的环境）
// 用法：node test/shot.mjs '[{"eval":"__t.start(\"hider\")"},{"wait":500},{"shot":"a"}]' 名字前缀
import path from 'path'; import os from 'os'; import { pathToFileURL } from 'url';
const pw = await import(process.env.PW ? pathToFileURL(process.env.PW).href : 'playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const steps = JSON.parse(process.argv[2] || '[]'); const out = process.argv[3] || 'shot', dir = process.env.OUTDIR || os.tmpdir();
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.env.SOFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] : ['--ignore-gpu-blocklist', '--enable-gpu'];
const b = await chromium.launch({ executablePath: exe, args });
const pg = await b.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
await pg.goto(pathToFileURL(path.resolve(process.env.PAGE || 'dist/index.html')).href + '#test'); await pg.waitForTimeout(+(process.env.BOOT || 1500));
let n = 0;
for (const s of steps) {
  if (s.eval) { const r = await pg.evaluate(s.eval); if (r !== undefined) console.log('eval>', JSON.stringify(r)); }
  if (s.wait) await pg.waitForTimeout(s.wait);
  if (s.key) await pg.keyboard.press(s.key);
  if (s.click) await pg.click(s.click);
  if (s.shot) { const f = path.join(dir, `${out}-${s.shot}.png`); await pg.screenshot({ path: f, timeout: 120000 }); console.log('shot', f); n++; }
}
if (!n) { const f = path.join(dir, `${out}.png`); await pg.screenshot({ path: f }); console.log('shot', f); }
console.log(errs.slice(0, 12).join('\n') || 'no console errors'); await b.close();
