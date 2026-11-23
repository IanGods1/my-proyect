/* Descarga todas las fotos de un álbum compartido de Google Fotos y arma el catálogo.
   Uso: node actualizar-catalogo.js <link-del-album> <carpeta-del-catalogo>
   Borra las fotos viejas y deja solo las del álbum nuevo. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const enlace = process.argv[2];
const carpeta = process.argv[3] || 'catalogo-lentes';
if (!/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(enlace || '')) {
  console.error('El link debe ser de Google Fotos (photos.app.goo.gl o photos.google.com).');
  process.exit(1);
}
const RX_FOTO = /^https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+/;

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1400, height: 1000 } });
  const vistas = [];                       // fotos que la página va pidiendo al bajar
  pagina.on('request', (r) => {
    const m = r.url().match(RX_FOTO);
    if (m && !vistas.includes(m[0])) vistas.push(m[0]);
  });
  await pagina.goto(enlace, { waitUntil: 'networkidle', timeout: 90000 });
  const html = await pagina.content();

  // 1) Las primeras fotos vienen en orden dentro de la página
  let titulo = 'Catálogo';
  const ordenadas = [];
  const i = html.indexOf("AF_initDataCallback({key: 'ds:1'");
  if (i >= 0) {
    const a = html.indexOf('data:', i) + 5;
    const b = html.indexOf(', sideChannel:', a);
    try {
      const datos = JSON.parse(html.slice(a, b));
      for (const it of datos[1] || []) {
        const u = it && it[1] && it[1][0];
        if (u && RX_FOTO.test(u)) ordenadas.push(u.match(RX_FOTO)[0]);
      }
      if (datos[3] && typeof datos[3][1] === 'string') titulo = datos[3][1];
    } catch (e) { console.warn('No se pudo leer la lista inicial:', e.message); }
  }

  // 2) Bajar hasta el final para que cargue el resto
  await pagina.mouse.move(700, 600);
  let quieto = 0, antes = -1;
  for (let k = 0; k < 3000 && quieto < 15; k++) {
    await pagina.mouse.wheel(0, 600);
    await pagina.waitForTimeout(250);
    if (vistas.length === antes) quieto++; else { quieto = 0; antes = vistas.length; }
  }
  await navegador.close();

  const fotos = [...ordenadas];
  for (const u of vistas) if (!fotos.includes(u)) fotos.push(u);
  // la portada del álbum aparece una vez más; ya está quitada porque no se repiten
  if (!fotos.length) { console.error('No se encontraron fotos. ¿El álbum está compartido con link?'); process.exit(1); }
  console.log(`Álbum "${titulo}": ${fotos.length} fotos`);

  // 3) Borrar fotos viejas y descargar las nuevas
  const dirFotos = path.join(carpeta, 'fotos');
  fs.rmSync(dirFotos, { recursive: true, force: true });
  fs.mkdirSync(dirFotos, { recursive: true });
  const lista = [];
  let sig = 0;
  async function trabajador() {
    while (sig < fotos.length) {
      const n = ++sig;
      const nombre = String(n).padStart(3, '0') + '.jpg';
      for (let intento = 1; ; intento++) {
        try {
          const r = await fetch(fotos[n - 1] + '=w800-h800-l75');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          fs.writeFileSync(path.join(dirFotos, nombre), Buffer.from(await r.arrayBuffer()));
          break;
        } catch (e) {
          if (intento >= 4) throw new Error(`Foto ${n}: ${e.message}`);
          await new Promise((ok) => setTimeout(ok, 1000 * intento));
        }
      }
      lista[n - 1] = { n, archivo: 'fotos/' + nombre };
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabajador));

  const catalogo = {
    id: Date.now().toString(36),
    titulo,
    origen: enlace,
    actualizado: new Date().toISOString(),
    fotos: lista,
  };
  fs.writeFileSync(path.join(carpeta, 'catalogo.json'), JSON.stringify(catalogo, null, 1));
  console.log('Listo:', lista.length, 'fotos guardadas en', dirFotos);
})().catch((e) => { console.error(e); process.exit(1); });
