"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

/**
 * "Rajkot has no listings yet" — the strip above an all-India feed (Rajan,
 * 9 Aug 2026).
 *
 * The feed already widened to the whole country when the chosen city turned out
 * to have nothing live (lib/feed/scope). That fixes the blank screen, but on its
 * own it is a silent swap: the chip says Rajkot and the cards say Ahmedabad.
 * This says out loud what happened, and turns the gap into the one action that
 * closes it — be the first to list here.
 *
 * `cityName` is the server's, from the scope that did the widening, so this can
 * never name a different city from the one the rails were resolved against.
 */
export function CityEmptyNotice({ cityName, onList }: { cityName: string; onList: () => void }) {
  return (
    <section className="border-b-8 border-surface-2 bg-surface-1 px-4 py-3.5">
      <div className="flex items-start gap-3 rounded-12 bg-accent-soft px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <Icon name="pin" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-15 font-semibold leading-[1.25] text-ink-primary">
            No listings in {cityName} yet
          </h2>
          <p className="mt-0.5 text-11 leading-[1.35] text-ink-secondary">
            Be the first to list your property here. Meanwhile, showing properties from all over India.
          </p>
          <Button variant="outline" className="mt-2.5 h-9 text-13" onClick={onList}>
            List your property
          </Button>
        </div>
      </div>
    </section>
  );
}
