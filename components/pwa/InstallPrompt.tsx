"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "@/components/nav/Header";

/**
 * Install prompts (Doc6 §8):
 *  - Android/Chromium: captures `beforeinstallprompt` → shows an install CARD.
 *  - iOS Safari (no prompt API): shows an "Add to Home Screen" GUIDE.
 * Dismissal is remembered locally (a UI preference, not business data).
 * Full design polish arrives in Module 13; this is the wired foundation.
 */

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "hz-install-dismissed";

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

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setDismissed(false);

    if (isIos()) {
      setShowIosGuide(true);
      return;
    }
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!deferred && !showIosGuide) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom)+8px)] z-dropdown mx-auto w-full max-w-column px-4">
      <div className="flex items-center gap-3 rounded-12 border border-border bg-surface-1 p-3 shadow-l3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-8 bg-accent-soft">
          <Icon name="home" size={22} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-13 font-semibold text-ink-primary">
            Install <Wordmark className="text-13" />
          </p>
          <p className="truncate text-11 text-ink-tertiary">
            {showIosGuide ? "Tap Share, then “Add to Home Screen”." : "Add to your home screen for a faster, app-like experience."}
          </p>
        </div>
        {deferred ? (
          <Button
            size="small"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              dismiss();
            }}
          >
            Install
          </Button>
        ) : (
          <Icon name="share" size={20} className="text-accent" />
        )}
        <button aria-label="Dismiss" onClick={dismiss} className="grid h-9 w-9 place-items-center text-ink-tertiary">
          <Icon name="close" size={18} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
