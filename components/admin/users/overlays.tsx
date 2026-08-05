"use client";

/**
 * The A11 overlays — template 1693, 1717-1784.
 *
 * They live in one file because the SAME sheet is opened from three places: the
 * user panel's action bar, the A10 row menu, and the A10 bulk bar. Copying
 * "Suspend user?" into three components is how three copies end up with three
 * different reason fields.
 *
 * Every one of them posts to /api/v1/admin/users/:id/actions and reports what
 * the server said — none of them close on a toast the client made up.
 */

import { useState, type ReactNode } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  Chip,
  Modal,
  RightSheet,
  useToast,
} from "@/components/admin/ds";
import { useNow } from "@/lib/hooks/useNow";

export type ActionRunner = (
  body: Record<string, unknown>,
) => Promise<{ ok: boolean; summary?: string; message?: string }>;

/** POST one action against one user, and hand back what the server said. */
export function makeRunner(userId: string): ActionRunner {
  return async (body) => {
    const res = await fetch(`/api/v1/admin/users/${userId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    if (!json?.ok)
      return { ok: false, message: json?.error?.message ?? "That didn't go through" };
    return { ok: true, summary: json.data?.summary };
  };
}

const inputStyle = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--s2)",
  color: "var(--ink1)",
  fontSize: 14,
} as const;

const areaStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--s2)",
  color: "var(--ink1)",
  fontSize: 13,
  fontFamily: "inherit",
  resize: "none",
} as const;

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

/** The one place an overlay reports a server refusal, in the design's tone. */
function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "var(--errorSoft)",
        borderRadius: 8,
        fontSize: 11,
        color: "var(--error)",
      }}
    >
      {message}
    </div>
  );
}

/* ───────────────────────────────────────────── template 1693 · Suspend ───── */

const DURATIONS: [label: string, days: number | null][] = [
  ["7 days", 7],
  ["30 days", 30],
  ["Until review", null],
];

export function SuspendOverlay({
  run,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const res = await run({ action: "suspend", days, reason });
    setBusy(false);
    if (!res.ok) return setError(res.message ?? null);
    onDone(res.summary ?? "User suspended");
  }

  return (
    <Modal
      title="Suspend user?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn label={busy ? "Suspending…" : "Suspend"} kind="dangerFill" onClick={go} />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 6 }}>Duration</div>
      {DURATIONS.map(([label, value]) => (
        <label
          key={label}
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
            checked={days === value}
            onChange={() => setDays(value)}
            style={{ accentColor: "var(--accent)" }}
          />
          {label}
        </label>
      ))}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason…"
        style={{ ...areaStyle, height: 60, marginTop: 8 }}
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
        Their listings will be hidden and chats frozen.
      </div>
      <Err message={error} />
    </Modal>
  );
}

/* ───────────────────────────────────────── template 1757 · Lift suspension ─ */

export function LiftSuspendOverlay({
  run,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Lift suspension?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Lifting…" : "Lift suspension"}
            kind="primary"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "lift_suspension" });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Suspension lifted · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>
        Listings and chats will be restored and the user notified.
      </div>
      <Err message={error} />
    </Modal>
  );
}

/* ─────────────────────────────────────────── template 1717 · Send message ── */

const CHANNELS: [key: string, label: string][] = [
  ["in_app", "In-app"],
  ["email", "Email"],
  ["whatsapp", "WhatsApp"],
];

export function SendMessageOverlay({
  run,
  ids,
  templates,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  /** more than one when opened from the bulk bar */
  ids?: string[];
  templates: { code: string; subject: string | null; body: string }[];
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [template, setTemplate] = useState("Custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <RightSheet
      title="Send message"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={onClose} />
          <Btn
            label={busy ? "Sending…" : "Send"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "send_message", channels, subject, body, ids });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Message sent · logged");
            }}
          />
        </>
      }
    >
      <Label>Channels</Label>
      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
        {CHANNELS.map(([key, label]) => (
          <label
            key={key}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={channels.includes(key)}
              onChange={() =>
                setChannels((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]))
              }
              style={{ accentColor: "var(--accent)" }}
            />
            {label}
          </label>
        ))}
      </div>

      <Label>Template</Label>
      <select
        value={template}
        onChange={(e) => {
          setTemplate(e.target.value);
          const t = templates.find((x) => x.code === e.target.value);
          if (t) {
            setSubject(t.subject ?? "");
            setBody(t.body);
          } else {
            setSubject("");
            setBody("");
          }
        }}
        style={{ ...inputStyle, marginBottom: 12 }}
      >
        <option value="Custom">Custom</option>
        {templates.map((t) => (
          <option key={t.code} value={t.code}>
            {t.subject ?? t.code}
          </option>
        ))}
      </select>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message…"
        style={{ ...areaStyle, height: 90 }}
      />
      {ids && ids.length > 1 ? (
        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8 }}>
          Going to {ids.length} users · every send is logged separately.
        </div>
      ) : null}
      <Err message={error} />
    </RightSheet>
  );
}

/* ──────────────────────────────────────────── template 1726 · Grant trial ── */

const GRANT_REASONS = [
  "Founding broker onboarding",
  "Support goodwill — technical issue",
  "Partnership trial",
  "Testing",
];
const GRANT_DURATIONS = ["7 days", "14 days", "30 days"];

export function GrantTrialOverlay({
  run,
  ids,
  userName,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  ids?: string[];
  userName: string;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [contents, setContents] = useState({ listings: 1, requirements: 1, proposals: 10 });
  const [duration, setDuration] = useState(14);
  const [reason, setReason] = useState(GRANT_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = (key: keyof typeof contents, by: number) =>
    setContents((c) => ({ ...c, [key]: Math.max(0, Math.min(50, c[key] + by)) }));

  const rows: [keyof typeof contents, string][] = [
    ["listings", "Property listings"],
    ["requirements", "Requirement posts"],
    ["proposals", "Proposals"],
  ];

  return (
    <RightSheet
      title="New grant"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={onClose} />
          <Btn
            label={busy ? "Granting…" : "Grant trial"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({
                action: "grant_trial",
                contents,
                durationDays: duration,
                reason,
                note,
                ids,
              });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Trial granted · logged");
            }}
          />
        </>
      }
    >
      <Label>User</Label>
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
          color: "var(--ink2)",
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <AdminIcon name="search" size={16} />
        {ids && ids.length > 1 ? `${ids.length} selected users` : userName}
      </div>

      <Label>Grant contents</Label>
      {rows.map(([key, label]) => (
        <div
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>{label}</span>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <span
              onClick={() => step(key, -1)}
              style={{
                width: 32,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--ink2)",
              }}
            >
              −
            </span>
            <span style={{ width: 40, textAlign: "center", fontSize: 14 }}>{contents[key]}</span>
            <span
              onClick={() => step(key, 1)}
              style={{
                width: 32,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--ink2)",
              }}
            >
              +
            </span>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", margin: "10px 0 6px" }}>
        Duration
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {GRANT_DURATIONS.map((d) => (
          <Chip
            key={d}
            label={d}
            active={duration === Number(d.split(" ")[0])}
            onClick={() => setDuration(Number(d.split(" ")[0]))}
          />
        ))}
      </div>

      <Label>Reason (required)</Label>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...inputStyle, marginBottom: 8 }}
      >
        {GRANT_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notes…"
        style={{ ...areaStyle, height: 50 }}
      />
      <div
        style={{
          background: "var(--infoSoft)",
          borderRadius: 8,
          padding: 10,
          fontSize: 11,
          color: "var(--ink2)",
          marginTop: 10,
        }}
      >
        User sees: &quot;You&apos;ve received a trial from HomzList: {contents.listings} listing +{" "}
        {contents.requirements} requirement for {duration} days&quot;
      </div>
      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8 }}>
        Buying a paid plan ends the trial automatically.
      </div>
      <Err message={error} />
    </RightSheet>
  );
}

/* ─────────────────────────────────────────── template 1740 · Adjust balance ─ */

const BALANCES: [key: string, label: string][] = [
  ["proposal", "Proposals"],
  ["listing", "Listing slot"],
  ["requirement", "Requirement slot"],
];

export function AdjustBalanceOverlay({
  run,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [kind, setKind] = useState("proposal");
  const [delta, setDelta] = useState(5);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <RightSheet
      title="Adjust balance"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={onClose} />
          <Btn
            label={busy ? "Applying…" : "Apply adjustment"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "adjust_balance", kind, delta, reason });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Balance adjusted · logged");
            }}
          />
        </>
      }
    >
      <Label>Type</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
        {BALANCES.map(([key, label]) => (
          <label
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              padding: "6px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              checked={kind === key}
              onChange={() => setKind(key)}
              style={{ accentColor: "var(--accent)" }}
            />
            {label}
          </label>
        ))}
      </div>

      <Label>Amount</Label>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <span
          onClick={() => setDelta((d) => Math.max(-100, d - 1))}
          style={{
            width: 36,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--ink2)",
          }}
        >
          −
        </span>
        <span style={{ width: 50, textAlign: "center" }}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
        <span
          onClick={() => setDelta((d) => Math.min(100, d + 1))}
          style={{
            width: 36,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--ink2)",
          }}
        >
          +
        </span>
      </div>

      <Label>Reason (required)</Label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why are you adjusting this balance?"
        style={{ ...areaStyle, height: 70 }}
      />
      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8 }}>
        This is logged in the audit trail with your name.
      </div>
      <Err message={error} />
    </RightSheet>
  );
}

/* ───────────────────────────────────────────── template 1750 · Role change ─ */

export function RoleChangeOverlay({
  run,
  userName,
  current,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  userName: string;
  current: string | null;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [role, setRole] = useState(current ?? "owner");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

  return (
    <Modal
      title={`Change role for ${userName}?`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Changing…" : "Change role"}
            kind="primary"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "role_change", role, reason });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Role changed · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 8 }}>
        Current: {current ? label(current) : "none"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {["owner", "broker", "builder"].map((r) => (
          <label
            key={r}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              padding: "6px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              checked={role === r}
              onChange={() => setRole(r)}
              style={{ accentColor: "var(--accent)" }}
            />
            {label(r)}
          </label>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason…"
        style={{ ...areaStyle, height: 50, marginTop: 8 }}
      />
      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8 }}>
        Their listings stay as they are. Plan availability may change.
      </div>
      <Err message={error} />
    </Modal>
  );
}

/* ────────────────────────────────────────── template 1766 · Merge accounts ── */

export function MergeAccountsOverlay({
  run,
  primary,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  primary: { id: string; name: string | null; phone: string | null };
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string | null; phone: string | null; plan_names: string[]; listings_count: number }[]
  >([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) return setResults([]);
    const res = await fetch(
      `/api/v1/admin/list/users?q=${encodeURIComponent(value.trim())}&pageSize=5`,
      { cache: "no-store" },
    ).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { rows: typeof results } }
      | null;
    setResults((json?.data?.rows ?? []).filter((r) => r.id !== primary.id));
  }

  const chosen = results.find((r) => r.id === picked);

  return (
    <RightSheet
      title="Merge accounts"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={onClose} />
          <Btn
            label={busy ? "Merging…" : "Merge accounts"}
            kind="dangerFill"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "merge", mergedId: picked, confirm });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Accounts merged · logged");
            }}
          />
        </>
      }
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
          marginBottom: 12,
        }}
      >
        <AdminIcon name="search" size={16} />
        <input
          value={term}
          onChange={(e) => search(e.target.value)}
          placeholder="Find the second account"
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

      {results.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {results.map((r) => (
            <div
              key={r.id}
              onClick={() => setPicked(r.id)}
              style={{
                border: `1px solid ${picked === r.id ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8,
                padding: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>{r.phone}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {(r.plan_names ?? []).length} plans · {r.listings_count} listings
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {[primary, chosen].map((a, i) =>
          a ? (
            <div
              key={i}
              style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
            >
              <Avatar initials={(a.name ?? "U").slice(0, 2).toUpperCase()} size={28} />
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>{a.phone}</div>
            </div>
          ) : null,
        )}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          marginBottom: 10,
          cursor: "pointer",
        }}
      >
        <input type="radio" checked readOnly style={{ accentColor: "var(--accent)" }} />
        Keep this account as primary
      </label>

      <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.7, marginBottom: 12 }}>
        · Listings and plan balances move to the primary account
        <br />· The other account is suspended, not deleted
        <br />· Chats stay with their original threads
      </div>

      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type MERGE to confirm"
        style={inputStyle}
      />
      <Err message={error} />
    </RightSheet>
  );
}

