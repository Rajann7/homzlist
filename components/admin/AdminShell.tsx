"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import type { NavEntry } from "@/lib/admin/nav";
import type { TileKey } from "@/lib/admin/dashboard";
import { AdminSearch } from "./AdminSearch";
import { AdminBell, type BellItem } from "./AdminBell";
import { AdminBanners } from "./AdminBanners";

/**
 * The global admin shell (P13 Part A, repeated verbatim in P14/P15).
 *
 * Built to designs/P13-14-15's shell markup, measurement for measurement. The
 * design's three device states are widths of its own frame — mobile 390, tablet
 * 768, desktop 1440 — so they map to: default / `md:` / `desktop:` (the 1440px
 * breakpoint added in tailwind.config.ts).
 *
 *   sidebar   visible from tablet up (`showSidebar = !mobile`), 240px → 64px collapsed
 *   header    56px · breadcrumbs + search from tablet up · bell · "N online"
 *             DESKTOP-only and Super-only (`superWide = !mobile && !tablet`)
 *   main      the SCROLL CONTAINER (the design's shell is `overflow:hidden` with
 *             `<main style="flex:1;overflow-y:auto">`), padded 16 mobile / 24 up,
 *             max-width 1200 centred
 *   mobile    a bottom drawer with a grabber — no header, no footer, just the nav
 *
 * `main` owning the scroll is not cosmetic: A4's action bar is `sticky bottom:0`
 * against it, which only works if the page itself does not scroll.
 */

export interface ShellStaff {
  id: string;
  name: string;
  email: string;
  level: "staff" | "admin" | "super";
  levelLabel: string;
}

export interface OnlineStaff {
  name: string;
  level: string;
}

interface Props {
  staff: ShellStaff;
  nav: NavEntry[];
  badges: Partial<Record<TileKey, number>>;
  online: OnlineStaff[];
  bell: BellItem[];
  env: string | null;
  /** `maintenance_settings` — drives the design's maintenance banner. */
  maintenance: { enabled: boolean; since: string | null } | null;
  /** `flags` capability (Super only) — whether the banner offers "Turn off". */
  canLiftMaintenance: boolean;
  children: React.ReactNode;
}

/** The design's three online-presence circle colours, as tokens. */
const ONLINE_DOT = ["var(--accent)", "var(--info)", "var(--warning)"];

const ROLE_CHIP: Record<ShellStaff["level"], { bg: string; fg: string }> = {
  super: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  admin: { bg: "var(--info-soft)", fg: "var(--info)" },
  staff: { bg: "var(--surface-2)", fg: "var(--ink-secondary)" },
};

