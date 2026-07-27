"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Header, Icon, Toggle, BottomSheet, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { notificationsApi, type Prefs } from "@/lib/notifications/client";
import { pushState, enablePush } from "@/lib/notifications/push-client";
import { EnableSheet } from "./EnableSheet";
import { cn } from "@/lib/utils";

/**
 * P10 S7 — Notification preferences (Doc4 §63).
 *
 * Every switch is a row in `notification_pref_groups` and every flip is a
 * PATCH; the screen renders the SERVER's answer, so a rejected write (a locked
 * group, an unknown group) snaps the switch back rather than lying. Sections,
 * labels, sub-labels, defaults and the lock all come from the database — there
 * is no toggle list in this file.
 *
 * "Browser notifications: Enabled / Blocked" is the one thing that is NOT a
 * stored preference: it is the browser's own permission, read live.
 */

const HOURS = Array.from({ length: 24 }, (_, h) => {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return { value: `${String(h).padStart(2, "0")}:00`, label: `${hh}:00 ${ap}` };
});
const hourLabel = (hhmm: string) => HOURS.find((h) => h.value === hhmm.slice(0, 5))?.label ?? hhmm;

export function NotificationPrefs({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [quietSheet, setQuietSheet] = useState(false);
  const [perm, setPerm] = useState(() => pushState());
  const [draft, setDraft] = useState({ from: "23:00", to: "08:00" });
  const [saving, setSaving] = useState(false);
  const [howTo, setHowTo] = useState(false);

  const load = useCallback(async () => {
    const r = await notificationsApi.prefs();
    if (r.ok) {
      setPrefs(r.data);
      setDraft({ from: r.data.quietStart.slice(0, 5), to: r.data.quietEnd.slice(0, 5) });
      setOffline(false);
    } else if (r.error.code === "OFFLINE") setOffline(true);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const sync = () => setPerm(pushState());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    setSaving(true);
    const r = await notificationsApi.setPrefs(body);
    setSaving(false);
    // Always render what is STORED — a locked group the server refused snaps
    // the switch back instead of leaving the UI showing a lie.
    if (r.ok) { setPrefs(r.data); if (okMsg) toast.show(okMsg); }
    else toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't save that");
  }

  const header = <Header left={<BackButton fallback={`${base}/notifications`} />} title="Notifications" centerTitle />;

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-8" />)}
        </div>
      </AppShell>
    );
  }

  if (!prefs) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Icon name="wifi-off" size={48} className="text-ink-disabled" />
          <p className="text-13 text-ink-tertiary">
            {offline ? "You're offline. Reconnect to load your preferences." : "Couldn't load your preferences."}
          </p>
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
        </div>
      </AppShell>
    );
  }

  // Sections come from the data, in the order the server sorted them.
  const sections: { name: string; rows: Prefs["groups"] }[] = [];
  for (const g of prefs.groups) {
    const last = sections[sections.length - 1];
    if (last && last.name === g.section) last.rows.push(g);
    else sections.push({ name: g.section, rows: [g] });
  }
  // "Weekly digest" is its own section in the design, below Marketing and
  // Quiet hours; pull it out so those two can sit in between.
  const digest = sections.find((s) => s.name === "Weekly digest");
  const main = sections.filter((s) => s.name !== "Weekly digest");

  return (
    <AppShell header={header}>
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
          <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
        </div>
      )}

      <div className="mx-4 my-3 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
        You&apos;ll always get critical alerts about your payments and listings by email.
      </div>

      {/* Browser permission — a live browser fact, not a stored preference. */}
      <div className="mx-4 mb-1 mt-3 rounded-12 border border-border bg-surface-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-15 font-semibold text-ink-primary">Browser notifications</span>
          <span
            className={cn(
              "inline-flex items-center rounded-4 px-[7px] py-[3px] text-11 font-semibold uppercase tracking-[0.3px]",
              perm.permission === "granted" ? "bg-accent-soft text-accent" : "bg-error-soft text-error",
            )}
          >
            {perm.permission === "granted" ? "Enabled" : perm.permission === "denied" ? "Blocked" : "Off"}
          </span>
        </div>
        {perm.permission !== "granted" && (
          <>
            <div className="mt-2 text-11 leading-[1.5] text-ink-tertiary">
              {perm.iosNeedsInstall
                ? "Add HomzList to your Home Screen — iOS only delivers notifications to an installed app."
                : perm.permission === "denied"
                  ? "Notifications are blocked in your browser settings. Enable them to get instant alerts."
                  : "Turn them on to get instant alerts."}
            </div>
            <button
              onClick={async () => {
                // Already denied → the browser will not re-prompt, so the only
                // honest response is the instructions sheet (the same one the
                // P11 banner opens). Anything else is a control that does
                // nothing. Otherwise, ask for permission directly.
                if (perm.permission === "denied" || perm.iosNeedsInstall) { setHowTo(true); return; }
                const r = await enablePush();
                setPerm(pushState());
                if (r.ok) toast.show("Notifications enabled");
                else setHowTo(true);
              }}
              className="chrome mt-2 inline-block text-13 font-semibold text-accent"
            >
              {perm.permission === "denied" ? "How to enable" : "Enable notifications"}
            </button>
          </>
        )}
      </div>

      {main.map((s) => (
        <div key={s.name}>
          <SectionHead>{s.name}</SectionHead>
          {s.rows.map((g) => (
            <ToggleRow
              key={g.code}
              label={g.label}
              sub={g.sublabel}
              on={g.enabled}
              locked={g.locked}
              disabled={saving}
              onChange={(v) => patch({ groups: { [g.code]: v } })}
            />
          ))}
        </div>
      ))}

      <SectionHead>Marketing</SectionHead>
      <ToggleRow
        label="Offers and updates from HomzList"
        sub="Promotional messages only. You can opt in or out anytime."
        on={prefs.marketingConsent}
        disabled={saving}
        onChange={(v) => patch({ marketingConsent: v }, v ? "You'll get offers and updates" : "Marketing messages off")}
      />

      <SectionHead>Quiet hours</SectionHead>
      <div className="flex items-center px-4">
        <button onClick={() => setQuietSheet(true)} className="chrome flex min-w-0 flex-1 flex-col gap-0.5 py-3 text-left">
          <span className="truncate text-15 text-ink-primary">Quiet hours</span>
          <span className="text-11 text-ink-tertiary">Non-urgent notifications are held during these hours</span>
        </button>
        <span className="ml-auto flex items-center gap-2 py-3">
          <span className="whitespace-nowrap text-13 text-ink-tertiary">
            {hourLabel(prefs.quietStart)} – {hourLabel(prefs.quietEnd)}
          </span>
          <Toggle checked={prefs.quietHours} disabled={saving} onChange={(v) => patch({ quietHours: v })} />
        </span>
      </div>

      {digest && (
        <>
          <SectionHead>Weekly digest</SectionHead>
          {digest.rows.map((g) => (
            <ToggleRow
              key={g.code}
              label={g.label}
              sub={g.sublabel}
              on={g.enabled}
              locked={g.locked}
              disabled={saving}
              onChange={(v) => patch({ groups: { [g.code]: v } })}
            />
          ))}
        </>
      )}
      <div className="h-4" />

      <BottomSheet open={quietSheet} onClose={() => setQuietSheet(false)} title="Quiet hours">
        <div className="px-4 pb-4">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1.5 block text-13 font-semibold text-ink-secondary">From</span>
              <select
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3.5 text-15 text-ink-primary"
              >
                {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </label>
            <label className="flex-1">
              <span className="mb-1.5 block text-13 font-semibold text-ink-secondary">To</span>
              <select
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3.5 text-15 text-ink-primary"
              >
                {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
            Non-urgent notifications are held during these hours.
          </div>
          <Button
            fullWidth
            className="mt-2"
            loading={saving}
            onClick={async () => {
              await patch({ quietStart: draft.from, quietEnd: draft.to, quietHours: true }, "Quiet hours saved");
              setQuietSheet(false);
            }}
          >
            Save
          </Button>
        </div>
      </BottomSheet>

      {/* Same sheet the P11 banner opens — one behaviour for one link. */}
      <EnableSheet open={howTo} onClose={() => setHowTo(false)} onResult={() => setPerm(pushState())} />
    </AppShell>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="chrome px-4 pb-2 pt-5 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">{children}</div>
  );
}

function ToggleRow({
  label, sub, on, locked, disabled, onChange,
}: {
  label: string; sub?: string | null; on: boolean; locked?: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center px-4">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-3">
        <span className="flex items-center gap-1.5 truncate text-15 text-ink-primary">
          {label}
          {locked && <Icon name="lock" size={14} className="text-ink-tertiary" />}
        </span>
        {sub && <span className="text-11 text-ink-tertiary">{sub}</span>}
      </span>
      <span className="ml-auto flex items-center py-3">
        <Toggle checked={on} disabled={locked || disabled} onChange={onChange} />
      </span>
    </div>
  );
}
