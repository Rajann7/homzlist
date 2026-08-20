"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark } from "./Header";
import { useRole } from "./RoleContext";
import { DEFAULT_NAV } from "./BottomNav";
import { HUB_GROUPS, dashItem } from "@/lib/dashboard/items";
import { fetchDashboardCounts, type DashboardCounts } from "@/lib/dashboard/client";

/**
 * SideNav — the console chrome's left sidebar (designs/desktop-tablet/01-shell.html).
 *
 * DESKTOP/TABLET ONLY. It is `hidden md:flex`, so below 768 it does not exist
 * and the mobile app is byte-for-byte what it was: the bottom nav plus the two
 * sheets. At 768–1199 it is the 72px icon rail, at 1200+ the 240px sidebar.
 *
 * It owns NO destinations of its own. Group 1 is `DEFAULT_NAV` (so the builder
 * rule — no Search — keeps working from the one place that already enforces it),
 * groups 2–4 are `HUB_GROUPS` / `DASH_ITEMS` (so the sidebar and the mobile
 * Dashboard hub can never drift apart), and group 5 is the profile sheet's own
 * rows, labels and hrefs verbatim. Counts come from `/api/v1/dashboard` — the
 * same call the hub makes, no new endpoint.
 */

/**
 * Console chrome lives on these first segments (00-SPEC.md §2 B). Everything
 * else on the seller host — the feed, search, a property, a story, blog, legal —
 * is browse chrome and gets no sidebar.
 */
const CONSOLE_PREFIXES = [
  "/dashboard", "/listings", "/leads", "/requirements", "/create", "/projects/new",
  "/plans", "/payments", "/checkout", "/boost", "/saved", "/activity", "/notifications",
  "/messages", "/profile", "/settings", "/help", "/visits", "/proposals", "/archived",
];

