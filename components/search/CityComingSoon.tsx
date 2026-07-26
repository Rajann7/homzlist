"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { searchApi } from "@/lib/search/client";
import { cn } from "@/lib/utils";

/**
 * P3 S5 — CITY COMING SOON (Doc4 §15, Doc7 §118).
 *
 * "Notify me" is a real promise, so it writes a real row: POST /city/request
 * inserts into `city_interest_requests`, which is the expansion signal admin
 * reports on and the list the launch announcement will mark `notified_at` on.
 * The button only flips to "You'll be notified ✓" AFTER the server confirms —
 * a button that turns green on a failed request is a lie.
 */
export function CityComingSoon({
  city, cityId, fallbackCity, basePath = "",
}: {
  city: string;
  cityId?: string | null;
  /** A launched city to offer instead ("Explore Rajkot instead"). */
  fallbackCity?: { name: string; slug: string } | null;
  basePath?: string;
}) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const notify = async () => {
    if (state === "saving" || state === "done") return;
    setState("saving");
    const r = await searchApi.registerCityInterest(city, cityId);
    if (r.ok) {
      setState("done");
      toast.show(`We'll notify you when we launch in ${city}`);
    } else {
      setState("error");
      toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't register right now");
    }
  };

  return (
    <AppShell
      header={
        <header className="chrome sticky top-0 z-header flex w-full items-center border-b border-divider bg-surface-1 px-2 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))]">
          <Link href={`${basePath}/search`} aria-label="Back" className="grid h-11 w-11 place-items-center">
            <Icon name="arrow-left" size={22} strokeWidth={1.8} className="text-ink-primary" />
          </Link>
        </header>
      }
    >
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
        {/* line-art map-pin inside a dotted circle, 96px (design S5) */}
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <circle cx="48" cy="42" r="34" stroke="var(--ink-tertiary)" strokeWidth="2" strokeDasharray="4 6" />
          <path d="M48 30a10 10 0 0 0-10 10c0 7 10 18 10 18s10-11 10-18a10 10 0 0 0-10-10Z" stroke="var(--accent)" strokeWidth="2.4" fill="none" />
          <circle cx="48" cy="40" r="3.2" fill="var(--accent)" />
        </svg>

        <h1 className="mt-5 text-20 font-bold text-ink-primary">HomzList is coming to {city}</h1>
        <p className="mt-2 max-w-[280px] text-15 text-ink-secondary">
          We&apos;re adding properties in your city soon. Get notified when we launch.
        </p>

        <button
          onClick={notify}
          disabled={state === "done" || state === "saving"}
          className={cn(
            "mt-6 h-11 rounded-8 px-7 text-15 font-semibold text-white",
            state === "done" ? "cursor-default bg-accent-disabled" : "bg-accent",
            state === "saving" && "opacity-70",
          )}
        >
          {state === "done" ? "You'll be notified ✓" : state === "saving" ? "Saving…" : "Notify me"}
        </button>

        {fallbackCity && (
          <Link href={`/${fallbackCity.slug}`} className="mt-3.5 text-15 font-semibold text-accent">
            Explore {fallbackCity.name} instead
          </Link>
        )}
      </div>
    </AppShell>
  );
}
