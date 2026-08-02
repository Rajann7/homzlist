"use client";

/**
 * A13 — Plans. Template 1197-1216, edit panel 1276-1294.
 *
 * Cards, not a table: seven of them, no filter bar, no search, no pagination.
 * Registering this on the list engine would be machinery standing in for a
 * `select *`.
 *
 * The note at the top is the screen's contract — "Changes apply to new
 * purchases only. Existing users keep the plan they bought" — and the save
 * panel prints the number of holders it left alone, so the promise is visible
 * rather than asserted.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Badge,
  Btn,
  GatedBtn,
  PageHead,
  SheetMenu,
  Shimmer,
  ToolCol,
  useToast,
  usePanels,
} from "@/components/admin/ds";

export type PlanRow = {
  code: string;
  kind: string;
  name: string;
  sub_label: string | null;
  price_paise: number;
  period_days: number | null;
  roles: string[];
  listing_quota: number;
  requirement_quota: number;
  proposal_quota: number;
  project_quota: number;
  requirement_access: boolean;
  is_active: boolean;
  purchases: number;
  revenue_paise: number;
  is_top_seller: boolean;
  active_holders: number;
};

const ROLES = ["owner", "broker", "builder"] as const;
const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

export const rupees = (paise: number) => `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

/** "₹12.0L" — the design's own shorthand on the stats line (template 1200). */
export function shortMoney(paise: number): string {
  const r = Number(paise) / 100;
  if (r >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(1)}Cr`;
  if (r >= 1_00_000) return `₹${(r / 1_00_000).toFixed(1)}L`;
  if (r >= 1_000) return `₹${(r / 1_000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

/** The design's "Lifetime · Monthly · 6 months" line, from period_days. */
function validity(days: number | null): string {
  if (!days) return "Lifetime";
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? "" : "s"}`;
  if (days % 30 === 0) return days === 30 ? "Monthly" : `${days / 30} months`;
  return `${days} days`;
}

/** The contents list — only the quotas this plan actually grants. */
export function planContents(p: PlanRow): string[] {
  const out: string[] = [];
  const line = (n: number, one: string, many: string) => {
    if (n < 0) out.push(`Unlimited ${many}`);
    else if (n > 0) out.push(`${n} ${n === 1 ? one : many}`);
  };
  line(p.listing_quota, "listing", "listings");
  line(p.requirement_quota, "requirement", "requirements");
  line(p.proposal_quota, "proposal", "proposals");
  line(p.project_quota, "project", "projects");
  if (p.requirement_access) out.push("Unlock all requirements");
  return out.length ? out : ["No quota — access only"];
}

export function PlansScreen() {
  const toast = useToast();
  const { pushPanel, changed } = usePanels();
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [menu, setMenu] = useState<PlanRow | null>(null);
  const [nonce, setNonce] = useState(0);

  // The plan editor is a panel over this grid; saving it must repaint the card
  // underneath, price and quotas included.
  useEffect(() => {
    if (changed) setNonce((n) => n + 1);
  }, [changed]);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/plans", { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean; data?: { rows: PlanRow[] } } | null;
    setRows(json?.ok ? (json.data?.rows ?? []) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/v1/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    toast(json?.ok ? `${json.data?.summary} · logged` : (json?.error?.message ?? "That didn't go through"));
    if (json?.ok) setNonce((n) => n + 1);
  };

  // Only the sellable products belong on A13; boosts are priced on A19's rate
  // card, and the admin-grant row is not a product at all.
  const plans = (rows ?? []).filter((p) => p.kind !== "boost" && p.code !== "admin_grant");

  return (
    <div>
      <PageHead
        title="Plans"
        right={
          <GatedBtn
            label="+ New plan"
            kind="primary"
            need="super"
            onClick={() => pushPanel("planEdit", { code: null, name: "New plan" })}
          />
        }
      />

      <div
        style={{
          background: "var(--infoSoft)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 11,
          color: "var(--ink2)",
          marginBottom: 16,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <span style={{ color: "var(--info)" }}>
          <AdminIcon name="info" size={16} />
        </span>
        Changes apply to new purchases only. Existing users keep the plan they bought
        (grandfathering).
      </div>

      {rows === null ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} h={200} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <div
              key={p.code}
              style={{
                background: "var(--s1)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 17, fontWeight: 600 }}>{p.name}</span>
                    {p.is_top_seller ? (
                      <Badge
                        bg="var(--accentSoft)"
                        fg="var(--accent)"
                        style={{ textTransform: "none", letterSpacing: 0 }}
                      >
                        Most popular
                      </Badge>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                    {p.price_paise > 0 ? rupees(p.price_paise) : "On request"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)" }}>{validity(p.period_days)}</div>
                </div>
                {/* the design's inline toggle (template 1201) — a real write */}
                <div
                  onClick={() => void act({ action: "save", code: p.code, changes: { is_active: !p.is_active } })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: p.is_active ? "var(--accent)" : "var(--ink3)",
                    cursor: "pointer",
                    flex: "none",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 18,
                      borderRadius: 999,
                      background: p.is_active ? "var(--accent)" : "var(--s3)",
                      position: "relative",
                      display: "inline-block",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: p.is_active ? 16 : 2,
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: "#fff",
                        transition: "left .2s",
                      }}
                    />
                  </span>
                  {p.is_active ? "Active" : "Hidden"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
                {ROLES.map((r) => (
                  <span
                    key={r}
                    style={{
                      fontSize: 11,
                      color: p.roles.includes(r) ? "var(--accent)" : "var(--ink3)",
                    }}
                  >
                    {roleLabel(r)}
                    {p.roles.includes(r) ? " ✓" : " —"}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.7 }}>
                {planContents(p).map((c) => (
                  <div key={c}>· {c}</div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 10 }}>
                {p.is_active
                  ? `${p.purchases.toLocaleString("en-IN")} purchases · ${shortMoney(p.revenue_paise)} revenue`
                  : "Hidden from users"}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                <GatedBtn
                  label="Edit"
                  kind="outline"
                  need="super"
                  style={{ height: 34, fontSize: 13 }}
                  onClick={() => pushPanel("planEdit", { code: p.code, name: p.name })}
                />
                <button
                  type="button"
                  aria-label="Plan actions"
                  onClick={() => setMenu(p)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--s1)",
                    color: "var(--ink2)",
                    cursor: "pointer",
                  }}
                >
                  <AdminIcon name="dots" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* template 1709 */}
      {menu ? (
        <SheetMenu onClose={() => setMenu(null)}>
          <ToolCol
            items={[
              ["Duplicate", () => void act({ action: "duplicate", code: menu.code })],
              [
                menu.is_active ? "Hide from users" : "Show to users",
                () => void act({ action: "save", code: menu.code, changes: { is_active: !menu.is_active } }),
              ],
              ["View purchases", () => pushPanel("planPurchases", { code: menu.code, name: menu.name })],
              ["Delete", () => void act({ action: "delete", code: menu.code }), true],
            ]}
            onPick={() => setMenu(null)}
          />
        </SheetMenu>
      ) : null}
    </div>
  );
}