/* ────────────────────────────────────────── template 1774 · Ban device/IP ── */

export function BanDeviceOverlay({
  run,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Ban device / IP?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Banning…" : "Ban"}
            kind="dangerFill"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "ban_device", reason });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Device banned · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.8 }}>
        The account&apos;s recorded IP hash and every device label on its push tokens are banned.
        <br />
        The raw IP is never stored, so the ban is enforced on its hash.
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason…"
        style={{ ...areaStyle, height: 50, marginTop: 10 }}
      />
      <Err message={error} />
    </Modal>
  );
}

/* ────────────────────────────────────────── template 1776 · Delete user ──── */

export function DeleteUserOverlay({
  run,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Delete this user?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Deleting…" : "Delete user"}
            kind="dangerFill"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "delete_user", confirm });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "User deleted · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.8, marginBottom: 10 }}>
        · Listings and requirements removed
        <br />· Chats anonymised
        <br />· Payment records kept 7 years (anonymised) — legal requirement
        <br />· Cannot be undone
      </div>
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type DELETE to confirm"
        style={inputStyle}
      />
      <Err message={error} />
    </Modal>
  );
}

/* ───────────────────────────────────── template 1875 · Sign out session ──── */

export function RevokeSessionOverlay({
  run,
  sid,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  /** null = every device */
  sid: string | null;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={sid ? "Sign out this session?" : "Sign out all devices?"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Signing out…" : "Sign out"}
            kind="dangerFill"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "sign_out", sid });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Session signed out · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>
        The user must sign in again on that device. This is logged.
      </div>
      <Err message={error} />
    </Modal>
  );
}

