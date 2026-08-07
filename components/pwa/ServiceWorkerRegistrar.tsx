"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Registers the service worker after load (Doc6 §8), and owns the update
 * handshake (Doc3 §98 — update toast "New version — Refresh").
 *
 * How the update works now that sw.js no longer calls skipWaiting() on install:
 * a newer worker installs and parks in `waiting`. We notice (either it was
 * already waiting when the page opened, or `updatefound` fires), show the toast,
 * and only on Refresh post SKIP_WAITING → the new worker activates → the
 * `controllerchange` event reloads the page onto the new build. Without the
 * handshake a deploy silently swapped chunks under whatever the user was doing.
 *
 * Only in production + secure contexts (SW requires HTTPS/localhost), and never
 * on account.* — the admin panel is a separate product sharing the root layout
 * (Doc6 §4), and registering the consumer worker there would put admin HTML and
 * chunks behind the public app's cache and offline fallback.
 */
export function ServiceWorkerRegistrar() {
  const toast = useToast();
  // The toast must be offered once per waiting worker, not once per re-render.
  const offered = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // avoid caching dev assets
    if (window.location.hostname.split(".")[0].toLowerCase() === "account") return;

    let cancelled = false;

    const offerUpdate = (waiting: ServiceWorker) => {
      if (offered.current || cancelled) return;
      offered.current = true;
      toast.show("New version", {
        duration: null,
        action: {
          label: "Refresh",
          onClick: () => waiting.postMessage("SKIP_WAITING"),
        },
      });
    };

    // The new worker took control → we are on the new build; reload once so the
    // open page stops running the old chunks.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (cancelled) return;
          // Already waiting when this tab opened (a deploy happened while the
          // app was closed).
          if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const next = reg.installing;
            if (!next) return;
            next.addEventListener("statechange", () => {
              // `controller` is null on the very first install — that one is not
              // an "update", it is the app becoming offline-capable.
              if (next.state === "installed" && navigator.serviceWorker.controller) offerUpdate(next);
            });
          });
        })
        .catch(() => {});
    };
    window.addEventListener("load", onLoad);

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [toast]);

  return null;
}
