"use client";

/**
 * A17 — Payments. Template 1114-1146.
 *
 * Seven chips, and the seventh is not a payment state: ABANDONED is a checkout
 * that never produced a payment row at all, so it is read from its own relation
 * (migration 0104) and drawn as the design's card list (template 1121). A chip
 * that filtered PAYMENTS for "abandoned" could only ever be empty.
 *
 * A row opens the PAYMENT PANEL, which P4 already built because A11's Payments
 * tab pushes it — one panel, two entrances.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  CopyBtn,
  Modal,
  PageHead,
  Shimmer,
  StatusBadge,
  useToast,
  usePanels,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup, ListError } from "@/components/admin/list";

type Row = {
  id: string;
  razorpay_payment_id: string | null;
  profile_id: string;
  user_name: string | null;
  item_name: string | null;
  amount_paise: number;
  strike_paise: number | null;
  coupon_code: string | null;
  gst_paise: number;
  method_label: string | null;
  status_key: string;
  created_at: string;
};

const FILTER_KEYS = ["method", "item", "from", "to"] as const;

/** template 1116 — the design's seven chips, in its order. */
const CHIPS: [key: string, label: string][] = [
  ["all", "All"],
  ["success", "Success"],
  ["pending", "Pending"],
  ["failed", "Failed"],
  ["refunded", "Refunded"],
  ["chargeback", "Chargebacks"],
  ["abandoned", "Abandoned"],
];

/**
 * template 1118's date-range button. A16 has the same control, and both write
 * the SAME two filter keys the list engine already resolves to SQL
 * (`created_at >= from`, `created_at < to`) — so this is a real narrowing of
 * the query, not a label above an unfiltered table.
 */
const RANGES: [key: string, label: string, days: number][] = [
  ["7d", "Last 7 days", 7],
  ["30d", "Last 30 days", 30],
  ["90d", "Last 90 days", 90],
  ["all", "All time", 0],
];

/** "1–31 Jan 2025" — the design's own format (template 1118). */
function rangeLabel(from?: string, to?: string): string {
  if (!from) return "All time";
  const a = new Date(from);
  const b = to ? new Date(to) : new Date();
  if (Number.isNaN(a.getTime())) return "All time";
  const mon = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return `${a.getDate()}–${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
  return `${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
}

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  chargeback: "Chargeback",
};

