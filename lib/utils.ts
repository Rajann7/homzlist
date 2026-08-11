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

/**
 * The origin of the PUBLIC host, from the browser's own address bar.
 *
 * Legal, blog and the rest of the marketing surface are served from
 * homzlist.com; the seller and admin apps are separate subdomains. A bare
 * `/legal/terms` from the seller app resolves to seller.homzlist.com/legal/terms,
 * which the middleware does not serve — it redirects to /login. So these links
 * have to be absolute onto the public host.
 *
 * DERIVED, not configured. This used to read `NEXT_PUBLIC_APP_URL`, which Next
 * inlines at BUILD time — so on a deployment where that variable is not set,
 * every one of these links was literally built as `http://localhost:3000/...`
 * and shipped that way. Nothing about the running site could correct it.
 * Stripping the subdomain off the host we are actually on is right on
 * localhost, on a LAN IP, on a preview URL and on the real domain, with nothing
 * to configure and nothing to keep in sync.
 *
 * The label list matches middleware's `getZone` — those are the only two
 * non-public hosts, so anything else is already the public host.
 */
export function publicOrigin(): string {
  if (typeof window !== "undefined") {
    const { protocol, host } = window.location;
    return `${protocol}//${host.replace(/^(seller|account)\./i, "")}`;
  }
  return configuredPublicOrigin();
}

/**
 * The server-render fallback: there is no address bar during SSR.
 *
 * `NEXT_PUBLIC_APP_URL` first because local .env.local sets it to the dev
 * origin; then `NEXT_PUBLIC_SITE_URL`; then the SAME literal default
 * `lib/seo/schema.ts` `siteUrl()` uses, so a link and the canonical of the page
 * it points at can never disagree. Defaulting to localhost here is what made an
 * unconfigured deployment render localhost links — the production domain is the
 * only sane default for a build with nothing set.
 */
export function configuredPublicOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://homzlist.com").replace(/\/$/, "");
}

/**
 * An absolute URL for a page that only exists on the PUBLIC host.
 *
 * Safe inside an event handler, where `window` always exists. For an `href`
 * RENDERED into markup use `usePublicHref` instead — calling this during render
 * would produce one string on the server and another in the browser, which is a
 * hydration mismatch.
 */
export function publicHref(path: string): string {
  return `${publicOrigin()}${path}`;
}


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

/**
 * A unique key for one user-initiated action, safe on every origin.
 *
 * `crypto.randomUUID()` only exists in a SECURE context — https, or localhost.
 * On plain http (a LAN address, `seller.lvh.me`, a staging box without TLS) it
 * is simply not there, and calling it throws. That threw inside an effect, React
 * unmounted the tree, and the whole screen fell into the error boundary: one
 * missing browser API took out the entire Send Inquiry sheet.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
