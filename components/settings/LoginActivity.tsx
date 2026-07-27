"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Header, Icon, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { authApi, type SessionRow } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * P10 S9 — Login activity (Doc4 §60 / Doc7 §1.7). Every device signed into this
 * account, the current one flagged, each other one revocable. The list is the
 * server's live session store (GET /auth/sessions); "Log out" calls the
 * ownership-scoped revoke (POST /auth/sessions/:id/revoke). We deliberately show
 * NO IP or location — the server never stores them (Doc9 privacy).
 */
export function LoginActivity({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await authApi.sessions();
    if (r.ok) { setSessions(r.data.sessions); setOffline(false); }
    else { setOffline(r.error.code === "OFFLINE"); setSessions([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function revoke(s: SessionRow) {
    setTarget(null);
    setBusy(s.id);
    const r = await authApi.revokeSession(s.id);
    setBusy(null);
    if (!r.ok) { toast.show("Couldn't log out that device"); return; }
    setSessions((list) => (list ?? []).filter((x) => x.id !== s.id));
    toast.show("Device logged out");
  }

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Login activity" centerTitle />;

  if (sessions === null) {
    return (
      <AppShell header={header}>
        <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-12" />)}</div>
      </AppShell>
    );
  }

  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);

  return (
    <AppShell header={header}>
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
          <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
        </div>
      )}

      {current && (
        <div className="px-4 pt-4">
          <div className="rounded-12 bg-accent-soft p-4">
            <div className="flex items-start gap-3">
              <Icon name="device" size={22} className="text-accent" />
              <div className="min-w-0 flex-1">
                <div className="text-15 font-semibold text-ink-primary">This device</div>
                <div className="mt-0.5 text-13 text-ink-secondary">{deviceLabel(current.userAgent)}</div>
                <div className="mt-1.5 text-11 font-semibold text-accent">● Active now</div>
                <div className="text-11 text-ink-tertiary">Signed in {fmtDate(current.createdAt)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SectionHead>Other sessions</SectionHead>
      {others.length === 0 ? (
        <p className="px-4 py-6 text-center text-13 text-ink-tertiary">You&apos;re only signed in on this device.</p>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {others.map((s) => (
            <div key={s.id} className="rounded-12 border border-border bg-surface-1 p-4">
              <div className="flex items-start gap-3">
                <Icon name="device" size={22} className="text-ink-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="text-15 font-semibold text-ink-primary">{deviceLabel(s.userAgent)}</div>
                  <div className="mt-0.5 text-11 text-ink-tertiary">Last active {fmtRelative(s.lastUsedAt)}</div>
                  <div className="text-11 text-ink-tertiary">Signed in {fmtDate(s.createdAt)}</div>
                </div>
                <Button variant="outline" size="small" disabled={busy === s.id} onClick={() => setTarget(s)}>
                  {busy === s.id ? "…" : "Log out"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-6" />

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => { if (target) void revoke(target); }}
        title="Log out this device?"
        body="That device will need an OTP to sign back in."
        confirmLabel="Log out"
        destructive
      />
    </AppShell>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className={cn("chrome px-4 pb-2 pt-5 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary")}>{children}</div>;
}

/** Friendly device label from a user-agent — best-effort, never a raw UA string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${os}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d ago` : fmtDate(iso);
}
