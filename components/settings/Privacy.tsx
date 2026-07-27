"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Header, Icon, Toggle, Skeleton, Button, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { settingsApi, type UserPrefs } from "@/lib/settings/client";

/**
 * P10 S6b — Privacy (Doc4 §60). Four visibility toggles, each a column in
 * user_settings. Every flip PATCHes and the screen renders the STORED answer, so
 * a rejected write snaps the switch back rather than lying. Enforcement of these
 * at the points they affect (listing default number, chat last-seen/activity,
 * find-by-phone) is tracked in docs/PENDING-INTEGRATIONS.md.
 */
const ROWS: { key: keyof Omit<UserPrefs, "locale">; label: string; sub?: string }[] = [
  { key: "showNumberDefault", label: "Show my number by default on new listings", sub: "You can change this per listing" },
  { key: "showLastSeen", label: "Show last seen in chats" },
  { key: "showActivity", label: "Show activity status" },
  { key: "findableByPhone", label: "Allow others to find me by phone number" },
];

export function Privacy({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await settingsApi.prefs();
    if (r.ok) { setPrefs(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") { setOffline(true); setPrefs(null); }
    else setPrefs(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function flip(key: keyof Omit<UserPrefs, "locale">, value: boolean) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    setSaving(true);
    const r = await settingsApi.setPrefs({ [key]: value });
    setSaving(false);
    if (r.ok) setPrefs(r.data);
    else { setPrefs((p) => (p ? { ...p, [key]: !value } : p)); toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't save that"); }
  }

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Privacy" centerTitle />;

  if (!prefs) {
    if (offline) {
      return (
        <AppShell header={header}>
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to load your privacy settings.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell header={header}>
        <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-8" />)}</div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <div className="mx-4 my-3 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
        Control what other people can see about you on HomzList.
      </div>
      <div className="px-4 pb-2 pt-3 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">Visibility</div>
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center px-4">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-3">
            <span className="text-15 text-ink-primary">{row.label}</span>
            {row.sub && <span className="text-11 text-ink-tertiary">{row.sub}</span>}
          </span>
          <span className="ml-3 py-3">
            <Toggle checked={prefs[row.key]} disabled={saving} onChange={(v) => void flip(row.key, v)} />
          </span>
        </div>
      ))}
      <div className="mx-4 mt-5 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
        Changing these settings won&apos;t affect listings you&apos;ve already published.
      </div>
      <div className="h-4" />
    </AppShell>
  );
}
