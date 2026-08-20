"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Otp } from "./screens/Otp";
import { Role } from "./screens/Role";
import { Details } from "./screens/Details";
import { Coach } from "./screens/Coach";
import { BrowserUnsupported, OfflineBanner, SavedAccounts } from "./screens/Misc";
import { AuthPageShell } from "./AuthPageShell";
import { publicHref } from "@/lib/utils";
import { sanitizeNext } from "@/lib/auth/next-url";
import { authApi } from "@/lib/auth/client";
import { getSavedAccounts, rememberAccount, type SavedAccountHint } from "@/lib/auth/saved-accounts";

/**
 * P1 Auth & Entry orchestrator. Single-file flow (matches the design) with a
 * screen stack for browser-back. Entry (Doc4 §1): Splash → silent refresh →
 * session? home : (onboarding first-run) → Login. New user OTP → Role → Details
 * → Coach → home.
 */
type Screen = "splash" | "onboarding" | "savedAccounts" | "login" | "otp" | "role" | "details" | "coach" | "browserUnsupported";

/**
 * "Browse as Guest" and the Terms / Privacy links leave the auth flow for real
 * pages, so they are plain navigations rather than screens in the stack.
 *
 * They must go to the PUBLIC host, absolutely. Login runs on seller.<host>
 * (middleware redirects public /login there), and on the seller host every
 * route except /login bounces an anonymous visitor back to /login — a bare
 * "/legal/terms" from this screen would have looped straight back here. The
 * prototype parked all three on a "coming in Batch P2 / P12" placeholder; P2
 * (feed) and P12 (legal reader) both ship now, so they point at the real thing.
 */
