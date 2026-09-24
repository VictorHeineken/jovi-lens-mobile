const CACHE = 'jovi-lens-v5';
const CORE = [
  '/',
  '/camera',
  '/gallery',
  '/notes',
  '/history',
  '/copilot',
  '/profile',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/demo-assets/demo-default-photo.jpg',
  '/demo-assets/demo-resultado-encontrado.jpg',
  '/demo-assets/demo-buscando-texto.jpg',
  '/demo-assets/history-factory.jpg',
  '/demo-assets/history-workers.jpg',
  '/demo-assets/history-railway.jpg',
  '/demo-assets/history-spinning-jenny.jpg',
  '/demo-assets/history-child-labor.jpg',
  '/demo-assets/history-crystal-palace.jpg',
  '/demo-assets/programming-code.jpg',
  '/demo-assets/programming-javascript.jpg',
  '/demo-assets/programming-frontend.jpg',
  '/demo-assets/books-library.jpg',
  '/demo-assets/books-open.jpg',
  '/demo-assets/books-shelves.jpg',
  '/demo-assets/arts-palette.jpg',
  '/demo-assets/biology-cells.jpg',
  '/demo-assets/camera-vintage.jpg',
  '/demo-assets/camera-collection.jpg',
  '/demo-assets/chemistry-beakers.jpg',
  '/demo-assets/geography-globe.jpg',
  '/demo-assets/photography-film.jpg',
  '/demo-assets/math-blackboard.jpg',
  '/demo-assets/physics-pendulum.jpg',
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {})));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))));
});
