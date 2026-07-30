"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { SectionH } from "@/components/help/primitives";

/**
 * P12 S7 — the offline page the service worker serves when a navigation fails.
 *
 * "Recently viewed" is the genuinely local part of this screen: it is the only
 * data we have without a network, cached by the SW when those listings were
 * opened. It is UI cache, not business truth (CLAUDE.md rule 3) — prices shown
 * here are stamped as cached and the cards are dimmed exactly as the design
 * draws them.
 */
interface CachedCard {
  id: string;
  priceLabel: string;
  subtitle: string;
}

const CACHE_KEY = "hz-recently-viewed";

export function OfflineView() {
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const [recent, setRecent] = useState<CachedCard[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) setRecent((JSON.parse(raw) as CachedCard[]).slice(0, 6));
    } catch {
      /* a corrupt cache is simply no cache */
    }
  }, []);

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        window.location.reload();
        return;
      }
    } catch {
      /* still offline */
    }
    setRetrying(false);
    toast.show("Still offline", { variant: "error" });
  };

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      <div className="flex flex-col items-center gap-2 px-8 pt-20 text-center">
        <span className="relative">
          <Icon name="cloud-off" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <Icon name="refresh" size={20} className="absolute -right-1 bottom-2 text-accent" />
        </span>
        <p className="mt-4 text-20 font-bold text-ink-primary">You&apos;re offline</p>
        <p className="max-w-[280px] text-15 text-ink-secondary">
          Check your connection. You can still browse recently viewed properties.
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="chrome mt-4 inline-flex h-11 min-w-[160px] items-center justify-center gap-2 rounded-8 bg-accent px-4 text-15 font-semibold text-white disabled:bg-accent-disabled"
        >
          {retrying ? (
            <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
          ) : (
            "Retry"
          )}
        </button>
        {recent.length > 0 && (
          <a
            href={`/property/${recent[0].id}`}
            className="chrome inline-flex h-11 min-w-[220px] items-center justify-center rounded-8 border border-border px-4 text-15 font-semibold text-ink-primary"
          >
            Browse cached properties
          </a>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <SectionH>Recently viewed</SectionH>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            {recent.map((c) => (
              <a
                key={c.id}
                href={`/property/${c.id}`}
                className="chrome flex w-[150px] shrink-0 flex-col overflow-hidden rounded-12 border border-border opacity-[0.68]"
              >
                <span className="relative flex h-[84px] items-center justify-center bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
                  <Icon name="home" size={20} />
                  <Icon name="cloud-off" size={16} className="absolute right-1.5 top-1.5 text-white" />
                </span>
                <span className="flex flex-col gap-0.5 p-2">
                  <span className="text-13 font-semibold text-ink-primary">{c.priceLabel}</span>
                  <span className="text-11 text-ink-tertiary">{c.subtitle}</span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      <p className="px-8 pb-8 pt-6 text-center text-11 text-ink-tertiary">
        Anything you do offline (saves, messages) will sync automatically when you&apos;re back.
      </p>
    </div>
  );
}
