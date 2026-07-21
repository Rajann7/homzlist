"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchCities } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * City selector sheet (P1 S7). Search bar (40px surface2), POPULAR CITIES,
 * rows with property count, selected = accent-soft + check. Backend-driven.
 */
export interface City {
  id: string;
  name: string;
  state: string;
  propertyCount: number;
}

export function CitySheet({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId?: string | null;
  onSelect: (city: City) => void;
}) {
  const [q, setQ] = useState("");
  const [cities, setCities] = useState<City[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCities(null);
    const t = setTimeout(() => {
      fetchCities(q).then((c) => active && setCities(c));
    }, q ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Select city">
      <div className="flex h-[62vh] flex-col">
        <div className="flex h-10 items-center gap-2 rounded-8 bg-surface-2 px-3">
          <Icon name="search" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search city or area…"
            className="w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
            autoComplete="off"
          />
          {q && (
            <button aria-label="Clear" onClick={() => setQ("")} className="text-ink-tertiary">
              <Icon name="close" size={16} strokeWidth={1.7} />
            </button>
          )}
        </div>

        <p className="chrome mt-4 mb-1 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
          {q ? "Results" : "Popular cities"}
        </p>

        <div className="-mx-4 flex-1 overflow-y-auto">
          {cities === null ? (
            <div className="flex flex-col gap-1 px-4 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : cities.length === 0 ? (
            <p className="px-4 pt-6 text-center text-13 text-ink-tertiary">No cities found.</p>
          ) : (
            cities.map((c) => {
              const selected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left",
                    selected && "bg-accent-soft",
                  )}
                >
                  <Icon name="pin" size={20} className="shrink-0 text-ink-tertiary" strokeWidth={1.7} />
                  <span className="flex-1">
                    <span className="block text-15 text-ink-primary">{c.name}</span>
                    <span className="block text-11 text-ink-tertiary">{c.state}</span>
                  </span>
                  <span className="text-13 text-ink-tertiary">{c.propertyCount.toLocaleString("en-IN")} properties</span>
                  {selected && <Icon name="check" size={18} className="text-accent" strokeWidth={2} />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
