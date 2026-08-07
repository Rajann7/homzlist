"use client";

/**
 * A7 — Verification queue. Template 868-892, detail sheet 1666, and its three
 * confirmations (1674 reject, 1679 revoke, 1684 grant badge).
 *
 * The checklist and the entered fields differ by LEVEL: a RERA certificate is
 * checked against the state portal and an expiry, an ID against the photo and
 * the name. The design draws both; which one appears is the row's own level.
 *
 * The grant-badge confirmation carries the sentence that matters most on this
 * screen (template 1684): a badge says identity verified, never property
 * verified. It is the difference between a claim HomzList can stand behind and
 * one it cannot.
 */

import { useState } from "react";
import {
  AdminIcon,
  Badge,
  Btn,
  Modal,
  PageHead,
  QueueTable,
  RightSheet,
  Shimmer,
  StatusBadge,
  Avatar,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup, ListError } from "@/components/admin/list";
import { QueueTabs, ageOf, initialsOf } from "./shared";
import { EmptyQueue, SheetRow, SheetSection } from "./RequirementsQueue";

type Row = {
  id: string;
  status: string;
  level: string;
  doc_type: string | null;
  doc_key: string | null;
  rera_number: string | null;
  valid_till: string | null;
  reason: string | null;
  submitted_at: string | null;
  created_at: string;
  profile_id: string;
  user_name: string | null;
  user_role: string | null;
};

const FILTER_KEYS = ["level", "role", "from", "to"] as const;

const TABS: [string, string][] = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["revoked", "Revoked"],
];

const RERA_REASONS = [
  "RERA number not found on portal",
  "Certificate doesn't match the number",
  "Certificate expired",
  "Document illegible",
];
const ID_REASONS = [
  "Photo doesn't match profile",
  "Document illegible or expired",
  "Name doesn't match account",
  "Suspected fake document",
];

