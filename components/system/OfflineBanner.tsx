"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * THE offline banner (P12 gallery — "Offline banner"): ink-primary bar, page-
 * coloured text, 13px, centred, wifi-off glyph, copy verbatim from the design.
 *
 * It used to exist twice with two different strings (billing said "last saved
 * data") and not at all on the app shell — so the whole consumer app went silent
 * when the signal dropped. One component now, one string, mounted globally by
 * AppShell via components/pwa/NetworkStatus.
 *
 * Singleton by construction: while the shell's banner is up, a screen-local
 * banner renders null instead of stacking a second identical bar. Billing raises
 * its own on a FAILED READ (stale data with the radio still on), which is a
 * different truth and still shows when the shell's is down.
 */

let globalShown = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => globalShown;
function setGlobalShown(v: boolean) {
  if (globalShown === v) return;
  globalShown = v;
  listeners.forEach((l) => l());
}

function Bar() {
  return (
    <div className="chrome flex shrink-0 items-center justify-center gap-2 bg-ink-primary px-4 py-2 text-13 text-page">
      <Icon name="wifi-off" size={16} strokeWidth={1.7} />
      You&apos;re offline — showing saved data
    </div>
  );
}

/** The app-shell instance. Only NetworkStatus renders this. */
export function GlobalOfflineBanner() {
  useEffect(() => {
    setGlobalShown(true);
    return () => setGlobalShown(false);
  }, []);
  return <Bar />;
}

/** A screen-local instance — suppressed while the shell already shows one. */
export function OfflineBanner() {
  const shellShowing = useSyncExternalStore(subscribe, snapshot, () => false);
  return shellShowing ? null : <Bar />;
}
