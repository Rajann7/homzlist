"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * The profile card family (designs/_samples/P9-profile-redesign-sample.html).
 *
 * P9 used to draw a 3-column photo grid with a grid/list toggle above it. The
 * redesign replaces both with proper CARDS — one list, every role, no toggle —
 * and the same three shapes are shared by the owner's profile and a visitor's,
 * so a property can never describe itself one way on one screen and another way
 * on the other.
 *
 * Rajan's edits on top of that sample (29 Jul 2026):
 *  - no view counts on a property card (leads is the seller's number),
 *  - smaller radii: cards 8, thumbs 6, chips and badges 4,
 *  - green stops being decorative — it now means "live/active" and nothing
 *    else, so a project's price is ink rather than accent.
 *
 * Owner-only facts (status, leads, boost) are OPTIONAL props. The visitor
 * profile simply doesn't pass them, which is why nothing private can leak
 * through this file: it has nothing to hide, it is never given it.
 */

/**
 * Status pill. Same `badge.kind` vocabulary the rest of the app uses, mapped to
 * the sample's tinted-pill treatment. Accent is reserved for live/active.
 */
const BADGE: Record<string, string> = {
  active: "bg-accent-soft text-accent",
  promoted: "bg-warning-soft text-warning",
  pending: "bg-info-soft text-info",
  "pending-approval": "bg-info-soft text-info",
  "under-review": "bg-info-soft text-info",
  grace: "bg-warning-soft text-warning",
  "changes-requested": "bg-warning-soft text-warning",
  failed: "bg-error-soft text-error",
  rejected: "bg-error-soft text-error",
  expired: "bg-surface-2 text-ink-secondary",
  stopped: "bg-surface-2 text-ink-secondary",
  refunded: "bg-surface-2 text-ink-secondary",
  sold: "bg-surface-2 text-ink-secondary",
  rented: "bg-surface-2 text-ink-secondary",
};

export function ProfileBadge({ kind, label, className }: { kind: string; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "chrome inline-flex h-[21px] shrink-0 items-center whitespace-nowrap rounded-4 px-2 text-11 font-bold uppercase tracking-[0.3px]",
        BADGE[kind] ?? "bg-surface-2 text-ink-secondary",
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * The count beside a tab label.
 *
 * It used to be a bare number one space after the word, which read as "Sell11"
 * — the label and the count ran together and neither was legible. It is a chip
 * of its own now, tinted accent on the tab you are standing on.
 */
export function TabCount({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "chrome ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-11 font-bold",
        active ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-tertiary",
      )}
    >
      {n}
    </span>
  );
}

/** One fact chip — "3 BHK", "1,450 sqft", "Poss. Dec 2027". */
function Spec({ children }: { children: React.ReactNode }) {
  return (
    <span className="chrome inline-flex h-[22px] items-center rounded-4 bg-surface-2 px-2 text-11 font-semibold text-ink-secondary">
      {children}
    </span>
  );
}

/** The list every card set sits in. */
export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2.5 px-3.5 pb-6 pt-3">{children}</div>;
}

/** "SELL LISTINGS · + Add listing" above a list. */
export function SectionHeader({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <div className="chrome flex items-center px-3.5 pb-0.5 pt-3 text-11 font-bold uppercase tracking-[0.6px] text-ink-tertiary">
      {label}
      {action && onAction && (
        <button onClick={onAction} className="ml-auto text-13 font-semibold normal-case tracking-normal text-accent">
          + {action}
        </button>
      )}
    </div>
  );
}

