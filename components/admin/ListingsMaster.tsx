"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { ListingFilterOptions, ListingFilters, MasterListingRow } from "@/lib/admin/listingStatuses";
import { STATUS_CHIPS } from "@/lib/admin/listingStatuses";
import { Initials, StatusBadge, Thumb } from "./queueBits";
import { AnchorMenu, Badge, Btn, Dropdown, DropdownItem, Modal, NoteBlock, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A12 — Listings master (Doc5 A12 / designs P14 `listingsMasterEl`).
 *
 * A3 shows what is waiting on a decision; this shows every listing in every
 * state, including Trash. The chip counts are queried over the whole table, so
 * a chip can never promise rows the table then fails to show.
 *
 * Its verbs are the ones that apply in any state — hide, make visible again —
 * and it deliberately does NOT duplicate approve/reject: a listing in a review
 * state links to A4, which is the screen built to decide it.
 */

interface Props {
  rows: MasterListingRow[];
  total: number;
  counts: Record<string, number>;
  page: number;
  pageSize: number;
  filters: ListingFilters;
  options: ListingFilterOptions;
  canEdit: boolean;
  siteUrl: string;
}

const FILTER_CHIPS: Array<{ key: keyof ListingFilters; param: string; label: string; from: keyof ListingFilterOptions | "boolean" }> = [
  { key: "type", param: "type", label: "Type", from: "types" },
  { key: "cityId", param: "city", label: "City", from: "cities" },
  { key: "role", param: "role", label: "Role", from: "roles" },
  { key: "boosted", param: "boosted", label: "Boosted", from: "boolean" },
  { key: "reported", param: "reported", label: "Reported", from: "boolean" },
];

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function ListingsMaster({ rows, total, counts, page, pageSize, filters, options, canEdit, siteUrl }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.q ?? "");
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { row: MasterListingRow; anchor: HTMLElement }>(null);
  const [dialog, setDialog] = useState<null | { row: MasterListingRow; action: "hide" | "unhide" }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2800);
  };

  const url = (param: string, value: string | null) => {
    const current: Record<string, string | null> = {
      q: filters.q,
      status: filters.status,
      type: filters.type,
      city: filters.cityId,
      role: filters.role,
      boosted: filters.boosted,
      reported: filters.reported,
    };
    current[param] = value;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v);
    return `/listings${sp.toString() ? `?${sp}` : ""}`;
  };

  const go = (param: string, value: string | null) => {
    setOpenChip(null);
    router.push(url(param, value));
  };

  const act = async () => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/listings/${dialog.row.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: dialog.action, reason }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const d = j?.error?.details ?? {};
        setError(
          d.alreadyHidden
            ? "This listing is already hidden."
            : d.inTrash
              ? "This listing is in the trash — restore it first."
              : d.notHidden
                ? "This listing is not hidden."
                : j?.error?.code === "FORBIDDEN"
                  ? "Your role cannot edit listings."
                  : "That didn't go through. Try again.",
        );
        return;
      }
      setDialog(null);
      setReason("");
      show(dialog.action === "hide" ? "Listing hidden · poster notified" : "Listing visible again · poster notified");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const [reason, setReason] = useState("");
  const activeStatus = filters.status ?? "all";
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Listings
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {(counts.all ?? 0).toLocaleString("en-IN")}
        </span>
      </div>

      {/* status chips — every count is a real query over the whole table */}
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => {
          const on = activeStatus === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => go("status", c.key === "all" ? null : c.key)}
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

      {/* search + filter chips */}
      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go("q", search.trim() || null);
          }}
          className="flex h-9 min-w-[160px] items-center gap-[6px] rounded-8 border px-[10px]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="search" size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or ID"
            aria-label="Search listings"
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--ink-primary)" }}
          />
        </form>

        {FILTER_CHIPS.map((c) => {
          const value = filters[c.key];
          const opts = c.from === "boolean" ? YES_NO : options[c.from];
          const label = value ? opts.find((o) => o.value === value)?.label ?? c.label : c.label;
          return (
            <div key={c.param} className="relative">
              <button
                type="button"
                onClick={() => setOpenChip(openChip === c.param ? null : c.param)}
                aria-haspopup="menu"
                aria-expanded={openChip === c.param}
                className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px]"
                style={{
                  borderColor: value ? "var(--accent)" : "var(--border)",
                  background: value ? "var(--accent-soft)" : "var(--surface-1)",
                  color: value ? "var(--accent)" : "var(--ink-secondary)",
                  fontWeight: value ? 600 : 400,
                }}
              >
                {c.from === "boolean" && value ? `${c.label}: ${label}` : label}
                <Icon name="chevron-down" size={14} />
              </button>
              {openChip === c.param && (
                <Dropdown onClose={() => setOpenChip(null)}>
                  <DropdownItem onSelect={() => go(c.param, null)}>Any</DropdownItem>
                  {opts.map((o) => (
                    <DropdownItem key={o.value} onSelect={() => go(c.param, o.value)}>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {value === o.value && (
                        <span className="shrink-0" style={{ color: "var(--accent)" }}>
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </DropdownItem>
                  ))}
                </Dropdown>
              )}
            </div>
          );
        })}

        {Object.values(filters).some(Boolean) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.push("/listings");
            }}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
          {total.toLocaleString("en-IN")} shown
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="list" size={72} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No listings match
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Try clearing some filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-12 border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full border-collapse" style={{ background: "var(--surface-1)", minWidth: 860 }}>
            <thead>
              <tr>
                {["Listing", "Price", "Location", "Poster", "Posted", "Status", ""].map((h, i) => (
                  <Th key={`${h}-${i}`}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <Td>
                    <div className="flex items-center gap-[10px]">
                      <Thumb size={40} url={r.coverUrl} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-[6px]">
                          <span className="max-w-[240px] truncate font-semibold" style={{ color: "var(--ink-primary)" }}>
                            {r.title}
                          </span>
                          {r.boosted && (
                            <Badge bg="var(--accent-soft)" fg="var(--accent)">
                              Boosted
                            </Badge>
                          )}
                          {r.reports > 0 && (
                            <span title={`${r.reports} open report${r.reports === 1 ? "" : "s"}`} style={{ color: "var(--error)" }}>
                              <Icon name="flag" size={13} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                          #{r.shortId} · {r.typeLabel}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.priceLabel}</Td>
                  <Td>
                    <span style={{ color: "var(--ink-secondary)" }}>{r.location}</span>
                  </Td>
                  <Td>
                    <Link href={`/users/${r.poster.id}`} className="flex items-center gap-2">
                      <Initials text={r.poster.initials} size={24} />
                      <span className="min-w-0">
                        <span className="block truncate" style={{ color: "var(--ink-primary)" }}>
                          {r.poster.name}
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                          {r.poster.role}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
                      {r.postedLabel}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge label={r.statusLabel} />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      aria-label={`Actions for ${r.title}`}
                      onClick={(e) => setMenu({ row: r, anchor: e.currentTarget })}
                      className="grid h-[30px] w-[30px] place-items-center"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      <Icon name="more" size={18} />
                    </button>
                  </Td>
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

      {menu && (
        <AnchorMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            menu.row.reviewHref
              ? { label: "Open review", onSelect: () => router.push(menu.row.reviewHref!) }
              : null,
            {
              label: "Open in user view ↗",
              onSelect: () => window.open(`${siteUrl}/property/${menu.row.id}`, "_blank", "noopener"),
            },
            { label: "Open poster", onSelect: () => router.push(`/users/${menu.row.poster.id}`) },
            menu.row.status === "hidden"
              ? {
                  label: "Make visible again",
                  onSelect: () => setDialog({ row: menu.row, action: "unhide" }),
                  disabled: !canEdit,
                  tooltip: "Admin only",
                }
              : {
                  label: "Hide from feed & search",
                  onSelect: () => setDialog({ row: menu.row, action: "hide" }),
                  danger: true,
                  disabled: !canEdit || menu.row.status === "deleted",
                  tooltip: canEdit ? "Already in the trash" : "Admin only",
                },
          ]}
        />
      )}

      {dialog && (
        <Modal
          title={dialog.action === "hide" ? `Hide "${dialog.row.title}"?` : "Make this listing visible again?"}
          onClose={() => {
            setDialog(null);
            setError(null);
          }}
          actions={
            <>
              <Btn
                kind="outline"
                onClick={() => {
                  setDialog(null);
                  setError(null);
                }}
              >
                Cancel
              </Btn>
              <Btn kind={dialog.action === "hide" ? "dangerFill" : "primary"} disabled={busy || reason.trim().length < 5} onClick={act}>
                {busy ? "Working…" : dialog.action === "hide" ? "Hide" : "Make visible"}
              </Btn>
            </>
          }
        >
          <NoteBlock tone={dialog.action === "hide" ? "warning" : "info"}>
            {dialog.action === "hide"
              ? "It leaves feed and search immediately and the poster is notified. Nothing is deleted."
              : "It returns to feed and search as a live listing, and the poster is notified."}
          </NoteBlock>
          <div className="mt-3">
            <TextArea value={reason} onChange={setReason} height={60} placeholder="Reason — this is logged…" />
          </div>
          {error && (
            <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
              {error}
            </p>
          )}
        </Modal>
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
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
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink-primary)", verticalAlign: "middle" }}>{children}</td>;
}
