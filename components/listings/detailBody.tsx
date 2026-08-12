"use client";

import * as React from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/billing/ui";
import type { IconName } from "@/components/ui/Icon";
import type { Photo } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";
import { avatarFill, avatarInitial } from "@/components/ui/Avatar";

/**
 * The shared BODIES of the property and project detail screens.
 *
 * Two things this file is responsible for.
 *
 * 1. There is ONE copy of each body. The Preview screen (P6 S1) promises "this
 *    is what a buyer will see", so it renders these exact components off the
 *    same server payload — the preview cannot disagree with the detail, because
 *    it IS the detail.
 *
 * 2. Everything the seller filled in gets somewhere to appear. A key present in
 *    the payload is rendered: the blocks come from `field_groups`, so a field an
 *    admin adds to a type shows up here with no code change.
 *
 * ---------------------------------------------------------------------------
 * Layout: CARDS ON A PAGE (rewrite, Rajan 29 Jul 2026)
 * ---------------------------------------------------------------------------
 * The previous version was one continuous white sheet with drawn 8px bands
 * between blocks. Rajan picked the card direction instead, so the structure is
 * different, not restyled:
 *
 *   • The page is `surface-2`. Every block is a `surface-1` card with a 12px
 *     radius, an 8px gutter and the l1 shadow (a hairline border in dark, where
 *     shadows don't read). Nothing is edge-to-edge except the hero.
 *   • Inside a card, answers are a TWO-COLUMN grid — label above value, split
 *     by hairlines. Twenty-seven answers fit in half the scroll a one-per-row
 *     list needs, and each one is still a complete "question → answer".
 *   • A card's header is a tinted icon + title + count, from
 *     `field_groups.icon`/`.tone` (migration 0070).
 *   • Colour carries meaning only: accent for price and confirmation, error for
 *     gone, warning for pending, info for the poster.
 *
 * ADAPTIVE KEY-SPEC STRIP (the thing Rajan flagged): the strip renders exactly
 * as many columns as the server sent — never four boxes with two filled. The
 * server takes the first four candidates that HAVE a value from an eight-entry
 * per-type list (migration 0071), and a lone survivor renders as one full-width
 * row rather than a single stranded tile.
 *
 * Responsive: the answer grid steps 2 → 3 across `sm`, amenities 3 → 4 → 6, the
 * hero relaxes from 4:3 to 16:10 above `sm`, type steps up once, and the page
 * gutter grows with the viewport. Nothing is pinned to a phone width.
 */

/** One titled block of the detail screen, as the server groups it. */
export interface AttrGroup {
  key: string;
  label: string;
  /** From `field_groups.icon` / `.tone` (migration 0070). */
  icon?: string | null;
  tone?: string | null;
  rows: { key: string; label: string; value: string }[];
}

export interface AmenityItem { code: string; label: string; icon: string | null; category: string | null }

/** What the server resolved for the strip — 0 to 4 of them, never a blank. */
export interface KeySpec { icon: string; value: string; label: string }

export type Tone = "accent" | "info" | "warning" | "error" | "neutral";

const TONE_SOFT: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  neutral: "bg-surface-2 text-ink-secondary",
};

const toneOf = (v: string | null | undefined): Tone =>
  v === "accent" || v === "info" || v === "warning" || v === "error" ? v : "neutral";

/** Horizontal rhythm inside a card — one constant, so every block lines up. */
const PAD = "px-3.5 sm:px-4";
/** The page gutter the cards sit in. */
const GUTTER = "mx-2 sm:mx-3";

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/**
 * One card. `flush` is for a card whose first child draws its own top edge
 * (the price block starts with padding of its own).
 */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-12 bg-surface-1 shadow-l1",
        // A shadow is invisible on a near-black page, so dark mode draws the
        // card's edge instead — same separation, no glow.
        "dark:border dark:border-border dark:shadow-none",
        GUTTER,
        "mt-2",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A tinted square holding one icon. */
function IconBadge({ name, tone = "neutral", size = 30, icon = 16 }: { name: string; tone?: Tone; size?: number; icon?: number }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-8", TONE_SOFT[tone])}
      style={{ width: size, height: size }}
    >
      <Icon name={name as IconName} size={icon} />
    </span>
  );
}

