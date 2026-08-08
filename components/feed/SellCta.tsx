"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { FeedSectionMeta } from "@/lib/feed/client";

/**
 * "Have a property to sell?" — the home feed's post-a-listing block (Rajan,
 * 8 Aug 2026), between Featured properties and News and Articles.
 *
 * The only block on the feed that is not a list, so it has no rail, no cursor
 * and no empty state; the server still owns its copy (lib/feed/sections) and the
 * subtitle carries the real place name, so it says "in Rajkot" over a Rajkot
 * feed and drops the phrase entirely when there is no city.
 *
 * The button is the same `/create` entry the bottom nav's plus opens — a guest
 * tapping it meets the login gate there, exactly as they do from the nav, so
 * this is not a second, weaker door into the create flow.
 */
export function SellCta({ section, onStart }: { section: FeedSectionMeta; onStart: () => void }) {
  return (
    <section className="border-b-8 border-surface-2 bg-surface-1 px-4 py-4">
      <div className="flex items-center gap-3 rounded-12 bg-accent-soft px-4 py-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <Icon name="home" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-15 font-semibold leading-[1.25] text-ink-primary">{section.title}</h2>
          <p className="mt-0.5 text-11 text-ink-secondary">{section.subtitle}</p>
        </div>
      </div>
      <Button fullWidth className="mt-3 h-11" onClick={onStart}>Post your property</Button>
    </section>
  );
}
