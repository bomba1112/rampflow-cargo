// Build: bundle src/ui/app.js and inline JS + CSS into one dist/index.html.
// `node build.mjs --single` makes the preview variant: no manifest link, nothing else to host.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';

const single = process.argv.includes('--single');
const out = single ? 'dist-single' : 'dist';
mkdirSync(out, { recursive: true });

const res = await build({
  entryPoints: ['src/ui/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'safari14'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '');
let html = readFileSync('src/index.template.html', 'utf8');
html = html
  .replace('<!--MANIFEST-->', single ? '' : '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/icon-192.png">')
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => js);
writeFileSync(`${out}/index.html`, html);
if (!single) {
  cpSync('public', out, { recursive: true });
  // PDF reader for opening a LIR file on the phone (loaded only when a file is opened; the legacy build runs on older phones)
  mkdirSync(`${out}/vendor`, { recursive: true });
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) cpSync(`node_modules/pdfjs-dist/legacy/build/${f}`, `${out}/vendor/${f}`);
  writeFileSync(`${out}/.nojekyll`, '');
}
console.log(`${out}/index.html  ${(html.length / 1024).toFixed(1)} KB`);
