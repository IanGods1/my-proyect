/* Guarda la app en el teléfono para que abra sin internet.
   Si cambia algún archivo de la app, suba el número de VERSION. */
const VERSION = 'san-vicenta-v21';
const ARCHIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/escaner.js',
  './js/facturas.js',
  './lib/anthropic.js',
  './lib/firebase.js',
  './lib/zxing.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/tienda.png',
  './icons/tienda-mascara.png',
  './fonts/share-tech-mono.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = pedir siempre los archivos nuevos a internet (GitHub Pages deja copias de hasta
  // 10 minutos en la memoria del teléfono; sin esto, una versión nueva podía quedarse con archivos viejos)
  const pedidos = ARCHIVOS.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(pedidos)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Firebase y otros servidores: pasan directo (no se guardan aquí)
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(e.request).then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
