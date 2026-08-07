"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Img — THE photo element (Doc8 §173: blur-up placeholder, `loading="lazy"`,
 * `decoding="async"`).
 *
 * Every photo in the app was a bare `<img>`: it painted the instant each byte
 * arrived, so a feed scroll was a sequence of pop-ins, and nothing told the
 * browser to decode off the main thread — the decode landed inside the scroll
 * frame and dropped it. This is a drop-in replacement (same props, same
 * classes), adding three things and changing no layout:
 *
 *  - a 200ms opacity fade from the surface-3 fill the design already puts behind
 *    photos, so a photo RESOLVES instead of snapping in (transform/opacity only,
 *    GPU-composited — Doc8 §193);
 *  - `decoding="async"` so decode never blocks a scroll frame;
 *  - `loading="lazy"` by default, overridable with `priority` for anything above
 *    the fold (a detail-page hero must not lazy-load — that is an LCP hit).
 *
 * The `complete` check matters more than it looks: a cached image finishes
 * loading BEFORE React hydrates, so `onLoad` never fires and, without this, the
 * photo would sit at opacity 0 forever. That is the classic fade-in bug.
 */

export interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Above-the-fold: skip lazy-loading and hint the browser to fetch it first. */
  priority?: boolean;
  /** Opt out of the fade (e.g. a photo already inside its own animation). */
  noFade?: boolean;
}

export function Img({ className, priority, noFade, onLoad, onError, alt = "", ...rest }: ImgProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Already decoded (memory/disk cache) before hydration — no onLoad is coming.
    if (ref.current?.complete) setReady(true);
  }, []);

  return (
    // R2/CDN already serves per-variant, pre-sized images (Doc8 §173); next/image
    // would put a second optimiser in front of a CDN that has already done the work.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      ref={ref}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      onLoad={(e) => { setReady(true); onLoad?.(e); }}
      // A broken URL must not leave an invisible element with a dead alt slot.
      onError={(e) => { setReady(true); onError?.(e); }}
      className={cn(
        !noFade && "transition-opacity duration-200 ease-out-quart",
        !noFade && !ready && "opacity-0",
        className,
      )}
      {...rest}
    />
  );
}
