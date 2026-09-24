// The seeded sample photos and notes carry web-style `src` paths
// (`/demo-assets/<name>.jpg`), which the web app resolves against Vite's public
// folder. React Native has no origin to resolve them against, so
// `<Image source={{ uri: '/demo-assets/x.jpg' }} />` silently fails and every
// sample tile renders as a fallback — the first thing a user sees on a fresh
// install.
//
// Metro resolves `require()` of an image at build time, so these files are
// bundled and work with no network (Demo Mode's whole point). They are
// downscaled copies of web/public/demo-assets (kept smaller than the web
// originals); attribution for all of them is in web/public/demo-assets/SOURCES.md.
//
// Object.create(null) rather than a bare literal: this is a string-keyed lookup
// whose keys come from stored record data, so a prototype-less object keeps a
// src of 'constructor' or '__proto__' from resolving to an Object.prototype
// member and defeating the fallback below.
const DEMO_IMAGES = Object.assign(Object.create(null), {
  '/demo-assets/books-library.jpg': require('../assets/demo/books-library.jpg'),
  '/demo-assets/books-open.jpg': require('../assets/demo/books-open.jpg'),
  '/demo-assets/books-shelves.jpg': require('../assets/demo/books-shelves.jpg'),
  '/demo-assets/arts-palette.jpg': require('../assets/demo/arts-palette.jpg'),
  '/demo-assets/biology-cells.jpg': require('../assets/demo/biology-cells.jpg'),
  '/demo-assets/camera-collection.jpg': require('../assets/demo/camera-collection.jpg'),
  '/demo-assets/camera-vintage.jpg': require('../assets/demo/camera-vintage.jpg'),
  '/demo-assets/chemistry-beakers.jpg': require('../assets/demo/chemistry-beakers.jpg'),
  '/demo-assets/demo-buscando-texto.jpg': require('../assets/demo/demo-buscando-texto.jpg'),
  '/demo-assets/demo-default-photo.jpg': require('../assets/demo/demo-default-photo.jpg'),
  '/demo-assets/demo-resultado-encontrado.jpg': require('../assets/demo/demo-resultado-encontrado.jpg'),
  '/demo-assets/geography-globe.jpg': require('../assets/demo/geography-globe.jpg'),
  '/demo-assets/history-factory.jpg': require('../assets/demo/history-factory.jpg'),
  '/demo-assets/history-railway.jpg': require('../assets/demo/history-railway.jpg'),
  '/demo-assets/history-spinning-jenny.jpg': require('../assets/demo/history-spinning-jenny.jpg'),
  '/demo-assets/history-child-labor.jpg': require('../assets/demo/history-child-labor.jpg'),
  '/demo-assets/history-crystal-palace.jpg': require('../assets/demo/history-crystal-palace.jpg'),
  '/demo-assets/history-workers.jpg': require('../assets/demo/history-workers.jpg'),
  '/demo-assets/math-blackboard.jpg': require('../assets/demo/math-blackboard.jpg'),
  '/demo-assets/photography-film.jpg': require('../assets/demo/photography-film.jpg'),
  '/demo-assets/physics-pendulum.jpg': require('../assets/demo/physics-pendulum.jpg'),
  '/demo-assets/programming-code.jpg': require('../assets/demo/programming-code.jpg'),
  '/demo-assets/programming-frontend.jpg': require('../assets/demo/programming-frontend.jpg'),
  '/demo-assets/programming-javascript.jpg': require('../assets/demo/programming-javascript.jpg'),
});

// Returns whatever `<Image source>` needs for this src: the bundled module for a
// seeded demo path, or a `{ uri }` object for everything else (file:// paths
// written by services/storage.js, data: URIs from a fresh capture, and remote
// http(s) URLs such as external thumbnails).
export function imageSource(src) {
  if (!src) return undefined;
  return DEMO_IMAGES[src] ?? { uri: src };
}

// The bundled module behind a seeded /demo-assets path, or null for anything
// else. Rendering an <Image> only needs imageSource() above, but reading the
// bytes (the AI pipeline resizes and base64-encodes the file) needs the module
// so expo-asset can materialize it to a real local URI — a /demo-assets string
// names no file on any filesystem. See services/imageAnalysis.js.
export function demoAssetModule(src) {
  if (typeof src !== 'string') return null;
  return DEMO_IMAGES[src] ?? null;
}
