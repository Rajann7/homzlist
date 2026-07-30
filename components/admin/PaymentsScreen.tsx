"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { PAYMENT_STATUS_CHIPS } from "@/lib/admin/paymentTypes";
import type { PaymentFilters, PaymentRow } from "@/lib/admin/paymentTypes";
import { Initials, StatusBadge } from "./queueBits";
import { Btn, Dropdown, DropdownItem } from "./overlays";

/**
 * A17 — Payments (Doc5 A17). The list; the row opens A18.
 *
 * The header states the money the CURRENT filter adds up to, not a lifetime
 * total, because a total that ignores the filter under it is the fastest way to
 * make someone quote the wrong number in a meeting.
 */

interface Props {
  rows: PaymentRow[];
  total: number;
  counts: Record<string, number>;
  sumLabel: string;
  page: number;
  pageSize: number;
  filters: PaymentFilters;
  methods: string[];
}

export function PaymentsScreen({ rows, total, counts, sumLabel, page, pageSize, filters, methods }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.q ?? "");
  const [openChip, setOpenChip] = useState<string | null>(null);

  const url = (param: string, value: string | null) => {
    const current: Record<string, string | null> = { q: filters.q, status: filters.status, method: filters.method };
    current[param] = value;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v);
    return `/payments${sp.toString() ? `?${sp}` : ""}`;
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Payments
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {total.toLocaleString("en-IN")} · {sumLabel}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {PAYMENT_STATUS_CHIPS.map((c) => {
          const on = (filters.status ?? "all") === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => router.push(url("status", c.key === "all" ? null : c.key))}
              className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                background: on ? "var(--accent-soft)" : "var(--surface-1)",
                color: on ? "var(--accent)" : "var(--ink-secondary)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {c.label} {(counts[c.key] ?? 0).toLocaleString("en-IN")}
            </button>
          );
        })}
      </div>

      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(url("q", search.trim() || null));
          }}
          className="flex h-9 min-w-[180px] items-center gap-[6px] rounded-8 border px-[10px]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="search" size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Payment id"
            aria-label="Search payments"
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--ink-primary)" }}
          />
        </form>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenChip(openChip === "method" ? null : "method")}
            aria-haspopup="menu"
            className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px]"
            style={{
              borderColor: filters.method ? "var(--accent)" : "var(--border)",
              background: filters.method ? "var(--accent-soft)" : "var(--surface-1)",
              color: filters.method ? "var(--accent)" : "var(--ink-secondary)",
              fontWeight: filters.method ? 600 : 400,
            }}
          >
            {filters.method ? filters.method.toUpperCase() : "Method"}
            <Icon name="chevron-down" size={14} />
          </button>
          {openChip === "method" && (
            <Dropdown onClose={() => setOpenChip(null)}>
              <DropdownItem
                onSelect={() => {
                  setOpenChip(null);
                  router.push(url("method", null));
                }}
              >
                Any method
              </DropdownItem>
              {methods.map((m) => (
                <DropdownItem
                  key={m}
                  onSelect={() => {
                    setOpenChip(null);
                    router.push(url("method", m));
                  }}
                >
                  {m.toUpperCase()}
                </DropdownItem>
              ))}
            </Dropdown>
          )}
        </div>

        {(filters.q || filters.status || filters.method) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.push("/payments");
            }}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Clear all
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="card" size={72} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No payments match
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-12 border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full border-collapse" style={{ background: "var(--surface-1)", minWidth: 780 }}>
            <thead>
              <tr>
                {["Payment", "Payer", "For", "Amount", "Method", "When", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-secondary)",
                      background: "var(--surface-2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/payments/${r.id}`)}
                  style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
                >
                  <td style={cell}>
                    <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                      {r.ref}
                    </span>
                  </td>
                  <td style={cell}>
                    <span className="flex items-center gap-2">
                      <Initials text={r.payer.initials} size={24} />
                      <span className="truncate">{r.payer.name}</span>
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ color: "var(--ink-secondary)" }}>{r.forWhat}</span>
                  </td>
                  <td style={cell}>
                    <span className="whitespace-nowrap font-semibold">{r.amountLabel}</span>
                  </td>
                  <td style={cell}>{r.method}</td>
                  <td style={cell}>
                    <span className="whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
                      {r.atLabel}
                    </span>
                  </td>
                  <td style={cell}>
                    <StatusBadge label={r.statusLabel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={page <= 1} onClick={() => router.push(`${url("q", filters.q)}${url("q", filters.q).includes("?") ? "&" : "?"}page=${page - 1}`)}>
            Previous
          </Btn>
          <span className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Page {page} of {pages}
          </span>
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={page >= pages} onClick={() => router.push(`${url("q", filters.q)}${url("q", filters.q).includes("?") ? "&" : "?"}page=${page + 1}`)}>
            Next
          </Btn>
        </div>
      )}

      <p className="mt-4 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
        Amounts are the stored paise values, formatted here — never recomputed from a price list.{" "}
        <Link href="/users" style={{ color: "var(--accent)" }}>
          Payer names open A11.
        </Link>
      </p>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--ink-primary)",
  verticalAlign: "middle",
};
