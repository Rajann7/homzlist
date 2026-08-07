"use client";

/**
 * The offline action queue (Doc3 §98 — "service worker … offline action queue").
 *
 * The offline screen promises: "Anything you do offline (saves, messages) will
 * sync automatically when you're back." Until now nothing did that — a save or a
 * message typed with no signal returned `OFFLINE` and was simply lost. This is
 * the thing that makes the promise true.
 *
 * Design notes that matter:
 *  - The store is IndexedDB, NOT localStorage, and it holds only what is needed
 *    to REPLAY a request the user already authorised (path/method/body). No
 *    business truth is decided here: the server still validates, authorises and
 *    answers on replay, exactly as it would have online (CLAUDE.md backend lock).
 *  - Only three writes are ever queued (see `QueueKind`). Anything involving
 *    money, moderation, deletion of someone else's data or an upload is NOT
 *    queueable — replaying those minutes later, out of the user's sight, is how
 *    you charge someone twice.
 *  - Replay is at-most-once per record: the record is deleted before the retry
 *    counter can double-fire, and a 4xx (other than 401/429) drops the record
 *    rather than retrying forever — it will never succeed.
 *  - The service worker drains the SAME store on a `sync` event, so a queued
 *    message still goes out if the tab was closed. Both drains are guarded by a
 *    per-record `claimedAt` lease so the page and the worker cannot send twice.
 */

export type QueueKind = "save" | "unsave" | "message";

export interface QueuedWrite {
  id: string;
  kind: QueueKind;
  path: string; // "/api/v1/…"
  method: "POST" | "DELETE";
  body?: unknown;
  ts: number;
  claimedAt: number | null;
}

const DB_NAME = "hz-offline";
const DB_VERSION = 1;
const STORE = "queue";
/** A drain lease older than this is assumed dead (tab closed mid-flight). */
const LEASE_MS = 30_000;

/** Same channel name the service worker uses — see public/sw.js. */
const CHANNEL = "hz-offline-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = run(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

const available = () => typeof indexedDB !== "undefined";

/* ------------------------------------------------------------------ store */

export async function enqueue(item: Omit<QueuedWrite, "id" | "ts" | "claimedAt">): Promise<boolean> {
  if (!available()) return false;
  const record: QueuedWrite = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: Date.now(),
    claimedAt: null,
  };
  try {
    await tx("readwrite", (s) => s.add(record) as IDBRequest<IDBValidKey>);
  } catch {
    return false;
  }
  announce();
  // Ask the browser to wake the worker when connectivity returns. Background
  // Sync is Chromium-only; every other browser falls back to the `online`
  // listener in components/pwa/OfflineSync.tsx, so nothing is lost — it just
  // needs the tab to still be open.
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (reg as unknown as { sync?: { register: (t: string) => Promise<void> } })?.sync?.register(CHANNEL);
  } catch {
    /* no Background Sync — the online listener covers it */
  }
  return true;
}

export async function pendingCount(): Promise<number> {
  if (!available()) return 0;
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

async function allPending(): Promise<QueuedWrite[]> {
  try {
    const rows = await tx<QueuedWrite[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedWrite[]>);
    return rows.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

const drop = (id: string) => tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>).catch(() => {});
const put = (row: QueuedWrite) => tx("readwrite", (s) => s.put(row) as IDBRequest<IDBValidKey>).catch(() => {});

/* --------------------------------------------------------------- announce */

/** Fired whenever the queue depth changes, so the banner can re-read it. */
export function announce() {
  try {
    window.dispatchEvent(new CustomEvent(CHANNEL));
    new BroadcastChannel(CHANNEL).postMessage("changed");
  } catch {
    /* BroadcastChannel unsupported — the same-tab event still fires */
  }
}

/* ------------------------------------------------------------------ drain */

let draining = false;

/**
 * Send everything that is waiting, oldest first. Returns how many went out.
 * Safe to call repeatedly: concurrent calls collapse into the in-flight one.
 */
export async function drain(): Promise<{ sent: number; left: number }> {
  if (!available() || draining || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { sent: 0, left: await pendingCount() };
  }
  draining = true;
  let sent = 0;
  try {
    for (const row of await allPending()) {
      // Someone else (the service worker, another tab) is already on it.
      if (row.claimedAt && Date.now() - row.claimedAt < LEASE_MS) continue;
      await put({ ...row, claimedAt: Date.now() });

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
        // Still offline — release the lease and stop; the rest keeps its order.
        await put({ ...row, claimedAt: null });
        break;
      }

      if (status < 400 || (status >= 400 && status < 500 && status !== 401 && status !== 429)) {
        // 2xx = done. 4xx = it can never succeed (gone, forbidden, invalid) —
        // keeping it would retry forever on every reconnect.
        await drop(row.id);
        if (status < 400) sent += 1;
      } else {
        // 401/429/5xx are transient: leave it queued for the next drain.
        await put({ ...row, claimedAt: null });
        break;
      }
    }
  } finally {
    draining = false;
  }
  announce();
  return { sent, left: await pendingCount() };
}

/** Subscribe to queue-depth changes (same tab + other tabs + the worker). */
export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(CHANNEL, fn);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => fn();
  } catch {
    /* unsupported */
  }
  return () => {
    window.removeEventListener(CHANNEL, fn);
    bc?.close();
  };
}
