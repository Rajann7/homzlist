"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FactsStrip, MetaChip, OverlayChip } from "./cardChrome";
import type { FeedCard as Card } from "@/lib/feed/client";

/**
 * The PROJECT card in the home feed.
 *
 * Redesigned 28 Jul 2026 (Rajan) because the create screen grew a whole
 * vocabulary the card had no way to show: it rendered name + "2 BHK from ₹45L"
 * + status, so a plotting scheme, a shopping complex and an apartment tower
 * were indistinguishable — and the two things the old card could do (Save,
 * Inquiry) both went to `listings`, which a project is not, so neither ever
 * worked.
 *
 * The image is the SAME 16/9 the feed already used. Every value below it is a
 * real column: project_types.label, project_units, possession_date,
 * towers/floors/total_units/available_units, attributes (total_plots, site
 * area) and the RERA pair.
 */
export function ProjectCard({
  card, onOpen, onOpenPoster, onContact, onMore,
}: {
  card: Card;
  onOpen: () => void;
  onOpenPoster: () => void;
  /** Call / WhatsApp — records a real lead for the builder (migration 0051). */
  onContact: (channel: "call" | "whatsapp") => void;
  onMore: () => void;
}) {
  const units = card.unitTypes ?? [];
  const shownUnits = units.slice(0, 3);
  const facts = [
    ...(card.possessionLabel ? [{ label: "Possession", value: card.possessionLabel }] : []),
    ...(card.facts ?? []),
  ].slice(0, 4);

  return (
    <article className="border-b border-divider bg-surface-1 pb-3">
      {/* ---- Cover — the feed's existing 16/9, unchanged ---- */}
      <button type="button" onClick={onOpen} className="relative block w-full" aria-label={`Open ${card.title ?? "project"}`}>
        <div className="aspect-[16/9] w-full overflow-hidden">
          {card.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface-3 text-ink-tertiary">
              <Icon name="image" size={40} />
            </div>
          )}
        </div>

        {/* Badges as a ROW. "Promoted" and "New Project" were both absolutely
            positioned at left-3/top-3, so a boosted project drew one on top of
            the other and neither was readable. */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <OverlayChip caps>New Project</OverlayChip>
          {card.promoted && <OverlayChip caps>Promoted</OverlayChip>}
        </div>

        {/* Status + scheme type, over a gradient. */}
        {(card.projectTypeLabel || card.buildStatus) && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
            {card.buildStatus && (
              <OverlayChip caps tone={statusTone(card.buildStatusCode)} className="shrink-0">{card.buildStatus}</OverlayChip>
            )}
            {card.projectTypeLabel && <OverlayChip>{card.projectTypeLabel}</OverlayChip>}
          </div>
        )}
      </button>

      {/* ---- Body ---- */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 text-left">
          {/* Name + RERA */}
          <span className="flex w-full items-start gap-2">
            <span className="min-w-0 flex-1 text-17 font-semibold leading-[1.25] text-ink-primary">{card.title}</span>
            {card.rera && (
              <MetaChip tone="accent" className="mt-0.5 shrink-0 uppercase tracking-[0.3px]">
                <Icon name="shield" size={12} />
                {card.reraExempt ? "RERA Exempt" : "RERA"}
              </MetaChip>
            )}
          </span>

          {/* Price band — the cheapest AND the dearest unit, not just "from" */}
          <span className="text-20 font-bold leading-none text-ink-primary">
            {card.priceBand ?? "Price on request"}
          </span>

          {/* Unit types the scheme actually has (project_units rows) */}
          {shownUnits.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {shownUnits.map((u) => <MetaChip key={u}>{u}</MetaChip>)}
              {units.length > shownUnits.length && (
                <span className="text-11 font-semibold leading-none text-ink-tertiary">+{units.length - shownUnits.length} more</span>
              )}
            </span>
          )}

          <FactsStrip facts={facts} />

          <span className="flex items-center gap-1 text-13 text-ink-tertiary">
            <Icon name="pin" size={14} /> {card.areaLabel ?? "Rajkot"}
          </span>
        </button>

        {/* Poster row — the builder */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPoster}
            className="flex min-w-0 items-center gap-2 text-left"
            aria-label={`View ${card.poster.name}'s profile`}
          >
            <Avatar src={card.poster.avatarUrl} name={card.poster.name} size={24} />
            <span className="truncate text-13 font-semibold text-ink-primary">{card.poster.name}</span>
            {card.poster.verified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
            {card.poster.role && <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 capitalize text-ink-secondary">{card.poster.role}</span>}
          </button>
          <span className="ml-auto shrink-0 text-11 text-ink-tertiary">{card.postedAgo}</span>
        </div>

        {/* Action bar — the project detail's bar, on the card. No wishlist heart:
            `saves` is keyed to listings, so a project has never been savable and
            the old heart silently persisted nothing. Call and WhatsApp write a
            real lead; the primary opens the project. */}
        <div className="mt-1 flex items-center gap-2">
          {card.isOwn ? (
            <Button variant="outline" className="h-10 flex-1 text-13" onClick={onOpen}>View Project</Button>
          ) : (
            <>
              <button
                aria-label="Call builder"
                onClick={() => onContact("call")}
                className="grid h-10 w-11 shrink-0 place-items-center rounded-8 border border-border text-ink-primary"
              >
                <Icon name="phone" size={18} />
              </button>
              <button
                aria-label="WhatsApp builder"
                onClick={() => onContact("whatsapp")}
                className="grid h-10 w-11 shrink-0 place-items-center rounded-8 border border-border text-ink-primary"
              >
                <Icon name="whatsapp" size={18} />
              </button>
              <Button className="h-10 flex-1 text-13" onClick={onOpen}>View Project</Button>
            </>
          )}
          <button aria-label="More" onClick={onMore} className="grid h-11 w-9 shrink-0 place-items-center">
            <Icon name="more" size={22} className="text-ink-secondary" />
          </button>
        </div>
      </div>
    </article>
  );
}

/** The status DOT's colour comes off the stored code, never off the label. */
function statusTone(code: string | null | undefined) {
  if (code === "ready") return "accent" as const;
  if (code === "booking_open") return "info" as const;
  return "warning" as const; // under_construction
}
