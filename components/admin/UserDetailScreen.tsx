"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { UserDetail } from "@/lib/admin/userDetail";
import { Initials, StatusBadge } from "./queueBits";
import { Badge, Btn, NoteBlock, SecHead, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A11 — User detail (Doc5 A11 / P14's user panel).
 *
 * Header (avatar · name · badges · status) then the tab strip. Three tabs are
 * live: Overview, Plans and Notes. The rest of Doc5's list — Payments,
 * Listings, Leads, Chats, Communication log, Timeline — are not drawn at all
 * until they read real rows, because a tab that opens onto nothing is worse
 * than a tab that is not there yet. They are tracked in
 * docs/PENDING-INTEGRATIONS.md.
 */

type Tab = "overview" | "plans" | "notes";

export function UserDetailScreen({ detail }: { detail: UserDetail }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState(detail.notes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  const addNote = async () => {
    const body = draft.trim();
    if (body.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectType: "user", subjectId: detail.id, body }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error?.code === "FORBIDDEN" ? "Your role cannot add notes." : "That note was not saved.");
        return;
      }
      setDraft("");
      // Re-read from the server rather than pushing the draft into the list —
      // the row's id, author and timestamp are the server's to decide.
      router.refresh();
      const fresh = await fetch(`/api/v1/admin/notes?subjectType=user&subjectId=${detail.id}`, { cache: "no-store" });
      const fj = await fresh.json().catch(() => null);
      if (fj?.ok) setNotes(fj.data.notes);
      show("Note added");
    } finally {
      setBusy(false);
    }
  };

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "plans", label: "Plans", count: detail.plans.length },
    { key: "notes", label: "Notes", count: notes.length },
  ];

  return (
    <div>
      {/* ------------------------------------------------------------ header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/users" className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={16} />
          Users
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Initials text={detail.initials} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
              {detail.name}
            </h1>
            <StatusBadge label={detail.statusLabel} />
            {detail.verified.id && (
              <Badge bg="var(--surface-2)" fg="var(--ink-secondary)">
                ID
              </Badge>
            )}
            {detail.verified.rera && (
              <Badge bg="var(--info-soft)" fg="var(--info)">
                RERA
              </Badge>
            )}
          </div>
          <p className="mt-[2px] text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            {detail.roleLabel} · {detail.handle} · joined {detail.joinedLabel}
          </p>
        </div>
      </div>

      {detail.suspension && (
        <div className="mb-4">
          <NoteBlock tone="error">
            Suspended since {detail.suspension.sinceLabel}
            {detail.suspension.days ? ` for ${detail.suspension.days} days` : ""} — {detail.suspension.reason}
          </NoteBlock>
        </div>
      )}

      {detail.counts.reports > 0 && (
        <div className="mb-4">
          <NoteBlock tone="warning">
            {detail.counts.reports} report{detail.counts.reports === 1 ? " has" : "s have"} been filed against this
            account. <Link href="/queues/reports?f=users" style={{ color: "var(--accent)", fontWeight: 600 }}>Open the reports queue →</Link>
          </NoteBlock>
        </div>
      )}

      {/* -------------------------------------------------------------- tabs */}
      <div className="mb-[14px] flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--divider)" }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="flex shrink-0 items-center gap-[6px] px-3 py-[10px] text-[15px] font-semibold"
              style={{
                color: on ? "var(--ink-primary)" : "var(--ink-tertiary)",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <>
          <SecHead>Profile</SecHead>
          <Row label="Phone" value={detail.phone} />
          <Row label="Email" value={detail.email ?? "Not given"} />
          <Row label="Role" value={detail.roleLabel} />
          <Row label="City" value={detail.city} />
          <Row label="Bio" value={detail.bio ?? "Empty"} />
          <Row label="Joined" value={detail.joinedLabel} />
          <Row label="Last active" value={detail.lastActiveLabel} />

          <SecHead>What this account has</SecHead>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 desktop:grid-cols-6">
            <Stat label="Listings" value={detail.counts.listings} href={`/queues/listings`} />
            <Stat label="Requirements" value={detail.counts.requirements} href={`/queues/requirements`} />
            <Stat label="Leads" value={detail.counts.leads} />
            <Stat label="Payments" value={detail.counts.payments} />
            <Stat label="Plans" value={detail.counts.plans} />
            <Stat label="Reports" value={detail.counts.reports} tone={detail.counts.reports > 0 ? "error" : undefined} />
          </div>
        </>
      )}

      {tab === "plans" && (
        <>
          {detail.plans.length === 0 ? (
            <p className="py-[60px] text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              This account has never held a plan.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-12 border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full border-collapse" style={{ background: "var(--surface-1)" }}>
                <thead>
                  <tr>
                    {["Plan", "Started", "Expires", "Status"].map((h) => (
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
                  {detail.plans.map((p) => (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--divider)" }}>
                      <td style={cell}>
                        <span className="font-semibold" style={{ color: "var(--ink-primary)" }}>
                          {p.name}
                        </span>
                        {p.isTrial && (
                          <span className="ml-2">
                            <Badge bg="var(--info-soft)" fg="var(--info)">
                              Trial
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td style={cell}>{p.startsLabel}</td>
                      <td style={cell}>{p.expiresLabel}</td>
                      <td style={cell}>
                        <StatusBadge label={p.status === "active" ? "Active" : p.status === "expired" ? "Expired" : p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "notes" && (
        <>
          <div className="mb-4">
            <TextArea value={draft} onChange={setDraft} height={80} placeholder="Only other admins see this note." />
            {error && (
              <p className="mt-2 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
                {error}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Btn kind="primary" disabled={busy || draft.trim().length < 2} onClick={addNote}>
                {busy ? "Saving…" : "Add note"}
              </Btn>
            </div>
          </div>

          {notes.length === 0 ? (
            <p className="py-10 text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              No internal notes on this account yet.
            </p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="mb-3 rounded-12 border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
                <p className="text-[13px]" style={{ color: "var(--ink-primary)" }}>
                  {n.body}
                </p>
                <p className="mt-2 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {n.author} · {n.atLabel}
                </p>
              </div>
            ))
          )}
        </>
      )}

      <AdminToast message={toast} />
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--ink-primary)",
  verticalAlign: "middle",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
      <div className="w-[120px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {label}
      </div>
      <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "error" }) {
  const body = (
    <div className="rounded-12 border p-3 shadow-l1 dark:shadow-none" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
      <p className="text-[20px] font-bold leading-none" style={{ color: tone === "error" && value > 0 ? "var(--error)" : "var(--ink-primary)" }}>
        {value}
      </p>
      <p className="mt-1 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        {label}
      </p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
