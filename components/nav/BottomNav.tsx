"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";

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
export const DEFAULT_NAV: NavItem[] = [
  { name: "home", href: "/", label: "Home", match: (p) => p === "/" },
  { name: "search", href: "/search", label: "Search", match: (p) => p.startsWith("/search") },
  { name: "plus", href: "/create", label: "Create", match: (p) => p.startsWith("/create") },
  { name: "message", href: "/messages", label: "Messages", match: (p) => p.startsWith("/messages") },
  { name: "user", href: "/profile", label: "Profile", match: (p) => p.startsWith("/profile") },
];

export function BottomNav({ items = DEFAULT_NAV }: { items?: NavItem[] }) {
  const pathname = usePathname() ?? "/";

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
      {items.map((item) => {
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
