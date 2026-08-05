"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { accountApi, type AccountLifecycle as Lifecycle } from "@/lib/content/client";

/**
 * P12 S6 — Deactivate or delete, and the two end states.
 *
 * One screen with five states, because that is the flow the design draws and
 * because the state is the SERVER's, not a wizard step the client invents:
 *
 *   choose        the two cards, with the payment-hold banner when it applies
 *   otp           OTP re-verify, bound server-side to the action it was sent for
 *   deactivated   "Account deactivated" — log in any time to reactivate
 *   grace         "Account scheduled for deletion on <date>" + Cancel deletion
 *
 * Landing here after logging in during the grace period goes straight to
 * `grace`, because /account/lifecycle reports `deletionScheduledAt` — which is
 * the only way "Log in before then to cancel" is a real instruction.
 *
 * The 7-day payment hold is enforced in three places, and only the first is
 * cosmetic: the button is disabled, `/account/verify/start` refuses to send a
 * code, and `requestDeletion` refuses to schedule. Disabling a button is a
 * hint; the other two are the guard.
 */

const REASONS = ["Found a property", "Too many messages", "Not useful", "Privacy concerns", "Other"];

type Step = "loading" | "choose" | "otp" | "deactivated" | "grace";

export function AccountLifecycle({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();

  const [life, setLife] = useState<Lifecycle | null>(null);
  const [offline, setOffline] = useState(false);
  const [step, setStep] = useState<Step>("loading");

  const [dialog, setDialog] = useState<null | "deact" | "del1" | "del2">(null);
  const [reason, setReason] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const [action, setAction] = useState<"deactivate" | "delete">("deactivate");
  const [otpSession, setOtpSession] = useState<string | null>(null);
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const load = useCallback(async () => {
    const r = await accountApi.lifecycle();
    if (!r.ok) {
      if (r.error.code === "OFFLINE") setOffline(true);
      return;
    }
    setLife(r.data);
    setOffline(false);
    if (r.data.deletionScheduledAt) { setScheduled(r.data.deletionScheduledAt); setStep("grace"); }
    else if (r.data.state === "deactivated") setStep("deactivated");
    else setStep("choose");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function startVerify(which: "deactivate" | "delete") {
    setBusy(true);
    const r = await accountApi.startVerify(which, reason);
    setBusy(false);
    if (!r.ok) {
      const code = r.error.code;
      toast.show(
        code === "FORBIDDEN" ? "Deletion isn't available yet — a payment is still inside the 7-day hold."
          : code === "RATE_LIMITED" ? "Too many codes requested. Try again in a little while."
          : code === "NUMBER_LOCKED" ? "This number is temporarily locked. Contact support."
          : code === "OFFLINE" ? "You're offline — try again"
          : "Couldn't send the code",
      );
      return;
    }
    setAction(which);
    setOtpSession(r.data.otpSession);
    setMasked(r.data.maskedPhone);
    setCode(["", "", "", "", "", ""]);
    setOtpError(null);
    setDialog(null);
    setStep("otp");
    // DEV mode has no SMS provider (CLAUDE.md stack note) — the code comes back
    // in the response so the flow is testable end to end.
    if (r.data.devCode) toast.show(`Dev code: ${r.data.devCode}`);
    setTimeout(() => boxes.current[0]?.focus(), 150);
  }

  async function confirmOtp() {
    if (!otpSession || busy) return;
    const value = code.join("");
    if (value.length < 6) return;
    setBusy(true);
    setOtpError(null);
    const r = await accountApi.confirmVerify(otpSession, value);
    setBusy(false);
    if (!r.ok) {
      setOtpError(
        r.error.code === "OTP_LOCKED" ? "Too many attempts — this number is locked for now."
          : r.error.code === "OTP_INVALID" ? "That code isn't right. Check and try again."
          : "Couldn't verify that code.",
      );
      setCode(["", "", "", "", "", ""]);
      boxes.current[0]?.focus();
      return;
    }
    if (r.data.action === "delete") { setScheduled(r.data.deletionScheduledAt); setStep("grace"); }
    else setStep("deactivated");
  }

  async function cancelDeletion() {
    setBusy(true);
    const r = await accountApi.cancelDeletion();
    setBusy(false);
    if (!r.ok) { toast.show("Couldn't cancel that — try again"); return; }
    toast.show("Deletion cancelled — welcome back");
    await load();
  }

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Account" />;

  if (step === "loading") {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to manage your account.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-56 w-full rounded-12" />
            <Skeleton className="h-64 w-full rounded-12" />
          </div>
        )}
      </AppShell>
    );
  }

  /* ── deactivated ──────────────────────────────────────────────────────── */
  if (step === "deactivated") {
    return (
      <AppShell header={header} showNav={false}>
        <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center">
          <Icon name="pause" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="mt-4 text-20 font-bold text-ink-primary">Account deactivated</p>
          <p className="max-w-[280px] text-15 text-ink-secondary">
            Your profile and listings are hidden. Log in anytime to reactivate.
          </p>
          <Button
            className="mt-4 min-w-[180px]"
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" });
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
              window.location.href = "/login";
            }}
          >
            <Icon name="log-out" size={20} />
            Log out
          </Button>
        </div>
      </AppShell>
    );
  }

  /* ── grace period ─────────────────────────────────────────────────────── */
  if (step === "grace") {
    const when = scheduled
      ? new Date(scheduled).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const daysLeft = scheduled
      ? Math.max(0, Math.ceil((new Date(scheduled).getTime() - Date.now()) / 86_400_000))
      : 0;
    return (
      <AppShell header={header} showNav={false}>
        <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center">
          <Icon name="clock" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="mt-4 text-20 font-bold text-ink-primary">Account scheduled for deletion</p>
          <p className="max-w-[300px] text-15 text-ink-secondary">
            Your account will be deleted on <b className="text-ink-primary">{when}</b>. Log in before then to cancel.
          </p>
          <p className="text-13 text-ink-tertiary">
            {daysLeft} day{daysLeft === 1 ? "" : "s"} left to change your mind.
          </p>
          <Button className="mt-4 min-w-[200px]" loading={busy} onClick={() => void cancelDeletion()}>
            Cancel deletion
          </Button>
          <Button
            variant="text"
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" });
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
              window.location.href = "/login";
            }}
          >
            Log out
          </Button>
        </div>
      </AppShell>
    );
  }

  /* ── OTP re-verify ────────────────────────────────────────────────────── */
  if (step === "otp") {
    const full = code.every(Boolean);
    return (
      <AppShell
        header={<Header left={<BackButton onClick={() => setStep("choose")} />} title={action === "delete" ? "Confirm deletion" : "Confirm deactivation"} />}
        showNav={false}
      >
        <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
          <Icon name="lock" size={48} className="text-accent" />
          <p className="text-17 font-semibold text-ink-primary">Enter the code we sent you</p>
          <p className="text-13 text-ink-secondary">A 6-digit code was sent to {masked}</p>

          <div className="flex justify-center gap-2">
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => { boxes.current[i] = el; }}
                value={c}
                inputMode="numeric"
                maxLength={1}
                aria-label={`Digit ${i + 1}`}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(-1);
                  setCode((prev) => { const n = [...prev]; n[i] = v; return n; });
                  if (v && i < 5) boxes.current[i + 1]?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !code[i] && i > 0) {
                    boxes.current[i - 1]?.focus();
                    setCode((prev) => { const n = [...prev]; n[i - 1] = ""; return n; });
                  }
                }}
                onPaste={(e) => {
                  const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                  if (!digits) return;
                  e.preventDefault();
                  const n = ["", "", "", "", "", ""];
                  digits.split("").forEach((d, k) => { n[k] = d; });
                  setCode(n);
                  boxes.current[Math.min(digits.length, 5)]?.focus();
                }}
                className="h-[52px] w-11 rounded-8 border border-border bg-surface-1 text-center text-24 font-bold text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
              />
            ))}
          </div>

          {otpError && <p className="text-13 text-error">{otpError}</p>}

          <Button className="w-full max-w-[320px]" disabled={!full} loading={busy} onClick={() => void confirmOtp()}>
            {action === "delete" ? "Verify & delete" : "Verify & deactivate"}
          </Button>
          <Button variant="text" onClick={() => void startVerify(action)}>Resend code</Button>
        </div>
      </AppShell>
    );
  }

  /* ── choose ───────────────────────────────────────────────────────────── */
  const hold = life?.paymentHold;
  const availableFrom = hold?.availableFrom
    ? new Date(hold.availableFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;
  const daysSincePayment = hold?.lastPaymentAt
    ? Math.max(0, Math.floor((Date.now() - new Date(hold.lastPaymentAt).getTime()) / 86_400_000))
    : null;

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-3 p-4">
        {/* Deactivate card */}
        <div className="flex flex-col gap-3 rounded-12 border border-accent-disabled bg-accent-soft p-4">
          <Icon name="pause" size={32} className="text-ink-secondary" />
          <p className="text-17 font-semibold text-ink-primary">Deactivate temporarily</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 leading-[1.5] text-ink-secondary">
            <li>Your profile and listings are hidden</li>
            <li>Chats are paused</li>
            <li>Everything comes back when you log in again</li>
            <li>Your plans stay as they are</li>
          </ul>
          <Button variant="outline" className="bg-surface-1" onClick={() => setDialog("deact")}>
            Deactivate account
          </Button>
        </div>

        {/* Delete card */}
        <div className="flex flex-col gap-3 rounded-12 border border-error p-4">
          {hold?.active && (
            <div className="flex items-start gap-2.5 rounded-8 bg-warning-soft p-3 text-13 leading-[1.5] text-ink-primary">
              <Icon name="alert" size={18} className="mt-px shrink-0 text-warning" />
              <span>
                You made a payment {daysSincePayment === 0 ? "today" : `${daysSincePayment} day${daysSincePayment === 1 ? "" : "s"} ago`}.
                Deletion is available 7 days after a payment.
              </span>
            </div>
          )}
          <Icon name="trash" size={32} className="text-error" />
          <p className="text-17 font-semibold text-ink-primary">Delete permanently</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 leading-[1.5] text-ink-secondary">
            <li>Your listings, requirements and chats are removed</li>
            <li><b className="text-ink-primary">Active plans are lost — no refund</b></li>
            <li>Payment records are kept for 7 years as required by law (anonymised)</li>
            <li>You have 30 days to change your mind</li>
          </ul>
          <button
            disabled={hold?.active}
            onClick={() => { setReason(null); setDialog("del1"); }}
            className="chrome inline-flex h-11 items-center justify-center rounded-8 border border-error text-15 font-semibold text-error transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:border-border disabled:text-ink-disabled"
          >
            Delete account
          </button>
          {hold?.active && availableFrom && (
            <p className="text-11 text-ink-tertiary">Available from {availableFrom}</p>
          )}
        </div>
      </div>

      {/* ── dg-deact ── */}
      {dialog === "deact" && (
        <DialogShell onClose={() => setDialog(null)}>
          <p className="text-17 font-semibold text-ink-primary">Deactivate your account?</p>
          <p className="text-13 leading-[1.5] text-ink-secondary">
            Your listings and profile will be hidden until you log in again.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => void startVerify("deactivate")}>Deactivate</Button>
          </div>
        </DialogShell>
      )}

      {/* ── dg-del1 · consequences + reason ── */}
      {dialog === "del1" && (
        <DialogShell onClose={() => setDialog(null)}>
          <p className="text-17 font-semibold text-ink-primary">Delete your account?</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 leading-[1.5] text-ink-secondary">
            <li>All listings, requirements and chats removed</li>
            <li>Active plans lost — <b className="text-ink-primary">no refund</b></li>
            <li>Anonymised payment records kept 7 years (legal requirement)</li>
            <li>30-day grace period to change your mind</li>
          </ul>
          <p className="mt-1 text-13 font-semibold text-ink-primary">Why are you leaving?</p>
          <div className="flex flex-col">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className="chrome flex min-h-11 items-center gap-3 px-1 py-2 text-left active:bg-surface-2"
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] ${
                    reason === r ? "border-[6px] border-accent" : "border-border"
                  }`}
                />
                <span className="flex-1 text-13 text-ink-primary">{r}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason} onClick={() => { setTyped(""); setDialog("del2"); }}>
              Continue
            </Button>
          </div>
        </DialogShell>
      )}

      {/* ── dg-del2 · type DELETE ── */}
      {dialog === "del2" && (
        <DialogShell onClose={() => setDialog(null)}>
          <p className="text-17 font-semibold text-ink-primary">This will delete everything</p>
          <div className="flex items-start gap-2.5 rounded-8 bg-warning-soft p-3 text-13 leading-[1.5] text-ink-primary">
            <Icon name="alert" size={18} className="mt-px shrink-0 text-warning" />
            <span>{atRiskLine(life)}</span>
          </div>
          <div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Type DELETE to confirm</span>
            <input
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
              className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
            />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={typed.trim() !== "DELETE"}
              loading={busy}
              onClick={() => void startVerify("delete")}
            >
              Delete account
            </Button>
          </div>
        </DialogShell>
      )}
    </AppShell>
  );
}

/**
 * "You have 1 active ₹999 plan and 1 live listing" — every number is read from
 * /account/lifecycle, so the warning is about this account rather than a
 * sentence that says the same thing to everyone.
 */
function atRiskLine(life: Lifecycle | null): string {
  const parts: string[] = [];
  const r = life?.atRisk;
  if (r?.activePlans) parts.push(`${r.activePlans} active plan${r.activePlans === 1 ? "" : "s"}`);
  if (r?.liveListings) parts.push(`${r.liveListings} live listing${r.liveListings === 1 ? "" : "s"}`);
  if (r?.activeBoosts) parts.push(`${r.activeBoosts} running boost${r.activeBoosts === 1 ? "" : "s"}`);
  if (!parts.length) return "This removes your listings, requirements and chats. It can't be undone after 30 days.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `You have ${list}. These will be lost and won't be refunded.`;
}

function DialogShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-dialog grid place-items-center p-6" role="alertdialog" aria-modal="true">
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[86vh] w-full max-w-[330px] animate-toast-in flex-col gap-3 overflow-y-auto rounded-16 bg-surface-1 p-6 shadow-l3 dark:border dark:border-border">
        {children}
      </div>
    </div>
  );
}
