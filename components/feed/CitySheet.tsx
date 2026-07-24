"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * P2 City sheet — search + RECENT + ALL CITIES from the server (Doc7 §11, cached).
 * Selecting a city swaps the feed in place (the parent re-fetches) + toast. The
 * list is never hardcoded; it reads `/locations/cities`.
 */
export interface CityRow { id: string; name: string; state: string; propertyCount: number; }

export function CitySheet({
  open, onClose, selectedId, onSelect,
}: { open: boolean; onClose: () => void; selectedId: string | null; onSelect: (c: CityRow) => void }) {
  const [cities, setCities] = useState<CityRow[] | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/locations/cities", { credentials: "same-origin" });
      const json = await res.json();
      if (json.ok) setCities(json.data.cities ?? json.data.items ?? []);
      else setCities([]);
    } catch { setCities([]); }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const shown = (cities ?? []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));

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
                  <span className={cn("flex-1 text-15", sel ? "font-semibold text-accent" : "text-ink-primary")}>{c.name}</span>
                  <span className="text-13 text-ink-tertiary">{c.propertyCount.toLocaleString("en-IN")}</span>
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
