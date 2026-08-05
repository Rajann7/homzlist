"use client";

/**
 * "Switch account" — template 1597-1601.
 *
 * The design lists "signed-in Google accounts on this device" with the current
 * one highlighted, and an "+ Add another account" button. All three are real:
 *
 *  · the list is /api/v1/admin/accounts, which resolves each parked account
 *    against a live refresh session and a live staff row — a revoked admin
 *    simply is not in the answer;
 *  · tapping a row asks the server to switch, and the server does it by
 *    rotating that account's own session (the browser never names a token);
 *  · "+ Add another account" starts the same sign-in A1 uses, which is exactly
 *    what adding one means.
 *
 * The whole panel reloads after a switch rather than re-rendering: the role,
 * the nav, the badges and every gated button belong to the new admin.
 */

import { useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Btn,
  RightSheet,
  AdminIcon,
  useToast,
} from "@/components/admin/ds";

type Account = {
  id: string;
  name: string;
  email: string;
  initials: string;
  current: boolean;
};

export function SwitchAccountSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch("/api/v1/admin/accounts", { cache: "no-store" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as
        | { ok: boolean; data?: { accounts: Account[] } }
        | null;
      if (live) setAccounts(body?.ok ? (body.data?.accounts ?? []) : []);
    })();
    return () => {
      live = false;
    };
  }, []);

  async function switchTo(account: Account) {
    if (busy || account.current) return;
    setBusy(true);
    const res = await fetch("/api/v1/admin/accounts/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ staffId: account.id }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!body?.ok) {
      setBusy(false);
      toast("That account is no longer signed in on this device");
      // Re-read: whatever went stale should stop being offered.
      setAccounts(null);
      const again = await fetch("/api/v1/admin/accounts", { cache: "no-store" }).catch(() => null);
      const list = (await again?.json().catch(() => null)) as
        | { ok: boolean; data?: { accounts: Account[] } }
        | null;
      setAccounts(list?.ok ? (list.data?.accounts ?? []) : []);
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
    window.location.assign("/");
  }

  async function addAnother() {
    setBusy(true);
    const res = await fetch("/api/v1/admin/auth/start", { method: "POST", cache: "no-store" });
    const body = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: { redirect?: string; outcome?: string } }
      | null;
    if (body?.ok && body.data?.redirect) {
      window.location.assign(body.data.redirect);
      return;
    }
    if (body?.ok && body.data?.outcome === "ok") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
      window.location.assign("/");
      return;
    }
    setBusy(false);
    toast("Could not start Google sign-in");
  }

  return (
    <RightSheet
      title="Switch account"
      onClose={onClose}
      footer={<Btn label="Close" kind="outline" onClick={onClose} style={{ flex: 1 }} />}
    >
      <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 12 }}>
        Signed-in Google accounts on this device.
      </div>

      {accounts === null ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Loading…</div>
      ) : (
        accounts.map((a) => (
          <div
            key={a.id}
            onClick={() => switchTo(a)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--border)",
              marginBottom: 8,
              cursor: a.current || busy ? "default" : "pointer",
              background: a.current ? "var(--accentSoft)" : "var(--s1)",
              opacity: busy && !a.current ? 0.6 : 1,
            }}
          >
            <Avatar initials={a.initials} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink3)" }}>{a.email}</div>
            </div>
            {a.current ? (
              <Badge
                bg="var(--accentSoft)"
                fg="var(--accent)"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                Current
              </Badge>
            ) : (
              <AdminIcon name="chevR" size={18} />
            )}
          </div>
        ))
      )}

      <Btn
        label="+ Add another account"
        kind="outline"
        onClick={addAnother}
        style={{ height: 38, fontSize: 13, marginTop: 4 }}
      />
    </RightSheet>
  );
}
