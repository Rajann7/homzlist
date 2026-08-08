"use client";

import { useEffect, useRef } from "react";

/**
 * Android's Back button closes the top open layer instead of leaving the screen
 * (Doc3 §98 — "back-button closes sheets (history-state)").
 *
 * Every sheet and dialog in the app is state, not a route, so Back used to blow
 * past the open sheet and navigate away — on a phone that reads as the app
 * losing your place. This pushes one throwaway history entry while a layer is
 * open and pops it back off when the layer closes any other way (X, backdrop,
 * Esc, swipe-down), so the history depth is exactly where it was.
 *
 * Stacking works for free: a sheet opened from a sheet pushes a second entry, so
 * Back closes the top one first — which is what BottomSheet's doc already
 * promised and nothing implemented.
 *
 * Deliberately NOT used for full-screen route-like layers (the story viewer, the
 * auth flow) — those own their own history handling.
 */
let seq = 0;

/** Read by components/nav/ScrollRestore — a pop this hook caused, not the user. */
export const SYNTHETIC_POP = "hz-nav-synthetic";

/**
 * Navigate OUT of an open sheet/dialog. Use this instead of calling the router
 * straight after closing the layer.
 *
 * Closing a layer runs the cleanup below, which calls `history.back()` to drop
 * the throwaway entry. That pop is ASYNCHRONOUS, and the App Router treats it as
 * a navigation of its own — so a `router.push()` issued in the same tick is
 * thrown away and the screen just sits there. Every navigating row in every
 * sheet was dead this way: the profile menu (Settings / Saved / Activity /
 * Drafts / Archived / Help), the Messages menu, both insights menus, the plan
 * and payment menus, the notifications menu.
 *
 * So run the navigation ON that pop. The timer is the fallback for a caller
 * whose layer had no entry to drop — then there is no pop coming at all.
 */
export function navigateAfterClose(go: () => void) {
  if (typeof window === "undefined") {
    go();
    return;
  }
  let done = false;
  let timer: ReturnType<typeof setTimeout>;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    clearTimeout(timer);
    go();
  };
  window.addEventListener("popstate", run);
  timer = setTimeout(run, 150);
}

export function useBackClose(open: boolean, onClose: () => void) {
  // Held in a ref so a caller passing an inline arrow doesn't re-run the effect
  // on every render — that would push a history entry per render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const marker = ++seq;
    window.history.pushState({ ...(window.history.state ?? {}), hzLayer: marker }, "");

    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by something other than Back → drop the entry we added, so the
      // next Back doesn't need two taps. Guarded on the marker still being the
      // current entry: if the user navigated (or Back already popped it), it is
      // not ours to remove and calling back() would leave the page.
      if (window.history.state?.hzLayer === marker) {
        // Mark this pop as OURS. It fires a real `popstate`, and the shell's
        // scroll-restore watches popstate to decide "this was a Back" — without
        // the mark, closing a sheet and then tapping a link within the next
        // couple of seconds would restore the previous screen's scroll offset
        // onto the new one.
        try { sessionStorage.setItem(SYNTHETIC_POP, String(Date.now())); } catch { /* private mode */ }
        window.history.back();
      }
    };
  }, [open]);
}
