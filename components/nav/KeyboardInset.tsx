"use client";

import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard's height as `--kbd` on :root (the design's
 * own variable — P7 pads the composer by `calc(8px + var(--kbd,0px))`).
 *
 * Why this is needed at all: the shell is sized with `100dvh`, and on iOS Safari
 * and Android Chrome the *dynamic* viewport does NOT shrink when the keyboard
 * opens — the keyboard overlays the page. So a bottom-pinned composer sat
 * underneath it and you couldn't see what you were typing. `visualViewport` is
 * the only surface that reports the covered area, so we measure it and let the
 * shell subtract it.
 *
 * Mounted once by AppShell, so every screen with a bottom-anchored control (chat
 * composer, sheets with inputs) gets the same behaviour rather than each one
 * inventing its own.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Height the keyboard (or any browser UI overlay) is covering. `offsetTop`
        // matters when the page is scrolled under a pinned keyboard.
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        // Ignore sub-100px deltas: those are the address bar collapsing, not a
        // keyboard, and reacting to them makes the layout jitter while scrolling.
        const kbd = covered > 100 ? Math.round(covered) : 0;
        document.documentElement.style.setProperty("--kbd", `${kbd}px`);
      });
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.setProperty("--kbd", "0px");
    };
  }, []);

  return null;
}
