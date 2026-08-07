/* HomzList service worker (Doc6 §8 / Doc8 §26).
 * Scaffold scope:
 *  - precache the app shell + offline fallback,
 *  - network-first for navigations with offline fallback,
 *  - stale-while-revalidate for static assets & images (CDN),
 *  - NEVER cache API responses or anything sensitive (Doc9 §26).
 *  - drain the offline write-queue on `sync` (Module 13 — Doc3 §98).
 */

const VERSION = "hz-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = ["/", OFFLINE_URL, "/manifest.webmanifest"];

// NOTE: deliberately NO skipWaiting() here. A new worker parks in `waiting` so
// the page can show the "New version — Refresh" toast (Doc3 §98) and the user
// decides when to swap — skipping straight in would hot-swap the chunks under a
// half-filled listing form. Clicking Refresh posts SKIP_WAITING (below).
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
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
  if (event.data === "DRAIN_QUEUE") event.waitUntil(drainQueue());
});

/* ---------------------------------------------------------------------------
 * Offline write-queue drain (Doc3 §98).
 *
 * The page writes queued actions into IndexedDB (lib/pwa/offline-queue.ts); this
 * drains the SAME store when the browser reports connectivity back, so a save or
 * a message survives the tab being closed. Kept byte-identical in shape to the
 * page-side drain — same store, same lease, same 4xx-drops rule — so the two can
 * never disagree about what has already been sent.
 * ------------------------------------------------------------------------- */

const QUEUE_DB = "hz-offline";
const QUEUE_STORE = "queue";
const QUEUE_CHANNEL = "hz-offline-queue";
const LEASE_MS = 30000;

function queueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function queueTx(mode, run) {
  return queueDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(QUEUE_STORE, mode);
        const r = run(t.objectStore(QUEUE_STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

async function drainQueue() {
  let rows = [];
  try {
    rows = (await queueTx("readonly", (s) => s.getAll())) || [];
  } catch {
    return;
  }
  rows.sort((a, b) => a.ts - b.ts);

  for (const row of rows) {
    if (row.claimedAt && Date.now() - row.claimedAt < LEASE_MS) continue;
    await queueTx("readwrite", (s) => s.put({ ...row, claimedAt: Date.now() })).catch(() => {});

    let status = 0;
    try {
      const res = await fetch(row.path, {
        method: row.method,
        headers: row.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: row.body === undefined ? undefined : JSON.stringify(row.body),
        credentials: "same-origin",
        cache: "no-store",
      });
      status = res.status;
    } catch {
      await queueTx("readwrite", (s) => s.put({ ...row, claimedAt: null })).catch(() => {});
      break; // still offline — keep the order, try again on the next sync
    }

    if (status < 400 || (status >= 400 && status < 500 && status !== 401 && status !== 429)) {
      await queueTx("readwrite", (s) => s.delete(row.id)).catch(() => {});
    } else {
      await queueTx("readwrite", (s) => s.put({ ...row, claimedAt: null })).catch(() => {});
      break; // 401/429/5xx are transient
    }
  }

  // Tell any open tab to re-read the queue depth so its banner clears.
  try {
    new BroadcastChannel(QUEUE_CHANNEL).postMessage("changed");
  } catch {
    /* older browser — the tab's own `online` drain covers it */
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === QUEUE_CHANNEL) event.waitUntil(drainQueue());
});

/* ---------------------------------------------------------------------------
 * Push (Module 10 — Doc2 §14).
 *
 * FCM delivers a web push as a standard `push` event whose payload carries the
 * `notification` + `data` we sent server-side. Handling it here (rather than in
 * a separate firebase-messaging-sw.js) keeps ONE service worker, so the PWA
 * caching and the push handling can never disagree about which SW is in
 * control — the token is registered against this exact registration.
 *
 * Device notes: Android and desktop show these directly; iOS only delivers to
 * an INSTALLED (standalone) PWA, which is why registration records `standalone`.
 * ------------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { notification: { body: event.data && event.data.text() } }; }

  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || "HomzList";
  const options = {
    body: n.body || d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Same tag = the phone REPLACES the old notification instead of stacking a
    // second one, which is the shade-level half of Doc2 §14's grouping rule.
    tag: d.threadId ? `thread:${d.threadId}` : d.type || "homzlist",
    renotify: true,
    data: { href: d.href || "/notifications", notificationId: d.notificationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Focus an open tab and route it, rather than opening a duplicate app.
      for (const c of list) {
        if ("focus" in c) { c.postMessage({ type: "NOTIFICATION_CLICK", href }); return c.focus(); }
      }
      return self.clients.openWindow(href);
    }),
  );
});
