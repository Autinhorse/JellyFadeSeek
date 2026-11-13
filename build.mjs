import { build } from 'esbuild'; import fs from 'fs';
const targets = { game: ['src/main.js', 'src/index.html', 'dist/index.html'], slice: ['src/slice/main.js', 'src/slice/index.html', 'dist/slice/index.html'] };
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['game']) {
  const [entry, tpl, out] = targets[name];
  const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
  const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(out, fs.readFileSync(tpl, 'utf8').replace('/*__JS__*/', () => js)); console.log('built', name, (js.length / 1024).toFixed(0) + ' KB');
}
