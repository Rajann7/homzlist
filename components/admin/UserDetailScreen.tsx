"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { UserDetail } from "@/lib/admin/userDetail";
import { Initials, StatusBadge } from "./queueBits";
import { Badge, Btn, Modal, NoteBlock, SecHead, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A11 — User detail (Doc5 A11 / P14's user panel).
 *
 * Header (avatar · name · badges · status) · the action bar · nine tabs.
 *
 * Every tab reads real rows and every action re-checks its capability on the
 * server. The Chats tab lists threads and deliberately does NOT open them:
 * message bodies stay out of the panel unless a message was reported, and a
 * reported message is read on A9 with its context. There is no composer
 * anywhere in this screen, by design.
 */

type Tab = "overview" | "listings" | "plans" | "payments" | "leads" | "chats" | "comms" | "notes" | "timeline";

export function UserDetailScreen({
  detail,
  can,
  suspendDurations,
  openImpersonate,
}: {
  detail: UserDetail;
  /** What this seat may do — the same map the endpoint re-checks. */
  can: { users: boolean; ban: boolean };
  suspendDurations: Array<{ value: string; label: string }>;
  /** A10's row menu links here with ?impersonate=1 — open the dialog on arrival. */
  openImpersonate?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState(detail.notes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "suspend" | "lift" | "role" | "message" | "ban" | "impersonate">(
    openImpersonate ? "impersonate" : null,
  );

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

  /** One place that posts an action and reports what the server actually did. */
  const act = async (payload: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      // A31 is its own endpoint — it opens an audited session rather than
      // changing anything about the account.
      if (payload.action === "impersonate") {
        const r = await fetch("/api/v1/admin/impersonation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", profileId: detail.id, reason: payload.reason }),
          cache: "no-store",
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setError(j?.error?.code === "FORBIDDEN" ? "Your role cannot open a user view." : "That session could not be started.");
          return false;
        }
        router.push(`/users/${detail.id}/view?session=${j.data.sessionId}`);
        return true;
      }

      const r = await fetch(`/api/v1/admin/users/${detail.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const d = j?.error?.details ?? {};
        setError(
          d.alreadySuspended
            ? "This account is already suspended."
            : d.notSuspended
              ? "This account is not suspended."
              : d.detail === "no_device_on_record"
                ? "There is no device or address on record for this account, so there is nothing to ban."
                : j?.error?.code === "FORBIDDEN"
                  ? "Your role cannot take that action."
                  : "That didn't go through. Try again.",
        );
        return false;
      }
      setDialog(null);
      show(msg);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "listings", label: "Listings", count: detail.listings.length },
    { key: "plans", label: "Plans", count: detail.plans.length },
    { key: "payments", label: "Payments", count: detail.payments.length },
    { key: "leads", label: "Leads", count: detail.leads.length },
    { key: "chats", label: "Chats", count: detail.chats.length },
    { key: "comms", label: "Communication", count: detail.comms.length },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "timeline", label: "Timeline", count: detail.timeline.length },
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

      {/* action bar — every button re-checked server-side, never UI-gated only */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Btn kind="outline" style={{ height: 34, fontSize: 13 }} disabled={!can.users} tooltip="Admin only" onClick={() => setDialog("message")}>
          Send message
        </Btn>
        {detail.status === "suspended" ? (
          <Btn kind="primary" style={{ height: 34, fontSize: 13 }} disabled={!can.users} tooltip="Admin only" onClick={() => setDialog("lift")}>
            Lift suspension
          </Btn>
        ) : (
          <Btn kind="danger" style={{ height: 34, fontSize: 13 }} disabled={!can.users} tooltip="Admin only" onClick={() => setDialog("suspend")}>
            Suspend
          </Btn>
        )}
        <Btn kind="outline" style={{ height: 34, fontSize: 13 }} disabled={!can.users} tooltip="Admin only" onClick={() => setDialog("role")}>
          Change role
        </Btn>
        <Btn kind="outline" style={{ height: 34, fontSize: 13 }} disabled={!can.users} tooltip="Admin only" onClick={() => setDialog("impersonate")}>
          Open in user view
        </Btn>
        {can.ban && (
          <Btn kind="danger" style={{ height: 34, fontSize: 13 }} onClick={() => setDialog("ban")}>
            Ban device/IP
          </Btn>
        )}
      </div>

      {error && !dialog && (
        <p className="mb-4 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}

      {detail.bans.length > 0 && (
        <div className="mb-4">
          <NoteBlock tone="error">
            {detail.bans.length === 1 ? "A ban is" : `${detail.bans.length} bans are`} in force against this account:{" "}
            {detail.bans.map((b) => `${b.kind} since ${b.atLabel} (${b.reason})`).join(" · ")}
          </NoteBlock>
        </div>
      )}

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

      {tab === "listings" && (
        <TableOrEmpty
          empty="This account has never posted a listing."
          heads={["Listing", "Price", "Posted", "Status", ""]}
          rows={detail.listings.map((l) => [
            <span key="t" className="font-semibold" style={{ color: "var(--ink-primary)" }}>
              {l.title}
            </span>,
            l.priceLabel,
            l.postedLabel,
            <StatusBadge key="s" label={l.statusLabel} />,
            l.reviewHref ? (
              <Link key="r" href={l.reviewHref} className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                Open review →
              </Link>
            ) : (
              ""
            ),
          ])}
        />
      )}

      {tab === "payments" && (
        <TableOrEmpty
          empty="This account has never paid for anything."
          heads={["Reference", "Amount", "Method", "Date", "Status"]}
          rows={detail.payments.map((p) => [p.ref, p.amountLabel, p.method, p.atLabel, <StatusBadge key="s" label={p.statusLabel} />])}
        />
      )}

      {tab === "leads" && (
        <TableOrEmpty
          empty="No one has enquired with this account yet."
          heads={["From", "About", "Stage", "When"]}
          rows={detail.leads.map((l) => [l.who, l.about, l.stage, l.atLabel])}
        />
      )}

      {tab === "chats" && (
        <>
          <NoteBlock tone="info">
            Chats are listed, never opened: Doc9 keeps message bodies out of the panel unless a message
            was reported, and a reported message is read on A9 with its context. There is no composer
            anywhere in the panel.
          </NoteBlock>
          <div className="mt-3">
            <TableOrEmpty
              empty="This account has no chat threads."
              heads={["With", "About", "Messages", "Last activity"]}
              rows={detail.chats.map((c) => [c.withWhom, c.about, c.messages, c.atLabel])}
            />
          </div>
        </>
      )}

      {tab === "comms" && (
        <>
          {detail.comms.length === 0 ? (
            <p className="py-[60px] text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              No admin has messaged this account.
            </p>
          ) : (
            detail.comms.map((c) => (
              <div key={c.id} className="mb-3 rounded-12 border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                    {c.subject}
                  </span>
                  <Badge bg="var(--surface-2)" fg="var(--ink-tertiary)">
                    {c.channel}
                  </Badge>
                  {c.delivered && (
                    <Badge bg="var(--accent-soft)" fg="var(--accent)">
                      Delivered
                    </Badge>
                  )}
                </div>
                <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                  {c.body}
                </p>
                <p className="mt-2 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {c.sentBy} · {c.atLabel}
                </p>
              </div>
            ))
          )}
        </>
      )}

      {tab === "timeline" && (
        <>
          {detail.timeline.length === 0 ? (
            <p className="py-[60px] text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              Nothing has been done to this account by an admin yet.
            </p>
          ) : (
            detail.timeline.map((t) => (
              <div key={t.id} className="flex gap-3 border-b py-3" style={{ borderColor: "var(--divider)" }}>
                <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                <div className="min-w-0">
                  <p className="text-[13px]" style={{ color: "var(--ink-primary)" }}>
                    {t.text}
                  </p>
                  <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    {t.by} · {t.atLabel}
                  </p>
                </div>
              </div>
            ))
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

      {dialog && (
        <ActionDialog
          kind={dialog}
          name={detail.name}
          role={detail.role}
          durations={suspendDurations}
          busy={busy}
          error={error}
          onClose={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={(payload, msg) => act(payload, msg)}
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

/** Every A11 action, in the design's modal shape: copy, a reason, two buttons. */
function ActionDialog({
  kind,
  name,
  role,
  durations,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  kind: "suspend" | "lift" | "role" | "message" | "ban" | "impersonate";
  name: string;
  role: string | null;
  durations: Array<{ value: string; label: string }>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: Record<string, unknown>, msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(durations[0]?.value ?? "");
  const [nextRole, setNextRole] = useState(role === "owner" ? "broker" : "owner");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const copy = {
    suspend: { title: `Suspend ${name}?`, cta: "Suspend", note: "Their listings are hidden and chats are frozen. They are notified." },
    lift: { title: "Lift this suspension?", cta: "Lift", note: "Their listings become visible again and chats reopen. They are notified." },
    role: { title: `Change ${name}'s role?`, cta: "Change role", note: "The role decides which plans and quotas apply. They are notified." },
    message: { title: `Message ${name}`, cta: "Send", note: "They read this exactly as written, in their notifications." },
    ban: { title: "Ban device / IP?", cta: "Ban", note: "HomzList never stores the raw address — the ban is keyed on its salted hash." },
    impersonate: {
      title: `Open user view as ${name}?`,
      cta: "Start session",
      note: "You will see their account exactly as they do. Nothing that sends, pays or messages is rendered, and no user session is created. The session is logged with your name, and so is the moment you end it.",
    },
  }[kind];

  const valid =
    kind === "lift"
      ? true
      : kind === "message"
        ? subject.trim().length >= 3 && message.trim().length >= 5
        : kind === "role"
          ? reason.trim().length >= 5 && nextRole !== role
          : reason.trim().length >= 5 && (kind !== "suspend" || Boolean(days));

  const submit = () => {
    if (kind === "suspend") onConfirm({ action: "suspend", reason: reason.trim(), days }, "Account suspended");
    else if (kind === "lift") onConfirm({ action: "lift", reason: reason.trim() }, "Suspension lifted");
    else if (kind === "role") onConfirm({ action: "role", role: nextRole, reason: reason.trim() }, "Role changed");
    else if (kind === "message") onConfirm({ action: "message", subject: subject.trim(), body: message.trim() }, "Message sent");
    else if (kind === "impersonate") onConfirm({ action: "impersonate", reason: reason.trim() }, "Session started");
    else onConfirm({ action: "ban_device", reason: reason.trim() }, "Device banned");
  };

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind={kind === "lift" || kind === "message" ? "primary" : "dangerFill"} disabled={busy || !valid} onClick={submit}>
            {busy ? "Working…" : copy.cta}
          </Btn>
        </>
      }
    >
      {kind === "suspend" && (
        <>
          <p className="mb-[6px] text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Duration
          </p>
          {durations.map((d) => (
            <label key={d.value} className="flex cursor-pointer items-center gap-2 py-[6px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
              <input type="radio" name="susp-days" checked={days === d.value} onChange={() => setDays(d.value)} style={{ accentColor: "var(--accent)" }} />
              {d.label}
            </label>
          ))}
        </>
      )}

      {kind === "role" && (
        <>
          <p className="mb-[6px] text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            New role
          </p>
          {["owner", "broker", "builder"].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 py-[6px] text-[13px] capitalize" style={{ color: "var(--ink-primary)" }}>
              <input
                type="radio"
                name="next-role"
                checked={nextRole === r}
                disabled={r === role}
                onChange={() => setNextRole(r)}
                style={{ accentColor: "var(--accent)" }}
              />
              {r}
              {r === role && (
                <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  (current)
                </span>
              )}
            </label>
          ))}
        </>
      )}

      {kind === "message" && (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="mb-2 h-10 w-full rounded-8 border px-3 text-[14px] outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
          />
          <TextArea value={message} onChange={setMessage} height={90} placeholder="They read this exactly as written." />
        </>
      )}

      {kind !== "message" && kind !== "lift" && (
        <div className="mt-2">
          <TextArea value={reason} onChange={setReason} height={60} placeholder="Reason…" />
        </div>
      )}

      <div className="mt-3">
        <NoteBlock tone={kind === "lift" || kind === "message" ? "info" : "warning"}>{copy.note}</NoteBlock>
      </div>

      {error && (
        <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

/** The tab tables all look the same — one table, or the tab's own empty line. */
function TableOrEmpty({ heads, rows, empty }: { heads: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="py-[60px] text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-12 border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full border-collapse" style={{ background: "var(--surface-1)" }}>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th
                key={`${h}-${i}`}
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
          {rows.map((cells, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--divider)" }}>
              {cells.map((c, j) => (
                <td key={j} style={cell}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
