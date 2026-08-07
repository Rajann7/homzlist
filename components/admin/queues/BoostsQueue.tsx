"use client";

/**
 * A6 — Boost queue. Template 849-866, detail sheet 1652, and the two
 * confirmations it opens (1659 approve, 1661 reject & refund).
 *
 * Every row here has ALREADY BEEN PAID FOR. That is why the amount and the
 * payment reference are on the row and why rejecting asks for a reason: the
 * button labelled "Reject & refund" moves ₹1,499 back, and the design says so
 * on the confirmation. The eligibility checks are real reads, not ticks — a
 * boost whose listing went hidden while it waited must not start.
 */

import { useEffect, useState } from "react";
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
  Thumb,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup, ListError } from "@/components/admin/list";
import { QueueTabs, ageOf, money } from "./shared";
import { EmptyQueue, SheetRow, SheetSection } from "./RequirementsQueue";

type Row = {
  id: string;
  status: string;
  created_at: string;
  subject_kind: string;
  subject_id: string;
  targeting: string;
  target_label: string | null;
  duration_days: number;
  price_paise: number;
  poster_id: string;
  poster_name: string | null;
  subject_title: string | null;
  subject_status: string | null;
  subject_cover_url: string | null;
  subject_price_paise: number | null;
  payment_ref: string | null;
  payment_status: string | null;
  payment_method: string | null;
};

const FILTER_KEYS = ["targeting", "kind", "status", "from", "to"] as const;

const TABS: [string, string][] = [
  ["pending", "Pending"],
  ["payment", "Payment pending"],
  ["rejected", "Rejected"],
];

const REFUND_REASONS = [
  "Listing hidden during review",
  "Content violates policy",
  "Duplicate boost",
];

