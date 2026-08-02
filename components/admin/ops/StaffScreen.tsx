"use client";

/**
 * A25 — Staff. Template 2522-2564.
 *
 * The whitelist, plus the permission matrix under it. The matrix is RENDERED
 * FROM the same list the server authorises against (`CAPABILITIES` in
 * lib/admin/staff-admin.ts), so the table an admin reads cannot drift from what
 * the endpoints actually allow — a hand-written second copy is how a matrix
 * ends up documenting permissions nobody has.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  Modal,
  NoteStrip,
  PageHead,
  RoleChip,
  RowMenu,
  Shimmer,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";

type Row = {
  id: string;
  profile_id: string;
  email: string;
  display_name: string;
  level: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  added_by_name: string | null;
  is_online: boolean;
  pending_first_login: boolean;
  action_count: number;
};

type Capability = { label: string; min: "staff" | "admin" | "super" };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/system", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

const shortDate = (iso: unknown) =>
  iso ? new Date(String(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 5) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export function StaffScreen({ meId }: { meId: string }) {
  const toast = useToast();
  const list = useAdminList<Row>("staff", ["level", "active"]);
  const [adding, setAdding] = useState(false);
  const [roleOf, setRoleOf] = useState<Row | null>(null);
  const [perfOf, setPerfOf] = useState<Row | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/admin/system?what=capabilities", { cache: "no-store" }).catch(
        () => null,
      );
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { capabilities: Capability[] } }
        | null;
      setCaps(json?.ok ? (json.data?.capabilities ?? []) : []);
    })();
  }, []);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<Row>[] = [
    {
      label: "Staff",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar initials={(r.display_name ?? "??").slice(0, 2).toUpperCase()} size={32} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              {r.display_name}
              {r.id === meId ? (
                <Badge bg="var(--accentSoft)" fg="var(--accent)" style={{ textTransform: "none", letterSpacing: 0 }}>
                  You
                </Badge>
              ) : null}
              {!r.is_active ? (
                <Badge bg="var(--errorSoft)" fg="var(--error)" style={{ textTransform: "none", letterSpacing: 0 }}>
                  Removed
                </Badge>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      label: "Role",
      cell: (r) => (
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (r.id !== meId) setRoleOf(r);
          }}
          style={{ cursor: r.id === meId ? "default" : "pointer" }}
        >
          <RoleChip role={r.level} />
        </span>
      ),
    },
    {
      label: "Added by",
      cell: (r) =>
        r.added_by_name ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Avatar initials={r.added_by_name.slice(0, 2).toUpperCase()} size={20} />
            {r.added_by_name}
          </span>
        ) : (
          <span style={{ color: "var(--ink3)" }}>—</span>
        ),
    },
    { label: "Added", cell: (r) => <span style={{ color: "var(--ink2)" }}>{shortDate(r.created_at)}</span> },
    {
      label: "Last login",
      cell: (r) =>
        r.pending_first_login ? (
          <Badge bg="var(--warningSoft)" fg="var(--warning)" style={{ textTransform: "none", letterSpacing: 0 }}>
            Pending first login
          </Badge>
        ) : (
          <span style={{ color: "var(--ink2)" }}>{ago(r.last_login_at)}</span>
        ),
    },
    {
      label: "Online",
      cell: (r) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: r.is_online ? "var(--accent)" : "var(--ink3)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: r.is_online ? "var(--accent)" : "var(--inkDis)",
            }}
          />
          {r.is_online ? "Online" : "Offline"}
        </span>
      ),
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["View performance", () => setPerfOf(r)],
            r.id !== meId && ["Change role", () => setRoleOf(r)],
            r.id !== meId && [
              "Sign out everywhere",
              () => void act({ action: "staff_signout", id: r.id }),
            ],
            r.id !== meId &&
              r.is_active && [
                "Remove access",
                () => void act({ action: "staff_revoke", id: r.id }),
                true,
              ],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="Staff"
        right={<Btn label="+ Add staff" kind="primary" onClick={() => setAdding(true)} />}
      />
      <NoteStrip tone="ok">
        Admins sign in with Google only. Only emails added here can access the panel. Removing an
        email revokes access instantly.
      </NoteStrip>

      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => setPerfOf(r)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      <div style={{ fontSize: 15, fontWeight: 600, margin: "24px 0 10px" }}>Permission matrix</div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}>
          <thead>
            <tr>
              {["Capability", "Staff", "Admin", "Super Admin"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i ? "center" : "left",
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink2)",
                    background: "var(--s2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caps.map((c) => (
              <tr key={c.label} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ padding: "10px 16px", fontSize: 13 }}>{c.label}</td>
                {(["staff", "admin", "super"] as const).map((col) => {
                  const rank = { staff: 1, admin: 2, super: 3 };
                  const allowed = rank[col] >= rank[c.min];
                  return (
                    <td key={col} style={{ padding: "10px 16px", textAlign: "center" }}>
                      {allowed ? (
                        <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                          <AdminIcon name="check" size={16} />
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink3)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <AddStaff
          onClose={() => setAdding(false)}
          onDone={(msg) => {
            toast(msg);
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}

      {roleOf ? (
        <ChangeRole
          row={roleOf}
          onClose={() => setRoleOf(null)}
          onDone={(msg) => {
            toast(msg);
            setRoleOf(null);
            list.reload();
          }}
        />
      ) : null}

      {perfOf ? <StaffPerformance row={perfOf} onClose={() => setPerfOf(null)} /> : null}
    </div>
  );
}

function AddStaff({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title="Add staff"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Adding…" : "Add"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({ action: "staff_add", email, name, level });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Added"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <NoteStrip tone="ok">
        There is no password to set. Adding the email is the invitation — they sign in with Google
        at account.homzlist.com and the whitelist lets them through.
      </NoteStrip>
      <FField label="Google email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@homzlist.com"
          style={F_INPUT_STYLE}
        />
      </FField>
      <FField label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Role">
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={F_INPUT_STYLE}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="super">Super Admin</option>
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

function ChangeRole({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [level, setLevel] = useState(row.level);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`Change role — ${row.display_name}`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({ action: "staff_role", id: row.id, level });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <FField label="Role">
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={F_INPUT_STYLE}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="super">Super Admin</option>
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/** template 2545 — every number a real count over the audit log. */
function StaffPerformance({ row, onClose }: { row: Row; onClose: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/admin/system?what=staff-perf&id=${row.id}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: Record<string, unknown> }
        | null;
      setData(json?.ok ? (json.data ?? null) : null);
    })();
  }, [row.id]);

  const activity = (data?.activity ?? []) as { bucket: string; n: number }[];
  const max = Math.max(1, ...activity.map((a) => a.n));
  const recent = (data?.recent ?? []) as {
    action: string;
    entity_label: string;
    created_at: string;
  }[];

  return (
    <Modal
      title={row.display_name}
      onClose={onClose}
      footer={<Btn label="Close" kind="outline" onClick={onClose} style={{ flex: 1 }} />}
    >
      {!data ? (
        <Shimmer h={240} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Avatar initials={row.display_name.slice(0, 2).toUpperCase()} size={44} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{row.display_name}</div>
              <RoleChip role={row.level} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              [String(data.approvals ?? 0), "Approvals"],
              [String(data.rejections ?? 0), "Rejections"],
              [String(data.tickets_closed ?? 0), "Tickets closed"],
              [String(data.total_actions_30d ?? 0), "Actions (30d)"],
            ].map(([v, l]) => (
              <div
                key={l}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--s2)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>{l}</div>
              </div>
            ))}
          </div>

          {activity.length ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Activity · 30 days</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginBottom: 16 }}>
                {activity.map((a) => (
                  <div
                    key={a.bucket}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  >
                    <div
                      title={`${a.n} actions`}
                      style={{
                        width: "100%",
                        maxWidth: 24,
                        height: `${Math.round((a.n / max) * 80)}px`,
                        background: "var(--accent)",
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                    <div style={{ fontSize: 10, color: "var(--ink3)" }}>
                      {new Date(a.bucket).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <NoteStrip tone="neutral">No actions in the last 30 days.</NoteStrip>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Recent actions</div>
          {recent.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)", padding: "10px 0" }}>Nothing yet.</div>
          ) : (
            recent.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 0",
                  borderTop: "1px solid var(--divider)",
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>{a.action}</span>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{a.entity_label}</span>
                <span style={{ fontSize: 11, color: "var(--ink3)" }}>{ago(a.created_at)}</span>
              </div>
            ))
          )}
        </>
      )}
    </Modal>
  );
}
