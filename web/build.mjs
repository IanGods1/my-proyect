// Genera la versión web lista para publicar en ./dist (o ./dist-test con --test).
import { build, transform } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const test = process.argv.includes('--test');
const out = test ? 'dist-test' : 'dist';
const buildId = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: { app: 'src/main.js' },
  outdir: out,
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020', 'safari14', 'chrome90'],
  define: { __TEST__: String(test) },
  legalComments: 'none',
  logLevel: 'info',
});

const css = await transform(readFileSync('src/styles.css', 'utf8'), { loader: 'css', minify: true });
writeFileSync(`${out}/app.css`, css.code);

cpSync('index.html', `${out}/index.html`);
cpSync('manifest.webmanifest', `${out}/manifest.webmanifest`);
cpSync('icons', `${out}/icons`, { recursive: true });
writeFileSync(`${out}/sw.js`, readFileSync('sw.js', 'utf8').replace('__BUILD__', buildId));
// GitHub Pages: sin procesamiento Jekyll
writeFileSync(`${out}/.nojekyll`, '');
console.log(`Versión web generada en ${out}/ (${test ? 'pruebas' : 'producción'})`);
