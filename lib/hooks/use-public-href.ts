"use client";

import { useSyncExternalStore } from "react";
import { configuredPublicOrigin, publicOrigin } from "@/lib/utils";

/**
 * `publicOrigin()` for an href that is RENDERED into markup rather than read
 * inside a click handler.
 *
 * The value differs between the server (no address bar — it falls back to the
 * configured site URL) and the browser (the real host). Reading it straight
 * during render would therefore emit one href on the server and a different one
 * on hydration, which React reports as a mismatch.
 *
 * `useSyncExternalStore` is exactly the escape hatch for this: the server
 * snapshot is also used for the first client render, so hydration matches, and
 * the real origin is swapped in immediately afterwards. The store never
 * changes, so `subscribe` has nothing to listen to.
 */
const subscribe = () => () => {};

export function usePublicOrigin(): string {
  return useSyncExternalStore(subscribe, publicOrigin, configuredPublicOrigin);
}

/** An absolute URL onto the public host, safe to render as an `href`. */
export function usePublicHref(path: string): string {
  return `${usePublicOrigin()}${path}`;
}
