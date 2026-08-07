"use client";

/**
 * A14 — Coupons. Template 1218-1240.
 *
 * Four chips, a table on tablet+ and a card list on mobile (template 1226), and
 * a scope column that says which products a code actually reaches.
 *
 * The status is DERIVED (migration 0102): a coupon is exhausted when its cap
 * fills and expired when its date passes. A stored status column is one nobody
 * remembers to flip at 500/500.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Badge,
  CopyBtn,
  GatedBtn,
  PageHead,
  SheetMenu,
  Shimmer,
  StatusBadge,
  ToolCol,
  UsageBar,
  useToast,
  usePanels,
} from "@/components/admin/ds";
import { Pager, useAdminList, ListError } from "@/components/admin/list";

export type CouponRow = {
  id: string;
  code: string;
  label: string | null;
  discount_type: string;
  discount_value: number;
  max_discount_paise: number | null;
  min_value_paise: number;
  applies_to: string;
  catalog_codes: string[];
  per_user_limit: number;
  usage_cap: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  usage_pct: number;
  status_key: string;
};

const FILTER_KEYS = ["applies", "from", "to"] as const;

/** template 1221 — Active · Scheduled · Expired · Exhausted */
const CHIPS: [key: string, label: string][] = [
  ["active", "Active"],
  ["scheduled", "Scheduled"],
  ["expired", "Expired"],
  ["exhausted", "Exhausted"],
];

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  exhausted: "Exhausted",
};

