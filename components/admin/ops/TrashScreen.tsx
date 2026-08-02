"use client";

/**
 * A29 — Trash. Template 2692-2717.
 *
 * The design's eight chips are the resource's eight tabs, so each count is a
 * real count over the whole table. Two things this screen must not get wrong:
 *
 *  · "Purge in" is a countdown, and the row turns red when it has passed. That
 *    is derived from `purge_at` in SQL, never stored.
 *  · Purge is SUPER-ONLY and irreversible, so it takes a typed confirmation —
 *    enforced server-side, not by a disabled button.
 */

import { useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  Modal,
  ModTabs,
  NoteStrip,
  PageHead,
  Shimmer,
  Thumb,
  useAdminRole,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";

type Row = {
  id: string;
  entity_type: string;
  entity_id: string;
  label: string;
  deleted_by_kind: string;
  deleted_by_name: string | null;
  reason: string | null;
  deleted_at: string;
  purge_at: string | null;
  purge_days_left: number | null;
  purge_state: string;
};

const TABS: [string, string][] = [
  ["all", "All"],
  ["listings", "Listings"],
  ["requirements", "Requirements"],
  ["users", "Users"],
  ["chats", "Chats"],
  ["photos", "Photos"],
  ["projects", "Projects"],
  ["coupons", "Coupons"],
];

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

/** "18 days" · "Today" · "Purged soon" — the design's own wording. */
function purgeLabel(r: Row): string {
  if (r.purge_at === null) return "Held";
  const d = Math.floor(Number(r.purge_days_left ?? 0));
  if (d < 0) return "Purged soon";
  if (d === 0) return "Today";
  return `${d} day${d === 1 ? "" : "s"}`;
}

export function TrashScreen() {
  const toast = useToast();
  const role = useAdminRole();
  const list = useAdminList<Row>("trash", ["by"], "all");
  const [purging, setPurging] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const restore = async (r: Row) => {
    setBusy(r.id);
    const json = await post({ action: "trash_restore", id: r.id });
    setBusy(null);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const counts = list.data?.tabCounts ?? {};

  const cols: Col<Row>[] = [
    {
      label: "Item",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {r.entity_type === "user" ? (
            <Avatar initials={(r.label ?? "U").slice(0, 2).toUpperCase()} size={32} />
          ) : r.entity_type === "chat" ? (
            <span style={{ color: "var(--ink3)" }}>
              <AdminIcon name="msg" size={20} />
            </span>
          ) : (
            <Thumb size={32} />
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{r.entity_id.slice(0, 8)}</div>
          </div>
        </div>
      ),
    },
    {
      label: "Type",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {r.entity_type}
        </Badge>
      ),
    },
    {
      label: "Deleted by",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Badge
            bg={r.deleted_by_kind === "admin" ? "var(--infoSoft)" : "var(--s2)"}
            fg={r.deleted_by_kind === "admin" ? "var(--info)" : "var(--ink2)"}
            style={{ textTransform: "none", letterSpacing: 0 }}
          >
            {r.deleted_by_kind}
          </Badge>
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>{r.deleted_by_name ?? ""}</span>
        </span>
      ),
    },
    { label: "Deleted on", cell: (r) => <span style={{ color: "var(--ink2)" }}>{shortDate(r.deleted_at)}</span> },
    {
      label: "Purge in",
      cell: (r) => (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color:
              r.purge_state === "over"
                ? "var(--error)"
                : r.purge_state === "warn"
                  ? "var(--warning)"
                  : "var(--ink3)",
          }}
        >
          {purgeLabel(r)}
        </span>
      ),
    },
    {
      label: "Reason",
      cell: (r) => (
        <span
          title={r.reason ?? ""}
          style={{
            color: "var(--ink3)",
            display: "inline-block",
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.reason ?? "—"}
        </span>
      ),
    },
    {
      label: "",
      cell: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <Btn
            label={busy === r.id ? "…" : "Restore"}
            kind="outline"
            style={{ height: 30, fontSize: 12 }}
            onClick={() => void restore(r)}
          />
          {/* template 2712 — the Purge button exists for Super only */}
          {role === "super" ? (
            <Btn
              label="Purge"
              kind="danger"
              style={{ height: 30, fontSize: 12 }}
              onClick={() => setPurging(r)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  const rows = (list.data?.rows ?? []).map((r) => ({
    ...r,
    _hl: r.purge_state === "over" ? "var(--error)" : undefined,
  }));

  return (
    <div>
      <PageHead title="Trash" />
      <NoteStrip tone="neutral">
        Soft-deleted items. Everything here is recoverable until its purge date. Nothing is ever
        hard-deleted without the retention schedule.
      </NoteStrip>

      <ModTabs
        tabs={TABS.map(([k, l]) => [k, l, counts[k]] as [string, string, number | undefined])}
        active={list.tab ?? "all"}
        onSelect={list.setTab}
      />

      {list.loading ? (
        <Shimmer h={280} />
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 70, color: "var(--ink3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <AdminIcon name="inbox" size={80} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)" }}>Trash is empty</div>
          <div style={{ fontSize: 13 }}>Deleted items appear here until their purge date.</div>
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={rows} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {purging ? (
        <PurgeConfirm
          row={purging}
          onClose={() => setPurging(null)}
          onDone={(msg) => {
            toast(msg);
            setPurging(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PurgeConfirm({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`Purge ${row.label}`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Purging…" : "Purge permanently"}
            kind="danger"
            style={{ flex: 1 }}
            disabled={confirm !== "PURGE"}
            onClick={async () => {
              setBusy(true);
              const json = await post({ action: "trash_purge", id: row.id, confirm });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Purged"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <NoteStrip tone="warn">
        This deletes {row.label} permanently. It cannot be undone and it is not in any backup you
        can restore from the panel.
      </NoteStrip>
      <FField label="Type PURGE to confirm">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}
