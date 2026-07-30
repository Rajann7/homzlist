"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { UserFilterOptions, UserFilters, UserRow } from "@/lib/admin/users";
import { Initials, StatusBadge } from "./queueBits";
import { AnchorMenu, Badge, Btn, Dropdown, DropdownItem, Modal, NoteBlock, RightSheet } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A10 — Users (Doc5 A10 / designs P14 `usersEl`).
 *
 * Head with the total pill, saved views, columns and export · a filter bar of
 * the design's six chips with a search box and the filtered count · a bulk bar
 * once rows are ticked · the table on tablet and desktop, the design's card list
 * on mobile (A10 is one of the screens whose design DOES branch on viewport).
 *
 * Every filter writes to the URL and is answered by Postgres. Nothing on this
 * screen filters an array in the browser, so a row an admin filtered out was
 * never sent.
 */

interface Props {
  rows: UserRow[];
  /** Rows the current filters match. */
  total: number;
  /** Every profile — the design's "4,281 users" pill. */
  allUsers: number;
  page: number;
  pageSize: number;
  filters: UserFilters;
  options: UserFilterOptions;
  canSuspend: boolean;
  canGrant: boolean;
  canImpersonate: boolean;
}

/** The design's six chips, in its order, mapped to their URL key. */
const CHIPS: Array<{ key: keyof UserFilters; label: string; options: keyof UserFilterOptions; param: string }> = [
  { key: "role", label: "Role", options: "roles", param: "role" },
  { key: "status", label: "Status", options: "statuses", param: "status" },
  { key: "plan", label: "Plan", options: "plans", param: "plan" },
  { key: "cityId", label: "City", options: "cities", param: "city" },
  { key: "verification", label: "Verification", options: "verifications", param: "verification" },
  { key: "joined", label: "Joined", options: "joined", param: "joined" },
];

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  shared: boolean;
  mine: boolean;
}

