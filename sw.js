// Çevrimdışı çalışma. Uygulama dosyaları önbellekten, her şey ağdan.
//
// api.anthropic.com'a giden istekler bilerek hiç dokunulmadan geçiyor:
// okuma isteği her zaman canlı olmalı, önbelleğe alınmamalı.

const ONBELLEK = 'fason-kesim-2026-09-21-a';

const DOSYALAR = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/ocr.js',
  './js/foto.js',
  './js/xlsx.js',
  './js/olcu.js',
  './js/parse.js',
  './js/yerlesim.js',
  './js/depo.js',
  './assets/icon.svg',
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches.open(ONBELLEK)
      // Tek bir dosya eksikse kurulumun tamamı düşmesin.
      .then((o) => Promise.allSettled(DOSYALAR.map((d) => o.add(d))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== ONBELLEK).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;

  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;   // API ve dış kaynaklar doğrudan ağa

  olay.respondWith((async () => {
    // Önce ağ: yeni sürüm yayınlandığında hemen gelsin.
    try {
      const yanit = await fetch(istek);
      if (yanit && yanit.ok) {
        const o = await caches.open(ONBELLEK);
        o.put(istek, yanit.clone());
      }
      return yanit;
    } catch {
      const bellekten = await caches.match(istek);
      if (bellekten) return bellekten;
      if (istek.mode === 'navigate') {
        const ana = await caches.match('./index.html');
        if (ana) return ana;
      }
      return new Response('Çevrimdışısın ve bu dosya önbellekte yok.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
