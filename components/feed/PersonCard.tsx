"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { FeedPerson } from "@/lib/feed/client";

/**
 * A seller on the Top Builders / Top Brokers rails (P2, 5 Aug 2026).
 *
 * Everything on it is measured: `stats` is built server-side from live
 * inventory ("6 projects", "14 listings"), the tick is a real approved
 * verification, the role is `profiles.role`. Nothing here is a placeholder — if
 * a seller has nothing live, `searchBrokers` never returns them, so this card
 * cannot render a zero.
 *
 * The WHOLE card is the button. A nested "View Profile" <button> would be
 * invalid inside it and would give two tap targets for one destination — the
 * span below is the affordance, not a second control.
 */
export function PersonCard({ person, onOpen }: { person: FeedPerson; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${person.name}'s profile`}
      className="flex h-full w-[156px] shrink-0 snap-start flex-col items-center gap-2 rounded-8 border border-border bg-surface-1 p-3 text-center"
    >
      <Avatar src={person.avatarUrl} name={person.name} size={56} />

      <span className="flex w-full items-center justify-center gap-1">
        {/* Two lines then "…": a firm name runs long ("Shree Siddhi Vinayak
            Developers"), and truncating to one line lost which firm it was. */}
        <span className="line-clamp-2 min-w-0 text-13 font-semibold leading-[1.25] text-ink-primary">{person.name}</span>
        {person.verified && <Icon name="verified" size={13} className="shrink-0 self-start text-accent" />}
      </span>

      {person.role && (
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 capitalize leading-none text-ink-secondary">{person.role}</span>
      )}

      {/* "6 projects" / "14 listings · Usually responds in 2 hours" — server-built. */}
      <span className="line-clamp-2 w-full text-11 leading-[1.3] text-ink-tertiary">{person.stats}</span>

      <span className="mt-auto grid h-8 w-full place-items-center rounded-8 border border-border text-13 font-semibold text-ink-primary">
        View Profile
      </span>
    </button>
  );
}
