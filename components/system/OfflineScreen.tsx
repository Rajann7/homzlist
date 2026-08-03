"use client";

import { useEffect, useState } from "react";
import { Icon, Button } from "@/components";
import { useToast } from "@/components/ui/Toast";

/**
 * P12 S7 — the offline page, served by the service worker when a navigation
 * fails with no cached page.
 *
 * "Recently viewed" is read from the SAME cache the service worker filled, via
 * the Cache Storage API. It is not a business read and it is not a fake list:
 * if the cache is empty the rail is not drawn at all, because three placeholder
 * cards on an offline screen would be inventing property that does not exist.
 *
 * Retry actually probes the network (a HEAD to a tiny endpoint) rather than
 * calling location.reload() and landing back here — the prototype's Retry
 * spins and toasts "Still offline", and this does the real version of that.
 */

interface CachedListing {
  href: string;
  title: string;
  subtitle: string;
}

export function OfflineScreen() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<CachedListing[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof caches === "undefined") return;
        const names = await caches.keys();
        const found: CachedListing[] = [];
        for (const n of names) {
          const c = await caches.open(n);
          for (const req of await c.keys()) {
            const u = new URL(req.url);
            const m = /^\/property\/([^/]+)$/.exec(u.pathname);
            if (m && !found.some((f) => f.href === u.pathname)) {
              found.push({ href: u.pathname, title: "Saved property", subtitle: "Viewed recently" });
            }
            if (found.length >= 6) break;
          }
          if (found.length >= 6) break;
        }
        if (!cancelled) setRecent(found);
      } catch {
        /* Cache Storage unavailable — the rail simply doesn't render. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function retry() {
    setBusy(true);
    let online = false;
    try {
      const res = await fetch("/api/health", { method: "HEAD", cache: "no-store" });
      online = res.ok;
    } catch {
      online = false;
    }
    setBusy(false);
    if (online) window.location.reload();
    else toast.show("Still offline", { variant: "error" });
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      <div className="flex flex-col items-center gap-2 px-8 pt-20 text-center">
        <span className="relative">
          <Icon name="cloud-off" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <Icon name="rotate-cw" size={20} className="absolute -right-1 bottom-2 text-accent" />
        </span>
        <p className="mt-4 text-20 font-bold text-ink-primary">You&apos;re offline</p>
        <p className="max-w-[280px] text-15 text-ink-secondary">
          Check your connection. You can still browse recently viewed properties.
        </p>
        <Button className="mt-4 min-w-[160px]" loading={busy} onClick={() => void retry()}>Retry</Button>
        {recent.length > 0 && (
          <Button
            variant="outline"
            className="min-w-[220px]"
            onClick={() => { window.location.href = recent[0].href; }}
          >
            Browse cached properties
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="mx-4 mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
            Recently viewed
          </h2>
          <div className="flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recent.map((r) => (
              <a
                key={r.href}
                href={r.href}
                className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-12 border border-border opacity-[0.68]"
              >
                <span className="relative grid h-[84px] place-items-center bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
                  <Icon name="home" size={20} />
                  <Icon name="cloud-off" size={16} className="absolute right-1.5 top-1.5 text-white" />
                </span>
                <span className="flex flex-col gap-0.5 p-2">
                  <span className="text-13 font-semibold text-ink-primary">{r.title}</span>
                  <span className="text-11 text-ink-tertiary">{r.subtitle}</span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      <p className="px-8 pb-10 pt-6 text-center text-11 leading-[1.5] text-ink-tertiary">
        Anything you do offline (saves, messages) will sync automatically when you&apos;re back.
      </p>
    </div>
  );
}
