"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Otp } from "./screens/Otp";
import { Role } from "./screens/Role";
import { Details } from "./screens/Details";
import { Coach } from "./screens/Coach";
import { BrowserUnsupported, Placeholder, OfflineBanner, SavedAccounts } from "./screens/Misc";
import { authApi } from "@/lib/auth/client";
import { getSavedAccounts, rememberAccount, type SavedAccountHint } from "@/lib/auth/saved-accounts";

/**
 * P1 Auth & Entry orchestrator. Single-file flow (matches the design) with a
 * screen stack for browser-back. Entry (Doc4 §1): Splash → silent refresh →
 * session? home : (onboarding first-run) → Login. New user OTP → Role → Details
 * → Coach → home.
 */
type Screen = "splash" | "onboarding" | "savedAccounts" | "login" | "otp" | "role" | "details" | "coach" | "browserUnsupported" | "guest";

/** Best-effort hint from a verified user DTO (server stays the source of truth). */
function hintFromUser(phone: string, user: unknown): SavedAccountHint | null {
  const u = user as { name?: string | null; phoneMasked?: string | null; photoUrl?: string | null } | null;
  if (!u || !phone) return null;
  return { name: u.name ?? "", phone, phoneMasked: u.phoneMasked ?? "", photoUrl: u.photoUrl ?? null };
}

const ONBOARDED_KEY = "hz-onboarded";

function browserSupported() {
  if (typeof window === "undefined") return true;
  return "fetch" in window && "Promise" in window && "grid" in document.documentElement.style;
}

export function AuthFlow() {
  const [stack, setStack] = useState<Screen[]>(["splash"]);
  const [offline, setOffline] = useState(false);
  const [flow, setFlow] = useState<{ phone: string; otpSession: string; devCode?: string; role?: string }>({ phone: "", otpSession: "" });
  const [saved, setSaved] = useState<SavedAccountHint[]>([]);
  // /login?add=1 — arriving from the P9 switch sheet to sign a SECOND account
  // into this device. The server keeps both sessions (lib/auth/account-pool).
  // Read on every render, NOT via useState: this component is server-rendered
  // first, so a lazy initial state would freeze the SSR value (false) through
  // hydration and the flag would never be seen. Nothing renders from it.
  const addingAccount =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1";

  const screen = stack[stack.length - 1];

  const go = useCallback((s: Screen) => {
    setStack((st) => [...st, s]);
    window.history.pushState({ hzDepth: (window.history.state?.hzDepth ?? 0) + 1 }, "");
  }, []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);

  useEffect(() => {
    const onPop = () => back();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [back]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (screen !== "splash") return;
    if (!browserSupported()) {
      replace("browserUnsupported");
      return;
    }
    // "Add account" (P9 S1): a session already exists on purpose. Refreshing it
    // would bounce straight home, and the S5 picker would offer the account
    // that is already signed in — go straight to the number entry.
    if (addingAccount) {
      replace("login");
      return;
    }
    let cancelled = false;
    (async () => {
      const refreshed = await authApi.refresh().catch(() => ({ ok: false }) as const);
      if (cancelled) return;
      if (refreshed.ok) {
        window.location.href = "/";
        return;
      }
      const onboarded = localStorage.getItem(ONBOARDED_KEY);
      const hints = getSavedAccounts();
      setSaved(hints);
      // Returning user with remembered accounts → S5 picker; else login / first-run onboarding.
      setTimeout(() => !cancelled && replace(hints.length ? "savedAccounts" : onboarded ? "login" : "onboarding"), 900);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, addingAccount]);

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    replace("login");
  };

  // S5 pick — re-trigger a full OTP for the remembered number (server re-validates;
  // the stored hint is convenience only). On any error, fall back to Login prefilled.
  const pickSaved = async (a: SavedAccountHint) => {
    const res = await authApi.requestOtp(a.phone).catch(() => ({ ok: false }) as const);
    if (res.ok) {
      setFlow((f) => ({ ...f, phone: a.phone, otpSession: res.data.otpSession, devCode: res.data.devCode }));
      go("otp");
    } else {
      setFlow((f) => ({ ...f, phone: a.phone }));
      go("login");
    }
  };
  // Relative so it works on any host (localhost, a LAN IP via nip.io, the real
  // domain). The seller dashboard lives on the same host as /login already.
  // Adding an account lands back on the profile, where the switch sheet is —
  // that's where the user was and where the new account is now visible.
  const goHome = () => {
    window.location.href = addingAccount ? "/profile" : "/";
  };

  return (
    <div className="mx-auto w-full max-w-column">
      {offline && screen !== "splash" && <OfflineBanner onRetry={() => setOffline(!navigator.onLine)} />}

      {screen === "splash" && <Splash />}
      {screen === "onboarding" && <Onboarding onDone={finishOnboarding} />}
      {screen === "savedAccounts" && <SavedAccounts accounts={saved} onPick={pickSaved} onUseAnother={() => go("login")} />}
      {screen === "login" && (
        <Login
          initialPhone={flow.phone}
          onContinue={(phone, otpSession, devCode) => {
            setFlow((f) => ({ ...f, phone, otpSession, devCode }));
            go("otp");
          }}
          onGuest={() => go("guest")}
          // P12 S3 shipped the real readers — the signup consent line now opens
          // the live Terms / Privacy documents instead of a placeholder.
          onLegal={(which) => {
            window.location.href = which === "terms" ? "/legal/terms" : "/legal/privacy";
          }}
        />
      )}
      {screen === "otp" && (
        <Otp
          phone={flow.phone}
          otpSession={flow.otpSession}
          devCode={flow.devCode}
          onEdit={back}
          onVerified={(res) => {
            if (res.isNew) go("role");
            else {
              const hint = hintFromUser(flow.phone, res.user);
              if (hint) rememberAccount(hint);
              // P12 S6 — a deletion is still pending: land on the grace screen so
              // the user can cancel it, rather than dropping them into the app
              // with a purge date they never saw.
              if (res.next === "grace") window.location.href = "/account/grace";
              else goHome();
            }
          }}
        />
      )}
      {screen === "role" && (
        <Role
          onContinue={(role) => {
            setFlow((f) => ({ ...f, role }));
            go("details");
          }}
        />
      )}
      {screen === "details" && (
        <Details
          role={flow.role ?? "owner"}
          onBack={back}
          onDone={(user) => {
            const hint = hintFromUser(flow.phone, user);
            if (hint) rememberAccount(hint);
            replace("coach");
          }}
        />
      )}
      {screen === "coach" && <Coach onDone={goHome} />}
      {screen === "browserUnsupported" && <BrowserUnsupported />}
      {screen === "guest" && <Placeholder title="Feed — coming in Batch P2" onBack={back} />}
    </div>
  );
}