function leaveTo(path: string) {
  window.location.href = publicHref(path);
}

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
  // The city the account was just created with, for the S8 coach mark that
  // points at the header's city chip. It stood on a hardcoded "Rajkot", so the
  // very first thing a new user in Ahmedabad read was the wrong city.
  const [city, setCity] = useState("");
  // /login?add=1 — arriving from the P9 switch sheet to sign a SECOND account
  // into this device. The server keeps both sessions (lib/auth/account-pool).
  // Read on every render, NOT via useState: this component is server-rendered
  // first, so a lazy initial state would freeze the SSR value (false) through
  // hydration and the flag would never be seen. Nothing renders from it.
  const addingAccount =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1";

  /**
   * /login?next=… — the screen the user was actually trying to reach.
   *
   * Every guest CTA in the app lands here (save, inquire, report, chat, "Post a
   * Requirement", the legal reader's grievance link, and the middleware's own
   * gate on /messages, /notifications, /saved). Without this the flow ended on
   * the feed and the user had to find their way back, which for a link opened
   * from WhatsApp means they simply do not.
   *
   * Read the same way as `addingAccount` and for the same reason: a lazy
   * useState would freeze the server value through hydration. Sanitised here
   * as well as in the middleware — this value ends up in `location.href`, so
   * it is never trusted just because it survived one hop.
   */
  const nextPath =
    typeof window !== "undefined"
      ? sanitizeNext(new URLSearchParams(window.location.search).get("next"))
      : null;

  const screen = stack[stack.length - 1];

  /**
   * Depth of the history entry the CURRENT screen owns.
   *
   * This flow is one document with its own screen stack, so it reads `popstate`
   * as "the user pressed Back, drop a screen". That was true until every sheet
   * and dialog in the app started pushing a throwaway history entry to make
   * Android Back close the top layer (lib/hooks/use-back-close, Module 13) —
   * closing one calls `history.back()`, which fires a real `popstate` that was
   * never a screen Back. So picking a city on S7 (or reading a role's ⓘ and
   * tapping "Got it" on S6) popped the screen underneath the sheet and threw a
   * half-registered user back to Role, losing everything they had typed.
   *
   * A layer's entry carries the screen's own `hzDepth` (use-back-close spreads
   * the existing state), so its pop lands on the SAME depth we are already on,
   * while a genuine screen Back lands on a LOWER one. That is the whole test.
   */
  const depth = useRef(0);

  /**
   * The account exists — S7 came back ok and the session cookies are set.
   *
   * From here the flow behind us is spent: OTP session consumed, and POST
   * /register answers FORBIDDEN for a profile that is already registered. Back
   * off the coach marks was walking straight into it — a signed-in user landed
   * on "I am a…" and every Continue from there dead-ended on "Something went
   * wrong". Back now leaves for the app, which is where they already are.
   */
  const registered = useRef(false);

  // Relative so it works on any host (localhost, a LAN IP via nip.io, the real
  // domain). The seller dashboard lives on the same host as /login already.
  // Adding an account lands back on the profile, where the switch sheet is —
  // that's where the user was and where the new account is now visible.
  // "Adding an account" is deliberately NOT a `next` case: the user came from
  // the P9 switch sheet, so the profile is where they were and where the new
  // account is now visible.
  const goHome = useCallback(() => {
    window.location.href = addingAccount ? "/profile" : (nextPath ?? "/");
  }, [addingAccount, nextPath]);

  const go = useCallback((s: Screen) => {
    setStack((st) => [...st, s]);
    depth.current = (window.history.state?.hzDepth ?? depth.current) + 1;
    window.history.pushState({ ...(window.history.state ?? {}), hzDepth: depth.current }, "");
  }, []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const to = (e.state as { hzDepth?: number } | null)?.hzDepth ?? 0;
      // A sheet/dialog closing pops its own entry and lands back on ours.
      if (to >= depth.current) return;
      depth.current = to;
      if (registered.current) {
        goHome();
        return;
      }
      back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [back, goHome]);

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
        // A valid-but-expired session, silently revived — still honour `next`,
        // otherwise a shared link opened after an idle hour drops the user on
        // the feed even though they were never asked to sign in.
        // A full page load, not router.push(): the session identity changes
        // here, and a client-side push would keep the previous user's cache and
        // rendered tree.
        window.location.href = nextPath ?? "/";
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

  /**
   * Splash, onboarding and the coach marks are full-bleed experiences on every
   * device — a slide carousel or a dimmed tour inside a 420px card would be
   * nonsense. Everything else is a FORM, and a form is what the desktop set
   * puts in a centred card beside the product pane (02-auth-entry.html).
   */
  const carded = screen !== "splash" && screen !== "onboarding" && screen !== "coach" && screen !== "browserUnsupported";
  const Shell = carded ? AuthPageShell : Passthrough;

  /**
   * The card's ✕ — never a dead control: it does what "Browse as Guest" right
   * below it does, and goes to the public feed. `hidden md:grid`, so the phone
   * never sees it (the mobile design has no close button).
   */
  const close = () => leaveTo("/");

  return (
    // `md:max-w-none` releases the 470 column at 768+ (00-SPEC.md §1). Below
    // that this is the same centred column it has always been.
    <div className="mx-auto w-full max-w-column md:max-w-none">
      {offline && screen !== "splash" && <OfflineBanner onRetry={() => setOffline(!navigator.onLine)} />}

      {screen === "splash" && <Splash />}
      {screen === "onboarding" && <Onboarding onDone={finishOnboarding} />}
      <Shell wide={screen === "role"} onClose={close}>
      {screen === "savedAccounts" && <SavedAccounts accounts={saved} onPick={pickSaved} onUseAnother={() => go("login")} />}
      {screen === "login" && (
        <Login
          initialPhone={flow.phone}
          onContinue={(phone, otpSession, devCode) => {
            setFlow((f) => ({ ...f, phone, otpSession, devCode }));
            go("otp");
          }}
          onGuest={() => leaveTo("/")}
          onLegal={(which) => leaveTo(`/legal/${which}`)}
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
              goHome();
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
          onDone={(user, cityName) => {
            const hint = hintFromUser(flow.phone, user);
            if (hint) rememberAccount(hint);
            registered.current = true;
            setCity(cityName ?? "");
            replace("coach");
          }}
        />
      )}
      </Shell>
      {screen === "coach" && <Coach city={city} onDone={goHome} />}
      {screen === "browserUnsupported" && <BrowserUnsupported />}
    </div>
  );
}

/** No shell — the full-bleed screens render exactly as they always have. */
function Passthrough({ children }: { wide?: boolean; onClose?: () => void; children: React.ReactNode }) {
  return <>{children}</>;
}
