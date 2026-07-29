"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { feedApi } from "@/lib/feed/client";
import { useRole } from "./RoleContext";

/**
 * BottomNav — P3 canonical (CLAUDE.md rule 6 / Doc6 §5.3). THE bottom nav, used
 * on every screen that has one. 52px + safe-area, surface-1, top hairline, 5
 * equal items, 26px icon-only (Instagram style — Doc1 §3). Active = filled +
 * ink-primary; inactive = outline + ink-tertiary. position: fixed; content sits
 * above it via the `pb-nav-safe` utility on the page/scroll container.
 *
 * Feature-toggle safe: if an item is disabled by admin flag, it renders nothing
 * and the row reflows (Doc6 §9.1) — pass a filtered `items` list.
 */

export interface NavItem {
  name: IconName;
  href: string;
  label: string;
  /** Match rule: exact for tabs; prefix for sections. */
  match?: (pathname: string) => boolean;
  /** Small accent dot (e.g. Requirements has new matches). */
  dot?: boolean;
  /** Red count badge (e.g. Messages unread). 0 = hidden. */
  badge?: number;
}

// Canonical 5 (P3): home · search · plus (create) · message (chat) · user (profile).
// (Messages sits in the nav; Saved moved to the feed header top-right.)
// Icons are the `nav-*` set (Instagram geometry) — nav-only names, so the shared
// home/search/plus/message/user glyphs the rest of the app draws are untouched.
export const DEFAULT_NAV: NavItem[] = [
  { name: "nav-home", href: "/", label: "Home", match: (p) => p === "/" },
  { name: "nav-search", href: "/search", label: "Search", match: (p) => p.startsWith("/search") },
  { name: "nav-create", href: "/create", label: "Create", match: (p) => p.startsWith("/create") },
  { name: "nav-message", href: "/messages", label: "Messages", match: (p) => p.startsWith("/messages") },
  { name: "nav-profile", href: "/profile", label: "Profile", match: (p) => p.startsWith("/profile") },
];

export function BottomNav({ items }: { items?: NavItem[] }) {
  const pathname = usePathname() ?? "/";
  const role = useRole();
  // A BUILDER has no Search: they post projects and answer requirements, and
  // browse/explore is an Owner/Broker product (Rajan, 29 Jul 2026). Four items,
  // and the row reflows by itself because every item is `flex-1` — the same
  // feature-toggle behaviour documented above.
  //
  // Applied here rather than at each call site so a caller that passes its own
  // list (the feed does, to ride the unread badge on Messages) can't reintroduce
  // the icon — which would have been the very first screen a builder opens.
  const base = (items ?? DEFAULT_NAV).filter((i) => !(role === "builder" && i.name === "nav-search"));

  // Unread messages badge. The feed passes its own count (it already reads
  // /feed/badges for the header bell), so a caller-supplied `badge` always wins.
  // Every OTHER screen used to render the nav with no count at all — the icon
  // was silently lying on profile, listings, search, chat. This fills that in
  // from the same server count (unread threads + pending requests), re-read when
  // the route changes and when the tab regains focus, so it clears after the
  // user has been through the inbox. Guests get 0 from the endpoint.
  const wantsFetch = base.some((i) => i.name === "nav-message" && i.badge === undefined);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!wantsFetch) return;
    let alive = true;
    const read = () => feedApi.badges().then((r) => { if (alive && r.ok) setUnread(r.data.messages); });
    void read();
    const onVis = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, [wantsFetch, pathname]);

  const resolved = base.map((i) =>
    i.name === "nav-message" && i.badge === undefined ? { ...i, badge: unread } : i,
  );

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // In normal flow (shrink-0) at the bottom of a fixed-height shell → always
        // visible, never scrolls, mobile-address-bar-proof (CLAUDE.md rule 6).
        "chrome z-nav flex h-[calc(52px+env(safe-area-inset-bottom))] w-full shrink-0",
        "items-start border-t border-border bg-surface-1 pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {resolved.map((item) => {
        const active = item.match ? item.match(pathname) : pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className="grid h-[52px] flex-1 place-items-center outline-none focus-visible:outline-none"
          >
            <span
              className={cn(
                "relative grid place-items-center transition-transform duration-150 ease-out-quart active:scale-90",
                active ? "text-ink-primary" : "text-ink-tertiary",
              )}
            >
              <Icon name={item.name} size={26} filled={active} strokeWidth={active ? 2 : 1.7} />
              {item.dot && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />}
              {(item.badge ?? 0) > 0 && (
                <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-semibold text-white">
                  {item.badge! > 9 ? "9+" : item.badge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
