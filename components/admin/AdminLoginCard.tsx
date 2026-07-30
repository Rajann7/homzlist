"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * A1's card, exactly as P13 specifies it: max 380px, surface1, r16, L3, 32px
 * padding — wordmark + ADMIN chip, "Admin sign in" 20/700, the 13/ink2 subtitle,
 * a single outline "Sign in with Google" button at 44px, the 11/ink3 note about
 * Super Admins, and the footer line about logging.
 *
 * There is no password field here and there is no endpoint that would take one.
 * The two error states are the ones the design draws: an unauthorised Google
 * account, and access revoked mid-session.
 */

const G_LOGO = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 6.06L5.84 8.9c.87-2.6 3.3-4.15 6.16-4.15z" />
  </svg>
);

export function AdminLoginCard({
  mode,
  error,
  email,
}: {
  mode: "live" | "dev";
  error: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [devError, setDevError] = useState<string | null>(null);

  // State (b): revoked mid-session is a full-page message, not a card with a button.
  if (error === "revoked") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}>
            <Icon name="lock" size={28} />
          </span>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
            Your admin access was removed
          </h1>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Contact a Super Admin if this is unexpected.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
            className="mt-2 flex h-10 items-center rounded-8 border px-4 text-[15px] font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--ink-primary)" }}
          >
            Back to HomzList
          </a>
        </div>
        <Footer />
      </Shell>
    );
  }

  const signIn = async () => {
    setBusy(true);
    setDevError(null);
    try {
      if (mode === "live") {
        window.location.href = "/api/v1/admin/auth/google/start";
        return;
      }
      const r = await fetch("/api/v1/admin/auth/dev", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: devEmail }),
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        const next: string = j?.data?.next ?? "";
        setDevError(
          next.includes("error=revoked")
            ? "That account's admin access has been removed."
            : next.includes("error=unauthorized")
              ? "This Google account doesn't have admin access"
              : "Enter the Google address a Super Admin added.",
        );
        return;
      }
      // A hard navigation, not router.replace: signing in changes what the
      // SERVER renders for "/", and the client router would happily replay the
      // RSC payload it cached while signed out — which leaves the admin sitting
      // on the login screen with a valid session.
      window.location.replace(j?.data?.next ?? "/");
    } catch {
      setDevError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div
        className="w-full rounded-16 border p-8"
        style={{ maxWidth: 380, background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-bold tracking-[-0.02em]">
            <span style={{ color: "var(--ink-primary)" }}>Homz</span>
            <span style={{ color: "var(--accent)" }}>List</span>
          </span>
          <span
            className="rounded-4 px-[5px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.3px]"
            style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}
          >
            Admin
          </span>
        </div>

        <h1 className="mt-6 text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Admin sign in
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          Only authorised HomzList staff can access this panel.
        </p>

        {/* State (a): unauthorised Google account. */}
        {(error === "unauthorized" || devError) && (
          <div className="mt-6 flex gap-2 rounded-8 p-3" style={{ background: "var(--error-soft)" }}>
            <span style={{ color: "var(--error)" }}>
              <Icon name="alert" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                {devError ?? "This Google account doesn't have admin access"}
              </p>
              {email && (
                <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  Signed in as: {email}
                </p>
              )}
              <p className="mt-1 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                Contact a Super Admin
              </p>
            </div>
          </div>
        )}

        {error === "expired" || error === "idle" ? (
          <div className="mt-6 rounded-8 p-3" style={{ background: "var(--warning-soft)" }}>
            <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              {error === "idle"
                ? "You were signed out after 2 hours of inactivity."
                : "Your session expired. Sign in again to continue."}
            </p>
          </div>
        ) : null}

        {mode === "dev" && (
          <label className="mt-6 block">
            <span className="text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
              Google address
            </span>
            <input
              type="email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && devEmail) signIn();
              }}
              placeholder="you@homzlist.com"
              autoComplete="off"
              className="mt-1 h-10 w-full rounded-8 border px-3 text-[15px] outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-primary)" }}
            />
            <span className="mt-1 block text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
              Google OAuth is not configured on this environment, so the address is
              checked against the staff whitelist directly.
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={signIn}
          disabled={busy || (mode === "dev" && !devEmail)}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-8 border text-[15px] font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--ink-primary)", background: "transparent" }}
        >
          {busy ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: "var(--ink-tertiary)" }}
              aria-label="Signing in"
            />
          ) : (
            <>
              {G_LOGO}
              Sign in with Google
            </>
          )}
        </button>

        <p className="mt-4 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          Access is granted by a Super Admin. Contact them if you can&rsquo;t sign in.
        </p>
      </div>
      <Footer />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6" style={{ background: "var(--page)" }}>
      {children}
    </div>
  );
}

function Footer() {
  return (
    <p className="text-center text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
      Protected by Google authentication · All admin actions are logged
    </p>
  );
}
