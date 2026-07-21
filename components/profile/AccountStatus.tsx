"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { profileApi } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

/**
 * Account status sub-screen (P9 S1 menu). Good-standing card + past actions
 * (rejections/warnings/report-outcomes) with severity dots. Own data only (Doc2 §11).
 */
interface Event {
  kind: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string | null;
  created_at: string;
}

export function AccountStatus({ onBack }: { onBack: () => void }) {
  const [good, setGood] = useState(true);
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    profileApi.accountStatus().then((r) => {
      if (r.ok) {
        setGood(r.data.inGoodStanding);
        setEvents(r.data.events.filter((e: Event) => e.kind !== "bio_flag"));
      } else setEvents([]);
    });
  }, []);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      <header className="chrome sticky top-0 z-header flex h-header items-center gap-2 border-b border-border bg-surface-1 px-4">
        <button aria-label="Back" onClick={onBack} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
        <h1 className="text-17 font-semibold text-ink-primary">Account status</h1>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {good && (
          <div className="flex items-center gap-3 rounded-12 bg-accent-soft p-4">
            <Icon name="check" size={22} className="text-accent" strokeWidth={2} />
            <span className="text-15 font-semibold text-ink-primary">Your listings are in good standing</span>
          </div>
        )}

        {events === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : events.length === 0 ? (
          !good && <p className="text-13 text-ink-tertiary">No actions on your account.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3 rounded-12 border border-border p-3">
                <span
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.severity === "error" ? "bg-error" : e.severity === "warning" ? "bg-warning" : "bg-info")}
                />
                <span className="flex-1">
                  <span className="block text-13 text-ink-primary">
                    {e.title}
                    {e.detail ? ` — ${e.detail}` : ""}
                  </span>
                  <span className="block text-11 text-ink-tertiary">{fmt(e.created_at)}</span>
                </span>
              </div>
            ))}
            <p className="text-11 text-ink-tertiary">Repeated violations can limit your account.</p>
          </div>
        )}
      </div>
    </div>
  );
}
