"use client";

/**
 * The admin shell — template 74-160 (markup) with 399-445 (`renderVals`).
 *
 * Three device bands, all from the design, none invented:
 *   mobile  (<768)      no sidebar; a bottom DRAWER behind the ☰ button; no
 *                       breadcrumbs; no header search box; main padding 16
 *   tablet  (768-1439)  sidebar 240 (64 collapsed); main padding 24
 *   desktop (≥1440)     as tablet, plus the "3 online" cluster, which the design
 *                       shows only for a SUPER admin on desktop
 *                       (`superWide = role==='super' && !mobile && !tablet`, 439)
 *
 * The header's bell / search / avatar surfaces are passed in as render props:
 * each is a specific surface TYPE in the design (right sheet · centred overlay ·
 * anchored dropdown) and each needs server data, so the screen that mounts the
 * shell supplies them.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminIcon } from "./icons";
import { useTheme } from "@/components/theme/ThemeProvider";
import { AdminNav, type NavCounts } from "./nav";
import { AdminToast } from "./toast";
import { useAdmin, SCREEN_TITLES, QUEUE_SCREENS } from "./admin-context";
import { screenForPath, SCREEN_ROUTES } from "./screens";
import Link from "next/link";

const SIDEBAR_PREF = "hz-admin-sidebar-collapsed";

/** template 406-408 — the wordmark, `Homz` in ink1 + `List` in accent. */
function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>
      <span style={{ color: "var(--ink1)" }}>Homz</span>
      <span style={{ color: "var(--accent)" }}>List</span>
    </div>
  );
}

/** template 433 — the role chip under the sidebar's admin name. */
function SidebarRoleChip({ role }: { role: "staff" | "admin" | "super" }) {
  const label = role === "super" ? "Super Admin" : role === "admin" ? "Admin" : "Staff";
  const bg =
    role === "super" ? "var(--accentSoft)" : role === "admin" ? "var(--infoSoft)" : "var(--s2)";
  const fg =
    role === "super" ? "var(--accent)" : role === "admin" ? "var(--info)" : "var(--ink2)";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: ".3px",
        textTransform: "uppercase",
        color: fg,
        background: bg,
        padding: "2px 6px",
        borderRadius: 999,
        display: "inline-block",
        marginTop: 3,
      }}
    >
      {label}
    </span>
  );
}

