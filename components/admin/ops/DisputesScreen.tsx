"use client";

/**
 * A24 — Disputes. Template 2484-2521.
 *
 * Doc3's Section-79 stance made operable. The screen exists so that when a
 * complaint arrives we can show we acted on it and preserved what it was about
 * — which is what the safe harbour actually turns on.
 *
 * "Preserve evidence" is therefore ONE-WAY and Super-only, and it does real
 * work: it holds the related trash rows from the purge job, so a nightly sweep
 * cannot delete the listing a dispute is about.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  ModTabs,
  Mono,
  NoteStrip,
  PageHead,
  Shimmer,
  StatusBadge,
  Thumb,
  useAdminRole,
  useToast,
  usePanels,
  type Col,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";

type Row = {
  id: string;
  number: string;
  category: string;
  summary: string;
  amount_claimed_paise: number | null;
  status: string;
  outcome: string | null;
  evidence_preserved: boolean;
  created_at: string;
  listing_id: string | null;
  listing_title: string | null;
  party_a: string;
  party_a_name: string | null;
  party_b: string | null;
  party_b_name: string | null;
};

const TABS: [string, string][] = [
  ["open", "Open"],
  ["review", "Under review"],
  ["resolved", "Resolved"],
];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

const rupees = (paise: unknown) =>
  paise ? `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}` : "—";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function DisputesScreen() {
  const toast = useToast();
  const list = useAdminList<Row>("disputes", ["category"], "open");
  const { pushPanel, changed } = usePanels();
  const counts = list.data?.tabCounts ?? {};

  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  const cols: Col<Row>[] = [
    {
      label: "Dispute",
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {r.number}
            {r.evidence_preserved ? (
              <Badge bg="var(--warningSoft)" fg="var(--warning)">
                evidence held
              </Badge>
            ) : null}
          </div>
          <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
            {r.category}
          </Badge>
        </div>
      ),
    },
    {
      label: "Parties",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Avatar initials={(r.party_a_name ?? "??").slice(0, 2).toUpperCase()} size={22} />
          <span style={{ color: "var(--ink3)" }}>↔</span>
          <Avatar initials={(r.party_b_name ?? "HL").slice(0, 2).toUpperCase()} size={22} />
          <span style={{ fontSize: 12 }}>
            {r.party_a_name ?? "—"} ↔ {r.party_b_name ?? "HomzList"}
          </span>
        </span>
      ),
    },
    {
      label: "Related",
      cell: (r) =>
        r.listing_id ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Thumb size={28} />
            <span
              style={{
                fontSize: 12,
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.listing_title ?? r.listing_id.slice(0, 8)}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--ink3)" }}>—</span>
        ),
    },
    {
      label: "Amount claimed",
      cell: (r) => <span style={{ fontWeight: 600 }}>{rupees(r.amount_claimed_paise)}</span>,
    },
    { label: "Raised", cell: (r) => <span style={{ color: "var(--ink2)" }}>{shortDate(r.created_at)}</span> },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={
            r.status === "investigating"
              ? "Pending"
              : r.status === "resolved" || r.status === "closed"
                ? "Approved"
                : "Open"
          }
        />
      ),
    },
  ];

  return (
    <div>
      <PageHead title="Disputes" />
      <NoteStrip tone="neutral">
        HomzList is an intermediary. We do not adjudicate contracts — we record what happened,
        preserve the evidence, and act on what the platform controls.
      </NoteStrip>

      <ModTabs
        tabs={TABS.map(([k, l]) => [k, l, counts[k]] as [string, string, number | undefined])}
        active={list.tab ?? "open"}
        onSelect={list.setTab}
      />

      {list.loading ? (
        <Shimmer h={280} />
      ) : (list.data?.rows ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No disputes in this state.
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => pushPanel("dispute", { id: r.id, number: r.number })} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}
    </div>
  );
}


