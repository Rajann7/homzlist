"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SYNTHETIC_POP, SYNTHETIC_POP_LAYER } from "@/lib/hooks/use-back-close";

/**
 * Scroll-position restore for the app shell (Doc8 §193 — "position restore").
 *
 * The shell scrolls INSIDE `<main>`, not the window (so the bottom nav can stay
 * pinned), and the browser's own scroll restoration only ever tracks the window.
 * So going feed → listing → Back landed you at the top of the feed every single
 * time, having lost your place after ten screens of scrolling — the single most
 * un-Instagram thing the app did.
 *
 * Only BACK/FORWARD restores. A fresh navigation to a route you happen to have
 * visited before still opens at the top, which is what tapping a link means. The
 * `popstate` flag carries the direction across the remount (Next's router
 * doesn't expose navigation type), and expires almost immediately so a sheet
 * closing — which also pops a history entry, see use-back-close — can't be
 * mistaken for a Back navigation later on.
 */

const POP_FLAG = "hz-nav-pop";
const key = (p: string) => `hz-scroll:${p}`;

/** Set once, app-wide, on the first mount that runs. */
let popWatcherAttached = false;

export function ScrollRestore() {
  const pathname = usePathname() ?? "/";
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (popWatcherAttached) return;
    popWatcherAttached = true;
    window.addEventListener("popstate", () => {
      try {
        // A sheet or dialog closing pops the throwaway entry it pushed. That is
        // not the user going Back, and treating it as one would restore a stale
        // offset onto whatever they open next.
        if (sessionStorage.getItem(SYNTHETIC_POP)) {
          sessionStorage.removeItem(SYNTHETIC_POP);
          sessionStorage.removeItem(SYNTHETIC_POP_LAYER);
          return;
        }
        sessionStorage.setItem(POP_FLAG, String(Date.now()));
      } catch { /* private mode */ }
    });
  }, []);

  useEffect(() => {
    const box = anchor.current?.parentElement;
    if (!box) return;

    let cameFromBack = false;
    try {
      const at = Number(sessionStorage.getItem(POP_FLAG) || 0);
      // A client-side Back through the router can take a beat; 2s was tight
      // enough to miss it on a cold route.
      cameFromBack = at > 0 && Date.now() - at < 5000;
      // NOT cleared here. React StrictMode runs this effect twice (mount →
      // cleanup → mount); clearing on read meant the first pass consumed the
      // flag and started the restore, cleanup cancelled its frame, and the
      // second pass saw no flag and did nothing — the restore never landed.
      // The flag is cleared when the restore finishes, and expires by time
      // anyway, so a re-run simply re-derives the same answer.
    } catch { /* private mode — never restore, never crash */ }
    const doneRestoring = () => { try { sessionStorage.removeItem(POP_FLAG); } catch { /* private mode */ } };

    let raf = 0;
    // While the restore is settling, the container is short and scrollTop reads
    // back clamped. The save handler below would persist THAT — overwriting the
    // very offset being restored — so saving is muted until the restore lands.
    let restoring = false;
    if (cameFromBack) {
      const want = Number((() => { try { return sessionStorage.getItem(key(pathname)); } catch { return 0; } })() || 0);
      if (want <= 0) doneRestoring(); // nothing saved for this route — don't leave the flag armed
      if (want > 0) {
        // The feed's rails lazy-load, so the container is far shorter than the
        // saved offset when this first runs and the browser CLAMPS scrollTop to
        // whatever fits — which is how a restore silently lands back at the top.
        // So keep re-applying until the position actually sticks, on a deadline
        // rather than a frame count (30 frames was ~half a second; the content
        // it was waiting for takes a few seconds to arrive).
        restoring = true;
        const deadline = Date.now() + 4000;
        const settle = () => {
          box.scrollTop = want;
          // Landed (allowing a pixel of rounding) → done.
          if (Math.abs(box.scrollTop - want) <= 1) { restoring = false; doneRestoring(); return; }
          if (Date.now() > deadline) {
            // Never arrived: leave the user at the top rather than at an
            // arbitrary offset into content that is no longer there.
            box.scrollTop = 0;
            restoring = false;
            doneRestoring();
            return;
          }
          raf = requestAnimationFrame(settle);
        };
        raf = requestAnimationFrame(settle);
      }
    }

    let writeRaf = 0;
    const onScroll = () => {
      if (restoring) return;
      // Coalesced to one write per frame: sessionStorage on every scroll event is
      // a synchronous main-thread write and would be the jank we came to remove.
      cancelAnimationFrame(writeRaf);
      writeRaf = requestAnimationFrame(() => {
        try { sessionStorage.setItem(key(pathname), String(Math.round(box.scrollTop))); } catch { /* full/private */ }
      });
    };
    box.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(writeRaf);
      box.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  return <span ref={anchor} aria-hidden className="hidden" />;
}