/* ───────────────────────────────────────── template 1759 · Impersonation ─── */

export type ImpSession = {
  id: string;
  profileId: string;
  profileName: string | null;
  startedAt: string;
  expiresAt: string | null;
};

export function ImpersonateOverlay({
  userId,
  userName,
  live,
  onClose,
  onChanged,
}: {
  userId: string;
  userName: string;
  /** an already-running session — the design renders the frame instead of the dialog */
  live: ImpSession | null;
  onClose: () => void;
  onChanged: (session: ImpSession | null, message: string) => void;
}) {
  const now = useNow();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (live) {
    const minutes = Math.max(
      1,
      Math.round((now - new Date(live.startedAt).getTime()) / 60_000),
    );
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 130,
          background: "var(--page)",
          display: "flex",
          flexDirection: "column",
          animation: "fadeIn .2s ease",
        }}
      >
        <div
          style={{
            flex: "none",
            background: "var(--warning)",
            color: "#111",
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            <AdminIcon name="eye" size={18} />
          </span>
          <span style={{ flex: 1 }}>
            Viewing as {live.profileName ?? "user"} (read-only) · Started {minutes} min ago
          </span>
          <button
            type="button"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              const res = await fetch("/api/v1/admin/impersonate", {
                method: "DELETE",
                cache: "no-store",
              }).catch(() => null);
              const json = (await res?.json().catch(() => null)) as
                | { ok?: boolean; data?: { minutes: number } }
                | null;
              setBusy(false);
              onChanged(
                null,
                `Impersonation session ended · logged ${json?.data?.minutes ?? minutes} min`,
              );
            }}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Exit session
          </button>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--ink3)",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            <span style={{ color: "var(--ink1)" }}>Homz</span>
            <span style={{ color: "var(--accent)" }}>List</span>
          </div>
          <div style={{ fontSize: 14 }}>User-app view as {live.profileName ?? "user"}</div>
          <div style={{ fontSize: 12 }}>All sends, payments and messages are disabled.</div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={`Open user view as ${userName}?`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Starting…" : "Start session"}
            kind="primary"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              const res = await fetch("/api/v1/admin/impersonate", {
                method: "POST",
                headers: { "content-type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ profileId: userId }),
              }).catch(() => null);
              const json = (await res?.json().catch(() => null)) as
                | { ok?: boolean; data?: { session: ImpSession; userViewUrl: string }; error?: { message?: string } }
                | null;
              setBusy(false);
              if (!json?.ok || !json.data) {
                toast(json?.error?.message ?? "Could not start the session");
                return;
              }
              // The user app itself opens in its own tab on the seller host —
              // first-party, so its session cookie works, and read-only because
              // the token it mints carries the impersonation claim.
              window.open(json.data.userViewUrl, "_blank", "noopener");
              onChanged(json.data.session, "Impersonation started · logged");
            }}
          />
        </>
      }
    >
      <div
        style={{
          background: "var(--warningSoft)",
          borderRadius: 8,
          padding: 12,
          fontSize: 11,
          color: "var(--ink2)",
          lineHeight: 1.5,
        }}
      >
        You&apos;ll see the app exactly as they do. All sends, payments and messages are disabled.
        This session is logged with your name.
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────── template 1778 · Force expire req ─── */

export function ForceExpireOverlay({
  run,
  requirementId,
  onClose,
  onDone,
}: {
  run: ActionRunner;
  requirementId: string;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Force expire this requirement?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Expiring…" : "Force expire"}
            kind="dangerFill"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await run({ action: "force_expire_requirement", requirementId });
              setBusy(false);
              if (!res.ok) return setError(res.message ?? null);
              onDone(res.summary ?? "Requirement expired · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>
        It will stop matching immediately. The poster is notified.
      </div>
      <Err message={error} />
    </Modal>
  );
}

export { Badge as _Badge };
