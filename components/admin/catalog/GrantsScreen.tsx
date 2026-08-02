"use client";

/**
 * A15 — Grants & trials. Template 1252-1272.
 *
 * The log of every trial ever given, and the two things you can still do to a
 * live one: extend it, or revoke it.
 *
 * "+ New grant" opens A11's OWN sheet, against the same endpoint the user panel
 * uses. There is one grant path in the app, so this screen can never record a
 * grant the user panel would have made differently.
 *
 * Revoking withdraws the PLAN, not just the log row — the quota check reads
 * `user_plans`, so a revocation that left the plan active would have given the
 * user everything anyway.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  GatedBtn,
  Modal,
  PageHead,
  RoleChip,
  SheetMenu,
  Shimmer,
  ToolCol,
  useToast,
  usePanels,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";
import { GrantTrialOverlay, makeRunner } from "../users/overlays";

export type GrantRow = {
  id: string;
  profile_id: string;
  user_name: string | null;
  user_role: string | null;
  contents: Record<string, number>;
  duration_days: number | null;
  reason: string;
  granted_by_name: string;
  created_at: string;
  expires_at: string | null;
  status_key: string;
  expiring_soon: boolean;
};

const FILTER_KEYS = ["role", "by", "from", "to"] as const;
const CHIPS: [key: string, label: string][] = [
  ["active", "Active"],
  ["expired", "Expired"],
  ["all", "All"],
];

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

const roleLabel = (r: string | null) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Owner");

/** "1 listing · 1 requirement · 10 proposals" — the design's Granted cell. */
export function grantedChips(contents: Record<string, number>): string[] {
  const out: string[] = [];
  const add = (n: unknown, one: string, many: string) => {
    const v = Number(n ?? 0);
    if (v > 0) out.push(`${v} ${v === 1 ? one : many}`);
  };
  add(contents?.listings, "listing", "listings");
  add(contents?.requirements, "requirement", "requirements");
  add(contents?.proposals, "proposal", "proposals");
  add(contents?.projects, "project", "projects");
  return out.length ? out : ["nothing"];
}

/** "2 Feb 2025 · 8 days left" / "Expired 10 Jan" — the design's Expires cell. */
export function expiresLabel(r: GrantRow): string {
  if (r.status_key === "revoked") return "Revoked";
  if (!r.expires_at) return "No expiry";
  const end = new Date(r.expires_at);
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  const date = end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return days > 0 ? `${date} · ${days} day${days === 1 ? "" : "s"} left` : `Expired ${date}`;
}

