"use client";

import { useEffect } from "react";

/**
 * Registers the service worker after load (Doc6 §8). Kept out of the critical
 * render path. Only in production + secure contexts (SW requires HTTPS/localhost).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // avoid caching dev assets
    // Not on account.* — the admin panel is a separate product sharing the root
    // layout (Doc6 §4). Registering the consumer worker there would put admin
    // HTML and chunks behind the public app's cache and offline fallback.
    if (window.location.hostname.split(".")[0].toLowerCase() === "account") return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