const rupees = (paise: unknown) =>
  `₹${Math.round(Number(paise ?? 0) / 100).toLocaleString("en-IN")}`;

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const ago = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export function PaymentsScreen({
  options,
  total,
}: {
  options: { methods: { value: string; label: string }[]; items: { value: string; label: string }[] };
  total: number;
}) {
  const { pushPanel, changed } = usePanels();
  const list = useAdminList<Row>("payments", FILTER_KEYS, "all");

  // A refund issued in the panel changes this row's status and the tab counts.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [abandoned, setAbandoned] = useState(false);

  const tab = list.tab ?? "all";
  const rows = list.data?.rows ?? [];
  const counts = list.data?.tabCounts ?? {};

  const groups: FilterGroup[] = [
    { key: "method", label: "Method", options: options.methods },
    { key: "item", label: "Item", options: options.items },
  ];

  const open = (r: Row) =>
    pushPanel("payment", { id: r.id, label: r.razorpay_payment_id ?? r.id.slice(0, 8) });

  return (
    <div>
      <PageHead
        title="Payments"
        sub={
          <Badge
            bg="var(--s2)"
            fg="var(--ink2)"
            style={{
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 600,
              fontSize: 13,
              padding: "5px 10px",
              borderRadius: 999,
            }}
          >
            {`${total.toLocaleString("en-IN")} total`}
          </Badge>
        }
        right={
          <button
            type="button"
            onClick={() => setRangeOpen(true)}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s1)",
              color: "var(--ink1)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {rangeLabel(list.filters.from?.[0], list.filters.to?.[0])}
            <AdminIcon name="chevD" size={16} />
          </button>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {CHIPS.map(([key, label]) => {
          const active = key === "abandoned" ? abandoned : !abandoned && tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "abandoned") {
                  setAbandoned(true);
                  return;
                }
                setAbandoned(false);
                list.setTab(key);
              }}
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
              {/* template 1114: the chip list is [['all','All',''],…] — "All"
                  and "Abandoned" carry no count, the other five do. */}
              {key === "abandoned" || key === "all"
                ? label
                : `${label} ${(counts[key] ?? 0).toLocaleString("en-IN")}`}
            </button>
          );
        })}
      </div>

      {abandoned ? (
        <AbandonedTab />
      ) : (
        <>
          {/* template 1141's mobile branch is `head, chipRow, cards` — there is
              no search box and no filter pill row at 390. Same branch A12 has,
              and the same one the first pass missed there. */}
          <div className="hidden md:block">
            <FilterBar
              placeholder="payment ID / order ID / phone"
              search={list.search}
              onSearch={list.setSearch}
              groups={groups}
              filters={list.filters}
              onOpenFilters={() => setFiltersOpen(true)}
              onClear={list.clearFilters}
              countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} payments`}
            />
          </div>

          {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Shimmer key={i} h={56} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
              No payments here.
            </div>
          ) : (
            <>
              {/* mobile — template 1134 */}
              <div className="flex flex-col gap-[10px] md:hidden">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => open(r)}
                    style={{
                      background: r.status_key === "chargeback" ? "var(--errorSoft)" : "var(--s1)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar initials={(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.user_name}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ink3)",
                            fontFamily: "ui-monospace,monospace",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.razorpay_payment_id ?? "not charged through the gateway"}
                        </div>
                      </div>
                      <StatusBadge status={STATUS_LABEL[r.status_key] ?? r.status_key} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--ink2)",
                        gap: 8,
                      }}
                    >
                      <span>{r.item_name}</span>
                      <span style={{ fontWeight: 600, color: "var(--ink1)" }}>
                        {rupees(r.amount_paise)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* tablet + desktop — template 1137 */}
              <div
                className="hidden md:block"
                style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}
              >
                <table
                  className="md:min-w-[860px] desktop:min-w-0"
                  style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
                >
                  <thead>
                    <tr>
                      <Th>Payment ID</Th>
                      <Th>User</Th>
                      <Th>Item</Th>
                      <Th>Amount</Th>
                      <Th tabletHidden>Method</Th>
                      <Th>Status</Th>
                      <Th tabletHidden>Date</Th>
                      <Th w={40} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => open(r)}
                        style={{
                          borderTop: "1px solid var(--divider)",
                          cursor: "pointer",
                          background: r.status_key === "chargeback" ? "var(--errorSoft)" : "transparent",
                        }}
                      >
                        <Td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontFamily: "ui-monospace,monospace",
                              fontSize: 12,
                            }}
                          >
                            {r.razorpay_payment_id ?? "—"}
                            {r.razorpay_payment_id ? <CopyBtn value={r.razorpay_payment_id} /> : null}
                          </span>
                        </Td>
                        <Td>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              pushPanel("user", { id: r.profile_id, name: r.user_name });
                            }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                          >
                            <Avatar initials={(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={24} />
                            {r.user_name}
                          </span>
                        </Td>
                        <Td>
                          <span style={{ color: "var(--ink2)" }}>{r.item_name}</span>
                        </Td>
                        <Td>
                          {/* the design's struck-out original, only when a
                              coupon really moved the price */}
                          {r.strike_paise ? (
                            <span
                              title={`${r.coupon_code ?? "Coupon"} · GST ${rupees(r.gst_paise)}`}
                            >
                              <span style={{ fontWeight: 600 }}>{rupees(r.amount_paise)}</span>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "var(--ink3)",
                                  marginLeft: 5,
                                  fontSize: 12,
                                }}
                              >
                                {rupees(r.strike_paise)}
                              </span>
                            </span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{rupees(r.amount_paise)}</span>
                          )}
                        </Td>
                        <Td tabletHidden>
                          <Badge
                            bg="var(--s2)"
                            fg="var(--ink2)"
                            style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                          >
                            {r.method_label || "—"}
                          </Badge>
                        </Td>
                        <Td>
                          <StatusBadge status={STATUS_LABEL[r.status_key] ?? r.status_key} />
                        </Td>
                        <Td tabletHidden>
                          <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                            {stamp(r.created_at)}
                          </span>
                        </Td>
                        <Td>
                          <span style={{ color: "var(--ink3)" }}>
                            <AdminIcon name="chevR" size={16} />
                          </span>
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
        </>
      )}

      {filtersOpen ? (
        <FilterSheet
          groups={groups}
          value={list.filters}
          onApply={(next) => {
            list.applyFilters(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}

      {rangeOpen ? (
        <Modal
          title="Date range"
          onClose={() => setRangeOpen(false)}
          footer={<Btn label="Close" kind="outline" onClick={() => setRangeOpen(false)} />}
        >
          {RANGES.map(([key, label, days]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="payrange"
                checked={
                  days === 0 ? !list.filters.from : list.filters.from?.[0] === isoDaysAgo(days)
                }
                onChange={() => {
                  // Both keys are set together: `from` alone would leave a
                  // stale `to` from a previous choice narrowing the new window.
                  list.applyFilters({
                    ...list.filters,
                    from: days === 0 ? [] : [isoDaysAgo(days)],
                    to: [],
                  });
                  setRangeOpen(false);
                }}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
        </Modal>
      ) : null}
    </div>
  );
}

/** Midnight N days ago, so the same choice produces the same string all day. */
function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** template 1121 — the Abandoned tab. Cards, not a table. */
function AbandonedTab() {
  const toast = useToast();
  const { pushPanel } = usePanels();
  const [rows, setRows] = useState<Record<string, string | number>[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/abandoned?hours=${hours}`, { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { rows: Record<string, string | number>[]; total?: number } }
      | null;
    setRows(json?.ok ? (json.data?.rows ?? []) : []);
    setTotal(json?.ok ? (json.data?.total ?? 0) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(id: string) {
    setBusy(id);
    const res = await fetch("/api/v1/admin/abandoned", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action: "retry", id }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    setBusy(null);
    toast(json?.ok ? `Retry link sent — ${json.data?.summary}` : (json?.error?.message ?? "Failed"));
    if (json?.ok) setNonce((n) => n + 1);
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink3)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span>Checkouts started but not completed in the last {hours} hours.</span>
        {/* The design fixes 24h. The window is adjustable because a real
            environment's 24-hour list is often empty, and a tab that is empty
            by construction teaches an admin to stop opening it. */}
        {[24, 72, 168].map((h) => (
          <span
            key={h}
            onClick={() => setHours(h)}
            style={{
              cursor: "pointer",
              fontWeight: hours === h ? 600 : 400,
              color: hours === h ? "var(--accent)" : "var(--ink3)",
            }}
          >
            {h === 24 ? "24h" : h === 72 ? "3 days" : "7 days"}
          </span>
        ))}
      </div>

      {rows === null ? (
        <Shimmer h={80} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)", padding: 24 }}>
          Nobody has abandoned a checkout in this window.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div
              key={String(r.id)}
              style={{
                background: "var(--s1)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Avatar initials={String(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={32} />
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.user_name)}</div>
                <div style={{ fontSize: 12, color: "var(--ink3)" }}>
                  {String(r.item_name)} · {rupees(r.total_paise)} · started{" "}
                  {ago(String(r.created_at))}
                </div>
              </div>
              <Btn
                label={busy === String(r.id) ? "Sending…" : "Send retry link"}
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => retry(String(r.id))}
              />
              <Btn
                label="Open user"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => pushPanel("user", { id: r.profile_id, name: r.user_name })}
              />
            </div>
          ))}
          {/* The endpoint returns at most 100. Saying so is the difference
              between a capped list and a list that claims to be complete. */}
          {total > rows.length ? (
            <div style={{ fontSize: 12, color: "var(--ink3)", padding: "4px 2px" }}>
              Showing the {rows.length} most recent of {total.toLocaleString("en-IN")}. Narrow the
              window to see the rest.
            </div>
          ) : null}
        </div>
      )}
    </div>
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