/** Card heading: tinted icon, title, optional count. */
function Head({
  icon, tone = "neutral", title, count,
}: { icon: string; tone?: Tone; title: string; count?: number }) {
  return (
    <div className={cn("flex items-center gap-2.5 pb-2.5 pt-3.5", PAD)}>
      <IconBadge name={icon} tone={tone} />
      <h2 className="min-w-0 flex-1 text-15 font-bold leading-[1.2] text-ink-primary sm:text-17">{title}</h2>
      {count !== undefined && (
        <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-1 text-11 font-semibold leading-none text-ink-tertiary">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * The answer grid: label above value, two per row, hairlines between.
 *
 * `gap-px` on a divider-coloured background is what draws those hairlines
 * without a border per cell (a border per cell leaves a hanging line under a
 * part-filled last row). An odd last answer spans both columns, so the grid
 * never ends on a half-empty row.
 */
function AnswerGrid({ rows }: { rows: { key: string; label: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <div className="grid grid-cols-2 gap-px border-t border-divider bg-divider sm:grid-cols-3">
      {rows.map((r, i) => (
        <div
          key={r.key}
          className={cn(
            "bg-surface-1 px-3.5 py-2.5",
            // Last cell of an odd row fills the width rather than leaving a hole.
            i === rows.length - 1 && rows.length % 2 === 1 && "col-span-2 sm:col-span-1",
            i === rows.length - 1 && rows.length % 3 === 1 && "sm:col-span-3",
            i === rows.length - 1 && rows.length % 3 === 2 && "sm:col-span-2",
          )}
        >
          <div className="text-11 leading-none text-ink-tertiary">{r.label}</div>
          <div className="mt-1.5 break-words text-14 font-semibold leading-[1.3] text-ink-primary">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/** One label/value row — used by the screens' own blocks (owner notice). */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2.5", PAD)}>
      <span className="min-w-0 shrink text-13 leading-[1.35] text-ink-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-right text-14 font-semibold leading-[1.35] text-ink-primary">
        {value}
      </span>
    </div>
  );
}

/** Small square tag. No pills anywhere on these screens. */
function Tag({
  children, tone = "neutral", icon, className,
}: { children: React.ReactNode; tone?: Tone; icon?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-4 px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px]",
        TONE_SOFT[tone],
        className,
      )}
    >
      {icon && <Icon name={icon as IconName} size={12} />}
      {children}
    </span>
  );
}

/**
 * The key-spec strip — as many columns as there are specs.
 *
 * This is the fix for the hole Rajan spotted: the server sends only specs that
 * have a value (0-4 of them, migration 0071), and the grid is sized to what
 * arrived. One spec would look stranded as a lone tile in a four-up grid, so it
 * renders as a single left-aligned row instead — deliberate either way, never
 * blank boxes.
 */
function SpecStrip({ items }: { items: KeySpec[] }) {
  if (!items.length) return null;

  if (items.length === 1) {
    const s = items[0];
    return (
      <div className={cn("flex items-center gap-2.5 border-t border-divider py-3", PAD)}>
        <IconBadge name={s.icon} tone="accent" size={32} icon={17} />
        <span className="text-15 font-bold leading-none text-ink-primary">{s.value}</span>
        <span className="text-13 leading-none text-ink-tertiary">{s.label}</span>
      </div>
    );
  }

  return (
    <div className={cn("grid divide-x divide-divider border-t border-divider", GRID_COLS[items.length] ?? "grid-cols-4")}>
      {items.map((s) => (
        <div key={s.label + s.value} className="flex flex-col items-center gap-1.5 px-1 py-3">
          <span className="text-accent"><Icon name={s.icon as IconName} size={18} /></span>
          <span className="max-w-full truncate text-15 font-bold leading-none text-ink-primary">{s.value}</span>
          <span className="max-w-full truncate text-11 leading-none text-ink-tertiary">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A description that starts clamped, with the fade the clamp needs to look
 * deliberate. The toggle only appears when the text really is taller than the
 * clamp — measured, not guessed from a character count.
 */
function ReadMore({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 4);
  }, [text]);

  return (
    <div className={cn("pb-3.5", PAD)}>
      <div className="relative">
        <p
          ref={ref}
          className={cn(
            "selectable whitespace-pre-wrap text-14 leading-[1.6] text-ink-secondary sm:text-15",
            !open && "line-clamp-4",
          )}
        >
          {text}
        </p>
        {!open && clamped && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-1 to-transparent" />
        )}
      </div>
      {(clamped || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-2 inline-flex items-center gap-1 text-13 font-semibold leading-none text-accent"
        >
          {open ? "Show less" : "Read more"}
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * The sticky section rail.
 *
 * A detail page is one long scroll by design (splitting it into tabs hides the
 * thing a buyer came to compare), so the navigation rides along with it. Each
 * chip scrolls its section under the bar; an IntersectionObserver keeps the
 * active chip honest while the user scrolls by hand — no scroll listener, so it
 * cannot fight the momentum scroll.
 */
function SectionRail({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-104px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  if (sections.length < 3) return null;

  return (
    <div className="sticky top-[52px] z-sticky border-b border-border bg-surface-1">
      <div ref={railRef} className="hz-x flex gap-1.5 px-3 py-2">
        {sections.map((s) => (
          <button
            key={s.id}
            data-chip={s.id}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn(
              "h-8 shrink-0 whitespace-nowrap rounded-8 px-3 text-13 font-semibold leading-none transition-colors duration-150",
              active === s.id ? "bg-accent text-ink-inverse" : "bg-surface-2 text-ink-secondary",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Amenities as an icon grid. Partial last rows are fine here — the tiles have
 * no dividers, so three amenities read as three tiles, not as a broken grid.
 * The icon is `amenities.icon` (migration 0070) — a column, so the 21st amenity
 * an admin inserts arrives with its own icon and this file never learns its
 * name.
 */
function Amenities({ items, id }: { items: AmenityItem[]; id?: string }) {
  if (!items.length) return null;
  return (
    <Card>
      <div id={id} className="scroll-mt-[104px]">
        <Head icon="star" tone="warning" title="Amenities" count={items.length} />
        <div className="grid grid-cols-3 border-t border-divider pb-1 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((a) => (
            <div key={a.code} className="flex flex-col items-center gap-2 px-2 py-3.5 text-center">
              <IconBadge name={a.icon ?? "check"} tone="accent" size={34} icon={18} />
              <span className="line-clamp-2 text-11 leading-[1.35] text-ink-secondary">{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * The poster / builder row.
 *
 * Every feed card names who posted it; tapping through to the detail used to
 * lose them completely, so the one screen where a buyer decides how to deal
 * (owner? broker? builder?) was the one screen that didn't say. `username` is
 * what makes it tappable — a profile with none isn't reachable, so it renders
 * as a plain row rather than a link that 404s.
 */
export function PosterCard({
  poster, title = "Posted by", id, onOpen, contact, onCall, onWhatsapp, privateNote,
}: {
  poster: { name: string | null; username: string | null; role: string | null; verified: boolean; avatarUrl: string | null } | null;
  title?: string;
  id?: string;
  onOpen?: (username: string) => void;
  /**
   * The number this person chose to PUBLISH, when they published one. It
   * belongs here, on their card, under their name — a number floating in a
   * button bar tells you nothing about whose phone will ring.
   */
  contact?: { number: string; whatsapp?: string | null } | null;
  onCall?: () => void;
  onWhatsapp?: () => void;
  /** Why there is no number here, when there is none. */
  privateNote?: string | null;
}) {
  if (!poster) return null;
  const name = poster.name ?? "HomzList user";
  const role = poster.role ? poster.role.charAt(0).toUpperCase() + poster.role.slice(1) : null;
  const tappable = Boolean(poster.username && onOpen);

  return (
    <Card>
      <div id={id} className="scroll-mt-[104px]">
        <Head icon="user" tone="info" title={title} />
        <button
          disabled={!tappable}
          onClick={() => poster.username && onOpen?.(poster.username)}
          className={cn("flex w-full items-center gap-3 border-t border-divider py-3 text-left disabled:cursor-default", PAD)}
        >
          {/* P4 draws this tile as a rounded-8 SQUARE, not a circle — the shape
              and size stay exactly as designed. Only what fills it when there is
              no photo changes: the same name-keyed letter the rest of the app
              uses, instead of a generic silhouette that made every poster
              without a photo look like the same person. */}
          <span
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-8",
              poster.avatarUrl || avatarInitial(poster.name) ? "" : "bg-surface-2 text-ink-tertiary",
            )}
          >
            {poster.avatarUrl ? (
              <Img src={poster.avatarUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
            ) : avatarInitial(poster.name) ? (
              <span className={cn("grid h-full w-full place-items-center text-17 font-semibold leading-none text-ink-inverse", avatarFill(poster.name))}>
                {avatarInitial(poster.name)}
              </span>
            ) : (
              <Icon name="user" size={22} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-15 font-semibold leading-[1.2] text-ink-primary">{name}</span>
              {poster.verified && <Icon name="verified" size={15} className="shrink-0 text-accent" />}
            </span>
            <span className="mt-1.5 flex items-center gap-1.5">
              {role && <Tag tone="accent">{role}</Tag>}
              {poster.username && (
                <span className="truncate text-11 leading-none text-ink-tertiary">@{poster.username}</span>
              )}
            </span>
          </span>
          {tappable && <Icon name="chevron-right" size={18} className="shrink-0 text-ink-tertiary" />}
        </button>

        {contact
          ? <PublishedNumber contact={contact} onCall={onCall} onWhatsapp={onWhatsapp} />
          : privateNote
            ? (
              <div className={cn("flex items-start gap-2 border-t border-divider py-3", PAD)}>
                <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
                <span className="text-12 leading-snug text-ink-secondary">{privateNote}</span>
              </div>
            )
            : null}
      </div>
    </Card>
  );
}

/**
 * The published number, in full.
 *
 * Not masked: publishing it is the whole point, and a masked number next to a
 * Call button that dials it anyway is theatre. Copy is a real action because
 * people write numbers down.
 */
function PublishedNumber({
  contact, onCall, onWhatsapp,
}: {
  contact: { number: string; whatsapp?: string | null };
  onCall?: () => void;
  onWhatsapp?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(contact.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the number is on screen to read anyway */ }
  };

  return (
    <div className={cn("border-t border-divider py-3", PAD)}>
      <div className="flex items-center gap-2">
        <Tag tone="accent">Number public</Tag>
        <button type="button" onClick={() => void copy()} className="chrome ml-auto text-11 font-semibold text-ink-tertiary">
          {copied ? "Copied" : "Tap to copy"}
        </button>
      </div>
      <button type="button" onClick={() => void copy()} className="chrome mt-2 flex w-full items-center gap-2 text-left">
        <Icon name="phone" size={16} className="shrink-0 text-accent" />
        <span className="text-15 font-semibold tracking-wide text-ink-primary">{contact.number}</span>
      </button>
      {(onCall || onWhatsapp) && (
        <div className="mt-2.5 flex gap-2">
          {onCall && (
            <button
              type="button"
              onClick={onCall}
              className="chrome flex h-10 flex-1 items-center justify-center gap-1.5 rounded-8 border border-border bg-surface-1 text-13 font-semibold text-ink-primary active:bg-surface-2"
            >
              <Icon name="phone" size={16} />Call
            </button>
          )}
          {onWhatsapp && (
            <button
              type="button"
              onClick={onWhatsapp}
              className="chrome flex h-10 flex-1 items-center justify-center gap-1.5 rounded-8 border border-accent bg-accent-soft text-13 font-semibold text-accent active:brightness-95"
            >
              <Icon name="whatsapp" size={16} className="text-[#25D366]" />WhatsApp
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/**
 * The full-bleed hero.
 *
 * It is a REAL carousel. The dots and the "2/7" counter were already drawn, but
 * nothing on this element responded to a swipe — the only way to reach photo 2
 * was to open the fullscreen viewer, which is not how anyone reads a listing.
 * Scroll-snap does the paging (native momentum, GPU-composited, no layout work
 * per frame) and the active index is derived from scrollLeft.
 *
 * `onOpenPhoto` is what makes it an entry point to the fullscreen viewer on the
 * real detail; the preview leaves it out, because a viewer inside a preview is
 * a dead end.
 */
export function DetailHero({
  photos, cover, alt, idx, onIdx, onOpenPhoto, grayscale, watermark, promoted, tags,
}: {
  photos: Photo[];
  cover: string | null | undefined;
  alt?: string;
  idx: number;
  /** Swiping the rail reports the new index back so the viewer opens on it. */
  onIdx?: (i: number) => void;
  onOpenPhoto?: () => void;
  grayscale?: boolean;
  watermark?: string | null;
  promoted?: boolean;
  /** Chips laid over the bottom-left of the photo (type, area). */
  tags?: string[];
}) {
  const rail = useRef<HTMLDivElement>(null);
  const items = photos.length ? photos : cover ? [{ id: "cover", url: cover, altText: alt ?? null } as Photo] : [];

  // Keep the rail in step when the index changes from the outside (the
  // fullscreen viewer swipes, then closes — the hero must be on that photo).
  useEffect(() => {
    const el = rail.current;
    if (!el || !items.length) return;
    const target = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: "auto" });
  }, [idx, items.length]);

  return (
    // `data-detail-hero` is what the morphing header watches — see
    // ListingDetail.useScrolledPastHero. It has to live on the hero itself so
    // the header works no matter which element is doing the scrolling.
    <div data-detail-hero className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black sm:aspect-[16/10]">
      {items.length ? (
        <div
          ref={rail}
          onScroll={(e) => {
            const el = e.currentTarget;
            const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (next !== idx && next >= 0 && next < items.length) onIdx?.(next);
          }}
          className="hz-x flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        >
          {items.map((p) => (
            <Img
              key={p.id}
              src={p.url ?? ""}
              alt={p.altText ?? alt ?? ""}
              data-protected="true"
              draggable={false}
              onClick={onOpenPhoto}
              className={cn(
                "h-full w-full shrink-0 snap-center snap-always object-cover",
                onOpenPhoto && "cursor-pointer",
                grayscale && "grayscale",
              )}
            />
          ))}
        </div>
      ) : (
        <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={40} /></span>
      )}

      {/* Bottom scrim — what makes the overlay chips and the dots legible on a
          bright photo, and what joins the photo to the card below it. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      {watermark && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rotate-[-24deg] text-[44px] font-bold uppercase tracking-[2px] text-white/[0.28]">
            {watermark}
          </span>
        </span>
      )}

      {promoted && (
        <span className="pointer-events-none absolute left-4 top-14 inline-flex items-center gap-1 rounded-4 bg-accent px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-ink-inverse">
          <Icon name="rocket" size={12} /> Promoted
        </span>
      )}

      {items.length > 1 && (
        <span className="pointer-events-none absolute right-4 top-14 rounded-4 bg-black/60 px-2 py-1 text-11 font-semibold leading-none text-white">
          {idx + 1}/{items.length}
        </span>
      )}

      {/* Bottom overlay row: chips left, dots right — one line, so neither can
          sit on top of the other however many chips there are. */}
      <span className="pointer-events-none absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3">
        <span className="flex min-w-0 flex-wrap gap-1.5">
          {(tags ?? []).map((t) => (
            <span
              key={t}
              className="truncate rounded-4 bg-black/55 px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-white"
            >
              {t}
            </span>
          ))}
        </span>
        {items.length > 1 && (
          <span className="flex shrink-0 items-center gap-1 pb-1">
            {items.map((p, i) => (
              <span
                key={p.id}
                className={cn(
                  "h-[3px] rounded-4 transition-[width,background-color] duration-200",
                  i === idx ? "w-5 bg-white" : "w-[10px] bg-white/45",
                )}
              />
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

/**
 * Everything between the hero and the sticky bar on a property detail.
 *
 * `notice` and `footer` are the two slots the real detail screen fills (the
 * moderation block, and the "Similar properties" rail) — the preview passes
 * neither, which is the whole difference between the two.
 */
export function PropertyDetailBody({
  listing, notice, footer, onOpenProfile, onCall, onWhatsapp, privateNote,
}: {
  listing: any;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenProfile?: (username: string) => void;
  /** Only passed when the poster published a number — see PosterCard. */
  onCall?: () => void;
  onWhatsapp?: () => void;
  /** Shown INSTEAD of a number, so its absence reads as a choice, not a gap. */
  privateNote?: string | null;
}) {
  const specs = (listing.keySpecs ?? []) as KeySpec[];
  const highlights = (listing.highlights ?? []) as string[];
  // Memoised: `sections` below depends on it, and a fresh array each render
  // would rebuild that list every time.
  const groups = useMemo(() => (listing.attributeGroups ?? []) as AttrGroup[], [listing.attributeGroups]);
  const amenities = amenityList(listing);

  const sections = useMemo(() => {
    const s: { id: string; label: string }[] = [{ id: "sec-overview", label: "Overview" }];
    if (listing.description) s.push({ id: "sec-about", label: "About" });
    for (const g of groups) s.push({ id: `sec-${g.key}`, label: g.label });
    if (amenities.length) s.push({ id: "sec-amenities", label: "Amenities" });
    s.push({ id: "sec-contact", label: "Seller" });
    return s;
  }, [listing.description, groups, amenities.length]);

  return (
    <div className="flex grow flex-col bg-surface-2 pb-3">
      {/* ---- Price + title + the adaptive spec strip --------------------- */}
      <Card>
        <div id="sec-overview" className="scroll-mt-[104px]">
          <div className={cn("pb-3.5 pt-3.5", PAD)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-24 font-bold leading-[1.05] text-ink-primary sm:text-[28px]">
                  {listing.priceOnly ?? listing.price}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {listing.pricePerSqft && (
                    <span className="text-13 leading-none text-ink-tertiary">{listing.pricePerSqft}</span>
                  )}
                  {listing.isNegotiable && <Tag tone="accent" icon="tag">Negotiable</Tag>}
                </div>
              </div>
              <Tag tone={listing.kind === "rent" ? "info" : "accent"} className="mt-1.5">{listing.kindLabel}</Tag>
            </div>

            <h1 className="mt-3 text-17 font-semibold leading-[1.35] text-ink-primary sm:text-20">
              {listing.title ?? listing.typeLabel}
            </h1>

            <div className="mt-2 flex items-start gap-2 text-13 leading-[1.4] text-ink-secondary sm:text-15">
              <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">{listing.locationLabel ?? listing.areaLabel}</span>
            </div>

            {/* Provenance line — every part of it is a real column. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-11 leading-none text-ink-tertiary">
              {listing.postedOn && (
                <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} /> Posted {listing.postedOn}</span>
              )}
              {typeof listing.photoCount === "number" && listing.photoCount > 0 && (
                <span className="inline-flex items-center gap-1"><Icon name="camera" size={12} /> {listing.photoCount} photos</span>
              )}
              {listing.poster?.verified && (
                <span className="inline-flex items-center gap-1 text-accent"><Icon name="verified" size={12} /> Verified poster</span>
              )}
            </div>
          </div>

          {/* Only the specs the server could fill — see SpecStrip. */}
          <SpecStrip items={specs} />
        </div>
      </Card>

      {/* ---- Highlights -------------------------------------------------- */}
      {highlights.length > 0 && (
        <Card>
          <div className={cn("hz-x flex gap-1.5 py-3", PAD)}>
            {highlights.map((h) => (
              <span
                key={h}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-8 bg-accent-soft px-3 text-13 font-semibold leading-none text-accent"
              >
                <Icon name="check" size={14} />
                {h}
              </span>
            ))}
          </div>
        </Card>
      )}

      {notice}

      <SectionRail sections={sections} />

      {/* ---- Description ------------------------------------------------- */}
      {listing.description && (
        <Card>
          <div id="sec-about" className="scroll-mt-[104px]">
            <Head icon="file" tone="info" title="About this property" />
            <ReadMore text={listing.description} />
          </div>
        </Card>
      )}

      {/* ---- Every answer the seller gave, in the form's own sections ----
          Labels and values are resolved server-side from `field_definitions`,
          grouped by `field_groups`, and the section's icon and colour come from
          the same row (migration 0070). A Flat carries twenty-seven details;
          they read as short titled cards the seller filled in. */}
      {groups.map((g) => (
        <Card key={g.key}>
          <div id={`sec-${g.key}`} className="scroll-mt-[104px]">
            <Head icon={g.icon ?? "list"} tone={toneOf(g.tone)} title={g.label} count={g.rows.length} />
            <AnswerGrid rows={g.rows} />
          </div>
        </Card>
      ))}

      {/* ---- Amenities --------------------------------------------------- */}
      <Amenities id="sec-amenities" items={amenities} />

      {/* ---- Who posted it ----------------------------------------------- */}
      {listing.poster && (
        <PosterCard
          id="sec-contact"
          poster={listing.poster}
          onOpen={onOpenProfile}
          contact={listing.contact?.number ? { number: String(listing.contact.number), whatsapp: listing.contact.whatsapp ?? null } : null}
          onCall={listing.contact?.number ? onCall : undefined}
          onWhatsapp={listing.contact?.number ? onWhatsapp : undefined}
          privateNote={listing.contact?.number ? null : privateNote}
        />
      )}

      {/* ---- Where it is ------------------------------------------------- */}
      {(listing.areaLabel || listing.pincode) && (
        <Card>
          <Head icon="pin" tone="accent" title="Location" />
          <AnswerGrid
            rows={[
              { key: "area", label: "Area", value: listing.areaLabel ?? "—" },
              ...(listing.pincode ? [{ key: "pin", label: "Pincode", value: String(listing.pincode) }] : []),
              ...(listing.typeLabel ? [{ key: "type", label: "Property type", value: listing.typeLabel }] : []),
            ]}
          />
        </Card>
      )}

      {footer}
    </div>
  );
}

/**
 * `amenityItems` (label + icon) is what the server sends now; `amenities` is
 * the older string[] the cards still read. Falling back keeps a cached payload
 * from rendering an empty block.
 */
function amenityList(row: any): AmenityItem[] {
  if (Array.isArray(row?.amenityItems) && row.amenityItems.length) return row.amenityItems as AmenityItem[];
  return ((row?.amenities ?? []) as string[]).map((a) => ({ code: a, label: a, icon: null, category: null }));
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * Everything between the cover and the sticky bar on a project detail.
 *
 * `openUnit` / `onToggleUnit` are what make the unit rows expandable, and
 * `onEnquireUnit` is what hangs a real WhatsApp enquiry off each one. The
 * preview passes its own expander and an inert enquire handler — the rows still
 * open, because a buyer's first question is always "what's in the 2 BHK".
 */
export function ProjectDetailBody({
  project: p, openUnit, onToggleUnit, onEnquireUnit, brochure, notice, footer, onOpenProfile, onCall, onWhatsapp,
}: {
  project: any;
  openUnit: string | null;
  onToggleUnit: (id: string | null) => void;
  /** The unit's id rides along so the chat can record WHICH unit (0087). */
  onEnquireUnit: (unitType: string, unitId: string) => void;
  brochure?: { url: string | null; scanned: boolean } | null;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenProfile?: (username: string) => void;
  /** A builder's number is public by design (Doc2 §6), so this is the norm. */
  onCall?: () => void;
  onWhatsapp?: () => void;
}) {
  const units: any[] = p.units ?? [];
  const priceBand = bandOf(units);
  /**
   * Server-resolved (projects.projectDTO → resolveKeySpecs, migration 0071).
   * This used to be four facts derived in this component, which drew empty
   * tiles on every scheme that has no towers and no floors.
   */
  const specs = (p.keySpecs ?? []) as KeySpec[];
  // Memoised for the same reason as the listing view above.
  const groups = useMemo(() => (p.attributeGroups ?? []) as AttrGroup[], [p.attributeGroups]);
  const amenities = amenityList(p);
  const banks = (p.bankApprovals ?? []) as string[];

  const sections = useMemo(() => {
    const s: { id: string; label: string }[] = [{ id: "sec-overview", label: "Overview" }];
    if (units.length) s.push({ id: "sec-units", label: "Units" });
    if (p.description) s.push({ id: "sec-about", label: "About" });
    for (const g of groups) s.push({ id: `sec-${g.key}`, label: g.label });
    if (amenities.length) s.push({ id: "sec-amenities", label: "Amenities" });
    if (banks.length) s.push({ id: "sec-banks", label: "Loans" });
    s.push({ id: "sec-builder", label: "Builder" });
    return s;
  }, [units.length, p.description, groups, amenities.length, banks.length]);

  return (
    <div className="flex grow flex-col bg-surface-2 pb-3">
      {/* ---- Headline ---------------------------------------------------- */}
      <Card>
        <div id="sec-overview" className="scroll-mt-[104px]">
          <div className={cn("pb-3.5 pt-3.5", PAD)}>
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 text-24 font-bold leading-[1.12] text-ink-primary sm:text-[28px]">{p.name}</h1>
              <Tag tone="info" className="mt-1.5">New Project</Tag>
            </div>

            {(p.projectTypeLabel || p.builderName) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 leading-[1.35] text-ink-secondary sm:text-15">
                {p.projectTypeLabel && <span>{p.projectTypeLabel}</span>}
                {p.projectTypeLabel && p.builderName && <span className="text-ink-tertiary">·</span>}
                {p.builderName && (
                  <span className="inline-flex items-center gap-1">
                    by <span className="font-semibold text-ink-primary">{p.builderName}</span>
                    {p.builder?.verified && <Icon name="verified" size={13} className="text-accent" />}
                  </span>
                )}
              </div>
            )}

            {priceBand && (
              <div className="mt-3.5 flex items-baseline gap-2">
                <span className="text-11 uppercase leading-none tracking-[0.4px] text-ink-tertiary">From</span>
                <span className="text-24 font-bold leading-none text-accent sm:text-[28px]">{priceBand}</span>
              </div>
            )}

            {(p.areaLabel || p.pincode) && (
              <div className="mt-3 flex items-start gap-2 text-13 leading-[1.4] text-ink-secondary sm:text-15">
                <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0">{[p.areaLabel, p.pincode].filter(Boolean).join(" – ")}</span>
              </div>
            )}

            {/* Status chips — wrapping rather than scrolling, so none of them
                can hide off the right edge on a narrow phone. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.buildStatusLabel && <Tag tone="warning" icon="clock">{p.buildStatusLabel}</Tag>}
              {p.possessionLabel && <Tag icon="key">Possession {p.possessionLabel}</Tag>}
              {(p.rera?.number || p.rera?.exempt) && (
                <Tag tone="accent" icon="shield">{p.rera.exempt ? "RERA Exempt" : "RERA Approved"}</Tag>
              )}
              {p.postedOn && <Tag>Posted {p.postedOn}</Tag>}
            </div>
          </div>

          <SpecStrip items={specs} />
        </div>
      </Card>

      {notice}

      <SectionRail sections={sections} />

      {/* ---- Unit types --------------------------------------------------- */}
      {units.length > 0 && (
        <Card>
          <div id="sec-units" className="scroll-mt-[104px]">
            <Head icon="layers" tone="accent" title="Available units" count={units.length} />
            <div className="divide-y divide-divider border-t border-divider">
              {units.map((u) => {
                const open = openUnit === u.id;
                const soldOut = u.available === false;
                return (
                  <div key={u.id}>
                    <button
                      onClick={() => onToggleUnit(open ? null : u.id)}
                      aria-expanded={open}
                      className={cn("flex w-full items-center gap-3 py-3 text-left", PAD, soldOut && "opacity-65")}
                    >
                      {u.floorPlanUrl ? (
                        <Img
                          src={u.floorPlanUrl}
                          alt=""
                          data-protected="true"
                          className="h-11 w-11 shrink-0 rounded-8 border border-border object-cover"
                        />
                      ) : (
                        <IconBadge name="home" tone={soldOut ? "neutral" : "accent"} size={44} icon={20} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-15 font-semibold leading-[1.2] text-ink-primary">{u.unitType}</span>
                          {soldOut ? <Tag tone="error">Sold out</Tag> : <Tag tone="accent">Available</Tag>}
                        </span>
                        <span className="mt-1 block truncate text-13 leading-none text-ink-tertiary">
                          {[
                            u.areaSqft ? `${u.areaSqft.toLocaleString("en-IN")} sqft` : null,
                            u.priceFrom ? `${u.priceFrom} onwards` : null,
                          ].filter(Boolean).join(" · ") || "Tap for details"}
                        </span>
                      </span>
                      <Icon name={open ? "chevron-up" : "chevron-down"} size={18} className="shrink-0 text-ink-tertiary" />
                    </button>

                    {open && (
                      <div className="bg-surface-2">
                        <div className="divide-y divide-divider">
                          {u.areaSqft && <Row label="Built-up area" value={`${u.areaSqft.toLocaleString("en-IN")} sqft`} />}
                          {u.carpetSqft && <Row label="Carpet area" value={`${u.carpetSqft.toLocaleString("en-IN")} sqft`} />}
                          {u.priceFrom && <Row label="Price from" value={u.priceFrom} />}
                          {u.unitsAvailable !== null && u.unitsAvailable !== undefined && (
                            <Row label="Units available" value={String(u.unitsAvailable)} />
                          )}
                        </div>
                        <div className={cn("flex gap-2 py-3", PAD)}>
                          {u.floorPlanUrl && (
                            <a
                              href={u.floorPlanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-8 border border-border bg-surface-1 text-13 font-semibold leading-none text-ink-primary"
                            >
                              <Icon name="crop" size={15} /> Floor plan
                            </a>
                          )}
                          <button
                            onClick={() => onEnquireUnit(u.unitType, u.id)}
                            disabled={soldOut}
                            className="flex h-10 flex-[1.6] items-center justify-center gap-1.5 rounded-8 bg-accent text-13 font-semibold leading-none text-ink-inverse disabled:bg-surface-3 disabled:text-ink-disabled"
                          >
                            {/* Was a WhatsApp mark. This button now opens an
                                in-app chat (0084/0086), and an icon must mean
                                what it does — migration 0076's whole point. */}
                            <Icon name="message" size={15} />
                            {soldOut ? "Sold out" : "Enquire"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* ---- Description ------------------------------------------------- */}
      {p.description && (
        <Card>
          <div id="sec-about" className="scroll-mt-[104px]">
            <Head icon="file" tone="info" title="About this project" />
            <ReadMore text={p.description} />
          </div>
        </Card>
      )}

      {/* ---- The scheme's own answers ------------------------------------ */}
      {groups.map((g) => (
        <Card key={g.key}>
          <div id={`sec-${g.key}`} className="scroll-mt-[104px]">
            <Head icon={g.icon ?? "list"} tone={toneOf(g.tone)} title={g.label} count={g.rows.length} />
            <AnswerGrid rows={g.rows} />
          </div>
        </Card>
      ))}

      {/* ---- Amenities --------------------------------------------------- */}
      <Amenities id="sec-amenities" items={amenities} />

      {/* ---- Home-loan approvals ------------------------------------------ */}
      {banks.length > 0 && (
        <Card>
          <div id="sec-banks" className="scroll-mt-[104px]">
            <Head icon="card" tone="info" title="Home loan approved by" count={banks.length} />
            <div className={cn("flex flex-wrap gap-1.5 border-t border-divider py-3", PAD)}>
              {banks.map((b) => (
                <span
                  key={b}
                  className="inline-flex h-8 items-center gap-1.5 rounded-8 bg-surface-2 px-2.5 text-13 font-semibold leading-none text-ink-primary"
                >
                  <Icon name="check-circle" size={14} className="text-accent" />
                  {b}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ---- RERA + brochure ---------------------------------------------- */}
      {((p.rera?.number || (p.rera?.exempt && p.rera?.reason)) || brochure?.url) && (
        <Card>
          <Head icon="shield" tone="accent" title="Approvals & documents" />
          <AnswerGrid
            rows={[
              ...(p.rera?.number ? [{ key: "rera", label: "RERA registration", value: String(p.rera.number) }] : []),
              ...(p.rera?.exempt && p.rera?.reason ? [{ key: "exempt", label: "RERA exemption", value: String(p.rera.reason) }] : []),
            ]}
          />
          {brochure?.url && (
            <a
              href={brochure.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("flex items-center gap-2.5 border-t border-divider py-3", PAD)}
            >
              <IconBadge name="file" tone="error" size={32} icon={17} />
              <span className="min-w-0 flex-1">
                <span className="block text-15 font-semibold leading-[1.2] text-ink-primary">Project brochure</span>
                <span className="mt-1 block text-11 leading-none text-ink-tertiary">
                  {brochure.scanned ? "PDF · checked" : "PDF · pending scan"}
                </span>
              </span>
              <Icon name="download" size={20} className="shrink-0 text-ink-secondary" />
            </a>
          )}
        </Card>
      )}

      {/* ---- The builder -------------------------------------------------- */}
      {p.builder && (
        <PosterCard
          id="sec-builder"
          poster={p.builder}
          title="Builder"
          onOpen={onOpenProfile}
          contact={p.contact?.number ? { number: String(p.contact.number), whatsapp: p.contact.whatsapp ?? null } : null}
          onCall={p.contact?.number ? onCall : undefined}
          onWhatsapp={p.contact?.number ? onWhatsapp : undefined}
        />
      )}

      {footer}
    </div>
  );
}

/** Tailwind needs the class names whole — no `grid-cols-${n}`. */
const GRID_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/** "₹45 Lakh – ₹78 Lakh" from the actual unit prices. */
export function bandOf(units: any[]): string | null {
  const prices = units.map((u) => u.priceFromPaise).filter((n: unknown): n is number => typeof n === "number" && n > 0);
  if (!prices.length) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const fmt = (paise: number) => {
    const n = paise / 100;
    if (n >= 1_00_00_000) return `₹${+(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000) return `₹${+(n / 1_00_000).toFixed(2)} Lakh`;
    return `₹${n.toLocaleString("en-IN")}`;
  };
  return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
}

/**
 * The card wrapper the two SCREEN files use for their own blocks (the owner's
 * status block, the similar-properties rail), so those match the body's rhythm
 * instead of re-inventing a container.
 */
export function DetailSection({
  icon, tone = "neutral", title, count, children, id,
}: {
  icon: string;
  tone?: Tone;
  title: string;
  count?: number;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card>
      <div id={id} className="scroll-mt-[104px]">
        <Head icon={icon} tone={tone} title={title} count={count} />
        <div className="border-t border-divider">{children}</div>
      </div>
    </Card>
  );
}

/**
 * Kept for the screens that still import it. In the card layout the gutter
 * between two cards IS the separation, so this draws nothing — leaving it as a
 * no-op is what stops a stray 8px band appearing between two cards.
 */
function Separator() {
  return null;
}

export { Separator as DetailSeparator, Row as DetailRow, PAD as DETAIL_PAD, Card as DetailCard, AnswerGrid as DetailAnswerGrid };
