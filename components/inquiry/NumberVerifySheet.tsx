"use client";

import { useEffect, useState } from "react";
import { BottomSheet, Button, Icon, useToast } from "@/components/billing/ui";
import { cn } from "@/lib/utils";
import * as leadsApi from "@/lib/leads/client";

/**
 * "Use a different number" — the popup.
 *
 * Verifying a number here NEVER creates an account and never touches the
 * session; it only proves the sender holds the handset before that number is
 * shared with a stranger. A number verified once is reusable for 7 days on any
 * other listing, so the popup opens straight on the reusable list when there is
 * one and no OTP is sent at all.
 */
export function NumberVerifySheet({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: (number: string) => void;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<"enter" | "code">("enter");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ number: string; expiresAt: string }[]>([]);
  const [reuseDays, setReuseDays] = useState(7);

  useEffect(() => {
    if (!open) return;
    setPhase("enter"); setNumber(""); setCode(""); setSession(""); setBusy(false);
    void (async () => {
      const res = await leadsApi.myNumbers();
      if (res.ok) { setSaved(res.data.verified.filter((v) => v.number !== res.data.myNumber)); setReuseDays(res.data.reuseDays); }
    })();
  }, [open]);

  async function start() {
    setBusy(true);
    const res = await leadsApi.startNumberOtp(number);
    setBusy(false);
    if (!res.ok) {
      const c = res.error.code;
      toast.show(
        c === "VALIDATION_ERROR" ? "Enter a valid 10-digit mobile number"
        : c === "NUMBER_LOCKED" ? "Too many attempts on this number — try later"
        : c === "RATE_LIMITED" ? "Too many numbers today — try tomorrow"
        : "Couldn't send the code",
        { variant: "error" },
      );
      return;
    }
    // Already inside the 7-day window: no OTP, straight back to the sheet.
    if (res.data.alreadyVerified) { onVerified(res.data.number); return; }
    setSession(res.data.otpSession ?? "");
    setPhase("code");
  }

  async function confirm() {
    setBusy(true);
    const res = await leadsApi.confirmNumberOtp(session, code);
    setBusy(false);
    if (!res.ok) {
      const c = res.error.code;
      toast.show(
        c === "OTP_INVALID" ? "That code isn't right"
        : c === "OTP_LOCKED" ? "Too many wrong codes — try later"
        : c === "NOT_FOUND" ? "That code expired — send a new one"
        : "Couldn't verify that number",
        { variant: "error" },
      );
      if (res.error.code === "NOT_FOUND") setPhase("enter");
      return;
    }
    toast.show("Number verified");
    onVerified(res.data.number);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={phase === "enter" ? "Use a different number" : "Enter the code"}>
      <div className="flex flex-col gap-3 pb-2">
        {phase === "enter" ? (
          <>
            {saved.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-11 font-bold tracking-wide text-ink-secondary">ALREADY VERIFIED</div>
                {saved.map((s) => (
                  <button
                    key={s.number}
                    type="button"
                    onClick={() => onVerified(s.number)}
                    className="chrome flex items-center gap-2.5 rounded-12 border border-border bg-surface-1 p-3 text-left"
                  >
                    <Icon name="check-circle" size={18} className="text-accent" />
                    <span className="flex-1 text-14 font-semibold text-ink-primary">{s.number}</span>
                    <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
              <span className="border-r border-divider py-3 pr-2.5 text-15 font-semibold text-ink-primary">+91</span>
              <input
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                className="h-12 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
              />
            </div>
            <p className="text-11 leading-snug text-ink-tertiary">
              We&apos;ll send a 6-digit code to confirm this number before it is shared. Verifying here does not
              create an account. Once verified it works for {reuseDays} days on any other listing.
            </p>
            <Button fullWidth loading={busy} disabled={number.length !== 10} onClick={() => void start()}>
              Send code
            </Button>
          </>
        ) : (
          <>
            <p className="text-13 text-ink-secondary">Code sent to +91 {number}</p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className={cn(
                "h-12 w-full rounded-8 border border-border bg-surface-1 px-3 text-center text-17",
                "tracking-[0.4em] text-ink-primary outline-none placeholder:tracking-normal placeholder:text-ink-tertiary",
              )}
            />
            <Button fullWidth loading={busy} disabled={code.length !== 6} onClick={() => void confirm()}>
              Verify number
            </Button>
            <button type="button" onClick={() => setPhase("enter")} className="chrome text-12 font-semibold text-ink-secondary">
              Change number
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
