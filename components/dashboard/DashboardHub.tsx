"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Skeleton } from "@/components/billing/ui";
import { BackButton, OfflineBanner } from "@/components/billing/primitives";
import { fetchDashboardCounts, type DashboardCounts } from "@/lib/dashboard/client";
import { HUB_GROUPS, TONE_BG, dashItem, type DashItem } from "@/lib/dashboard/items";
import { cn } from "@/lib/utils";

/**
 * Dashboard hub — the seller's nine destinations behind the feed header's grid
 * icon (Rajan, 6 Aug 2026; replaces the header's duplicate Saved entry point,
 * Saved keeps its row in the profile sheet).
 *
 * This screen owns NO business logic. Every tile pushes the route that already
 * existed and that still authorises itself server-side; every number comes from
 * `/api/v1/dashboard`. Nothing is derived here, nothing is cached here — the
 * hub is a door, not a source of truth.
 */
export function DashboardHub() {
  const router = useRouter();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetchDashboardCounts();
    if (res.ok) {
      setCounts(res.data.counts);
      setOffline(false);
    } else {
      // A failed count must never take the hub down with it: the tiles are
      // navigation first and a number second, so we render them countless
      // rather than showing an error screen the seller cannot act on.
      setCounts(null);
      setOffline(res.error.code === "OFFLINE");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      header={
        <Header
          left={<BackButton icon="close" fallback="/" />}
          title="Dashboard"
        />
      }
    >
      {offline && <OfflineBanner />}

      <div className="flex flex-col gap-6 px-4 pb-8 pt-4">
        {HUB_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h2 className="px-1 text-11 font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
              {group.title}
            </h2>

            {/* minmax(0,1fr) not 1fr: a default grid column is min-content wide,
                so a long label ("Browse requirements") would push the column
                past the container and scroll the page sideways. */}
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
              {group.items.map(({ key, wide }) => {
                const item = dashItem(key);
                if (!item) return null;
                return (
                  <Tile
                    key={key}
                    item={item}
                    wide={wide}
                    loading={loading}
                    counts={counts}
                    onOpen={() => router.push(item.href)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

/**
 * One destination. `wide` spans both columns and lays the chip out beside the
 * text instead of above it — the group's anchor row in the approved bento.
 */
function Tile({
  item,
  wide,
  loading,
  counts,
  onOpen,
}: {
  item: DashItem;
  wide?: boolean;
  loading: boolean;
  counts: DashboardCounts | null;
  onOpen: () => void;
}) {
  const value = item.count && counts ? counts[item.count] : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // Doc1 §1.4 radius roles: 12 = large card, 16 = modal/dialog. These are
        // cards, so 12 — 16 was borrowing the dialog radius and read too soft
        // against every other card in the app.
        "relative flex min-w-0 rounded-12 border border-border bg-surface-1 p-3 text-left",
        "transition-transform duration-150 ease-out-quart active:scale-[0.98]",
        wide ? "col-span-2 items-center gap-3" : "flex-col gap-2.5",
      )}
    >
      {/* Solid fill + on-accent glyph — the chip has to read at a glance, so it
          is a filled shape, not a tint. The fill is per-destination so no two
          tiles look alike; `rounded-8` is the standard card radius one step in
          from the tile's 12, which is what keeps a nested corner looking
          concentric instead of accidental. */}
      <span
        className={cn(
          "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-8 text-on-accent",
          TONE_BG[item.tone],
        )}
      >
        <Icon name={item.icon} size={22} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* No truncate anywhere on this screen: a clipped destination name is
            worse than a two-line one, and `break-words` keeps an unbroken long
            word inside the tile instead of widening the column. */}
        <span className="break-words text-15 font-semibold leading-tight text-ink-primary">
          {item.label}
        </span>
        <span className="break-words text-11 leading-snug text-ink-tertiary">
          {item.subtitle}
        </span>
      </span>

      <CountPill item={item} value={value} loading={loading} wide={wide} />
    </button>
  );
}

/**
 * The count. Three honest states: loading (a skeleton the size of the pill),
 * a real number, or nothing at all.
 *
 * "Nothing at all" covers both a zero and a count we could not read — neither
 * deserves a badge. A `0` pill is visual noise that says "look at me" about an
 * empty room, and inventing a number we do not have would be exactly the
 * fabricated count the DB lock bans.
 */
function CountPill({
  item,
  value,
  loading,
  wide,
}: {
  item: DashItem;
  value: number | string | null;
  loading: boolean;
  wide?: boolean;
}) {
  if (!item.count) return null;

  const position = wide ? "ml-auto shrink-0" : "absolute right-3 top-3";

  if (loading) return <Skeleton className={cn("h-[22px] w-8 rounded-full", position)} />;
  if (value === null || value === 0 || value === "") return null;

  /**
   * Two shapes, because the two payloads are different things.
   *
   * A count is at most a few digits, so it gets the fixed 22px pill. The plan
   * is a NAME, and the real ones run to "Requirement Access (trial)" — 26
   * characters. Left in the fixed pill that squeezes the label beside it down
   * to nothing on a 375px screen. So the text badge is capped instead and
   * allowed to run to a second line: the pill grows, the label keeps its room,
   * and nothing is ever cut off (no truncate on this screen).
   */
  const isText = typeof value === "string";

  return (
    <span
      className={cn(
        position,
        "grid min-h-[22px] min-w-[22px] place-items-center rounded-full px-2 text-11 font-semibold",
        isText
          ? "max-w-[45%] break-words py-0.5 text-center leading-tight"
          : "h-[22px] tabular-nums",
        // An "it's waiting on you" count is the notification badge everyone
        // already knows — red fill, white text, same as the bell and the
        // Messages nav badge. Everything else is the quieter accent pill so
        // the red keeps meaning something.
        item.urgent ? "bg-error text-white" : "bg-accent text-on-accent",
      )}
    >
      {value}
    </span>
  );
}
