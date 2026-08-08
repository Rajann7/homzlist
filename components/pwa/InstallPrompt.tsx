"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Install prompts — P12 gallery ("Install prompt — Android", "iOS install guide
 * overlay"), rules from Doc3 §98: *Android card weekly if not installed; iOS
 * manual guide overlay.*
 *
 *  - Android/Chromium: `beforeinstallprompt` is captured and re-offered at most
 *    once a week. It used to be dismissed FOREVER on the first tap of the X,
 *    which is not what "weekly" means — one accidental dismissal and the user
 *    could never install again.
 *  - iOS Safari has no prompt API, so it gets the manual guide overlay, on the
 *    same weekly cadence.
 *
 * The snooze timestamp is a UI preference (Doc: localStorage is for UI-only
 * prefs) — nothing business-related is decided here, and `appinstalled` /
 * display-mode are the real signals for "already installed".
 */

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SNOOZE_KEY = "hz-install-snoozed-at";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari non-standard flag
    window.navigator.standalone === true
  );
}
function snoozed() {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return at > 0 && Date.now() - at < WEEK_MS;
  } catch {
    return false;
  }
}

/**
 * account.* is the admin panel — a different product on a different host
 * (Doc6 §4). It inherits the root layout, so the consumer "Install HomzList"
 * card was drawing itself over the admin dashboard, offering staff a home-screen
 * shortcut to a tool that is not a PWA. Kept as a host check rather than a
 * layout change so no route has to opt out.
 */
function isAdminHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname.split(".")[0].toLowerCase() === "account";
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isAdminHost() || isStandalone() || snoozed()) return;

    let onInstalled: (() => void) | undefined;
    let onBIP: ((e: Event) => void) | undefined;
    let cancelled = false;

    (async () => {
      // A22 Feature flags → PWA install prompt. Off = the card is never offered.
      // Default-on: any fetch failure or missing flag proceeds as before.
      try {
        const r = await fetch("/api/v1/config/flags", { cache: "no-store" });
        const j = (await r.json()) as { data?: { flags?: Record<string, boolean> } };
        if (j?.data?.flags?.pwa_prompt === false) return;
      } catch {
        /* default-on */
      }
      if (cancelled) return;
      setHidden(false);

      onInstalled = () => { setHidden(true); setDeferred(null); setShowIosGuide(false); };
      window.addEventListener("appinstalled", onInstalled);

      if (isIos()) {
        setShowIosGuide(true);
        return;
      }
      onBIP = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BIPEvent);
      };
      window.addEventListener("beforeinstallprompt", onBIP);
    })();

    return () => {
      cancelled = true;
      if (onBIP) window.removeEventListener("beforeinstallprompt", onBIP);
      if (onInstalled) window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Snooze for a week (Doc3 §98) — not "never again". */
  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* private mode */ }
    setHidden(true);
  };

  if (hidden) return null;
  if (!deferred && !showIosGuide) return null;

  // Both sit above the bottom nav (52px + safe area), which is where the P12
  // gallery places them relative to the shell.
  const wrap = "fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom)+8px)] z-dropdown mx-auto w-full max-w-column px-4";

  if (showIosGuide) {
    return (
      <div className={wrap}>
        {/* iOS install guide overlay — ink-primary card with the arrow pointing
            down at Safari's Share button. */}
        <div className="chrome relative rounded-12 bg-ink-primary p-4 text-page shadow-l3">
          <button
            aria-label="Dismiss"
            onClick={dismiss}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center text-page/70"
          >
            <Icon name="close" size={18} strokeWidth={1.7} />
          </button>
          <p className="pr-8 text-15 font-semibold">Add HomzList to your Home Screen</p>
          <p className="mt-1 text-13 opacity-75">
            Tap the <Icon name="share" size={16} className="inline-block -mb-0.5 text-page" /> Share button, then
            &ldquo;Add to Home Screen&rdquo;.
          </p>
          <span
            aria-hidden
            className="mx-auto mt-2.5 -mb-6 block h-0 w-0"
            style={{
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "10px solid var(--ink-primary)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {/* Install prompt — Android */}
      <div className="chrome flex items-center gap-3 rounded-12 border border-border bg-surface-1 px-4 py-3 shadow-l3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-accent text-20 font-bold text-white">
          H
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-15 font-semibold text-ink-primary">Install HomzList</span>
          <span className="truncate text-11 text-ink-tertiary">Fast, light, works offline</span>
        </div>
        <Button
          size="small"
          onClick={async () => {
            const e = deferred!;
            setDeferred(null);
            await e.prompt();
            const choice = await e.userChoice;
            // "dismissed" in the OS sheet is still a dismissal — snooze a week,
            // same as tapping our X, so we don't re-ask on the next screen.
            dismiss();
            if (choice.outcome === "accepted") {
              try { localStorage.removeItem(SNOOZE_KEY); } catch { /* private mode */ }
            }
          }}
        >
          Install
        </Button>
        <button aria-label="Dismiss" onClick={dismiss} className="grid h-9 w-9 -mr-2 place-items-center text-ink-tertiary">
          <Icon name="close" size={20} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