/** Breadcrumb trail from the path — "Queues › Listings" (13px, ink3, accent links). */
function crumbsFor(pathname: string, nav: NavEntry[]): Array<{ label: string; href?: string }> {
  if (pathname === "/") return [{ label: "Dashboard" }];
  for (const entry of nav) {
    if (entry.type === "item" && entry.href === pathname) return [{ label: entry.label }];
    if (entry.type === "group") {
      const hit = entry.children.find((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
      if (hit) {
        const trail: Array<{ label: string; href?: string }> = [{ label: entry.label }];
        trail.push(pathname === hit.href ? { label: hit.label } : { label: hit.label, href: hit.href });
        return trail;
      }
    }
    if (entry.type === "item" && pathname.startsWith(entry.href + "/")) {
      return [{ label: entry.label, href: entry.href }, { label: "Detail" }];
    }
  }
  return [{ label: "Admin" }];
}

export function AdminShell({ staff, nav, badges, online, bell, env, maintenance, canLiftMaintenance, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of nav) if (e.type === "group") init[e.key] = e.children.some((c) => pathname.startsWith(c.href));
    return init;
  });
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Route change closes the mobile drawer — a nav tap must not leave it hanging.
  useEffect(() => setDrawer(false), [pathname]);

  useEffect(() => {
    const t = (localStorage.getItem("hz-admin-theme") as "light" | "dark") ?? "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    // Theme is a UI-only preference, so localStorage is the right home for it
    // (CLAUDE.md rule 3 bans business data there, not display prefs).
    localStorage.setItem("hz-admin-theme", next);
    document.documentElement.dataset.theme = next;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        setAvatarMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Doc3 §1.1: a 30-minute session with a 2-hour idle rule. The heartbeat both
   * keeps a working admin signed in and detects the moment a Super Admin removes
   * the seat — a revoked session must not sit on screen looking usable.
   */
  useEffect(() => {
    let stop = false;
    const beat = async () => {
      try {
        const r = await fetch("/api/v1/admin/auth/session", { method: "POST", cache: "no-store" });
        const j = await r.json();
        if (!stop && j?.data?.signedIn === false) router.replace(`/login?error=${j.data.reason ?? "expired"}`);
      } catch {
        /* offline — the banner covers it; never sign someone out over a dropped beat */
      }
    };
    const id = setInterval(beat, 5 * 60 * 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [router]);

  const crumbs = crumbsFor(pathname, nav);
  const railWidth = collapsed ? 64 : 240;
  const chip = ROLE_CHIP[staff.level];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const navRows = (
    // Design: `padding:8px 8px 16px`.
    <nav className="flex flex-col gap-[2px] px-2 pb-4 pt-2" aria-label="Admin sections">
      {nav.map((entry) =>
        entry.type === "item" ? (
          <Link
            key={entry.href}
            href={entry.href}
            className="admin-nav-row"
            data-active={isActive(entry.href) || undefined}
            data-collapsed={collapsed && !drawer ? "" : undefined}
            title={collapsed && !drawer ? entry.label : undefined}
          >
            {isActive(entry.href) && <span className="admin-nav-bar" />}
            <Icon name={entry.icon} size={20} />
            {(!collapsed || drawer) && <span className="truncate">{entry.label}</span>}
            {(!collapsed || drawer) && entry.badgeKey && badges[entry.badgeKey] ? (
              <span className="admin-nav-badge">{badges[entry.badgeKey]}</span>
            ) : null}
          </Link>
        ) : (
          <div key={entry.key} className="flex flex-col gap-[2px]">
            <button
              type="button"
              className="admin-nav-row"
              onClick={() => setOpen((o) => ({ ...o, [entry.key]: !o[entry.key] }))}
              aria-expanded={Boolean(open[entry.key])}
              data-collapsed={collapsed && !drawer ? "" : undefined}
              title={collapsed && !drawer ? entry.label : undefined}
            >
              <Icon name={entry.icon} size={20} />
              {(!collapsed || drawer) && <span className="truncate">{entry.label}</span>}
              {(!collapsed || drawer) && (
                <span className="ml-auto" style={{ color: "var(--ink-tertiary)" }}>
                  <Icon name={open[entry.key] ? "chevron-up" : "chevron-down"} size={16} />
                </span>
              )}
            </button>
            {(!collapsed || drawer) &&
              open[entry.key] &&
              entry.children.map((c) => (
                <Link key={c.href} href={c.href} className="admin-nav-row admin-nav-child" data-active={isActive(c.href) || undefined}>
                  {isActive(c.href) && <span className="admin-nav-bar" />}
                  <span className="truncate">{c.label}</span>
                  {c.badgeKey && badges[c.badgeKey] ? <span className="admin-nav-badge">{badges[c.badgeKey]}</span> : null}
                </Link>
              ))}
          </div>
        ),
      )}
    </nav>
  );

  // Design: `wm(18)` in the sidebar — 18px, 700, letter-spacing -0.02em, with the
  // ADMIN chip at 11px/600/0.3px on surface-2, radius 4, padding 2px 6px.
  const brand = (
    <div className="flex min-w-0 flex-1 items-center gap-[6px]">
      <span className="text-[18px] font-bold tracking-[-0.02em]">
        <span style={{ color: "var(--ink-primary)" }}>Homz</span>
        <span style={{ color: "var(--accent)" }}>List</span>
      </span>
      <span
        className="rounded-4 px-[6px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.3px]"
        style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}
      >
        Admin
      </span>
    </div>
  );

  // Design: padding 10px 12px, gap 8, border-top divider; role chip is a pill in
  // uppercase with margin-top 3.
  const footer = (
    <div className="mt-auto flex items-center gap-2 border-t px-3 py-[10px]" style={{ borderColor: "var(--divider)" }}>
      <Avatar name={staff.name} size={32} />
      {(!collapsed || drawer) && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {staff.name}
          </div>
          <span
            className="mt-[3px] inline-block rounded-full px-[6px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.3px]"
            style={{ background: chip.bg, color: chip.fg }}
          >
            {staff.levelLabel}
          </span>
        </div>
      )}
      {(!collapsed || drawer) && <LogoutButton />}
    </div>
  );

  return (
    // Design: `height:100%;width:100%;display:flex;overflow:hidden`. The page does
    // not scroll — `main` does.
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: "var(--page)" }}>
      {/* SIDEBAR (tablet + desktop) — `showSidebar = !mobile` */}
      <aside
        className="admin-sidebar hidden shrink-0 flex-col border-r md:flex"
        style={{
          width: railWidth,
          borderColor: "var(--divider)",
          background: "var(--surface-1)",
          transition: "width .2s cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div
          className="flex h-14 flex-none items-center gap-2 border-b px-3"
          style={{ borderColor: "var(--divider)" }}
        >
          {(!collapsed || drawer) && brand}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-7 w-7 flex-none place-items-center rounded-6"
            style={{ color: "var(--ink-tertiary)" }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{navRows}</div>
        {footer}
      </aside>

      {/* MOBILE DRAWER — the design's is a bottom sheet with a grabber and the nav.
          No header, no close button, no footer. */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto rounded-t-16 px-2 pb-6 pt-2"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="flex h-9 items-center justify-center">
              <div className="h-1 w-9 rounded-full" style={{ background: "var(--border)" }} />
            </div>
            {navRows}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* HEADER — 56px, gap 12, padding 0 16, border-bottom divider. Not sticky:
            it sits outside the scroll container, which `main` is. */}
        <header
          className="flex h-14 flex-none items-center gap-3 border-b px-4"
          style={{ borderColor: "var(--divider)", background: "var(--surface-1)" }}
        >
          <button
            type="button"
            className="grid h-9 w-9 flex-none place-items-center md:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            style={{ color: "var(--ink-primary)" }}
          >
            <Icon name="menu" size={22} />
          </button>

          <ol className="hidden min-w-0 items-center gap-[6px] overflow-hidden text-[13px] md:flex" style={{ color: "var(--ink-tertiary)" }}>
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-[6px]">
                {i > 0 && <span aria-hidden>›</span>}
                {c.href ? (
                  <Link href={c.href} style={{ color: "var(--accent)" }}>
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate">{c.label}</span>
                )}
              </li>
            ))}
          </ol>

          {/* The design centres the search between two flex:1 spacers. */}
          <div className="hidden flex-1 md:block" />
          <AdminSearch />
          <div className="hidden flex-1 md:block" />

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <AdminBell items={bell} />

            {/* `superWide = super && !mobile && !tablet` — DESKTOP only. */}
            {staff.level === "super" && online.length > 0 && (
              <div className="hidden items-center gap-[6px] px-1 desktop:flex" title={online.map((o) => o.name).join(", ")}>
                <div className="flex">
                  {/* The design's cluster is three plain 22px circles with a presence
                      dot — not the Avatar component (whose sizes are locked to the
                      Doc1 scale, and which would draw initials the design doesn't
                      show). Its three literal colours ARE accent / info / warning. */}
                  {online.slice(0, 3).map((o, i) => (
                    <span
                      key={o.name}
                      className="relative block h-[22px] w-[22px] rounded-full"
                      style={{
                        background: ONLINE_DOT[i] ?? "var(--accent)",
                        border: "2px solid var(--surface-1)",
                        marginLeft: i ? -6 : 0,
                      }}
                    >
                      <span
                        className="absolute -bottom-[1px] -right-[1px] h-[7px] w-[7px] rounded-full"
                        style={{ background: "var(--accent)", border: "1.5px solid var(--surface-1)" }}
                      />
                    </span>
                  ))}
                </div>
                <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {online.length} online
                </span>
              </div>
            )}

            {env && (
              <span
                className="rounded-4 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3px] text-white"
                style={{ background: "var(--error)" }}
              >
                {env}
              </span>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="grid h-10 w-10 flex-none place-items-center rounded-8"
              style={{ color: "var(--ink-primary)" }}
              aria-label={theme === "light" ? "Switch to dark" : "Switch to light"}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} size={20} />
            </button>

            <div className="relative">
              <button type="button" onClick={() => setAvatarMenu((v) => !v)} aria-label="Account menu" aria-expanded={avatarMenu}>
                <Avatar name={staff.name} size={32} />
              </button>
              {avatarMenu && (
                <>
                  <button type="button" className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setAvatarMenu(false)} />
                  <div
                    className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-12 border py-1"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "var(--shadow-3, 0 8px 24px rgba(0,0,0,.16))" }}
                  >
                    <div className="px-3 py-2">
                      <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                        {staff.name}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                        {staff.email}
                      </div>
                    </div>
                    <div className="h-px" style={{ background: "var(--divider)" }} />
                    <Link href="/staff" className="block px-3 py-2 text-[15px]" style={{ color: "var(--ink-primary)" }}>
                      My profile
                    </Link>
                    <LogoutRow />
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Maintenance, then offline — the design's order, both between the header
            and the scroll container. */}
        <AdminBanners maintenance={maintenance} canLiftMaintenance={canLiftMaintenance} />

        {/* THE SCROLL CONTAINER. Inner pad 16 mobile / 24 up, max-width 1200 centred
            — the design's `mainPadStyle`. */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--page)" }}>
          <div className="mx-auto w-full max-w-[1200px] p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/v1/admin/auth/session", { method: "DELETE", cache: "no-store" });
    router.replace("/login");
  };
}

function LogoutButton() {
  const logout = useLogout();
  return (
    <button
      type="button"
      onClick={logout}
      className="grid h-7 w-7 shrink-0 place-items-center"
      style={{ color: "var(--ink-tertiary)" }}
      aria-label="Log out"
      title="Log out"
    >
      <Icon name="log-out" size={18} />
    </button>
  );
}

function LogoutRow() {
  const logout = useLogout();
  return (
    <button type="button" onClick={logout} className="block w-full px-3 py-2 text-left text-[15px]" style={{ color: "var(--error)" }}>
      Log out
    </button>
  );
}