const rupees = (paise: number | null) =>
  paise === null || paise === undefined ? "—" : `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

/** "20% · max ₹200" / "₹50 flat" — the design's Discount cell. */
export function discountLabel(c: CouponRow): string {
  if (c.discount_type === "percent") {
    return c.max_discount_paise ? `${c.discount_value}% · max ${rupees(c.max_discount_paise)}` : `${c.discount_value}%`;
  }
  return `${rupees(c.discount_value)} flat`;
}

/** "₹999 plan only" / "All plans" — the design's Scope cell. */
export function scopeLabel(c: CouponRow, planNames: Record<string, string>): string {
  if (c.catalog_codes?.length) {
    return c.catalog_codes.map((code) => planNames[code] ?? code).join(", ");
  }
  return c.applies_to === "plans" ? "All plans" : c.applies_to === "boosts" ? "All boosts" : "Plans and boosts";
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export function CouponsScreen({ planNames }: { planNames: Record<string, string> }) {
  const toast = useToast();
  const { pushPanel, changed } = usePanels();
  const list = useAdminList<CouponRow>("coupons", FILTER_KEYS, "active");

  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [rowMenu, setRowMenu] = useState<CouponRow | null>(null);

  const tab = list.tab ?? "active";
  const rows = list.data?.rows ?? [];
  const counts = list.data?.tabCounts ?? {};

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/v1/admin/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    toast(json?.ok ? `${json.data?.summary} · logged` : (json?.error?.message ?? "That didn't go through"));
    if (json?.ok) list.reload();
  }

  const open = (c: CouponRow) => pushPanel("couponEdit", { id: c.id, code: c.code });

  return (
    <div>
      <PageHead
        title="Coupons"
        right={
          <GatedBtn
            label="+ New coupon"
            kind="primary"
            need="admin"
            onClick={() => pushPanel("couponEdit", { id: null, code: null })}
          />
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {CHIPS.map(([key, label]) => (
          <ChipCount key={key} label={label} count={counts[key] ?? 0} active={tab === key} onClick={() => list.setTab(key)} />
        ))}
      </div>

      {/* NO FILTER BAR. Template 1241 is `head, chipRow, table`
          — the chips ARE the narrowing this screen offers, and the design draws
          nothing else. The engine still honours ?q= and the filter keys, so a
          saved link or an export URL narrows exactly as it always did; what is
          gone is a control the design never had. Same miss as A12's mobile. */}

      {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No coupons here.
        </div>
      ) : (
        <>
          {/* mobile — template 1226 */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((c) => (
              <div
                key={c.id}
                onClick={() => open(c)}
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 700, fontSize: 14 }}>
                    {c.code}
                  </span>
                  <StatusBadge status={STATUS_LABEL[c.status_key] ?? c.status_key} />
                </div>
                <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 6 }}>
                  {discountLabel(c)} · {scopeLabel(c, planNames)}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
                  Used {c.used_count} / {c.usage_cap ?? "∞"}
                </div>
                <UsageBar pct={c.usage_pct} />
              </div>
            ))}
          </div>

          {/* tablet + desktop — template 1230 */}
          <div
            className="hidden md:block"
            style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}
          >
            <table
              className="md:min-w-[900px] desktop:min-w-0"
              style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
            >
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Discount</Th>
                  <Th>Applies to</Th>
                  <Th tabletHidden>Scope</Th>
                  <Th>Usage</Th>
                  <Th tabletHidden>Per user</Th>
                  <Th tabletHidden>Validity</Th>
                  <Th>Status</Th>
                  <Th w={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => open(c)}
                    style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
                  >
                    <Td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontFamily: "ui-monospace,monospace",
                          fontWeight: 700,
                        }}
                      >
                        {c.code}
                        <CopyBtn value={c.code} />
                      </span>
                    </Td>
                    <Td>{discountLabel(c)}</Td>
                    <Td>
                      <Badge
                        bg="var(--s2)"
                        fg="var(--ink2)"
                        style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                      >
                        {c.applies_to === "both" ? "Both" : c.applies_to === "plans" ? "Plans" : "Boosts"}
                      </Badge>
                    </Td>
                    <Td tabletHidden>
                      <span style={{ color: "var(--ink2)" }}>{scopeLabel(c, planNames)}</span>
                    </Td>
                    <Td>
                      <div>
                        <span style={{ fontSize: 12 }}>
                          {c.used_count} / {c.usage_cap ?? "∞"}
                        </span>
                        <UsageBar pct={c.usage_pct} />
                      </div>
                    </Td>
                    <Td tabletHidden>{c.per_user_limit}</Td>
                    <Td tabletHidden>
                      <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                        {day(c.starts_at)} – {day(c.expires_at)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={STATUS_LABEL[c.status_key] ?? c.status_key} />
                    </Td>
                    <Td>
                      <button
                        type="button"
                        aria-label="Coupon actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenu(c);
                        }}
                        style={{
                          width: 30,
                          height: 30,
                          border: "none",
                          background: "transparent",
                          color: "var(--ink3)",
                          cursor: "pointer",
                        }}
                      >
                        <AdminIcon name="dots" size={18} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {/* template 1710 */}
      {rowMenu ? (
        <SheetMenu onClose={() => setRowMenu(null)}>
          <ToolCol
            items={[
              ["Edit", () => open(rowMenu)],
              ["View usage", () => pushPanel("couponEdit", { id: rowMenu.id, code: rowMenu.code, tab: "usage" })],
              [
                rowMenu.status_key === "active" ? "End now" : "Delete",
                () =>
                  void act(
                    rowMenu.status_key === "active"
                      ? { action: "end", id: rowMenu.id }
                      : { action: "delete", id: rowMenu.id },
                  ),
                true,
              ],
            ]}
            onPick={() => setRowMenu(null)}
          />
        </SheetMenu>
      ) : null}
    </div>
  );
}

function ChipCount({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accentSoft)" : "var(--s1)",
        color: active ? "var(--accent)" : "var(--ink2)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label} {count}
    </button>
  );
}

function Th({
  children,
  w,
  tabletHidden,
}: {
  children?: React.ReactNode;
  w?: number;
  tabletHidden?: boolean;
}) {
  return (
    <th
      className={tabletHidden ? "hidden desktop:table-cell" : undefined}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink2)",
        background: "var(--s2)",
        whiteSpace: "nowrap",
        width: w,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, tabletHidden }: { children?: React.ReactNode; tabletHidden?: boolean }) {
  return (
    <td
      className={tabletHidden ? "hidden desktop:table-cell" : undefined}
      style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink1)", verticalAlign: "middle" }}
    >
      {children}
    </td>
  );
}
