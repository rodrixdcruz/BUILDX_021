/*
 * Nagpur HealthGrid — offline shell service worker (Commit 3).
 *
 * Network Blackout Mode: serves the cached app shell when the network is
 * unavailable so emergency reporting keeps working offline. Data lives in
 * localStorage (existing persistence approach), so cases created offline
 * are already local; the connectivity service queues actions for sync.
 *
 * Intentionally cache-only for navigation/assets — there is no backend to
 * talk to, so no runtime API caching is needed in this demo.
 */
const CACHE = 'nhg-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // SPA navigation: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Same-origin assets: cache first, refresh in the background when online.
  if (new URL(req.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fetchAndStore = fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
          .catch(() => hit)
        return hit ?? fetchAndStore
      }),
    )
  }
})
