"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/nav/Header";
import { authApi, friendlyError } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * S3 Login (P1, pixel-exact vs designs/P1.html).
 * Wordmark 24/700 top-48 · label "Phone number" 13/600 #555 · input row h44
 * surface2 1px #DBDBDB radius8, "+91" 15 #555 + divider, placeholder "98250 12345"
 * · Continue h44 (disabled #A8D5BD) · consent 11 #8E8E8E center, Terms/Privacy
 * accent 400 · "or" 13 #8E8E8E · "Browse as Guest" 15/600 accent (no icon).
 * States: rate-limited (warning banner) / number-locked (error banner).
 */
export function Login({
  initialPhone = "",
  onContinue,
  onGuest,
  onLegal,
}: {
  initialPhone?: string;
  onContinue: (phone: string, otpSession: string, devCode?: string) => void;
  onGuest: () => void;
  onLegal: (which: "terms" | "privacy") => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<null | { kind: "rate" | "locked"; text: string }>(null);
  const [hp, setHp] = useState("");

  const valid = /^[6-9]\d{9}$/.test(phone);

  async function submit() {
    if (!valid || loading) return;
    setLoading(true);
    setBanner(null);
    const res = await authApi.requestOtp(phone, hp);
    setLoading(false);
    if (res.ok) {
      onContinue(phone, res.data.otpSession, res.data.devCode);
    } else if (res.error.code === "NUMBER_LOCKED") {
      setBanner({ kind: "locked", text: "This number is locked for 24 hours. Contact support." });
    } else if (res.error.code === "RATE_LIMITED") {
      setBanner({ kind: "rate", text: "Too many attempts. Try again in 1 hour." });
    } else {
      setBanner({ kind: "rate", text: friendlyError(res.error) });
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page md:min-h-0 md:bg-transparent">
      {banner && (
        <div className={cn("chrome px-4 py-3 text-13", banner.kind === "locked" ? "bg-error-soft text-error" : "bg-warning-soft text-warning")}>
          {banner.text}
        </div>
      )}

      <div className="flex flex-1 flex-col px-4 md:px-0">
        <div className="mt-12 flex justify-center md:mt-0 md:justify-start">
          <Wordmark className="text-24" />
        </div>

        {/* Desktop/tablet only (designs/desktop-tablet/02-auth-entry.html). On a
            phone the card IS the screen and the field speaks for itself; in a
            420px popup over a page the visitor needs to be told what opened and
            what is about to happen. `hidden md:block` — the mobile design is
            byte-for-byte untouched. */}
        <h1 className="hidden text-24 font-bold tracking-[-0.02em] text-ink-primary md:mt-5 md:block">
          Log in or sign up
        </h1>
        <p className="hidden text-15 text-ink-secondary md:mt-2 md:block">
          We&rsquo;ll send a one-time code to your mobile number.
        </p>

        <div className="mt-8 flex flex-col gap-2">
          <label htmlFor="phone" className="chrome text-13 font-semibold text-ink-secondary">
            Phone number
          </label>
          <div className="flex h-11 items-center rounded-8 border border-border bg-surface-2 px-3 focus-within:border-[1.5px] focus-within:border-accent">
            <span className="chrome flex items-center gap-2 text-15 text-ink-secondary">
              +91
              <span className="h-5 w-px bg-border" />
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="98250 12345"
              className="ml-3 w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
          </div>

          {/* Honeypot — off-screen; bots fill it, humans don't. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <Button className="mt-4" fullWidth loading={loading} disabled={!valid} onClick={submit}>
            Continue
          </Button>

          <p className="chrome mt-3 text-center text-11 text-ink-tertiary">
            By continuing, you agree to our{" "}
            <button className="font-normal text-accent" onClick={() => onLegal("terms")}>
              Terms
            </button>{" "}
            &amp;{" "}
            <button className="font-normal text-accent" onClick={() => onLegal("privacy")}>
              Privacy Policy
            </button>
          </p>
        </div>

        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-divider" />
          <span className="chrome text-13 text-ink-tertiary">or</span>
          <span className="h-px flex-1 bg-divider" />
        </div>

        <button onClick={onGuest} className="chrome mx-auto text-15 font-semibold text-accent">
          Browse as Guest
        </button>
      </div>
    </div>
  );
}
