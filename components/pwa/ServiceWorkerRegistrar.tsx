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
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
