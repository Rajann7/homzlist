"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Otp } from "./screens/Otp";
import { Role } from "./screens/Role";
import { Details } from "./screens/Details";
import { Coach } from "./screens/Coach";
import { BrowserUnsupported, Placeholder, OfflineBanner } from "./screens/Misc";
import { authApi } from "@/lib/auth/client";

/**
 * P1 Auth & Entry orchestrator. Single-file flow (matches the design) with a
 * screen stack for browser-back. Entry (Doc4 §1): Splash → silent refresh →
 * session? home : (onboarding first-run) → Login. New user OTP → Role → Details
 * → Coach → home.
 */
type Screen = "splash" | "onboarding" | "login" | "otp" | "role" | "details" | "coach" | "browserUnsupported" | "guest" | "legal";

const ONBOARDED_KEY = "hz-onboarded";

function browserSupported() {
  if (typeof window === "undefined") return true;
  return "fetch" in window && "Promise" in window && "grid" in document.documentElement.style;
}

export function AuthFlow() {
  const [stack, setStack] = useState<Screen[]>(["splash"]);
  const [offline, setOffline] = useState(false);
  const [flow, setFlow] = useState<{ phone: string; otpSession: string; devCode?: string; role?: string }>({ phone: "", otpSession: "" });
  const legalRef = useRef<"terms" | "privacy">("terms");

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
    let cancelled = false;
    (async () => {
      const refreshed = await authApi.refresh().catch(() => ({ ok: false }) as const);
      if (cancelled) return;
      if (refreshed.ok) {
        window.location.href = "/";
        return;
      }
      const onboarded = localStorage.getItem(ONBOARDED_KEY);
      setTimeout(() => !cancelled && replace(onboarded ? "login" : "onboarding"), 900);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    replace("login");
  };
  // Relative so it works on any host (localhost, a LAN IP via nip.io, the real
  // domain). The seller dashboard lives on the same host as /login already.
  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="mx-auto w-full max-w-column">
      {offline && screen !== "splash" && <OfflineBanner onRetry={() => setOffline(!navigator.onLine)} />}

      {screen === "splash" && <Splash />}
      {screen === "onboarding" && <Onboarding onDone={finishOnboarding} />}
      {screen === "login" && (
        <Login
          initialPhone={flow.phone}
          onContinue={(phone, otpSession, devCode) => {
            setFlow((f) => ({ ...f, phone, otpSession, devCode }));
            go("otp");
          }}
          onGuest={() => go("guest")}
          onLegal={(which) => {
            legalRef.current = which;
            go("legal");
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
            else window.location.href = "/";
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
      {screen === "details" && <Details role={flow.role ?? "owner"} onBack={back} onDone={() => replace("coach")} />}
      {screen === "coach" && <Coach onDone={goHome} />}
      {screen === "browserUnsupported" && <BrowserUnsupported />}
      {screen === "guest" && <Placeholder title="Feed — coming in Batch P2" onBack={back} />}
      {screen === "legal" && <Placeholder title={`${legalRef.current === "terms" ? "Terms" : "Privacy Policy"} — coming in Batch P12`} onBack={back} />}
    </div>
  );
}