export function GrantsScreen() {
  const toast = useToast();
  const { pushPanel, changed } = usePanels();
  const list = useAdminList<GrantRow>("grants", FILTER_KEYS, "active");

  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [rowMenu, setRowMenu] = useState<GrantRow | null>(null);
  const [dialog, setDialog] = useState<"extend" | "revoke" | null>(null);
  const [newGrant, setNewGrant] = useState<{ id: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);

  const tab = list.tab ?? "active";
  const rows = list.data?.rows ?? [];
  const counts = list.data?.tabCounts ?? {};

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/v1/admin/grants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    if (!json?.ok) {
      toast(json?.error?.message ?? "That didn't go through");
      return false;
    }
    toast(`${json.data?.summary} · logged`);
    list.reload();
    return true;
  }

  return (
    <div>
      <PageHead
        title="Grants &amp; trials"
        right={
          <GatedBtn label="+ New grant" kind="primary" need="admin" onClick={() => setPicking(true)} />
        }
      />

      <div
        style={{
          background: "var(--warningSoft)",
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
        <span style={{ color: "var(--warning)" }}>
          <AdminIcon name="info" size={16} />
        </span>
        Trials are never shown to users as an option. They only appear after you grant them. Every
        grant is logged.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {CHIPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => list.setTab(key)}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${tab === key ? "var(--accent)" : "var(--border)"}`,
              background: tab === key ? "var(--accentSoft)" : "var(--s1)",
              color: tab === key ? "var(--accent)" : "var(--ink2)",
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {key === "all" ? label : `${label} ${counts[key] ?? 0}`}
          </button>
        ))}
      </div>

      {/* NO FILTER BAR. Template 1270 is `head, note, chipRow, table`
          — the chips ARE the narrowing this screen offers, and the design draws
          nothing else. The engine still honours ?q= and the filter keys, so a
          saved link or an export URL narrows exactly as it always did; what is
          gone is a control the design never had. Same miss as A12's mobile. */}

      {list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No grants here.
        </div>
      ) : (
        <>
          {/* mobile — template 1258 */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar initials={(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={28} />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {r.user_name}
                  </span>
                  <RoleChip role={roleLabel(r.user_role)} />
                </div>
                <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 6 }}>
                  {grantedChips(r.contents).join(" · ")}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: r.expiring_soon ? "var(--warning)" : "var(--ink3)",
                    marginTop: 4,
                    fontWeight: r.expiring_soon ? 600 : 400,
                  }}
                >
                  {expiresLabel(r)}
                </div>
              </div>
            ))}
          </div>

          {/* tablet + desktop — template 1261 */}
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
                  <Th>User</Th>
                  <Th>Granted</Th>
                  <Th tabletHidden>Duration</Th>
                  <Th>Expires</Th>
                  <Th tabletHidden>Reason</Th>
                  <Th tabletHidden>Granted by</Th>
                  <Th>Date</Th>
                  <Th w={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                    <Td>
                      <span
                        onClick={() => pushPanel("user", { id: r.profile_id, name: r.user_name })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                      >
                        <Avatar initials={(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={24} />
                        {r.user_name}
                        <span style={{ marginLeft: 4 }}>
                          <RoleChip role={roleLabel(r.user_role)} />
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {grantedChips(r.contents).map((g) => (
                          <Badge
                            key={g}
                            bg="var(--accentSoft)"
                            fg="var(--accent)"
                            style={{ textTransform: "none", letterSpacing: 0 }}
                          >
                            {g}
                          </Badge>
                        ))}
                      </span>
                    </Td>
                    <Td tabletHidden>{r.duration_days ? `${r.duration_days} days` : "—"}</Td>
                    <Td>
                      <span
                        style={{
                          color: r.expiring_soon ? "var(--warning)" : "var(--ink2)",
                          fontWeight: r.expiring_soon ? 600 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {expiresLabel(r)}
                      </span>
                    </Td>
                    <Td tabletHidden>
                      <span
                        title={r.reason}
                        style={{
                          color: "var(--ink2)",
                          display: "inline-block",
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.reason}
                      </span>
                    </Td>
                    <Td tabletHidden>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Avatar initials={r.granted_by_name.slice(0, 2).toUpperCase()} size={22} />
                        {r.granted_by_name}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: "var(--ink2)" }}>{day(r.created_at)}</span>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        aria-label="Grant actions"
                        onClick={() => setRowMenu(r)}
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

      {/* template 1711 */}
      {rowMenu && !dialog ? (
        <SheetMenu onClose={() => setRowMenu(null)}>
          <ToolCol
            items={[
              ["Open user", () => pushPanel("user", { id: rowMenu.profile_id, name: rowMenu.user_name })],
              ["Extend", () => setDialog("extend")],
              ["Revoke", () => setDialog("revoke"), true],
            ]}
            onPick={() => undefined}
          />
        </SheetMenu>
      ) : null}

      {dialog && rowMenu ? (
        <GrantDialog
          which={dialog}
          onClose={() => {
            setDialog(null);
            setRowMenu(null);
          }}
          onGo={async (reason, days) => {
            const okay = await act(
              dialog === "extend"
                ? { action: "extend", id: rowMenu.id, days, reason }
                : { action: "revoke", id: rowMenu.id, reason },
            );
            if (okay) {
              setDialog(null);
              setRowMenu(null);
            }
          }}
        />
      ) : null}

      {/* "+ New grant" — find the user, then A11's own sheet */}
      {picking ? (
        <UserPicker
          onClose={() => setPicking(false)}
          onPick={(u) => {
            setPicking(false);
            setNewGrant(u);
          }}
        />
      ) : null}
      {newGrant ? (
        <GrantTrialOverlay
          run={makeRunner(newGrant.id)}
          userName={newGrant.name}
          onClose={() => setNewGrant(null)}
          onDone={(m) => {
            setNewGrant(null);
            toast(m);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** template 1727 — the sheet's own "Search phone or name", made real. */
function UserPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (u: { id: string; name: string }) => void;
}) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<{ id: string; name: string; phone: string; role: string }[]>([]);

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) return setRows([]);
    const res = await fetch(`/api/v1/admin/list/users?q=${encodeURIComponent(value.trim())}&pageSize=8`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean; data?: { rows: typeof rows } } | null;
    setRows(json?.data?.rows ?? []);
  }

  return (
    <Modal
      title="Grant a trial to…"
      onClose={onClose}
      footer={<Btn label="Cancel" kind="outline" onClick={onClose} />}
    >
      <div
        style={{
          height: 40,
          background: "var(--s2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          marginBottom: 10,
        }}
      >
        <AdminIcon name="search" size={16} />
        <input
          autoFocus
          value={term}
          onChange={(e) => search(e.target.value)}
          placeholder="Search phone or name"
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            color: "var(--ink1)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>
      {rows.map((u) => (
        <div
          key={u.id}
          onClick={() => onPick({ id: u.id, name: u.name })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 0",
            borderTop: "1px solid var(--divider)",
            cursor: "pointer",
          }}
        >
          <Avatar initials={(u.name ?? "U").slice(0, 2).toUpperCase()} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{u.phone}</div>
          </div>
          <RoleChip role={roleLabel(u.role)} />
        </div>
      ))}
      {term.length >= 2 && rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)", padding: "10px 0" }}>Nobody matches.</div>
      ) : null}
    </Modal>
  );
}

function GrantDialog({
  which,
  onClose,
  onGo,
}: {
  which: "extend" | "revoke";
  onClose: () => void;
  onGo: (reason: string, days: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const extend = which === "extend";
  return (
    <Modal
      title={extend ? "Extend this trial?" : "Revoke this grant?"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Working…" : extend ? "Extend" : "Revoke"}
            kind={extend ? "primary" : "dangerFill"}
            onClick={() => {
              if (!reason.trim()) return;
              setBusy(true);
              onGo(reason, days);
            }}
          />
        </>
      }
    >
      {extend ? (
        <>
          <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 6 }}>Extend by</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${days === d ? "var(--accent)" : "var(--border)"}`,
                  background: days === d ? "var(--accentSoft)" : "var(--s1)",
                  color: days === d ? "var(--accent)" : "var(--ink2)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {d} days
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink2)" }}>
          The trial plan is withdrawn immediately and the user is told. Anything they already
          consumed stays consumed.
        </div>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)…"
        style={{
          width: "100%",
          height: 56,
          marginTop: 10,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
        }}
      />
    </Modal>
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
