"use client";

/**
 * A1 — Admin login. Template 34-71, reproduced exactly.
 *
 * The design draws four states off one screen and this renders the same four:
 *   default   the card
 *   unauth    the card + the red "this Google account doesn't have admin
 *             access" block, with the email that was refused
 *   revoked   NOT the card — a lock circle and "Your admin access was removed"
 *   loading   the button's label replaced by the design's spinner
 *
 * Which of the first three shows is the SERVER's answer, handed in as a prop
 * from a one-shot cookie the sign-in wrote; the client cannot put itself into
 * the refused state, and reloading does not resurrect a refusal that has been
 * dismissed. `loading` is the only state this component owns, because it is the
 * only one that is genuinely about this browser.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminIcon } from "@/components/admin/ds";
import { GoogleMark } from "./GoogleMark";
import type { LoginOutcomeKind } from "@/lib/admin/login-outcome";

export function AdminLoginScreen({
  outcome,
  staging,
  supportEmail,
}: {
  outcome: { kind: LoginOutcomeKind; email: string } | null;
  staging: boolean;
  /** branding_settings.support_email — where "Contact a Super Admin" goes. */
  supportEmail: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Dismissing the refusal is local; the cookie behind it is cleared by the
  // next start call, so a reload after dismissing shows the plain card.
  const [dismissed, setDismissed] = useState(false);

  const kind = dismissed ? null : outcome?.kind;
  const revoked = kind === "revoked";
  const unauth = kind === "not_whitelisted" || kind === "error";

  async function signIn() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/auth/start", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { redirect?: string; outcome?: string } }
        | null;

      if (body?.ok && body.data?.redirect) {
        window.location.assign(body.data.redirect);
        return; // leaving the page — keep the spinner
      }
      if (body?.ok && body.data?.outcome === "ok") {
        // A server-side redirect, so the panel's first paint already has the
        // session rather than mounting once as a guest.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
        window.location.assign("/");
        return;
      }
      // Refused or failed: the server wrote the flash cookie, so re-render the
      // screen from the server rather than guessing at the reason here.
      setDismissed(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        minHeight: "100dvh",
        overflow: "auto",
        background: "var(--s2)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
        {staging ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".3px",
              color: "#fff",
              background: "var(--error)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            STAGING
          </span>
        ) : null}
      </div>

      {revoked ? (
        <div
          style={{
            maxWidth: 420,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: "var(--s3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink3)",
            }}
          >
            <AdminIcon name="lock" size={32} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink1)" }}>
            Your admin access was removed
          </div>
          <div style={{ fontSize: 13, color: "var(--ink2)" }}>
            Contact a Super Admin if this is unexpected.
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s1)",
              color: "var(--ink1)",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Back to HomzList
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--s1)",
              borderRadius: 16,
              boxShadow: "var(--L3)",
              padding: 32,
              border: "1px solid var(--border)",
            }}
          >
            {/* template 421 — wordmark + ADMIN chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
                <span style={{ color: "var(--ink1)" }}>Homz</span>
                <span style={{ color: "var(--accent)" }}>List</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".3px",
                  color: "var(--ink3)",
                  background: "var(--s2)",
                  padding: "3px 7px",
                  borderRadius: 4,
                }}
              >
                ADMIN
              </span>
            </div>

            <div style={{ height: 24 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink1)" }}>
              Admin sign in
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink2)",
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              Only authorised HomzList staff can access this panel.
            </div>

            {unauth ? (
              <div
                style={{
                  marginTop: 16,
                  background: "var(--errorSoft)",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  gap: 10,
                }}
              >
                <div style={{ color: "var(--error)", flex: "none", marginTop: 1 }}>
                  <AdminIcon name="alert" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)" }}>
                    This Google account doesn&apos;t have admin access
                  </div>
                  {outcome?.email ? (
                    <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
                      {`Signed in as: ${outcome.email}`}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setDismissed(true)}
                      style={{
                        border: 0,
                        background: "none",
                        padding: 0,
                        font: "inherit",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--accent)",
                        cursor: "pointer",
                      }}
                    >
                      Use a different account
                    </button>
                    {/* The design draws this as a link with no destination. The
                        destination is the support address in branding_settings —
                        read server-side, never a constant in the bundle. */}
                    <a
                      href={`mailto:${supportEmail}?subject=Admin%20panel%20access`}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--accent)",
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                    >
                      Contact a Super Admin
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ height: 24 }} />
            <button
              type="button"
              onClick={signIn}
              disabled={loading}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s1)",
                color: "var(--ink1)",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {loading ? (
                <span
                  style={{
                    width: 18,
                    height: 18,
                    border: "2px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    borderRadius: 999,
                    display: "inline-block",
                    animation: "adminSpin 1s linear infinite",
                  }}
                />
              ) : (
                <>
                  <GoogleMark />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>

            <div
              style={{
                fontSize: 11,
                color: "var(--ink3)",
                marginTop: 16,
                lineHeight: 1.5,
              }}
            >
              Access is granted by a Super Admin. Contact them if you can&apos;t sign in.
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink3)",
              marginTop: 24,
              textAlign: "center",
              maxWidth: 380,
            }}
          >
            Protected by Google authentication · All admin actions are logged
          </div>
        </>
      )}
    </div>
  );
}