export function VerificationsQueue({ options }: { options: { roles: { value: string; label: string }[] } }) {
  const toast = useToast();
  const list = useAdminList<Row>("verifications", FILTER_KEYS, "pending");
  const [open, setOpen] = useState<Row | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tab = list.tab ?? "pending";
  const rows = list.data?.rows ?? [];

  const groups: FilterGroup[] = [
    {
      key: "level",
      label: "Level",
      options: [
        { value: "id", label: "ID" },
        { value: "rera", label: "RERA" },
        { value: "phone", label: "Phone" },
      ],
    },
    { key: "role", label: "Role", options: options.roles },
  ];

  const cols: Col<Row>[] = [
    {
      label: "User",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar initials={initialsOf(r.user_name)} size={28} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.user_name}</div>
            <div style={{ marginTop: 2 }}>
              <Badge
                bg="var(--s2)"
                fg="var(--ink3)"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {r.user_role ?? ""}
              </Badge>
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "Level",
      cell: (r) => (
        <Badge
          bg={r.level === "rera" ? "var(--infoSoft)" : "var(--s2)"}
          fg={r.level === "rera" ? "var(--info)" : "var(--ink2)"}
        >
          {r.level === "rera" ? "RERA" : r.level === "id" ? "ID" : "Phone"}
        </Badge>
      ),
    },
    {
      label: "Submitted",
      cell: (r) => (
        <span style={{ color: "var(--ink3)" }}>
          {r.submitted_at ? `${ageOf(r.submitted_at).text} ago` : "—"}
        </span>
      ),
    },
    {
      label: "Docs",
      cell: (r) => (
        <span style={{ color: "var(--ink2)" }}>{r.doc_key ? "1 file" : "no file"}</span>
      ),
    },
    { label: "Status", cell: (r) => <StatusBadge status={statusLabel(r.status)} /> },
    {
      label: "",
      w: 40,
      cell: () => (
        <span style={{ color: "var(--ink3)" }}>
          <AdminIcon name="chevR" size={16} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead title="Verification queue" />

      <QueueTabs tabs={TABS} active={tab} counts={list.data?.tabCounts ?? {}} onPick={list.setTab} />

      <FilterBar
        placeholder="Search user or RERA number…"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${list.data?.total ?? 0} verifications`}
      />

      {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          Nothing here.
        </div>
      ) : (
        <>
          <QueueTable<Row> cols={cols} rows={rows} onRow={(r) => setOpen(r)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
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

      {open ? (
        <VerificationSheet
          row={open}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            setOpen(null);
            toast(msg);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "approved") return "Verified";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  return "Suspended"; // revoked — the design has no separate chip for it
}

/* template 1666-1684 */
function VerificationSheet({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const toast = useToast();
  const rera = row.level === "rera";
  const [confirm, setConfirm] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [reason, setReason] = useState(rera ? RERA_REASONS[0] : ID_REASONS[0]);
  const [revokeReason, setRevokeReason] = useState("Certificate expired");
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const checklist = [
    "Name matches account",
    "Document is legible and unexpired",
    rera ? "RERA number format is valid" : "Photo matches profile",
    rera ? "Certificate matches the number" : "Address is readable",
  ];

  async function send(action: "approve" | "reject" | "revoke", why?: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/queues/verifications/${row.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, reason: why }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean } | null;
    setBusy(false);
    setConfirm(null);
    if (!json?.ok) {
      toast("That didn't go through — it may already be decided");
      return;
    }
    onDone(
      action === "approve"
        ? "Badge granted"
        : action === "reject"
          ? "Verification rejected · user notified"
          : "Verification revoked",
    );
  }

  const levelLabel = rera ? "RERA" : "ID";

  return (
    <>
      <RightSheet
        title="Verification"
        onClose={onClose}
        footer={
          row.status === "approved" ? (
            <Btn label="Revoke" kind="danger" style={{ flex: 1 }} onClick={() => setConfirm("revoke")} />
          ) : (
            <>
              <Btn label="Reject" kind="danger" style={{ flex: 1 }} onClick={() => setConfirm("reject")} />
              <Btn
                label="Approve & grant badge"
                kind="primary"
                style={{ flex: 1 }}
                onClick={() => setConfirm("approve")}
              />
            </>
          )
        }
      >
        <div
          style={{
            height: 180,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background:
              "repeating-linear-gradient(135deg,var(--s2),var(--s2) 10px,var(--s3) 10px,var(--s3) 20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink3)",
            position: "relative",
          }}
        >
          <AdminIcon name="file" size={32} />
          {!row.doc_key ? (
            <span style={{ position: "absolute", bottom: 10, fontSize: 11 }}>
              No document was uploaded
            </span>
          ) : null}
        </div>

        <SheetSection>Entered fields</SheetSection>
        {rera ? (
          <>
            <SheetRow label="RERA number" value={row.rera_number ?? "not given"} />
            <SheetRow
              label="Valid till"
              value={
                row.valid_till
                  ? new Date(row.valid_till).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "not given"
              }
            />
            <SheetRow label="Certificate" value={row.doc_type ?? "—"} />
          </>
        ) : (
          <>
            <SheetRow label="Doc type" value={row.doc_type ?? "—"} />
            <SheetRow label="Name on doc" value={row.user_name ?? "—"} />
          </>
        )}

        <SheetSection>Checklist</SheetSection>
        {checklist.map((t, i) => (
          <label
            key={i}
            style={{
              display: "flex",
              gap: 8,
              fontSize: 12,
              color: "var(--ink2)",
              padding: "4px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(checks[i])}
              onChange={() => setChecks((c) => ({ ...c, [i]: !c[i] }))}
              style={{ accentColor: "var(--accent)" }}
            />
            {t}
          </label>
        ))}

        {row.reason ? (
          <>
            <SheetSection>Previous decision</SheetSection>
            <div style={{ fontSize: 12, color: "var(--ink2)" }}>{row.reason}</div>
          </>
        ) : null}
      </RightSheet>

      {confirm === "approve" ? (
        <Modal
          title={`Grant ${levelLabel} Verified badge to ${row.user_name ?? "this user"}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirm(null)} />
              <Btn
                label={busy ? "Granting…" : "Grant badge"}
                kind="primary"
                onClick={() => send("approve")}
              />
            </>
          }
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--ink3)",
              background: "var(--infoSoft)",
              padding: 10,
              borderRadius: 8,
            }}
          >
            Badges say identity verified — never property verified.
          </div>
        </Modal>
      ) : null}

      {confirm === "reject" ? (
        <Modal
          title={`Reject ${levelLabel} verification?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirm(null)} />
              <Btn
                label={busy ? "Rejecting…" : "Reject"}
                kind="dangerFill"
                onClick={() => send("reject", reason)}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 8 }}>Reason</div>
          {(rera ? RERA_REASONS : ID_REASONS).map((r) => (
            <label
              key={r}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                checked={reason === r}
                onChange={() => setReason(r)}
                style={{ accentColor: "var(--accent)" }}
              />
              {r}
            </label>
          ))}
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "var(--warningSoft)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--ink2)",
            }}
          >
            The user is notified and can re-submit with corrected documents.
          </div>
        </Modal>
      ) : null}

      {confirm === "revoke" ? (
        <Modal
          title={`Revoke ${levelLabel} verification?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirm(null)} />
              <Btn
                label={busy ? "Revoking…" : "Revoke"}
                kind="dangerFill"
                onClick={() => send("revoke", revokeReason)}
              />
            </>
          }
        >
          <input
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            placeholder="Reason…"
            style={{
              width: "100%",
              height: 40,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s2)",
              color: "var(--ink1)",
              fontSize: 13,
            }}
          />
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "var(--warningSoft)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--ink2)",
            }}
          >
            The badge is removed immediately and the user is notified.
          </div>
        </Modal>
      ) : null}
    </>
  );
}
