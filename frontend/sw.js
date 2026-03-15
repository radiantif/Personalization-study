const CACHE = 'studyflow-v2';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/login.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('onrender.com') || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.status === 200) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});