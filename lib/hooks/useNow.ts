"use client";

import { useState } from "react";

/**
 * One clock reading, taken once per mount.
 *
 * Screens that show "expires in 4 days" or "12 minutes ago" were calling
 * `Date.now()` straight in the render body. That makes the render impure: the
 * same props produce a different tree depending on when React happens to run
 * it, which is exactly what the React Compiler rules object to, and it is a
 * hydration mismatch waiting for the one screen that does reach the server with
 * its data already in hand.
 *
 * Reading the clock once at mount keeps the number on screen from the first
 * painted frame — moving it into an effect would blank it for a frame, and the
 * design has no state for that. The value does not tick, which matches what
 * these screens did before: a day counter rendered once and left alone.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
