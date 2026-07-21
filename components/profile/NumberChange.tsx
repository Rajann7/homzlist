"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { profileApi } from "@/lib/profile/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * Number-change dual-OTP mini-flow (P9 S3 / Doc2 §3.3). Two steps:
 * (1) verify CURRENT number, (2) enter NEW number + verify. Both numbers are
 * OTP-verified server-side. Dev code logged to console (design has no on-screen hint).
 */
type Step = "verify-old" | "new-number" | "verify-new";

function OtpBoxes({ onComplete, error }: { onComplete: (code: string) => void; error?: boolean }) {
  const [d, setD] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const code = d.join("");
  useEffect(() => {
    if (code.length === 6) onComplete(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <div className="flex justify-between gap-2">
      {d.map((v, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="tel"
          inputMode="numeric"
          maxLength={6}
          value={v}
          onChange={(e) => {
            const chars = e.target.value.replace(/\D/g, "");
            setD((p) => {
              const n = [...p];
              chars.split("").forEach((c, k) => i + k < 6 && (n[i + k] = c));
              return n;
            });
            refs.current[Math.min(i + chars.length, 5)]?.focus();
          }}
          onKeyDown={(e) => e.key === "Backspace" && !d[i] && i > 0 && refs.current[i - 1]?.focus()}
          className={cn(
            "h-[52px] w-[48px] rounded-8 border bg-surface-2 text-center text-20 font-bold text-ink-primary outline-none focus:border-accent",
            error ? "border-error" : v ? "border-accent" : "border-transparent",
          )}
        />
      ))}
    </div>
  );
}

export function NumberChange({ onDone, onCancel }: { onDone: (masked: string) => void; onCancel: () => void }) {
  const { show } = useToast();
  const [step, setStep] = useState<Step>("verify-old");
  const [otpSession, setOtpSession] = useState("");
  const [maskedCurrent, setMaskedCurrent] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Kick off: send OTP to current number.
  useEffect(() => {
    profileApi.ncStart().then((r) => {
      if (r.ok) {
        setOtpSession(r.data.otpSession);
        setMaskedCurrent(r.data.maskedCurrent);
        if (r.data.devCode) console.info(`[HomzList dev] OTP code: ${r.data.devCode}`);
      } else show("Couldn't start. Try again.");
    });
  }, [show]);

  async function verifyOld(code: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await profileApi.ncVerifyOld(otpSession, code);
    setBusy(false);
    if (r.ok) setStep("new-number");
    else setError("Incorrect code. Please try again.");
  }

  async function sendNew() {
    if (!/^[6-9]\d{9}$/.test(newPhone) || busy) return;
    setBusy(true);
    setError(null);
    const r = await profileApi.ncSendNew(newPhone);
    setBusy(false);
    if (r.ok) {
      setOtpSession(r.data.otpSession);
      if (r.data.devCode) console.info(`[HomzList dev] OTP code: ${r.data.devCode}`);
      setStep("verify-new");
    } else if (!r.ok && (r.error as any).reason === "taken") setError("This number is already registered.");
    else setError("Couldn't send code. Try again.");
  }

  async function verifyNew(code: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await profileApi.ncVerifyNew(otpSession, code);
    setBusy(false);
    if (r.ok) {
      show("Number updated");
      onDone(r.data.phoneMasked);
    } else setError("Incorrect code. Please try again.");
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page px-4">
      <header className="flex h-header items-center">
        <button aria-label="Back" onClick={onCancel} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
      </header>

      {step === "verify-old" && (
        <>
          <h1 className="mt-2 text-20 font-bold text-ink-primary">Verify current number</h1>
          <p className="mt-2 text-15 text-ink-secondary">Sent to {maskedCurrent}</p>
          <p className="mt-2 text-11 text-ink-tertiary">You&apos;ll verify both your old and new number.</p>
          <div className="mt-6">
            <OtpBoxes onComplete={verifyOld} error={!!error} />
          </div>
          {error && <p className="mt-3 text-13 text-error">{error}</p>}
        </>
      )}

      {step === "new-number" && (
        <>
          <h1 className="mt-2 text-20 font-bold text-ink-primary">Enter new number</h1>
          <div className="mt-6 flex h-11 items-center rounded-8 border border-border bg-surface-2 px-3 focus-within:border-[1.5px] focus-within:border-accent">
            <span className="chrome flex items-center gap-2 text-15 text-ink-secondary">
              +91
              <span className="h-5 w-px bg-border" />
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98250 12345"
              className="ml-3 w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
          </div>
          {error && <p className="mt-3 text-13 text-error">{error}</p>}
          <Button className="mt-4" fullWidth loading={busy} disabled={!/^[6-9]\d{9}$/.test(newPhone)} onClick={sendNew}>
            Send OTP
          </Button>
        </>
      )}

      {step === "verify-new" && (
        <>
          <h1 className="mt-2 text-20 font-bold text-ink-primary">Verify new number</h1>
          <p className="mt-2 text-15 text-ink-secondary">Sent to +91 {newPhone.slice(0, 5)} {newPhone.slice(5)}</p>
          <div className="mt-6">
            <OtpBoxes onComplete={verifyNew} error={!!error} />
          </div>
          {error && <p className="mt-3 text-13 text-error">{error}</p>}
        </>
      )}
    </div>
  );
}
