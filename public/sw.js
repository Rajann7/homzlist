/* HomzList service worker (Doc6 §8 / Doc8 §26).
 * Scaffold scope:
 *  - precache the app shell + offline fallback,
 *  - network-first for navigations with offline fallback,
 *  - stale-while-revalidate for static assets & images (CDN),
 *  - NEVER cache API responses or anything sensitive (Doc9 §26).
 * The offline write-queue + background sync is wired in Module 13.
 */

const VERSION = "hz-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = ["/", OFFLINE_URL, "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache writes

  const url = new URL(request.url);

  // Never cache API / auth / dynamic data — always network, no fallback caching.
  if (url.pathname.startsWith("/api")) return;

  // Navigations: network-first, fall back to cached page, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Static assets / images: stale-while-revalidate.
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});

// Allow the page to trigger an immediate update (Module 13 update toast).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
