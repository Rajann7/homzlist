"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchCities } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * P2 City sheet — search + ALL CITIES from the server (Doc7 §11, cached).
 * Selecting a city swaps the feed in place (the parent re-fetches) + toast.
 *
 * Search is resolved server-side by `/locations/cities` (via `fetchCities`, the
 * same helper the auth sheet uses): the default list is the launched cities and
 * typing reaches the whole India master (104k+ cities), so every city + its
 * state is findable — not just the handful we filtered in the browser before.
 * The list is never hardcoded.
 */
export interface CityRow { id: string; name: string; state: string; propertyCount: number; }

export function CitySheet({
  open, onClose, selectedId, onSelect,
}: { open: boolean; onClose: () => void; selectedId: string | null; onSelect: (c: CityRow) => void }) {
  const [cities, setCities] = useState<CityRow[] | null>(null);
  const [q, setQ] = useState("");

  // Server-side search: default (no q) = launched cities from cache; typing
  // (debounced) queries the full master. Never filters a client array.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setCities(null);
    const t = setTimeout(() => {
      fetchCities(q.trim()).then((c) => active && setCities(c));
    }, q.trim() ? 250 : 0);
    return () => { active = false; clearTimeout(t); };
  }, [q, open]);

  const shown = cities ?? [];

  return (
    <BottomSheet open={open} onClose={onClose} title="Select city">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5">
          <Icon name="search" size={18} className="text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cities"
            className="w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
          />
        </div>

        {!cities ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-8" />)}</div>
        ) : shown.length === 0 ? (
          <p className="px-1 py-6 text-center text-13 text-ink-tertiary">No cities match “{q}”.</p>
        ) : (
          <div className="flex flex-col">
            <div className="px-1 pb-1 pt-1 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">All cities</div>
            {shown.map((c) => {
              const sel = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); onClose(); }}
                  className={cn("flex h-12 items-center gap-3 rounded-8 px-2 text-left", sel && "bg-accent-soft")}
                >
                  <Icon name="pin" size={18} className={sel ? "text-accent" : "text-ink-tertiary"} />
                  <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className={cn("truncate text-15 leading-tight", sel ? "font-semibold text-accent" : "text-ink-primary")}>{c.name}</span>
                    {c.state && <span className="truncate text-11 leading-tight text-ink-tertiary">{c.state}</span>}
                  </span>
                  <span className="shrink-0 text-13 text-ink-tertiary">{c.propertyCount.toLocaleString("en-IN")}</span>
                  {sel && <Icon name="check" size={18} className="text-accent" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
