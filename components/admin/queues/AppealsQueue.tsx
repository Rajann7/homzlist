"use client";

/**
 * A8 — Appeals queue. Template 894-917, and the unlock confirmation (1686).
 *
 * Two tabs, two genuinely different things:
 *
 *  · AUTO-FLAG appeals — the number detector hid someone's bio and they say it
 *    was their office landline. The flagged text is shown with the match
 *    highlighted, next to their explanation, because the decision is "is this
 *    a false positive" and that is unanswerable without both.
 *  · REJECT-LOCK reopens — a listing locked after three rejections. This is the
 *    only exit from that state; without it a poster who paid for a slot is
 *    stuck forever, which is exactly the dead end the hidden-issue hunt asks
 *    about.
 */

import { useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  Modal,
  PageHead,
  Shimmer,
  Thumb,
  useToast,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";
import { QueueTabs, ageOf, initialsOf } from "./shared";

type Row = {
  id: string;
  status: string;
  created_at: string;
  resolution: string | null;
  appeal_text: string | null;
  subject: string;
  subject_id: string | null;
  profile_id: string;
  user_name: string | null;
  user_role: string | null;
  user_bio: string | null;
  bio_flag_reason: string | null;
  kind: "flag" | "reopen";
  listing_title: string | null;
  listing_reject_count: number | null;
  listing_locked: boolean | null;
  listing_cover_url: string | null;
};

const FILTER_KEYS = ["kind", "status"] as const;

const TABS: [string, string][] = [
  ["flag", "Auto-flag appeals"],
  ["reopen", "Reject-lock reopens"],
  ["resolved", "Resolved"],
];

export function AppealsQueue() {
  const toast = useToast();
  const list = useAdminList<Row>("appeals", FILTER_KEYS, "flag");
  const [confirmUnlock, setConfirmUnlock] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const tab = list.tab ?? "flag";
  const rows = list.data?.rows ?? [];

  async function decide(row: Row, action: string, label: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/queues/appeals/${row.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean } | null;
    setBusy(false);
    setConfirmUnlock(null);
    if (!json?.ok) {
      toast("That appeal has already been answered");
      return;
    }
    toast(label);
    list.reload();
  }

  return (
    <div>
      <PageHead title="Appeals queue" />
      <QueueTabs tabs={TABS} active={tab} counts={list.data?.tabCounts ?? {}} onPick={list.setTab} />

      {list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Shimmer key={i} h={180} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No appeals waiting.
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {r.kind === "flag" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Avatar initials={initialsOf(r.user_name)} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{r.user_name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                      {`${r.user_role ?? ""} · appealed ${ageOf(r.created_at).text} ago`}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--s2)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: "var(--ink1)",
                    lineHeight: 1.5,
                  }}
                >
                  {r.user_bio ?? "(the flagged content is no longer on the profile)"}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink2)", margin: "10px 0 6px" }}>
                  {`Flag reason: ${r.bio_flag_reason ?? "auto-detected"}`}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <Thumb size={40} src={r.listing_cover_url} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {r.listing_title ?? "Listing"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                      {`ID #${(r.subject_id ?? "").slice(0, 8)} · ${
                        r.listing_locked ? "Locked" : "Not locked"
                      }`}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink3)", margin: "8px 0" }}>
                  Rejection history
                </div>
                <div style={{ fontSize: 12, color: "var(--ink2)", padding: "4px 0" }}>
                  {`${r.listing_reject_count ?? 0} of 3 rejections used`}
                </div>
              </>
            )}

            <div
              style={{
                borderLeft: "3px solid var(--border)",
                paddingLeft: 12,
                fontSize: 13,
                color: "var(--ink2)",
                fontStyle: "italic",
                marginTop: 10,
              }}
            >
              {`"${r.appeal_text ?? "No explanation given."}"`}
            </div>

            {r.status === "open" ? (
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                {r.kind === "flag" ? (
                  <>
                    <Btn
                      label="Dismiss flag"
                      kind="primary"
                      onClick={() => decide(r, "dismiss_flag", "Flag dismissed · content restored")}
                    />
                    <Btn
                      label="Uphold flag"
                      kind="outline"
                      onClick={() => decide(r, "uphold_flag", "Flag upheld")}
                    />
                  </>
                ) : (
                  <>
                    <Btn
                      label="Unlock & allow resubmit"
                      kind="primary"
                      onClick={() => setConfirmUnlock(r)}
                    />
                    <Btn
                      label="Keep locked"
                      kind="outline"
                      onClick={() => decide(r, "keep_locked", "Kept locked")}
                    />
                  </>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <Badge
                  bg={r.status === "upheld" ? "var(--accentSoft)" : "var(--s2)"}
                  fg={r.status === "upheld" ? "var(--accent)" : "var(--ink2)"}
                  style={{ textTransform: "none", letterSpacing: 0 }}
                >
                  {r.status === "upheld" ? "Appeal accepted" : "Original decision stands"}
                </Badge>
                {r.resolution ? (
                  <span style={{ fontSize: 11, color: "var(--ink3)", marginLeft: 8 }}>
                    {r.resolution}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))
      )}

      <Pager
        page={list.data?.page ?? 1}
        pageSize={list.data?.pageSize ?? 50}
        total={list.data?.total ?? 0}
        onPage={list.setPage}
      />

      {confirmUnlock ? (
        <Modal
          title="Unlock this listing?"
          onClose={() => setConfirmUnlock(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirmUnlock(null)} />
              <Btn
                label={busy ? "Unlocking…" : "Unlock"}
                kind="primary"
                onClick={() => decide(confirmUnlock, "unlock", "Unlocked · poster notified")}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink2)" }}>
            The poster gets one more resubmission — the rejection count is reset to zero.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