function Cover({ url, className, icon = "home" }: { url: string | null; className?: string; icon?: "home" | "building" }) {
  if (!url) {
    return (
      <span className={cn("grid place-items-center bg-surface-3 text-ink-tertiary", className)}>
        <Icon name={icon} size={26} strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <Img src={url} alt="" data-protected="true" className={cn("object-cover", className)} />
  );
}

export function ListingCard({
  onClick, coverUrl, photoCount, price, title, bhk, sqft, areaLabel,
  badge, ribbon, leads, boost,
}: {
  onClick: () => void;
  coverUrl: string | null;
  photoCount?: number;
  price: string;
  title: string | null;
  /** The stored option code ("3", "5+"), rendered as "<code> BHK". */
  bhk?: string | null;
  sqft?: number | null;
  areaLabel: string | null;
  /** Owner-only. A visitor's card shows no lifecycle state at all. */
  badge?: { kind: string; label: string };
  ribbon?: "SOLD" | "RENTED" | null;
  leads?: number;
  boost?: { targetLabel: string; daysLeft: number } | null;
}) {
  // The server sends "₹68 Lakh · Negotiable" — one string carrying two facts.
  // Printed whole it wrapped onto two lines and pushed the card out of shape,
  // so the amount leads and the qualifier joins the fact chips. Nothing is
  // recomputed here: it is the server's own string, split.
  const [priceMain, ...qualifiers] = price.split("·").map((s) => s.trim());
  const specs = [
    bhk ? `${bhk} BHK` : null,
    sqft ? `${sqft.toLocaleString("en-IN")} sqft` : null,
    ...qualifiers,
  ].filter((s): s is string => Boolean(s));

  return (
    <button
      onClick={onClick}
      className="flex w-full gap-3 rounded-8 border border-border bg-surface-1 p-2.5 text-left shadow-l1 active:bg-surface-2 dark:shadow-none"
    >
      {/* 16:9, not a square. Measured against the real covers on the DEV
          database, stored listing photos run 1.52–1.78 wide — every one of them
          wider than tall. A 92×92 thumb therefore cut a QUARTER of the width
          off the image the seller chose to lead with. At 16:9 no cover loses
          any width at all, and the tallest ones lose a little height instead —
          the axis that carries the least of a property photo. */}
      <span className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-6 bg-surface-3">
        <Cover url={coverUrl} className="h-full w-full" />
        {ribbon && (
          <span className="chrome absolute inset-0 grid place-items-center bg-black/45 text-11 font-bold tracking-[1px] text-white">
            {ribbon}
          </span>
        )}
        {!ribbon && !!photoCount && photoCount > 1 && (
          <span className="chrome absolute bottom-1 right-1 flex items-center gap-[3px] text-11 font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
            <Icon name="stack" size={13} />
            {photoCount}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-17 font-bold tracking-[-0.3px] text-ink-primary">{priceMain}</span>
            {title && <span className="mt-0.5 block truncate text-13 leading-[1.35] text-ink-primary">{title}</span>}
            {areaLabel && (
              <span className="mt-0.5 flex items-center gap-1 text-11 text-ink-tertiary">
                <Icon name="pin" size={12} strokeWidth={2} />
                <span className="truncate">{areaLabel}</span>
              </span>
            )}
          </span>
          {badge && <ProfileBadge kind={badge.kind} label={badge.label} />}
        </span>

        {!!specs.length && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {specs.map((s) => (
              <Spec key={s}>{s}</Spec>
            ))}
          </span>
        )}

        {/* Leads, not views — the view count was dropped from this screen on
            29 Jul 2026. A running boost states where it is placed and what is
            left of it, both from the `boosts` row that was paid for. */}
        {(leads !== undefined || boost) && (
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider pt-2">
            {leads !== undefined && (
              <span className="flex items-center gap-1 text-11 font-semibold text-ink-tertiary">
                <Icon name="message" size={13} strokeWidth={2} />
                <b className="font-bold text-ink-secondary">{leads}</b> {leads === 1 ? "lead" : "leads"}
              </span>
            )}
            {boost && (
              <span className="flex items-center gap-1 text-11 font-semibold text-warning">
                <Icon name="rocket" size={13} strokeWidth={2} />
                {boost.targetLabel} · {boost.daysLeft}d left
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

export function ProjectCard({
  onClick, coverUrl, photoCount, name, config, priceFrom, areaLabel, badge, specs, boost,
}: {
  onClick: () => void;
  coverUrl: string | null;
  photoCount?: number;
  name: string;
  config: string | null;
  priceFrom: string | null;
  areaLabel: string | null;
  badge?: { kind: string; label: string };
  /** "Under construction", "Poss. Dec 2027", "RERA P-IND-24-118". */
  specs: string[];
  boost?: { targetLabel: string; daysLeft: number } | null;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full overflow-hidden rounded-8 border border-border bg-surface-1 text-left shadow-l1 active:bg-surface-2 dark:shadow-none"
    >
      {/* 3:2. A fixed 132px height made the box ~2.6:1 on a phone, which cut
          roughly HALF the height off the real project covers on the DEV
          database (they measure 1.33–1.5). 3:2 sits between those two, so the
          worst case is ~11% of the height rather than ~49%, and no cover loses
          any width. */}
      <span className="relative block aspect-[3/2] w-full overflow-hidden bg-surface-3">
        <Cover url={coverUrl} className="h-full w-full" icon="building" />
        {badge && <ProfileBadge kind={badge.kind} label={badge.label} className="absolute left-2.5 top-2.5" />}
        {!!photoCount && photoCount > 1 && (
          <span className="chrome absolute bottom-2.5 right-2.5 flex items-center gap-[3px] text-11 font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
            <Icon name="stack" size={13} />
            {photoCount}
          </span>
        )}
      </span>

      <span className="block p-3">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-15 font-bold tracking-[-0.2px] text-ink-primary">{name}</span>
            {config && <span className="mt-0.5 block truncate text-13 text-ink-tertiary">{config}</span>}
          </span>
          {priceFrom && (
            <span className="shrink-0 text-right">
              {/* Ink, not accent: green means "live" on this screen now. */}
              <b className="block whitespace-nowrap text-15 font-bold text-ink-primary">{priceFrom}</b>
              <small className="block text-11 font-semibold text-ink-tertiary">onwards</small>
            </span>
          )}
        </span>

        {areaLabel && (
          <span className="mt-1.5 flex items-center gap-1 text-11 text-ink-tertiary">
            <Icon name="pin" size={12} strokeWidth={2} />
            <span className="truncate">{areaLabel}</span>
          </span>
        )}

        {!!specs.length && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {specs.map((s) => (
              <Spec key={s}>{s}</Spec>
            ))}
          </span>
        )}

        {boost && (
          <span className="mt-2 flex items-center gap-1 border-t border-divider pt-2 text-11 font-semibold text-warning">
            <Icon name="rocket" size={13} strokeWidth={2} />
            {boost.targetLabel} · {boost.daysLeft}d left
          </span>
        )}
      </span>
    </button>
  );
}

export function RequirementCard({
  onClick, budget, sub, areas, badge, footer, newCount,
}: {
  onClick: () => void;
  budget: string;
  sub: string;
  areas: string[];
  badge: { kind: string; label: string };
  /** "7 proposals" / "Posted 12 Jul" — whichever the server actually has. */
  footer: string;
  newCount?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-8 border border-border bg-surface-1 p-3 text-left shadow-l1 active:bg-surface-2 dark:shadow-none"
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-17 font-bold tracking-[-0.3px] text-ink-primary">{budget}</span>
          <span className="mt-0.5 block text-13 text-ink-secondary">{sub}</span>
        </span>
        <ProfileBadge kind={badge.kind} label={badge.label} />
      </span>

      {!!areas.length && (
        <span className="mt-2.5 flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <Spec key={a}>{a}</Spec>
          ))}
        </span>
      )}

      <span className="mt-2.5 flex items-center border-t border-divider pt-2.5">
        <span className="flex items-center gap-2 text-13 font-semibold text-ink-primary">
          {footer}
          {!!newCount && (
            <span className="chrome inline-flex h-[18px] items-center rounded-4 bg-accent px-1.5 text-11 font-bold text-ink-inverse">
              {newCount} new
            </span>
          )}
        </span>
        <Icon name="chevron-right" size={18} className="ml-auto shrink-0 text-ink-tertiary" />
      </span>
    </button>
  );
}
