"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Header, Icon, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { settingsApi, type UserPrefs } from "@/lib/settings/client";
import { cn } from "@/lib/utils";

/**
 * P10 S8 — Language (Doc4 §60). The interface locale, persisted server-side
 * (user_settings.locale) — the screen renders the STORED choice, and a pick that
 * the server refuses snaps back. Only the app chrome changes; listing text is
 * never translated, which the info strip states.
 */
const LANGS: { id: UserPrefs["locale"]; name: string; sub: string }[] = [
  { id: "en", name: "English", sub: "English" },
  { id: "hi", name: "हिन्दी", sub: "Hindi" },
  { id: "gu", name: "ગુજરાતી", sub: "Gujarati" },
];

export function Language({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [locale, setLocale] = useState<UserPrefs["locale"] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await settingsApi.prefs();
    setLocale(r.ok ? r.data.locale : "en");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function pick(id: UserPrefs["locale"]) {
    if (id === locale || saving) return;
    const prev = locale;
    setLocale(id); // optimistic
    setSaving(true);
    const r = await settingsApi.setPrefs({ locale: id });
    setSaving(false);
    if (r.ok) { setLocale(r.data.locale); toast.show("Language updated"); }
    else { setLocale(prev); toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't save that"); }
  }

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Language" centerTitle />;

  if (locale === null) {
    return (
      <AppShell header={header}>
        <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-8" />)}</div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <div className="pt-2">
        {LANGS.map((l) => {
          const on = l.id === locale;
          return (
            <button
              key={l.id}
              onClick={() => void pick(l.id)}
              disabled={saving}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2"
            >
              <span className="flex-1">
                <span className="block text-15 text-ink-primary">{l.name}</span>
                <span className="block text-11 text-ink-tertiary">{l.sub}</span>
              </span>
              <Icon name="check" size={20} className={cn(on ? "text-accent" : "text-transparent")} strokeWidth={2} />
            </button>
          );
        })}
      </div>
      <div className="mx-4 mt-5 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
        Only the app&apos;s interface changes. Listing descriptions stay in the language they were written in.
      </div>
      <div className="px-4 pb-6 pt-2 text-11 leading-[1.5] text-ink-tertiary">
        More languages are on the way. You can always search and browse in any of the above.
      </div>
      <div className="h-4" />
    </AppShell>
  );
}
