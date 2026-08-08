"use client";

import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The home feed's loading twins (8 Aug 2026 — Rajan).
 *
 * The rails used to load behind ONE grey rectangle per card slot
 * (`h-[380px] w-[86vw]`), so every carousel spent its first second as a wall of
 * solid blocks — it read as a broken screen rather than as a loading one, and
 * when the card arrived the whole rail jumped because a real card is not 380px
 * tall.
 *
 * These are shape-for-shape twins of the components they stand in for: same
 * box, same border, same 16/9 cover, same rows in the same order at the same
 * sizes. Nothing here is a new design — it is the card, drawn in grey, so the
 * screen fills in place instead of swapping.
 *
 * Keep them in sync with FeedCard / ProjectCard / PersonCard: if a row moves
 * there, it moves here.
 */

/** The rail's card box — matches FeedCard/ProjectCard `chrome="rail"`. */
export function RailCardSkeleton() {
  return (
    <div className="flex w-[86vw] max-w-[320px] shrink-0 flex-col overflow-hidden rounded-8 border border-border bg-surface-1 pb-3">
      {/* cover — the same 16/9 the card uses, so nothing shifts on arrival */}
      <Skeleton className="aspect-[16/9] w-full rounded-none" />

      <div className="flex flex-col gap-2 px-4 pt-3">
        {/* title: two clamped lines */}
        <Skeleton className="h-[17px] w-[88%] rounded-4" />
        <Skeleton className="h-[17px] w-[52%] rounded-4" />
        {/* price */}
        <Skeleton className="h-[20px] w-[45%] rounded-4" />
        {/* meta chips */}
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-[22px] w-14 rounded-4" />
          <Skeleton className="h-[22px] w-16 rounded-4" />
          <Skeleton className="h-[22px] w-12 rounded-4" />
        </div>
        {/* facts strip */}
        <Skeleton className="h-[62px] w-full rounded-8" />
        {/* location line */}
        <Skeleton className="h-[13px] w-[55%] rounded-4" />
        {/* poster row */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-[13px] w-[38%] rounded-4" />
          <Skeleton className="ml-auto h-[11px] w-10 rounded-4" />
        </div>
        {/* action bar */}
        <div className="mt-1 flex items-center gap-2">
          <Skeleton className="h-10 w-11 shrink-0 rounded-8" />
          <Skeleton className="h-10 flex-1 rounded-8" />
          <Skeleton className="h-10 flex-1 rounded-8" />
          <Skeleton className="h-10 w-9 shrink-0 rounded-8" />
        </div>
      </div>
    </div>
  );
}

/** The Top Builders / Top Brokers tile — matches PersonCard. */
export function RailPersonSkeleton() {
  return (
    <div className="flex w-[156px] shrink-0 flex-col items-center gap-2 rounded-8 border border-border bg-surface-1 p-3">
      <Skeleton className="h-14 w-14 rounded-full" />
      <Skeleton className="h-[13px] w-[80%] rounded-4" />
      <Skeleton className="h-[17px] w-14 rounded-4" />
      <Skeleton className="h-[11px] w-[60%] rounded-4" />
      <Skeleton className="mt-auto h-8 w-full rounded-8" />
    </div>
  );
}

/**
 * A whole rail before its heading is known — used while /feed/sections is still
 * in flight. Same header geometry (icon + title + subtitle + View all) and the
 * same card row, so the rails do not reflow when the real titles land.
 */
export function RailSkeleton({ people = false }: { people?: boolean }) {
  return (
    <section className="border-b-8 border-surface-2 bg-surface-1 py-3.5">
      <header className="flex items-end gap-2 px-4 pb-2.5">
        <Skeleton className="h-8 w-8 shrink-0 self-center rounded-8" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-[17px] w-[38%] rounded-4" />
          <Skeleton className="h-[11px] w-[58%] rounded-4" />
        </div>
        <Skeleton className="h-[15px] w-14 shrink-0 rounded-4" />
      </header>
      <div className="flex items-stretch gap-3 overflow-hidden px-4">
        {people
          ? [0, 1, 2].map((i) => <RailPersonSkeleton key={i} />)
          : [0, 1].map((i) => <RailCardSkeleton key={i} />)}
      </div>
    </section>
  );
}

/** The requirement-mode card (RequirementFeed's ReqCard), drawn in grey. */
export function RequirementCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-4 pl-5">
      <Skeleton className="h-[26px] w-24 rounded-4" />
      <Skeleton className="h-[17px] w-[46%] rounded-4" />
      <Skeleton className="h-[13px] w-[76%] rounded-4" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-[13px] w-[34%] rounded-4" />
        <Skeleton className="ml-auto h-[11px] w-10 rounded-4" />
      </div>
      <Skeleton className="h-11 w-full rounded-8" />
    </div>
  );
}
