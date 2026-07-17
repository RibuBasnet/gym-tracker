/* Training Ledger — service worker
   Strategy:
   - The page (index.html) is fetched NETWORK-FIRST so a freshly deployed
     version always wins when you're online. The last good copy is cached,
     so the app still opens offline (e.g. in the gym with no signal).
   - Google Fonts are cached so text renders offline too.
   - This is what removes the "delete and re-add the Home-Screen app to see
     changes" dance: cold launches pull the newest index.html automatically.
   NOTE: this worker never touches localStorage, so your logged data is safe. */

const VERSION = 'v1';
const CACHE = 'gym-tracker-' + VERSION;
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isNavigation(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return req.method === 'GET' && accept.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for the page itself.
  if (isNavigation(req)) {
    event.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  const url = new URL(req.url);
  const isFont =
    url.hostname.indexOf('fonts.googleapis.com') !== -1 ||
    url.hostname.indexOf('fonts.gstatic.com') !== -1;

  // Cache-first w/ background refresh for fonts and other same-origin assets.
  if (isFont || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
