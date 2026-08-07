"use client";

/**
 * The sidebar's nav rows — template 300-377 (`navConfig` + `navEl`).
 *
 * Two things here are the design's and must not drift: the ORDER and GROUPING
 * of the items (Dashboard · Queues ▸ · Users · Listings · Payments · Finance ·
 * Plans ▸ · Master Data · CMS · Templates · Support ▸ · [Staff] · Analytics ·
 * [Audit Log] · System ▸), and the fact that rows the role cannot see are
 * DROPPED, along with any group left empty (template 331-335).
 *
 * The badge counts are real server counts passed in as props — never a literal.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./icons";
import { canSee, type AdminRole } from "./admin-context";
import { SCREEN_ROUTES } from "./screens";

export type NavCounts = Partial<Record<string, number>>;

type NavItem = { type: "item"; icon: AdminIconName; label: string; screen: string };
type NavGroup = {
  type: "group";
  key: string;
  icon: AdminIconName;
  label: string;
  children: { label: string; screen: string }[];
};
type NavNode = NavItem | NavGroup;

/** template 300-337 — navConfig() */
export function navConfig(role: AdminRole): NavNode[] {
  const sup = role === "super";
  const groups: NavNode[] = [
    { type: "item", icon: "home", label: "Dashboard", screen: "dashboard" },
    {
      type: "group",
      key: "queues",
      icon: "layers",
      label: "Queues",
      children: [
        { label: "Listings", screen: "listings" },
        { label: "Requirements", screen: "requirements" },
        { label: "Boosts", screen: "boosts" },
        { label: "Verifications", screen: "verifications" },
        { label: "Appeals", screen: "appeals" },
        { label: "Reports", screen: "reports" },
      ],
    },
    { type: "item", icon: "users", label: "Users", screen: "users" },
    { type: "item", icon: "list", label: "Listings", screen: "listingsMaster" },
    { type: "item", icon: "card", label: "Payments", screen: "payments" },
    { type: "item", icon: "rupee", label: "Finance", screen: "finance" },
    {
      type: "group",
      key: "plans",
      icon: "tag",
      label: "Plans",
      children: [
        { label: "Plans", screen: "plans" },
        { label: "Coupons", screen: "coupons" },
        { label: "Grants", screen: "grants" },
      ],
    },
    { type: "item", icon: "db", label: "Master Data", screen: "masterData" },
    { type: "item", icon: "file", label: "CMS", screen: "cms" },
    { type: "item", icon: "tmpl", label: "Templates", screen: "templates" },
    {
      type: "group",
      key: "support",
      icon: "buoy",
      label: "Support",
      children: [
        { label: "Tickets", screen: "tickets" },
        { label: "Disputes", screen: "disputes" },
      ],
    },
  ];
  if (sup) groups.push({ type: "item", icon: "shield", label: "Staff", screen: "staff" });
  groups.push({ type: "item", icon: "chart", label: "Analytics", screen: "analytics" });
  if (sup) groups.push({ type: "item", icon: "scroll", label: "Audit Log", screen: "audit" });
  groups.push({
    type: "group",
    key: "system",
    icon: "settings",
    label: "System",
    children: [
      { label: "Cron & Status", screen: "cron" },
      { label: "Settings & Flags", screen: "settings" },
      { label: "Trash", screen: "trash" },
      { label: "Exports", screen: "exports" },
    ],
  });

  return groups
    .map((gp) => {
      if (gp.type === "item") return canSee(role, gp.screen) ? gp : null;
      const children = gp.children.filter((c) => canSee(role, c.screen));
      return children.length ? { ...gp, children } : null;
    })
    .filter((x): x is NavNode => x !== null);
}

/** template 344 — rowStyle(active) */
function rowStyle(active: boolean, collapsed: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: collapsed ? "9px 0" : "9px 10px",
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: 8,
    cursor: "pointer",
    position: "relative",
    color: active ? "var(--ink1)" : "var(--ink2)",
    background: active ? "var(--accentSoft)" : "transparent",
    fontSize: 15,
    fontWeight: 400,
    marginBottom: 2,
  } as const;
}

/** template 345 — the 3px accent rail on the active row */
function ActiveBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      style={{
        position: "absolute",
        left: 0,
        top: 6,
        bottom: 6,
        width: 3,
        borderRadius: 999,
        background: "var(--accent)",
      }}
    />
  );
}

/** template 346 — badgeEl(b) */
function NavBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      style={{
        marginLeft: "auto",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        background: "var(--s3)",
        color: "var(--ink2)",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count}
    </span>
  );
}

export function AdminNav({
  role,
  activeScreen,
  counts,
  collapsed,
  openGroups,
  onToggleGroup,
  onNavigate,
}: {
  role: AdminRole;
  activeScreen: string;
  counts: NavCounts;
  collapsed: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  onNavigate?: () => void;
}) {
  const isActive = (screen: string) =>
    activeScreen === screen || (screen === "listings" && activeScreen === "review");

  const rows: ReactNode[] = [];

  navConfig(role).forEach((n, i) => {
    if (n.type === "item") {
      const active = isActive(n.screen);
      rows.push(
        <Link
          key={`i${i}`}
          href={SCREEN_ROUTES[n.screen]}
          onClick={onNavigate}
          style={rowStyle(active, collapsed)}
        >
          <ActiveBar active={active} />
          <span
            style={{
              flex: "none",
              display: "flex",
              color: active ? "var(--accent)" : "inherit",
            }}
          >
            <AdminIcon name={n.icon} />
          </span>
          {collapsed ? null : (
            <span
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {n.label}
            </span>
          )}
          {collapsed ? null : <NavBadge count={counts[n.screen]} />}
        </Link>,
      );
      return;
    }

    const open = !!openGroups[n.key];
    rows.push(
      // A disclosure, not a div: this was a `<div onClick>`, so Tab skipped
      // every group and the screens inside a closed group were unreachable
      // without a mouse. `rowStyle` already supplies the design's padding,
      // colours and layout; the reset below only removes what a <button> adds
      // of its own, so it renders identically.
      <button
        type="button"
        key={`g${i}`}
        onClick={() => onToggleGroup(n.key)}
        aria-expanded={collapsed ? false : open}
        style={{
          ...rowStyle(false, collapsed),
          width: "100%",
          border: 0,
          font: "inherit",
          fontSize: 15,
          textAlign: "left",
          appearance: "none",
        }}
      >
        <span style={{ flex: "none", display: "flex" }}>
          <AdminIcon name={n.icon} />
        </span>
        {collapsed ? null : <span style={{ flex: 1, whiteSpace: "nowrap" }}>{n.label}</span>}
        {collapsed ? null : (
          <span
            style={{
              color: "var(--ink3)",
              display: "flex",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform .2s",
            }}
          >
            <AdminIcon name="chevD" size={16} />
          </span>
        )}
      </button>,
    );

    if (open && !collapsed) {
      n.children.forEach((c, j) => {
        const active = isActive(c.screen);
        rows.push(
          <Link
            key={`g${i}c${j}`}
            href={SCREEN_ROUTES[c.screen]}
            onClick={onNavigate}
            style={{
              ...rowStyle(active, false),
              padding: "8px 10px 8px 34px",
              fontSize: 14,
            }}
          >
            <ActiveBar active={active} />
            <span style={{ flex: 1, whiteSpace: "nowrap" }}>{c.label}</span>
            <NavBadge count={counts[c.screen]} />
          </Link>,
        );
      });
    }
  });

  return <>{rows}</>;
}