export function BoostsQueue() {
  const toast = useToast();
  const list = useAdminList<Row>("boosts", FILTER_KEYS, "pending");
  const [open, setOpen] = useState<Row | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tab = list.tab ?? "pending";
  const rows = list.data?.rows ?? [];

  const groups: FilterGroup[] = [
    {
      key: "targeting",
      label: "Targeting",
      options: [
        { value: "area", label: "Area" },
        { value: "city", label: "City" },
        { value: "state", label: "State" },
        { value: "india", label: "All India" },
      ],
    },
    {
      key: "kind",
      label: "Subject",
      options: [
        { value: "listing", label: "Listing" },
        { value: "project", label: "Project" },
        { value: "requirement", label: "Requirement" },
      ],
    },
  ];

  const cols: Col<Row>[] = [
    {
      label: "Boost",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Thumb size={40} src={r.subject_cover_url} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.subject_title ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{`Boost #${r.id.slice(0, 8)}`}</div>
          </div>
        </div>
      ),
    },
    { label: "Duration", cell: (r) => `${r.duration_days} days` },
    {
      label: "Targeting",
      cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.target_label ?? r.targeting}</span>,
    },
    {
      label: "Amount",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>{money(r.price_paise)}</span>
          {r.payment_status === "success" ? (
            <Badge
              bg="var(--accentSoft)"
              fg="var(--accent)"
              style={{ textTransform: "none", letterSpacing: 0 }}
            >
              Paid ✓
            </Badge>
          ) : (
            <Badge
              bg="var(--warningSoft)"
              fg="var(--warning)"
              style={{ textTransform: "none", letterSpacing: 0 }}
            >
              Unpaid
            </Badge>
          )}
        </div>
      ),
    },
    {
      label: "Requested",
      cell: (r) => <span style={{ color: "var(--ink3)" }}>{ageOf(r.created_at).text}</span>,
    },
    {
      label: "Listing",
      cell: (r) => <StatusBadge status={subjectLabel(r.subject_status)} />,
    },
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
      <PageHead
        title="Boost queue"
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
            {`${list.data?.tabCounts?.[tab] ?? 0} ${
              TABS.find((t) => t[0] === tab)?.[1].toLowerCase() ?? "pending"
            }`}
          </Badge>
        }
      />

      <QueueTabs tabs={TABS} active={tab} counts={list.data?.tabCounts ?? {}} onPick={list.setTab} />

      <FilterBar
        placeholder="Search listing, poster or payment ID…"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${list.data?.total ?? 0} boosts`}
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
        <EmptyQueue note="No boosts are waiting for a decision." />
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
        <BoostSheet
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

function subjectLabel(status: string | null): string {
  if (status === "live") return "Live";
  if (status === "hidden") return "Hidden";
  if (status === "pending_review") return "Pending";
  return status ?? "—";
}

/* template 1652-1664 */
function BoostSheet({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<"approve" | "refund" | null>(null);
  const [refundReason, setRefundReason] = useState(REFUND_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<{ label: string; ok: boolean }[] | null>(null);

  // The eligibility list is READ, not assumed: the listing may have gone hidden
  // or sold while the boost sat in the queue, and the whole point of the strip
  // is to say so before the money is committed.
  useEffect(() => {
    setChecks([
      { label: "Listing is live", ok: row.subject_status === "live" },
      { label: "Payment verified", ok: row.payment_status === "success" },
      { label: `Targeting: ${row.target_label ?? row.targeting}`, ok: Boolean(row.target_label) },
    ]);
  }, [row]);

  async function send(action: "approve" | "reject", reason?: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/queues/boosts/${row.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, reason }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; error?: { code: string; cityCapReached?: boolean } }
      | null;
    setBusy(false);
    setConfirm(null);
    if (!json?.ok) {
      toast(
        json?.error?.code === "PAYMENT_PENDING"
          ? "Not paid — this order was never captured, or has been refunded"
          : json?.error?.code === "LISTING_STATE_LOCKED"
            ? "That boost is no longer eligible — its listing changed"
            : "That didn't go through — try again",
      );
      return;
    }
    onDone(action === "approve" ? "Boost approved" : "Refund queued");
  }

  return (
    <>
      <RightSheet
        title={`Boost #${row.id.slice(0, 8)}`}
        onClose={onClose}
        footer={
          <>
            <Btn label="Reject & refund" kind="danger" onClick={() => setConfirm("refund")} />
            <Btn
              label="Approve boost"
              kind="primary"
              style={{ flex: 1 }}
              onClick={() => setConfirm("approve")}
            />
          </>
        }
      >
        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ height: 150, background: "var(--s2)" }}>
            {row.subject_cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.subject_cover_url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </div>
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "var(--promoted)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".3px",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            Promoted
          </span>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{money(row.subject_price_paise)}</div>
            <div style={{ fontSize: 12, color: "var(--ink2)" }}>{row.subject_title}</div>
          </div>
        </div>

        <SheetSection>Payment</SheetSection>
        <div style={{ background: "var(--s2)", borderRadius: 8, padding: 12, fontSize: 13 }}>
          {row.payment_ref ? (
            <div>
              {`${row.payment_ref} · ${row.payment_method ?? "—"} · ${money(row.price_paise)} · ${
                row.payment_status === "success" ? "verified ✓" : (row.payment_status ?? "unpaid")
              }`}
            </div>
          ) : (
            <div style={{ color: "var(--warning)" }}>
              No successful payment is linked to this boost yet.
            </div>
          )}
        </div>

        <SheetSection>Targeting</SheetSection>
        <SheetRow label="Area" value={row.target_label ?? row.targeting} />
        <SheetRow label="Duration" value={`${row.duration_days} days`} />

        <SheetSection>Eligibility checks</SheetSection>
        {(checks ?? []).map((c) => (
          <div
            key={c.label}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 0" }}
          >
            <span style={{ color: c.ok ? "var(--accent)" : "var(--error)" }}>
              <AdminIcon name={c.ok ? "check" : "x"} size={16} />
            </span>
            {c.label}
          </div>
        ))}
      </RightSheet>

      {confirm === "approve" ? (
        <Modal
          title="Approve boost?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirm(null)} />
              <Btn
                label={busy ? "Approving…" : "Approve boost"}
                kind="primary"
                onClick={() => send("approve")}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.5 }}>
            {`It starts immediately and runs for ${row.duration_days} days.`}
          </div>
        </Modal>
      ) : null}

      {confirm === "refund" ? (
        <Modal
          title="Reject & refund boost?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirm(null)} />
              <Btn
                label={busy ? "Refunding…" : "Reject & refund"}
                kind="dangerFill"
                onClick={() => send("reject", refundReason)}
              />
            </>
          }
        >
          {REFUND_REASONS.map((r) => (
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
                checked={refundReason === r}
                onChange={() => setRefundReason(r)}
                style={{ accentColor: "var(--accent)" }}
              />
              {r}
            </label>
          ))}
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "var(--accentSoft)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--ink2)",
            }}
          >
            {`${money(row.price_paise)} will be refunded automatically within 5–7 days and the poster notified.`}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