/** template 379-391 — crumbEl(). Queue screens sit under a non-clickable "Queues". */
function Crumbs({ screen }: { screen: string }) {
  const items: { label: string; href?: string; active?: boolean }[] = [];
  if (screen === "dashboard") {
    items.push({ label: "Dashboard", active: true });
  } else if (screen === "review") {
    items.push({ label: "Queues" });
    items.push({ label: "Listings", href: SCREEN_ROUTES.listings });
    items.push({ label: "Review", active: true });
  } else if (QUEUE_SCREENS.includes(screen)) {
    items.push({ label: "Queues" });
    items.push({ label: SCREEN_TITLES[screen] ?? screen, active: true });
  } else {
    items.push({ label: "Admin", href: SCREEN_ROUTES.dashboard });
    items.push({ label: SCREEN_TITLES[screen] ?? screen, active: true });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {items.map((c, i) => {
        const style = {
          color: c.active ? "var(--ink1)" : "var(--accent)",
          fontWeight: c.active ? 600 : 400,
          cursor: c.active || !c.href ? "default" : "pointer",
          whiteSpace: "nowrap",
        } as const;
        return (
          <Fragment key={i}>
            {i ? <span style={{ color: "var(--ink3)" }}>›</span> : null}
            {c.href ? (
              <Link href={c.href} style={style}>
                {c.label}
              </Link>
            ) : (
              <span style={style}>{c.label}</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export type AdminShellProps = {
  /** real, server-computed queue badge counts, keyed by screen */
  navCounts: NavCounts;
  /** unread admin_notifications count for the bell dot */
  unreadNotifications: number;
  /** maintenance_settings — the design's red banner across the top */
  maintenance: { on: boolean; since: string } | null;
  /** staff currently online, desktop + super only (template 439) */
  onlineStaff: { initials: string; color: string }[];
  onTurnOffMaintenance?: () => void;
  renderBell: (close: () => void) => ReactNode;
  renderSearch: (close: () => void) => ReactNode;
  renderAvatarMenu: (close: () => void) => ReactNode;
  children: ReactNode;
};

export function AdminShell({
  navCounts,
  unreadNotifications,
  maintenance,
  onlineStaff,
  onTurnOffMaintenance,
  renderBell,
  renderSearch,
  renderAvatarMenu,
  children,
}: AdminShellProps) {
  const { me, staging } = useAdmin();
  const { resolved, toggle } = useTheme();
  const pathname = usePathname() ?? SCREEN_ROUTES.dashboard;
  const screen = screenForPath(pathname);

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [overlay, setOverlay] = useState<"bell" | "search" | "avatar" | null>(null);
  const [offline, setOffline] = useState(false);
  const [groups, setGroups] = useState<Record<string, boolean>>({
    queues: true,
    plans: false,
    support: false,
    system: false,
  });

  // Sidebar width is a UI preference, so localStorage is the right home for it
  // (CLAUDE.md: UI-only prefs are fine there; business state never is).
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_PREF) === "1");
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_PREF, c ? "0" : "1");
      return !c;
    });
  }, []);

  // template 443 — the offline banner is a real connection state, not a demo flag.
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Close transient surfaces on navigation — template 272 (`go` clears overlay+drawer).
  useEffect(() => {
    setOverlay(null);
    setDrawer(false);
  }, [pathname]);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const toggleGroup = useCallback(
    (key: string) => setGroups((g) => ({ ...g, [key]: !g[key] })),
    [],
  );

  const navRows = (onNavigate?: () => void) => (
    <AdminNav
      role={me.role}
      activeScreen={screen}
      counts={navCounts}
      collapsed={collapsed && !drawer}
      openGroups={groups}
      onToggleGroup={toggleGroup}
      onNavigate={onNavigate}
    />
  );

  return (
    <div
      className="admin-root"
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        overflow: "hidden",
        background: "var(--page)",
        color: "var(--ink1)",
        position: "relative",
      }}
    >
      {/* SIDEBAR — tablet and desktop only (template 78, `showSidebar = !mobile`) */}
      <aside
        className="hidden md:flex"
        style={{
          width: collapsed ? 64 : 240,
          flex: "none",
          background: "var(--s1)",
          borderRight: "1px solid var(--divider)",
          flexDirection: "column",
          transition: "width .2s cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div
          style={{
            height: 56,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          {collapsed ? null : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <Wordmark size={18} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".3px",
                  color: "var(--ink3)",
                  background: "var(--s2)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ADMIN
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: 28,
              height: 28,
              flex: "none",
              border: "none",
              background: "transparent",
              color: "var(--ink3)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <AdminIcon name={collapsed ? "chevR" : "chevL"} size={18} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px 16px" }}>
          {navRows()}
        </nav>

        <div
          style={{
            flex: "none",
            borderTop: "1px solid var(--divider)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              flex: "none",
              borderRadius: 999,
              background: "linear-gradient(135deg,var(--accent),var(--info))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-inverse)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {me.initials}
          </div>
          {collapsed ? null : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)" }}>
                  {me.name}
                </div>
                <SidebarRoleChip role={me.role} />
              </div>
              <button
                type="button"
                onClick={() => setOverlay("avatar")}
                aria-label="Account menu"
                style={{
                  width: 28,
                  height: 28,
                  flex: "none",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink3)",
                  cursor: "pointer",
                }}
              >
                <AdminIcon name="logout" size={18} />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            height: 56,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
            borderBottom: "1px solid var(--divider)",
            background: "var(--s1)",
          }}
        >
          {/* ☰ — mobile only */}
          <button
            type="button"
            className="flex md:hidden"
            onClick={() => setDrawer((d) => !d)}
            aria-label="Menu"
            style={{
              width: 36,
              height: 36,
              border: "none",
              background: "transparent",
              color: "var(--ink1)",
              cursor: "pointer",
              flex: "none",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AdminIcon name="menu" size={22} />
          </button>

          {/* breadcrumbs + search box — tablet and desktop only */}
          <div className="hidden min-w-0 md:contents">
            <Crumbs screen={screen} />
            <div style={{ flex: 1 }} />
            <div
              onClick={() => setOverlay("search")}
              style={{
                width: "100%",
                maxWidth: 340,
                height: 40,
                background: "var(--s2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                color: "var(--ink3)",
                cursor: "text",
                flex: 1,
              }}
            >
              <AdminIcon name="search" size={18} />
              <span
                style={{
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Search phone, name, listing ID, payment ID…
              </span>
            </div>
          </div>
          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => setOverlay("bell")}
            aria-label="Notifications"
            style={{
              width: 40,
              height: 40,
              flex: "none",
              border: "none",
              background: "transparent",
              color: "var(--ink1)",
              cursor: "pointer",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <AdminIcon name="bell" size={20} />
            {unreadNotifications > 0 ? (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  background: "var(--error)",
                  color: "var(--ink-inverse)",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadNotifications}
              </span>
            ) : null}
          </button>

          {/* "3 online" — super admin, desktop band only (template 114/439) */}
          {me.role === "super" && onlineStaff.length > 0 ? (
            <div
              className="hidden desktop:flex"
              style={{ alignItems: "center", gap: 6, padding: "0 4px" }}
            >
              <div style={{ display: "flex" }}>
                {onlineStaff.map((s, i) => (
                  <div
                    key={i}
                    title={s.initials}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: s.color,
                      border: "2px solid var(--s1)",
                      marginLeft: i ? -6 : 0,
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        right: -1,
                        bottom: -1,
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: "var(--online)",
                        border: "1.5px solid var(--s1)",
                      }}
                    />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                {`${onlineStaff.length} online`}
              </span>
            </div>
          ) : null}

          {staging ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".3px",
                color: "var(--ink-inverse)",
                background: "var(--error)",
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              STAGING
            </span>
          ) : null}

          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            style={{
              width: 40,
              height: 40,
              flex: "none",
              border: "none",
              background: "transparent",
              color: "var(--ink1)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <AdminIcon name={resolved === "dark" ? "sun" : "moon"} size={20} />
          </button>

          <button
            type="button"
            onClick={() => setOverlay("avatar")}
            aria-label="Account"
            style={{
              width: 32,
              height: 32,
              flex: "none",
              borderRadius: 999,
              background: "linear-gradient(135deg,var(--accent),var(--info))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-inverse)",
              fontSize: 12,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            {me.initials}
          </button>
        </header>

        {maintenance?.on ? (
          <div
            style={{
              flex: "none",
              background: "var(--errorSoft)",
              color: "var(--ink1)",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--error)" }}>
              <AdminIcon name="alert" size={20} />
            </span>
            {`Maintenance mode is ON since ${maintenance.since} · Users see the maintenance page`}
            <span style={{ flex: 1 }} />
            {onTurnOffMaintenance ? (
              <span
                onClick={onTurnOffMaintenance}
                style={{ color: "var(--accent)", cursor: "pointer" }}
              >
                Turn off
              </span>
            ) : null}
          </div>
        ) : null}

        {offline ? (
          <div
            style={{
              flex: "none",
              background: "var(--warningSoft)",
              color: "var(--ink1)",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--warning)" }}>
              <AdminIcon name="offline" size={18} />
            </span>
            You&apos;re offline — actions will fail. Reconnect before approving.
          </div>
        ) : null}

        <main style={{ flex: 1, overflowY: "auto", background: "var(--page)" }}>
          <div
            className="p-4 md:p-6"
            style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* MOBILE DRAWER — the sidebar's nav as a bottom sheet (template 153-159) */}
      {drawer ? (
        <>
          <div
            onClick={() => setDrawer(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,.5)",
              zIndex: 40,
              animation: "fadeIn .2s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "85%",
              background: "var(--s1)",
              borderRadius: "16px 16px 0 0",
              zIndex: 41,
              overflowY: "auto",
              animation: "slideUp .3s cubic-bezier(0.2,0,0,1)",
              padding: "8px 8px 24px",
            }}
          >
            <div
              style={{
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: "var(--border)",
                }}
              />
            </div>
            {navRows(() => setDrawer(false))}
          </div>
        </>
      ) : null}

      {overlay === "bell" ? renderBell(closeOverlay) : null}
      {overlay === "search" ? renderSearch(closeOverlay) : null}
      {overlay === "avatar" ? renderAvatarMenu(closeOverlay) : null}

      <AdminToast />
    </div>
  );
}
