"use client";

import { useSyncExternalStore } from "react";
import { currentPath, loginHref } from "@/lib/auth/next-url";

/**
 * `loginHref()` for a guest CTA that is RENDERED as an href rather than read
 * inside a click handler.
 *
 * Same hydration problem `usePublicHref` solves: the destination depends on
 * `window.location`, which does not exist during SSR. The server snapshot is
 * the bare "/login" the markup used to carry, so hydration matches exactly and
 * the `?next=` is added on the client — and a JS-off visitor still gets a
 * working sign-in link, just without the return trip.
 */
const subscribe = () => () => {};

export function useLoginHref(next?: string): string {
  return useSyncExternalStore(
    subscribe,
    () => loginHref(next ?? currentPath()),
    () => "/login",
  );
}