export function isConsoleRoute(pathname: string): boolean {
  return CONSOLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

interface SideRow {
  icon: IconName;
  label: string;
  href: string;
  /** Which `/api/v1/dashboard` count rides this row, if any. */
  count?: keyof DashboardCounts;
  urgent?: boolean;
}

/** The profile sheet's rows — same icons, same labels, same hrefs. */
const YOU_ROWS: SideRow[] = [
  { icon: "bookmark", label: "Saved", href: "/saved" },
  { icon: "clock", label: "Your activity", href: "/activity" },
  { icon: "file", label: "Drafts", href: "/create/drafts" },
  { icon: "archive", label: "Archived", href: "/archived" },
  { icon: "help-circle", label: "Help", href: "/help" },
  { icon: "settings", label: "Settings", href: "/settings" },
];

export function SideNav() {
  const pathname = usePathname() ?? "/";
  const role = useRole();

  // Same shape-hint rule as the bottom nav: a role means "this is the seller
  // host", every route still authorises itself server-side.
  const show = role !== null && isConsoleRoute(pathname);

  /**
   * The sidebar itself is hidden by CSS (`hidden md:flex`), which is what keeps
   * the desktop/mobile switch free of a hydration flash. Its COUNTS request must
   * not be: below 768 nothing here is on screen, and a phone must not spend a
   * round trip on an invisible element. So the fetch — and only the fetch — is
   * gated on the same 768 the class is, watched live so a resized window fills
   * in without a reload.
   */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  useEffect(() => {
    if (!show || !wide) return;
    let alive = true;
    void fetchDashboardCounts().then((r) => { if (alive && r.ok) setCounts(r.data.counts); });
    return () => { alive = false; };
  }, [show, wide, pathname]);

  if (!show) return null;

  // Group 1 — the bottom nav's own Home + Search, builder rule included.
  const top: SideRow[] = DEFAULT_NAV
    .filter((i) => i.name === "nav-home" || i.name === "nav-search")
    .filter((i) => !(role === "builder" && i.name === "nav-search"))
    .map((i) => ({
      icon: (i.name === "nav-home" ? "home" : "search") as IconName,
      label: i.label,
      href: i.href,
    }));

  const groups: { title?: string; rows: SideRow[] }[] = [
    { rows: top },
    ...HUB_GROUPS.map((g) => ({
      title: g.title,
      rows: [
        // Dashboard heads the first hub group — on mobile it IS the hub screen,
        // on desktop the sidebar replaces the sheet but the screen still exists.
        ...(g.title === HUB_GROUPS[0].title
          ? [{ icon: "grid" as IconName, label: "Dashboard", href: "/dashboard" }]
          : []),
        ...g.items.flatMap(({ key }) => {
          const it = dashItem(key);
          if (!it) return [];
          return [{
            icon: it.icon,
            label: it.label,
            href: it.href,
            // `plan` is a NAME, not a number — the hub renders it as a text
            // badge on a 470px tile; a 72px rail has nowhere to put it.
            count: it.count && it.count !== "plan" ? (it.count as keyof DashboardCounts) : undefined,
            urgent: it.urgent,
          }];
        }),
      ],
    })),
    { title: "You", rows: YOU_ROWS },
  ];

  return (
    <aside
      aria-label="Sections"
      className={cn(
        "chrome z-header hidden shrink-0 flex-col border-r border-border bg-surface-1",
        "md:flex md:w-[72px] lg:w-[240px]",
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-divider lg:justify-start lg:px-[18px]">
        {/* Rail: the wordmark's two initials. Sidebar: the real wordmark. */}
        <Link href="/" aria-label="HomzList">
          <span aria-hidden className="chrome select-none text-20 font-bold tracking-tight lg:hidden">
            <span className="text-ink-primary">H</span>
            <span className="text-accent">L</span>
          </span>
          <Wordmark className="hidden lg:inline-block" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain p-2 lg:px-2.5 lg:pb-4 lg:pt-2.5">
        {groups.map((g, gi) => (
          <div
            key={g.title ?? `g${gi}`}
            className={cn(
              gi > 0 && "mt-1.5 border-t border-divider pt-1.5 lg:mt-0 lg:border-t-0 lg:pt-0",
            )}
          >
            {g.title && (
              <h2 className="mx-2 mb-1.5 mt-3.5 hidden text-11 font-semibold uppercase tracking-[0.06em] text-ink-tertiary lg:block">
                {g.title}
              </h2>
            )}
            {g.rows.map((r) => (
              <Row key={r.href + r.label} row={r} counts={counts} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-divider p-2.5">
        <Row
          row={{ icon: "user", label: "Profile", href: "/profile" }}
          counts={null}
          pathname={pathname}
        />
      </div>
    </aside>
  );
}

function Row({
  row, counts, pathname,
}: {
  row: SideRow;
  counts: DashboardCounts | null;
  pathname: string;
}) {
  const active = row.href === "/" ? pathname === "/" : pathname === row.href || pathname.startsWith(row.href + "/");
  const value = row.count && counts ? counts[row.count] : null;
  const n = typeof value === "number" && value > 0 ? value : null;

  return (
    <Link
      href={row.href}
      aria-current={active ? "page" : undefined}
      title={row.label}
      className={cn(
        "relative flex items-center gap-[11px] rounded-8 text-15",
        "h-[42px] justify-center lg:h-[38px] lg:justify-start lg:px-2.5",
        active ? "bg-accent-soft font-semibold text-accent" : "text-ink-secondary",
      )}
    >
      <span className="grid shrink-0 place-items-center">
        <Icon name={row.icon} size={20} filled={active} strokeWidth={active ? 2 : 1.7} />
      </span>
      <span className="hidden min-w-0 flex-1 truncate lg:block">{row.label}</span>
      {n !== null && (
        <span
          className={cn(
            "grid h-[18px] min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
            "absolute right-2.5 top-1 lg:static",
            row.urgent ? "bg-error text-white" : "bg-accent text-on-accent",
          )}
        >
          {n}
        </span>
      )}
    </Link>
  );
}
