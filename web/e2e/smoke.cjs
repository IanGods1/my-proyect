// Prueba completa en un navegador real (Chromium), con la "nube" simulada.
// Uso:  cd web && npm run build:test && NODE_PATH=$(npm root -g) node e2e/smoke.cjs [carpeta-de-capturas]
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.join(__dirname, '..', 'dist-test');
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const file = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  });
});

let step = 0;
const log = (m) => console.log(`  ✓ ${m}`);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${String(++step).padStart(2, '0')}-${name}.png`) });
  const text = (t, opts) => page.getByText(t, opts);
  const btn = (name, opts) => page.getByRole('button', { name, ...opts });
  const toastGone = () => page.waitForTimeout(150);

  /** Crea un grupo con el formulario. */
  async function createGroup({ kind, brand, models, note, name }) {
    await page.goto(url + '#/admin');
    await btn('Nuevo grupo de compatibilidad').click();
    await page.locator('.dialog').getByRole('button', { name: kind, exact: true }).click();
    if (brand) await page.getByPlaceholder('Automática (según el nombre)').fill(brand);
    await page.getByPlaceholder('ej. A54').fill(models);
    await page.getByRole('button', { name: 'Agregar modelo' }).click();
    if (note) await page.getByPlaceholder('ej. La cámara del 15 queda un poco justa').fill(note);
    if (name) await page.locator('label:has-text("Nombre del grupo") input').fill(name);
    await btn('Guardar grupo').click();
    await text('Grupo guardado').last().waitFor();
  }

  console.log('Primer uso');
  await page.goto(url);
  await text('Bienvenido a Guastaccesorio').waitFor();
  await shot('primer-uso');
  await btn('Crear contraseñas').click();
  await text('Administrador: La contraseña debe tener al menos 6 caracteres').waitFor();
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('admin-secreta');
  await pw.nth(1).fill('admin-secreta');
  await pw.nth(2).fill('admin-secreta');
  await pw.nth(3).fill('admin-secreta');
  await btn('Crear contraseñas').click();
  await text('Las dos contraseñas deben ser distintas').waitFor();
  await pw.nth(2).fill('trabajo-123');
  await pw.nth(3).fill('trabajo-123');
  await btn('Crear contraseñas').click();
  await text('Compatibilidad de cases y vidrios').waitFor();
  await btn('Administrar datos').waitFor();
  log('contraseñas creadas y el administrador queda dentro con sus botones');

  console.log('Administrador: cargar datos');
  await createGroup({ kind: 'Case', brand: 'Samsung', models: 'A54, A55, A34', note: 'La cámara del A55 queda justa' });
  await createGroup({ kind: 'Vidrio normal', brand: 'Samsung', models: 'A54, A34' });
  await createGroup({ kind: 'Vidrio 9D', brand: 'Samsung', models: 'A54, A55, A15' });
  await createGroup({ kind: 'Vidrio privacy', brand: 'Samsung', models: 'A54, A15' });
  await createGroup({ kind: 'Case', brand: '', models: 'iPhone 13, iPhone 14, iPhone 15', note: '' , name: 'Case grupo iPhone 13/14/15'});
  const data = await page.evaluate(() => window.__app.store.data);
  const models = Object.values(data.models);
  assert.equal(models.length, 7);
  assert.deepEqual(models.filter((m) => m.brand === 'Samsung').map((m) => m.name).sort(), ['A15', 'A34', 'A54', 'A55']);
  assert.deepEqual(models.filter((m) => m.brand === 'Apple').length, 3);
  assert.deepEqual(Object.values(data.groups).map((g) => g.variant).sort(), ['D9', 'NORMAL', 'NORMAL', 'NORMAL', 'PRIVACY']);
  log('modelos con la marca elegida (Samsung) y 3 clases de vidrio');
  await page.goto(url + '#/admin');
  await shot('administrar-datos');
  await page.goto(url + '#/group/new?type=GLASS&variant=D9');
  await page.getByPlaceholder('Automática (según el nombre)').fill('Samsung');
  await page.getByPlaceholder('ej. A54').fill('a5');
  await shot('formulario-vidrio-9d');

  console.log('Buscar');
  await page.goto(url);
  await page.getByPlaceholder('Buscar modelo').fill('ip13');
  await text('iPhone 13', { exact: true }).waitFor();
  assert.equal(await page.getByText('iPhone 15', { exact: true }).count(), 0);
  await page.getByPlaceholder('Buscar modelo').fill('A54');
  await shot('buscar');
  await page.getByRole('button', { name: /A54/ }).first().click();
  await text('El mismo case le queda a:').waitFor();
  await text('A55', { exact: true }).waitFor();
  await text('Nota: La cámara del A55 queda justa').waitFor();
  await shot('resultado-case');
  await page.getByRole('tab', { name: /Vidrio templado/ }).click();
  await btn(/^Normal/).waitFor();
  await btn(/^9D/).waitFor();
  await btn(/^Privacy/).waitFor();
  await text('2 modelos').first().waitFor();
  await shot('resultado-vidrio-normal');
  await btn(/^9D/).click();
  await text('A15', { exact: true }).waitFor();
  await text('A55', { exact: true }).waitFor();
  await shot('resultado-vidrio-9d');
  await btn(/^Privacy/).click();
  await text('A15', { exact: true }).waitFor();
  assert.equal(await page.getByText('A55', { exact: true }).count(), 0);
  log('las tres clases de vidrio muestran modelos distintos');
  // bidireccional: desde A55 aparece A54
  await page.goto(url + '#/models');
  await text('Samsung (4)').waitFor();
  await shot('lista-modelos');

  console.log('Configuración del administrador');
  await page.goto(url + '#/settings');
  await text('Conectado a Firebase').waitFor();
  await shot('configuracion');
  await btn('Cambiar contraseña de trabajador').click();
  const dpw = page.locator('.dialog input[type=password]');
  await dpw.nth(0).fill('abc');
  await dpw.nth(1).fill('abc');
  await btn('Continuar', { exact: true }).click();
  await text('La contraseña debe tener al menos 6 caracteres').waitFor();
  await dpw.nth(0).fill('trabajo-123');
  await dpw.nth(1).fill('trabajo-123');
  await btn('Continuar', { exact: true }).click();
  await text('Se cerrará la sesión en todos los teléfonos de trabajadores. ¿Continuar?').waitFor();
  await shot('confirmar-cambio-contrasena');
  await page.locator('.dialog').getByRole('button', { name: 'Cancelar' }).click();
  log('cambio de contraseña pide confirmación');

  console.log('Importar y exportar');
  await page.goto(url + '#/admin');
  const csv = 'tipo,grupo,modelo,nota,marca,variante\nVidrio templado,Vidrio 9D Moto,G84,,Motorola,9D\nVidrio templado,Vidrio 9D Moto,G54,,Motorola,9D\nAlgo,X,Y,,,\n';
  await page.locator('input[type=file]').setInputFiles({ name: 'datos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await text('Se encontraron 2 filas válidas: 1 grupos y 2 modelos.').waitFor();
  await text('1 filas con errores se omitirán:').waitFor();
  await shot('importar');
  await btn('Agregar a los datos actuales').click();
  await text('Importación completa: 1 grupos nuevos, 2 modelos nuevos, 2 compatibilidades agregadas').waitFor();
  await text('Vidrio templado · 9D').first().waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await btn('Exportar', { exact: true }).click(); await btn('CSV').click(); })()]);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  assert.match(exported, /^﻿tipo,grupo,modelo,nota,marca,variante/);
  assert.match(exported, /Vidrio templado,Vidrio 9D Moto,G54,,Motorola,9D/);
  log('importar con variante y exportar respaldo');

  console.log('Trabajador');
  await page.goto(url + '#/settings');
  await btn('Cerrar sesión').first().click();
  await page.locator('.dialog').getByRole('button', { name: 'Cerrar sesión' }).click();
  await btn('Entrar').waitFor();
  await shot('ingreso');
  await page.locator('input[type=password]').fill('mala-clave');
  await btn('Entrar').click();
  await text('Contraseña incorrecta', { exact: true }).waitFor();
  await page.locator('input[type=password]').fill('trabajo-123');
  await btn('Entrar').click();
  await text('Compatibilidad de cases y vidrios').waitFor();
  assert.equal(await btn('Administrar datos').count(), 0);
  assert.equal(await btn('Configuración').count(), 0);
  await shot('inicio-trabajador');
  await page.getByPlaceholder('Buscar modelo').fill('a54');
  await page.getByRole('button', { name: /A54/ }).first().click();
  await page.getByRole('tab', { name: /Vidrio templado/ }).click();
  await btn(/^9D/).click();
  await text('A55', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Editar grupo' }).count(), 0);
  await shot('resultado-trabajador');
  for (const route of ['#/admin', '#/settings', '#/group/new', '#/admin/models']) {
    await page.goto(url + route);
    await page.reload();
    await text('Compatibilidad de cases y vidrios').waitFor();
  }
  log('el trabajador no ve ni puede abrir las pantallas de administración');

  // Sesión permanente: reabrir la app no pide contraseña
  await page.goto(url);
  await page.reload();
  await text('Compatibilidad de cases y vidrios').waitFor();
  assert.equal(await btn('Entrar').count(), 0);
  assert.equal(await page.getByText('Cerrar sesión').count(), 0);
  log('sesión permanente del trabajador, sin botón de cerrar sesión');

  // El administrador cambia la contraseña desde otro teléfono: la sesión del trabajador se cierra
  await page.evaluate(async () => {
    const a = window.__app;
    const salt = a.newSalt();
    await a.backend.changeWorkerPassword(await a.derive('nueva-clave', salt, 60000), salt, 60000);
  });
  await text('La contraseña cambió. Pide la nueva al administrador').waitFor();
  await shot('contrasena-cambio');
  await page.reload();
  await text('La contraseña cambió. Pide la nueva al administrador').waitFor();
  await page.locator('input[type=password]').fill('trabajo-123');
  await btn('Entrar').click();
  await text('Contraseña incorrecta', { exact: true }).waitFor();
  await page.locator('input[type=password]').fill('nueva-clave');
  await btn('Entrar').click();
  await text('Compatibilidad de cases y vidrios').waitFor();
  log('al cambiar la contraseña se cierra la sesión del trabajador y la nueva funciona');

  console.log('Bloqueo por intentos');
  await page.evaluate(() => window.__app.auth.role && localStorage.setItem('gc_role', ''));
  await page.evaluate(async () => { await window.__app.backend.signOut(); localStorage.removeItem('gc_role'); });
  await page.reload();
  for (let i = 0; i < 5; i++) {
    await page.locator('input[type=password]').fill('mala' + i);
    await btn('Entrar').click();
    await page.waitForTimeout(80);
  }
  await text(/Bloqueado: intenta de nuevo en \d+ segundos/).waitFor();
  assert.equal(await btn('Entrar').isDisabled(), true);
  await shot('bloqueado');
  log('5 intentos fallidos bloquean el ingreso');

  console.log('Modo oscuro');
  await page.evaluate(() => localStorage.setItem('gc_theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await shot('oscuro-ingreso');

  assert.deepEqual(errors, [], `errores en la consola:\n${errors.join('\n')}`);
  log('sin errores en la consola');
  await browser.close();
  server.close();
  console.log('\nTODO BIEN');
})().catch(async (e) => {
  console.error('\nFALLÓ:', e.message);
  server.close();
  process.exit(1);
});
