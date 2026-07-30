"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { GrantRow, GrantablePlan } from "@/lib/admin/grantTypes";
import { Initials, StatusBadge } from "./queueBits";
import { AnchorMenu, Btn, Modal, NoteBlock, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A15 — Grants & trials (Doc5 A15).
 *
 * A grant is a plan nobody paid for, so the screen is built around the paper
 * trail rather than the button: who gave it, to whom, which plan, for how long,
 * why — and whether the entitlement it created is still alive, which is not the
 * same question as whether the grant was revoked.
 */

export function GrantsScreen({
  rows,
  plans,
  canGrant,
}: {
  rows: GrantRow[];
  plans: GrantablePlan[];
  canGrant: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "grant" | { revoke: GrantRow }>(null);
  const [menu, setMenu] = useState<null | { row: GrantRow; anchor: HTMLElement }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  };

  const post = async (payload: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const d = j?.error?.details ?? j?.error ?? {};
        setError(
          d.alreadyOnTrial
            ? "This account already has an active trial. Revoke that one first."
            : d.alreadyRevoked
              ? "This grant has already been revoked."
              : d.detail === "role_mismatch"
                ? `That plan is for ${(d.roles as string[] | undefined)?.join(", ") ?? "another role"} — this account could not spend its quotas.`
                : d.field === "days"
                  ? `Between 1 and ${d.max ?? 180} days.`
                  : d.field === "profileId"
                    ? "No account with that id."
                    : j?.error?.code === "FORBIDDEN"
                      ? "Your role cannot grant plans."
                      : "That didn't go through. Check the fields and try again.",
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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Grants &amp; trials
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {rows.filter((r) => r.state === "Active").length} active · {rows.length} total
        </span>
        <div className="flex-1" />
        <Btn kind="primary" disabled={!canGrant} tooltip="Admin only" onClick={() => setDialog("grant")}>
          Grant a plan
        </Btn>
      </div>

      {error && !dialog && (
        <p className="mb-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="gift" size={72} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            Nothing has been granted yet
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-12 border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full border-collapse" style={{ background: "var(--surface-1)", minWidth: 900 }}>
            <thead>
              <tr>
                {["To", "Plan", "For", "Usage", "Expires", "Why", "By", "State", ""].map((h, i) => (
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
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={cell}>
                    <Link href={`/users/${r.person.id}`} className="flex items-center gap-2">
                      <Initials text={r.person.initials} size={24} />
                      <span className="truncate">{r.person.name}</span>
                    </Link>
                  </td>
                  <td style={cell}>
                    <span className="font-semibold">{r.planName}</span>
                    <span className="ml-2 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                      {r.kind}
                    </span>
                  </td>
                  <td style={cell}>{r.days} days</td>
                  <td style={cell}>
                    <span style={{ color: "var(--ink-secondary)" }}>{r.usageLabel}</span>
                  </td>
                  <td style={cell}>
                    <span className="whitespace-nowrap">{r.expiresLabel}</span>
                  </td>
                  <td style={cell}>
                    <span className="line-clamp-2 max-w-[240px]" style={{ color: "var(--ink-secondary)" }}>
                      {r.reason}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ color: "var(--ink-secondary)" }}>{r.grantedBy}</span>
                    <span className="block text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                      {r.grantedLabel}
                    </span>
                  </td>
                  <td style={cell}>
                    <StatusBadge label={r.state} />
                  </td>
                  <td style={cell}>
                    <button
                      type="button"
                      aria-label={`Actions for ${r.person.name}'s grant`}
                      onClick={(e) => setMenu({ row: r, anchor: e.currentTarget })}
                      className="grid h-[30px] w-[30px] place-items-center"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      <Icon name="more" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {menu && (
        <AnchorMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            { label: "Open account", onSelect: () => router.push(`/users/${menu.row.person.id}`) },
            {
              label: "Revoke this grant",
              danger: true,
              disabled: !canGrant || !menu.row.revocable,
              tooltip: canGrant ? "Only an active grant can be revoked" : "Admin only",
              onSelect: () => setDialog({ revoke: menu.row }),
            },
          ]}
        />
      )}

      {dialog === "grant" && (
        <GrantDialog
          plans={plans}
          busy={busy}
          error={error}
          onClose={() => {
            setDialog(null);
            setError(null);
          }}
          onGrant={(profileId, code, days, reason) =>
            post({ action: "grant", profileId, code, days, reason }, "Plan granted · the account was notified")
          }
        />
      )}

      {dialog && typeof dialog === "object" && (
        <RevokeDialog
          row={dialog.revoke}
          busy={busy}
          error={error}
          onClose={() => {
            setDialog(null);
            setError(null);
          }}
          onRevoke={(reason) => post({ action: "revoke", grantId: dialog.revoke.id, reason }, "Grant revoked")}
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function GrantDialog({
  plans,
  busy,
  error,
  onClose,
  onGrant,
}: {
  plans: GrantablePlan[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onGrant: (profileId: string, code: string, days: number, reason: string) => void;
}) {
  const [profileId, setProfileId] = useState("");
  const [code, setCode] = useState(plans[0]?.code ?? "");
  const [days, setDays] = useState(String(plans[0]?.defaultDays ?? 14));
  const [reason, setReason] = useState("");

  const chosen = plans.find((p) => p.code === code);
  const n = Number(days);
  const valid = profileId.trim().length > 8 && code && Number.isFinite(n) && n >= 1 && n <= 180 && reason.trim().length >= 5;

  return (
    <Modal
      title="Grant a plan"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || !valid} onClick={() => onGrant(profileId.trim(), code, n, reason.trim())}>
            {busy ? "Granting…" : "Grant"}
          </Btn>
        </>
      }
    >
      <label className="mb-1 block text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Account id
      </label>
      <input
        value={profileId}
        onChange={(e) => setProfileId(e.target.value)}
        placeholder="Paste the id from the user's URL"
        className="mb-3 h-10 w-full rounded-8 border px-3 font-mono text-[13px] outline-none"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
      />

      <label className="mb-1 block text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Plan
      </label>
      <select
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          const p = plans.find((x) => x.code === e.target.value);
          if (p) setDays(String(p.defaultDays));
        }}
        className="mb-1 h-10 w-full rounded-8 border px-3 text-[14px] outline-none"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
      >
        {plans.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </select>
      {chosen && (
        <p className="mb-3 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          {chosen.listingQuota} listings · {chosen.requirementQuota} requirements · {chosen.proposalQuota} proposals
          {chosen.roles.length ? ` · ${chosen.roles.join(", ")} only` : ""}
        </p>
      )}

      <label className="mb-1 block text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Days
      </label>
      <input
        value={days}
        onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        className="mb-3 h-10 w-full rounded-8 border px-3 text-[14px] outline-none"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
      />

      <TextArea value={reason} onChange={setReason} height={60} placeholder="Why — this is on the record…" />

      <div className="mt-3">
        <NoteBlock tone="warning">
          This creates a real plan with real quotas that nobody paid for. Your name, the reason and the
          duration are all on the grant row.
        </NoteBlock>
      </div>

      {error && (
        <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

function RevokeDialog({
  row,
  busy,
  error,
  onClose,
  onRevoke,
}: {
  row: GrantRow;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRevoke: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={`Revoke ${row.person.name}'s ${row.planName}?`}
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="dangerFill" disabled={busy || reason.trim().length < 5} onClick={() => onRevoke(reason.trim())}>
            {busy ? "Revoking…" : "Revoke"}
          </Btn>
        </>
      }
    >
      <NoteBlock tone="warning">
        What they already posted stays live — the plan ends, so new actions stop. They are notified.
      </NoteBlock>
      <div className="mt-3">
        <TextArea value={reason} onChange={setReason} height={60} placeholder="Reason…" />
      </div>
      {error && (
        <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

const cell: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--ink-primary)",
  verticalAlign: "middle",
};
