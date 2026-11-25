/* sovereign. — service worker: caches the app files so it opens offline.
   Your curriculum data lives in localStorage, not here.
   When you change any app file, bump CACHE so installed copies pick up the update. */
const CACHE = 'sovereign-aioff-1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'css/courses.css', 'css/ai.css', 'css/design.css', 'css/themes.css', 'css/studio.css', 'css/workbench.css', 'css/nav.css', 'css/academic.css', 'css/refresh.css', 'css/review.css', 'css/exhibits.css', 'css/nav-overlay.css', 'css/ai-off.css', 'css/publish.css',
  'js/config.js', 'js/exhibits.js', 'js/store.js', 'js/components.js', 'js/exhibits-view.js', 'js/ai-client.js', 'js/files.js', 'js/dataset-import.js', 'js/mydata.js', 'js/capstone-ui.js', 'js/publish-model.js', 'js/publish.js', 'js/publish-attach.js', 'js/publish-docs.js', 'js/views-work.js', 'js/review-studio.js', 'js/views-ai.js', 'js/views-course.js', 'js/studio.js', 'js/syllabus.js', 'js/workbench.js', 'js/academic.js', 'js/views-dash.js', 'js/ai-off.js', 'js/app.js',
  'fonts/inter-tight-latin-700-normal.woff2', 'fonts/inter-tight-latin-800-normal.woff2', 'fonts/playfair-display-latin-400-normal.woff2', 'fonts/playfair-display-latin-400-italic.woff2',
  'fonts/instrument-serif-latin-400-normal.woff2', 'fonts/instrument-serif-latin-400-italic.woff2', 'fonts/cinzel-latin-500-normal.woff2', 'fonts/cinzel-latin-600-normal.woff2',
  'fonts/cormorant-garamond-latin-400-italic.woff2', 'fonts/cormorant-garamond-latin-500-italic.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sovereign-aioff-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Network first, so a new version shows up on the next open; the cache is the fallback that makes it work offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => { // revalidate with the server so a stale browser copy is never used
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