export function UsersScreen({
  rows,
  total,
  allUsers,
  page,
  pageSize,
  filters,
  options,
  canSuspend,
  canGrant,
  canImpersonate,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { row: UserRow; anchor: HTMLElement }>(null);
  const [sheet, setSheet] = useState<null | "views" | "columns" | "export">(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q ?? "");
  const [busy, setBusy] = useState(false);

  const show = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2800);
  };

  /** One place that turns a filter change into a URL — the URL is the state. */
  const withParam = (param: string, value: string | null) => {
    const sp = new URLSearchParams();
    const current: Record<string, string | null> = {
      q: filters.q,
      role: filters.role,
      status: filters.status,
      plan: filters.plan,
      city: filters.cityId,
      verification: filters.verification,
      joined: filters.joined,
    };
    current[param] = value;
    for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v);
    return `/users${sp.toString() ? `?${sp}` : ""}`;
  };

  const go = (param: string, value: string | null) => {
    setOpenChip(null);
    setSelected([]);
    router.push(withParam(param, value));
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    if (sheet !== "views") return;
    let dead = false;
    (async () => {
      const r = await fetch("/api/v1/admin/saved-views?queue=users", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!dead && j?.ok) setViews(j.data.views);
    })();
    return () => {
      dead = true;
    };
  }, [sheet]);

  const saveView = async () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queue: "users",
          name,
          filters: { q: filters.q, role: filters.role, status: filters.status, plan: filters.plan, city: filters.cityId, verification: filters.verification, joined: filters.joined },
        }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) {
        setSheet(null);
        show("View saved");
      } else show("That view could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const applyView = (v: SavedView) => {
    const f = v.filters as Record<string, string | null>;
    const sp = new URLSearchParams();
    for (const k of ["q", "role", "status", "plan", "city", "verification", "joined"]) {
      if (f[k]) sp.set(k, String(f[k]));
    }
    setSheet(null);
    router.push(`/users${sp.toString() ? `?${sp}` : ""}`);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    go("q", search.trim() || null);
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* pageHead: title · total pill · saved views / columns / export */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Users
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {allUsers.toLocaleString("en-IN")} users
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSheet(sheet === "views" ? null : "views")}
              aria-haspopup="menu"
              aria-expanded={sheet === "views"}
              className="flex h-9 items-center gap-[6px] rounded-8 border px-3 text-[13px] font-semibold"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-primary)" }}
            >
              {activeCount === 0 ? "All users" : "Filtered"}
              <Icon name="chevron-down" size={16} />
            </button>
            {sheet === "views" && (
              <Dropdown onClose={() => setSheet(null)}>
                <DropdownItem onSelect={() => { setSheet(null); router.push("/users"); }}>All users</DropdownItem>
                {views.map((v) => (
                  <DropdownItem key={v.id} onSelect={() => applyView(v)}>
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {!v.shared && (
                      <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                        private
                      </span>
                    )}
                  </DropdownItem>
                ))}
                {views.length === 0 && (
                  <p className="px-3 py-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                    No saved views yet.
                  </p>
                )}
                <DropdownItem accent topBorder disabled={busy} onSelect={saveView}>
                  + Save current view
                </DropdownItem>
              </Dropdown>
            )}
          </div>
          <IconBtn label="Columns" icon="sliders" onClick={() => setSheet("columns")} />
          <IconBtn label="Export" icon="download" onClick={() => setSheet("export")} />
        </div>
      </div>

      {/* filter bar */}
      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex h-9 min-w-[180px] items-center gap-[6px] rounded-8 border px-[10px]" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="search" size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone"
            aria-label="Search users"
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--ink-primary)" }}
          />
        </form>

        {CHIPS.map((c) => {
          const value = filters[c.key];
          const opts = options[c.options];
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
                {label}
                <Icon name="chevron-down" size={14} />
              </button>
              {openChip === c.param && (
                <Dropdown onClose={() => setOpenChip(null)}>
                  <DropdownItem onSelect={() => go(c.param, null)}>Any {c.label.toLowerCase()}</DropdownItem>
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

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelected([]);
              router.push("/users");
            }}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
          {total.toLocaleString("en-IN")} user{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* bulk bar */}
      {selected.length > 0 && (
        <div
          className="mb-[14px] flex flex-wrap items-center gap-3 rounded-8 border px-3 py-2"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {selected.length} selected
          </span>
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={!canSuspend} tooltip="Admin only" onClick={() => show("Bulk messaging arrives with A11's communication log")}>
            Send message
          </Btn>
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={!canGrant} tooltip="Admin only" onClick={() => show("Grants arrive with A15")}>
            Grant trial
          </Btn>
          <button type="button" onClick={() => setSelected([])} className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
            Clear
          </button>
          <span className="ml-auto text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            Bulk actions are logged
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="users" size={72} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No users match
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Try clearing some filters.
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE CARDS — the design branches on viewport for A10, unlike A5–A7. */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => !r.deleted && router.push(`/users/${r.id}`)}
                className="flex gap-[10px] rounded-12 border p-3"
                style={{
                  background: r.status === "suspended" ? "var(--error-soft)" : "var(--surface-1)",
                  borderColor: "var(--border)",
                  cursor: r.deleted ? "default" : "pointer",
                }}
              >
                <Initials text={r.initials} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px]">
                    <span className="truncate text-[13px] font-semibold" style={{ color: r.deleted ? "var(--ink-tertiary)" : "var(--ink-primary)" }}>
                      {r.name}
                    </span>
                    {r.isNew && (
                      <Badge bg="var(--warning-soft)" fg="var(--warning)">
                        New
                      </Badge>
                    )}
                  </div>
                  <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    {r.phone}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-[6px]">
                    <RoleChip role={r.roleLabel} />
                    <StatusBadge label={r.statusLabel} />
                    {r.trialLabel && (
                      <span className="text-[11px]" style={{ color: "var(--info)" }}>
                        {r.trialLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* TABLE — tablet and desktop */}
          <div className="hidden overflow-x-auto rounded-12 border md:block" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse" style={{ background: "var(--surface-1)", minWidth: 820 }}>
              <thead>
                <tr>
                  <Th width={40} />
                  <Th>User</Th>
                  <Th>Phone</Th>
                  <Th>Role</Th>
                  <Th desktopOnly>Verification</Th>
                  <Th desktopOnly>City</Th>
                  <Th>Plans</Th>
                  <Th>Listings</Th>
                  <Th desktopOnly>Leads</Th>
                  <Th desktopOnly>Joined</Th>
                  <Th>Status</Th>
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = selected.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => !r.deleted && router.push(`/users/${r.id}`)}
                      style={{
                        borderTop: "1px solid var(--divider)",
                        cursor: r.deleted ? "default" : "pointer",
                        background: isSel ? "var(--accent-soft)" : r.status === "suspended" ? "var(--error-soft)" : "transparent",
                      }}
                    >
                      <Td>
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={r.deleted}
                          aria-label={`Select ${r.name}`}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(r.id)}
                          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                        />
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Initials text={r.initials} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-[5px]">
                              <span className="truncate font-semibold" style={{ color: r.deleted ? "var(--ink-tertiary)" : "var(--ink-primary)" }}>
                                {r.name}
                              </span>
                              {r.isNew && (
                                <Badge bg="var(--warning-soft)" fg="var(--warning)">
                                  New
                                </Badge>
                              )}
                              {r.reports > 0 && (
                                <span title={`${r.reports} open report${r.reports === 1 ? "" : "s"}`} style={{ color: "var(--error)" }}>
                                  <Icon name="flag" size={13} />
                                </span>
                              )}
                            </div>
                            <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                              {r.handle}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
                          {r.phone}
                        </span>
                      </Td>
                      <Td>
                        <RoleChip role={r.roleLabel} />
                      </Td>
                      <Td desktopOnly>
                        <VerifCluster v={r.verified} deleted={r.deleted} />
                      </Td>
                      <Td desktopOnly>
                        <span style={{ color: "var(--ink-secondary)" }}>{r.city}</span>
                      </Td>
                      <Td>
                        {r.plans.length ? (
                          <span className="inline-flex flex-wrap gap-1">
                            {r.plans.map((p, i) => (
                              <Badge key={`${p}-${i}`} bg="var(--accent-soft)" fg="var(--accent)" plain>
                                {p}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-tertiary)" }}>No plan</span>
                        )}
                      </Td>
                      <Td>
                        <span>
                          {r.listings}
                          {r.listingSplit && (
                            <span className="ml-1 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                              {r.listingSplit}
                            </span>
                          )}
                        </span>
                      </Td>
                      <Td desktopOnly>{r.leads}</Td>
                      <Td desktopOnly>
                        <span className="whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
                          {r.joinedLabel}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge label={r.statusLabel} />
                        {r.trialLabel && (
                          <p className="mt-[2px] text-[11px]" style={{ color: "var(--info)" }}>
                            {r.trialLabel}
                          </p>
                        )}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          aria-label={`Actions for ${r.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu({ row: r, anchor: e.currentTarget });
                          }}
                          className="grid h-[30px] w-[30px] place-items-center"
                          style={{ color: "var(--ink-tertiary)" }}
                        >
                          <Icon name="more" size={18} />
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={page <= 1} onClick={() => router.push(`${withParam("q", filters.q)}${withParam("q", filters.q).includes("?") ? "&" : "?"}page=${page - 1}`)}>
            Previous
          </Btn>
          <span className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Page {page} of {pages}
          </span>
          <Btn kind="outline" style={{ height: 32, fontSize: 13 }} disabled={page >= pages} onClick={() => router.push(`${withParam("q", filters.q)}${withParam("q", filters.q).includes("?") ? "&" : "?"}page=${page + 1}`)}>
            Next
          </Btn>
        </div>
      )}

      {menu && (
        <AnchorMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            { label: "Open user", onSelect: () => router.push(`/users/${menu.row.id}`) },
            {
              label: "Impersonate (read-only)",
              onSelect: () => show("Impersonation arrives with A31"),
              disabled: !canImpersonate,
              tooltip: "Admin only",
            },
          ]}
        />
      )}

      {sheet === "columns" && (
        <RightSheet title="Columns" onClose={() => setSheet(null)} actions={<Btn kind="primary" style={{ flex: 1 }} onClick={() => setSheet(null)}>Done</Btn>}>
          <NoteBlock tone="info">
            A10 draws every column the design lists. Which of them a viewport shows is decided by the
            design itself — Verification, City, Leads and Joined are desktop-only — so there is nothing
            to toggle yet. Per-admin column choices arrive with A12&apos;s shared table.
          </NoteBlock>
        </RightSheet>
      )}

      {sheet === "export" && (
        <ExportUsers total={total} filters={filters} onClose={() => setSheet(null)} onDone={show} />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

/**
 * The design's export dialog for users carries a warning the listings one does
 * not: this file is personal data. The endpoint records who asked and what for.
 */
function ExportUsers({
  total,
  filters,
  onClose,
  onDone,
}: {
  total: number;
  filters: UserFilters;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "users",
          format: "csv",
          filters,
          rowCount: total,
          reason: reason.trim(),
          name: "Users export",
        }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error?.code === "FORBIDDEN" ? "Your role cannot export personal data." : "That export could not be queued.");
        return;
      }
      onClose();
      onDone("Export queued · you'll be notified when the file is ready");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export users"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || reason.trim().length < 5} onClick={run}>
            {busy ? "Queueing…" : "Export CSV"}
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        {total.toLocaleString("en-IN")} row{total === 1 ? "" : "s"} match the current filters.
      </p>
      <NoteBlock tone="warning">
        This file contains personal data — names, phone numbers and cities. The export, your name and
        the reason below are recorded in the audit log, and the file expires on its own.
      </NoteBlock>
      <div className="mt-3">
        <label className="mb-1 block text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
          Why do you need it?
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. quarterly broker outreach approved by Rajan"
          className="h-10 w-full rounded-8 border px-3 text-[14px] outline-none"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
        />
      </div>
      {error && (
        <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

function RoleChip({ role }: { role: string }) {
  const map: Record<string, [string, string]> = {
    Owner: ["var(--surface-2)", "var(--ink-secondary)"],
    Broker: ["var(--info-soft)", "var(--info)"],
    Builder: ["var(--accent-soft)", "var(--accent)"],
  };
  const [bg, fg] = map[role] ?? ["var(--surface-2)", "var(--ink-tertiary)"];
  return (
    <Badge bg={bg} fg={fg}>
      {role}
    </Badge>
  );
}

/** The design's verification cluster: a tick per level the user actually holds. */
function VerifCluster({ v, deleted }: { v: { id: boolean; rera: boolean }; deleted: boolean }) {
  if (deleted) return <span style={{ color: "var(--ink-tertiary)" }}>—</span>;
  if (!v.id && !v.rera) return <span style={{ color: "var(--ink-tertiary)" }}>—</span>;
  return (
    <span className="inline-flex gap-1">
      {v.id && (
        <Badge bg="var(--surface-2)" fg="var(--ink-secondary)">
          ID
        </Badge>
      )}
      {v.rera && (
        <Badge bg="var(--info-soft)" fg="var(--info)">
          RERA
        </Badge>
      )}
    </span>
  );
}

function IconBtn({ label, icon, onClick }: { label: string; icon: "sliders" | "download"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-8 border"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-secondary)" }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function Th({ children, width, desktopOnly }: { children?: React.ReactNode; width?: number; desktopOnly?: boolean }) {
  return (
    <th
      className={desktopOnly ? "hidden desktop:table-cell" : undefined}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink-secondary)",
        background: "var(--surface-2)",
        whiteSpace: "nowrap",
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, desktopOnly }: { children?: React.ReactNode; desktopOnly?: boolean }) {
  return (
    <td
      className={desktopOnly ? "hidden desktop:table-cell" : undefined}
      style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink-primary)", verticalAlign: "middle" }}
    >
      {children}
    </td>
  );
}
