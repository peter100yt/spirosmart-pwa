// Service worker do Registro FC: funcionamento offline.
// IMPORTANTE: ao publicar uma nova versão, altere VERSION para que os usuários recebam a atualização.
const VERSION = 'registro-fc-v4';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/backup.js',
  'js/calc.js',
  'js/charts.js',
  'js/dashboard.js',
  'js/db.js',
  'js/forms.js',
  'js/growth-data.js',
  'js/growth.js',
  'js/pages.js',
  'js/patient.js',
  'js/report.js',
  'js/router.js',
  'js/schema.js',
  'js/ui.js',
  'js/xlsx-export.js',
  'js/xlsx-import.js',
  'vendor/preact-htm.module.js',
  'vendor/chart.umd.min.js',
  'vendor/exceljs.min.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('registro-fc-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
