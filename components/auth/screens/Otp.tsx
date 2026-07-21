"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { authApi, friendlyError } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * S4 OTP (P1, pixel-exact). Title 20/700 · "Sent to +91 98250 12345" + Edit ·
 * 6 boxes 48×52 surface2 radius8 20/700 (active accent border, auto-advance,
 * auto-submit, WebOTP) · "Resend code in 00:27" → link · Verify h44.
 * States: wrong-OTP (shake + attempts-left) / exhausted (banner + disabled) /
 * resend-limit / number-locked. The dev code is logged to the console, never
 * shown on screen (design has no dev hint).
 */
export function Otp({
  phone,
  otpSession,
  devCode,
  onEdit,
  onVerified,
}: {
  phone: string;
  otpSession: string;
  devCode?: string;
  onEdit: () => void;
  onVerified: (result: { isNew: boolean; next: string }) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [resendsUsed, setResendsUsed] = useState(0);
  const [session] = useState(otpSession);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const submitting = useRef(false);

  const masked = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
  const code = digits.join("");

  // Dev only: surface the code in the console (no on-screen hint — design-exact).
  useEffect(() => {
    if (devCode) console.info(`[HomzList dev] OTP code: ${devCode}`);
  }, [devCode]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // WebOTP autofill (Android). Best-effort.
  useEffect(() => {
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials as any)
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((c: any) => {
        const otp = c?.code?.replace(/\D/g, "").slice(0, 6);
        if (otp?.length === 6) setDigits(otp.split(""));
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (code.length === 6 && !submitting.current && !exhausted) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function setDigit(i: number, v: string) {
    const chars = v.replace(/\D/g, "");
    if (!chars) {
      setDigits((d) => d.map((x, idx) => (idx === i ? "" : x)));
      return;
    }
    setDigits((d) => {
      const next = [...d];
      chars.split("").forEach((ch, k) => {
        if (i + k < 6) next[i + k] = ch;
      });
      return next;
    });
    inputs.current[Math.min(i + chars.length, 5)]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function verify() {
    if (code.length !== 6 || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    const res = await authApi.verifyOtp(session, code);
    setLoading(false);
    submitting.current = false;

    if (res.ok) {
      onVerified({ isNew: (res.data as any).isNew, next: (res.data as any).next });
      return;
    }
    setShake(true);
    setTimeout(() => setShake(false), 400);
    setDigits(Array(6).fill(""));
    inputs.current[0]?.focus();
    if (res.error.code === "OTP_LOCKED") {
      setExhausted(true);
      setError("Too many wrong attempts. Try again later.");
    } else if (res.error.code === "NUMBER_LOCKED") {
      setExhausted(true);
      setError("This number is locked for 24 hours. Contact support.");
    } else {
      setError(friendlyError(res.error));
    }
  }

  async function resend() {
    if (secondsLeft > 0 || resendsUsed >= 3) return;
    const res = await authApi.resendOtp(session);
    if (res.ok) {
      setResendsUsed((n) => n + 1);
      setSecondsLeft(res.data.resendIn);
      setError(null);
      setExhausted(false);
      if (res.data.devCode) console.info(`[HomzList dev] OTP code: ${res.data.devCode}`);
    } else if (res.error.code === "RATE_LIMITED" && res.error.reason === "resend_limit") {
      setResendsUsed(3);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page px-4">
      <div className="flex h-header items-center">
        <button aria-label="Back" onClick={onEdit} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
      </div>

      <h1 className="mt-2 text-20 font-bold text-ink-primary">Enter verification code</h1>
      <p className="mt-2 text-15 text-ink-secondary">
        Sent to {masked}{" "}
        <button onClick={onEdit} className="font-semibold text-accent">
          Edit
        </button>
      </p>

      {exhausted && error && <div className="chrome mt-4 rounded-8 bg-error-soft px-3 py-2 text-13 text-error">{error}</div>}

      <div className={cn("mt-6 flex justify-between gap-2", shake && "animate-[shake_0.4s]")}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            type="tel"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            value={d}
            disabled={exhausted}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className={cn(
              "h-[52px] w-[48px] rounded-8 bg-surface-2 text-center text-20 font-bold text-ink-primary outline-none border transition-colors",
              error && !exhausted ? "border-error" : d ? "border-accent" : "border-transparent",
              "focus:border-accent disabled:opacity-50",
            )}
          />
        ))}
      </div>

      {error && !exhausted && <p className="mt-3 text-13 text-error">{error}</p>}

      <div className="mt-4 text-13">
        {resendsUsed >= 3 ? (
          <span className="chrome text-ink-tertiary">Resend limit reached</span>
        ) : secondsLeft > 0 ? (
          <span className="chrome text-ink-tertiary">Resend code in 00:{String(secondsLeft).padStart(2, "0")}</span>
        ) : (
          <button onClick={resend} className="font-semibold text-accent">
            Resend code
          </button>
        )}
      </div>

      <Button className="mt-6" fullWidth loading={loading} disabled={code.length !== 6 || exhausted} onClick={verify}>
        Verify
      </Button>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
