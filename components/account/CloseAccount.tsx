"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Callout } from "@/components/help/primitives";
import { accountApi, type AccountStatus } from "@/lib/support/client";
import { cn } from "@/lib/utils";

/**
 * P12 S6 — Deactivate or delete, with both confirm dialogs, the OTP re-verify
 * step, and the two end screens (deactivated / deletion scheduled).
 *
 * Everything the screen asserts is the server's answer:
 *   • the payment-hold banner and the "Available from <date>" note come from
 *     GET /account/status, and the server refuses the deletion independently;
 *   • the second dialog's warning names the user's actual active plans, live
 *     listings and live requirements;
 *   • the grace date is the purge_at the server wrote, not a client + 30 days.
 */
type Step = "home" | "otp-deactivate" | "otp-delete" | "done-deactivated" | "done-grace";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "found_property", label: "Found a property" },
  { value: "too_many_messages", label: "Too many messages" },
  { value: "not_useful", label: "Not useful" },
  { value: "privacy", label: "Privacy concerns" },
  { value: "other", label: "Other" },
];

const DATE = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";

export function CloseAccount({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("home");

  const [deactDlg, setDeactDlg] = useState(false);
  const [del1, setDel1] = useState(false);
  const [del2, setDel2] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [otpSession, setOtpSession] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [purgeAt, setPurgeAt] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const load = useCallback(async () => {
    const r = await accountApi.status();
    if (r.ok) {
      setStatus(r.data);
      if (r.data.scheduled?.kind === "delete") {
        setPurgeAt(r.data.scheduled.purgeAt);
        setStep("done-grace");
      }
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const startOtp = async (intent: "deactivate" | "delete") => {
    setBusy(true);
    const r = await accountApi.stepUp(intent);
    setBusy(false);
    if (!r.ok) {
      toast.show(
        r.error.code === "NUMBER_LOCKED"
          ? "This number is temporarily locked"
          : "Too many codes requested — try again shortly",
        { variant: "error" },
      );
      return;
    }
    setOtpSession(r.data.otpSession);
    setPhoneMasked(r.data.phoneMasked);
    setDevCode(r.data.devCode);
    setDigits(["", "", "", "", "", ""]);
    setDeactDlg(false);
    setDel1(false);
    setDel2(false);
    setStep(intent === "delete" ? "otp-delete" : "otp-deactivate");
    setTimeout(() => inputs.current[0]?.focus(), 150);
  };

  const code = digits.join("");

  const verify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    const r =
      step === "otp-delete"
        ? await accountApi.delete(otpSession, code, reason)
        : await accountApi.deactivate(otpSession, code);
    setBusy(false);
    if (r.ok) {
      if ("purgeAt" in r.data) {
        setPurgeAt(r.data.purgeAt);
        setStep("done-grace");
      } else {
        setStep("done-deactivated");
      }
      return;
    }
    const c = r.error.code;
    setDigits(["", "", "", "", "", ""]);
    inputs.current[0]?.focus();
    toast.show(
      c === "OTP_INVALID" ? "That code isn't right"
      : c === "OTP_LOCKED" ? "Too many attempts — request a new code"
      : c === "NUMBER_LOCKED" ? "This number is temporarily locked"
      : c === "FORBIDDEN" ? "Deletion isn't available yet — a recent payment is on hold"
      : "Couldn't complete that",
      { variant: "error" },
    );
  };

  const cancelDeletion = async () => {
    setBusy(true);
    const r = await accountApi.cancelDeletion();
    setBusy(false);
    if (r.ok) {
      toast.show("Deletion cancelled — welcome back");
      window.location.href = `${base}/profile`;
    } else {
      toast.show("Couldn't cancel — please log in again", { variant: "error" });
    }
  };

  /* ------------------------------------------------------------- end screens */
  if (step === "done-deactivated") {
    return (
      <AppShell showNav={false}>
        <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center">
          <Icon name="pause" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="mt-4 text-20 font-bold text-ink-primary">Account deactivated</p>
          <p className="max-w-[280px] text-15 text-ink-secondary">
            Your profile and listings are hidden. Log in anytime to reactivate.
          </p>
          <a
            href="/login"
            className="chrome mt-4 inline-flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-8 bg-accent px-4 text-15 font-semibold text-white active:bg-accent-pressed"
          >
            <Icon name="log-out" size={20} className="text-white" />
            Log out
          </a>
        </div>
      </AppShell>
    );
  }

  if (step === "done-grace") {
    return (
      <AppShell showNav={false}>
        <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center">
          <Icon name="clock" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="mt-4 text-20 font-bold text-ink-primary">Account scheduled for deletion</p>
          <p className="max-w-[300px] text-15 text-ink-secondary">
            Your account will be deleted on <b className="font-semibold text-ink-primary">{DATE(purgeAt)}</b>. Log in
            before then to cancel.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={cancelDeletion}
            className="chrome mt-4 inline-flex h-11 min-w-[200px] items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white disabled:bg-accent-disabled active:bg-accent-pressed"
          >
            {busy ? "Cancelling…" : "Cancel deletion"}
          </button>
          <a href="/login" className="chrome mt-1 px-2 py-2 text-15 font-semibold text-accent">
            Log out
          </a>
        </div>
      </AppShell>
    );
  }

  /* -------------------------------------------------------------- OTP screen */
  if (step === "otp-deactivate" || step === "otp-delete") {
    const deleting = step === "otp-delete";
    return (
      <AppShell
        showNav={false}
        header={
          <Header
            left={<BackButton onClick={() => setStep("home")} />}
            title={deleting ? "Confirm deletion" : "Confirm deactivation"}
          />
        }
      >
        <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
          <Icon name="lock" size={48} className="text-accent" />
          <p className="text-17 font-semibold text-ink-primary">Enter the code we sent you</p>
          <p className="text-13 text-ink-secondary">A 6-digit code was sent to {phoneMasked}</p>
          {devCode && <p className="text-11 text-ink-tertiary">Dev code: {devCode}</p>}

          <div className="flex justify-center gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                maxLength={2}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(-1);
                  setDigits((prev) => prev.map((p, k) => (k === i ? v : p)));
                  if (v && i < 5) inputs.current[i + 1]?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) {
                    inputs.current[i - 1]?.focus();
                    setDigits((prev) => prev.map((p, k) => (k === i - 1 ? "" : p)));
                  }
                }}
                className="h-13 w-11 rounded-8 border border-border bg-surface-1 text-center text-24 font-bold text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
                style={{ height: 52 }}
              />
            ))}
          </div>

          <button
            type="button"
            disabled={code.length !== 6 || busy}
            onClick={verify}
            className="chrome inline-flex h-11 w-full max-w-[320px] items-center justify-center rounded-8 bg-accent text-15 font-semibold text-white disabled:bg-accent-disabled active:bg-accent-pressed"
          >
            {busy ? "Verifying…" : deleting ? "Verify & delete" : "Verify & deactivate"}
          </button>
          <button
            type="button"
            onClick={() => startOtp(deleting ? "delete" : "deactivate")}
            className="chrome px-2 py-2 text-15 font-semibold text-accent"
          >
            Resend code
          </button>
        </div>
      </AppShell>
    );
  }

  /* -------------------------------------------------------------- S6 home */
  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Account" />;

  if (loading || !status) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-[220px] w-full rounded-12" />
          <Skeleton className="h-[260px] w-full rounded-12" />
        </div>
      </AppShell>
    );
  }

  const held = Boolean(status.paymentHoldUntil);

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-3 p-4">
        {/* Deactivate */}
        <div className="flex flex-col gap-3 rounded-12 border border-accent-disabled bg-accent-soft p-4">
          <Icon name="pause" size={32} className="text-ink-secondary" />
          <p className="text-17 font-semibold text-ink-primary">Deactivate temporarily</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 text-ink-secondary">
            <li>Your profile and listings are hidden</li>
            <li>Chats are paused</li>
            <li>Everything comes back when you log in again</li>
            <li>Your plans stay as they are</li>
          </ul>
          <button
            type="button"
            onClick={() => setDeactDlg(true)}
            className="chrome inline-flex h-11 items-center justify-center rounded-8 border border-border bg-surface-1 px-4 text-15 font-semibold text-ink-primary active:bg-surface-2"
          >
            Deactivate account
          </button>
        </div>

        {/* Delete */}
        <div className="flex flex-col gap-3 rounded-12 border border-error bg-surface-1 p-4">
          {held && (
            <Callout tone="warn">
              You made a payment recently. Deletion is available {status.paymentHoldDays} days after a payment.
            </Callout>
          )}
          <Icon name="trash" size={32} className="text-error" />
          <p className="text-17 font-semibold text-ink-primary">Delete permanently</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 text-ink-secondary">
            <li>Your listings, requirements and chats are removed</li>
            <li>
              <b className="font-semibold text-ink-primary">Active plans are lost — no refund</b>
            </li>
            <li>Payment records are kept for 7 years as required by law (anonymised)</li>
            <li>You have {status.graceDays} days to change your mind</li>
          </ul>
          <button
            type="button"
            disabled={held}
            onClick={() => setDel1(true)}
            className={cn(
              "chrome inline-flex h-11 items-center justify-center rounded-8 border px-4 text-15 font-semibold",
              held ? "border-border text-ink-disabled" : "border-error text-error active:bg-error-soft",
            )}
          >
            Delete account
          </button>
          {held && (
            <p className="text-11 text-ink-tertiary">Available from {DATE(status.paymentHoldUntil)}</p>
          )}
        </div>
      </div>

      {/* dg-deact */}
      {deactDlg && (
        <Dialog onClose={() => setDeactDlg(false)}>
          <p className="text-17 font-semibold text-ink-primary">Deactivate your account?</p>
          <p className="text-13 text-ink-secondary">
            Your listings and profile will be hidden until you log in again.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <DlgBtn onClick={() => setDeactDlg(false)}>Cancel</DlgBtn>
            <DlgBtn tone="primary" disabled={busy} onClick={() => startOtp("deactivate")}>
              Deactivate
            </DlgBtn>
          </div>
        </Dialog>
      )}

      {/* dg-del1 */}
      {del1 && (
        <Dialog onClose={() => setDel1(false)}>
          <p className="text-17 font-semibold text-ink-primary">Delete your account?</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 text-ink-secondary">
            <li>All listings, requirements and chats removed</li>
            <li>
              Active plans lost — <b className="font-semibold text-ink-primary">no refund</b>
            </li>
            <li>Anonymised payment records kept 7 years (legal requirement)</li>
            <li>{status.graceDays}-day grace period to change your mind</li>
          </ul>
          <p className="mt-1 text-13 font-semibold text-ink-primary">Why are you leaving?</p>
          <div className="flex flex-col">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className="chrome flex min-h-11 items-center gap-3 px-1 py-2 text-left"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] border-border",
                    reason === r.value && "border-[6px] border-accent",
                  )}
                />
                <span className="flex-1 text-13 text-ink-primary">{r.label}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <DlgBtn onClick={() => setDel1(false)}>Cancel</DlgBtn>
            <DlgBtn
              tone="danger"
              disabled={!reason}
              onClick={() => {
                setDel1(false);
                setConfirmText("");
                setDel2(true);
              }}
            >
              Continue
            </DlgBtn>
          </div>
        </Dialog>
      )}

      {/* dg-del2 */}
      {del2 && (
        <Dialog onClose={() => setDel2(false)}>
          <p className="text-17 font-semibold text-ink-primary">This will delete everything</p>
          <Callout tone="warn">
            {impactSentence(status)} {status.impact.activePlans > 0 || status.impact.liveListings > 0
              ? "These will be lost and won't be refunded."
              : "Nothing paid for is currently active on this account."}
          </Callout>
          <div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Type DELETE to confirm</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder="DELETE"
              className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
            />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <DlgBtn onClick={() => setDel2(false)}>Cancel</DlgBtn>
            <DlgBtn tone="danger" disabled={confirmText.trim() !== "DELETE" || busy} onClick={() => startOtp("delete")}>
              Delete account
            </DlgBtn>
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}

function impactSentence(s: AccountStatus): string {
  const bits: string[] = [];
  if (s.impact.activePlans > 0) {
    bits.push(
      `${s.impact.activePlans} active ${s.impact.planNames[0] ?? "plan"}${s.impact.activePlans > 1 ? ` and ${s.impact.activePlans - 1} more` : ""}`,
    );
  }
  if (s.impact.liveListings > 0) bits.push(`${s.impact.liveListings} live listing${s.impact.liveListings === 1 ? "" : "s"}`);
  if (s.impact.liveRequirements > 0)
    bits.push(`${s.impact.liveRequirements} live requirement${s.impact.liveRequirements === 1 ? "" : "s"}`);
  if (!bits.length) return "You have no active plans or live content.";
  return `You have ${bits.join(" and ")}.`;
}

/* ---------------------------------------------------------------- dialog bits */

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[86vh] w-full max-w-[330px] animate-[hz-pop_0.2s_cubic-bezier(0.2,0,0,1)] flex-col gap-3 overflow-y-auto rounded-16 bg-surface-1 p-6 shadow-l3"
      >
        {children}
      </div>
    </div>
  );
}

function DlgBtn({
  children,
  onClick,
  tone = "secondary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "secondary" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "chrome inline-flex h-11 items-center justify-center rounded-8 px-4 text-15 font-semibold",
        tone === "primary" && "bg-accent text-white disabled:bg-accent-disabled active:bg-accent-pressed",
        tone === "danger" && "bg-error text-white disabled:opacity-40",
        tone === "secondary" && "bg-surface-2 text-ink-primary",
      )}
    >
      {children}
    </button>
  );
}
