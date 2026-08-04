import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured for our custom scales (Doc1). Without this, twMerge
 * doesn't recognise `text-15` etc. as font-sizes and collapses them with
 * `text-<color>` classes (dropping the size). Registering the custom groups
 * keeps size + colour independent, and radius/shadow tokens merge correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["11", "13", "15", "17", "20", "24"] }],
      rounded: [{ rounded: ["4", "8", "12", "16"] }],
      shadow: [{ shadow: ["l1", "l2", "l3"] }],
    },
  },
});

/** Merge conditional class names, de-duplicating conflicting Tailwind classes. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}


/**
 * Scroll an element into view under the sticky header, and ACTUALLY LAND.
 *
 * Two things make the obvious one-liner wrong, and both were found as dead
 * buttons rather than reasoned about in advance:
 *
 *  1. `behavior: "smooth"` is a SILENT no-op wherever smooth scrolling is
 *     switched off — headless Chrome with animations disabled, some in-app
 *     webviews, an OS-level reduce-motion setting. It does not throw; the page
 *     just sits there. Every one of the 19 entries in the legal reader's Table
 *     of contents was dead this way.
 *  2. The window is not always the scroller. `AppShell` puts the app's scroll
 *     inside `<main class="overflow-y-auto">` so the bottom nav can stay
 *     pinned — so on every AppShell screen `window.scrollTo` scrolls nothing.
 *     That killed all 15 jump chips in the components gallery.
 *
 * So: find the real scroll container, ask for smooth, and check a frame later
 * that something moved — falling back to an instant jump when it did not.
 */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return null;
}

export function scrollToId(id: string, offset = 76): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;

  const box = scrollParentOf(el);
  const from = box ? box.scrollTop : window.scrollY;
  const target = box
    ? Math.max(0, box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - offset)
    : Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);

  (box ?? window).scrollTo({ top: target, behavior: "smooth" });

  window.setTimeout(() => {
    const now = box ? box.scrollTop : window.scrollY;
    if (Math.abs(now - from) < 2 && Math.abs(target - from) > 4) {
      if (box) box.scrollTop = target;
      else window.scrollTo(0, target);
    }
  }, 120);
  return true;
}
