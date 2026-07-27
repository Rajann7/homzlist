"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ShareSheet } from "@/components/feed/sheets";
import type { FeedCard } from "@/lib/feed/client";
import { listingsApi, type ListingInsights as Insights } from "@/lib/listings/client";
import type { BadgeKind } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * P9 S5 — Listing insights.
 *
 * The owner's per-listing screen: the four metric cards, the 2-month
 * availability check-in, the boost and advice cards, and every action from the
 * design's ⋯ sheet and sticky bar.
 *
 * Two rules run through the whole screen:
 *  · Nothing is decided here. Counts, the plan line, whether the check-in is
 *    asking and whether the advice card applies are all the server's answer
 *    (GET /listings/:id/insights), re-read after every action that changes them.
 *  · No dead controls. A button that can't do its job in the listing's current
 *    state isn't rendered as a stub — it carries the action that state actually
 *    allows (a rented listing offers "Re-activate", not "Mark as Rented").
 */
export function ListingInsights({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [l, setL] = useState<Insights | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    action: string;
    title: string;
    body: string;
    label: string;
    destructive?: boolean;
  }>(null);

  const load = useCallback(async () => {
    const r = await listingsApi.insights(id);
    if (r.ok) { setL(r.data.listing); setOffline(false); return; }
    if (r.error.code === "OFFLINE") { setOffline(true); return; }
    setNotFound(true);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** Every status change re-reads the server rather than patching local state —
   *  marking sold also stops a boost and changes what the sticky bar may offer. */
  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = await listingsApi.setStatus(id, confirm.action);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) { toast.show("Couldn't update that listing"); return; }
    toast.show(DONE_TOAST[confirm.action] ?? "Listing updated");
    await load();
  };

  const answerStill = async (available: boolean) => {
    setBusy(true);
    const r = await listingsApi.stillAvailable(id, available);
    setBusy(false);
    toast.show(r.ok ? (available ? "Thanks — your listing stays live" : "Marked as sold") : "Couldn't save that");
    await load();
  };

  const remove = async () => {
    setConfirm(null);
    setBusy(true);
    const r = await listingsApi.remove(id);
    setBusy(false);
    if (!r.ok) { toast.show("Couldn't delete that listing"); return; }
    toast.show(`Moved to trash — restorable for ${r.data.trashDays} days`);
    // The listing no longer has insights to show, so this screen must not stay.
    router.replace("/listings");
  };

  if (notFound) {
    return (
      <Shell onMore={null}>
        <div className="flex flex-col items-center px-6 pb-6 pt-16 text-center">
          <Icon name="chart" size={72} className="text-ink-tertiary" />
          <div className="mt-5 text-17 font-semibold text-ink-primary">No insights for this listing</div>
          <p className="mt-2 max-w-[280px] text-13 leading-[1.45] text-ink-secondary">
            It may have been deleted, or it isn&apos;t yours.
          </p>
          <Button className="mt-5" onClick={() => router.push("/listings")}>Go to My Listings</Button>
        </div>
      </Shell>
    );
  }

  if (!l) {
    return (
      <Shell onMore={null}>
        {offline && <OfflineBanner />}
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-24 w-full rounded-12" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] w-full rounded-12" />)}
          </div>
          <Skeleton className="h-28 w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  const isRent = l.kind === "rent";
  const soldish = l.availability !== "available";
  const canMarkClosed = l.status === "live" && !soldish;
  const editHref = `/create/form?edit=${l.id}`;

  return (
    <Shell onMore={() => setMenu(true)}>
      {offline && <OfflineBanner />}

      <div className="p-4 pb-[100px]">
        {/* The 2-month check-in. It renders only while the server says the
            question is actually open — the cron sets the flag and auto-hides
            the listing 15 days later, so this is where the owner answers it. */}
        {l.stillAvailableAsked && (
          <div className="mb-3 flex flex-col gap-1.5 rounded-8 bg-info-soft p-3">
            <div className="flex w-full items-center gap-2">
              <Icon name="clock" size={20} className="shrink-0 text-info" />
              <span className="flex-1 text-15 font-semibold text-ink-primary">Is this property still available?</span>
            </div>
            <p className="text-11 leading-[1.45] text-ink-secondary">
              We check every 2 months to keep listings fresh. No response within 15 days will hide it automatically.
            </p>
            <div className="mt-1 flex w-full gap-2">
              <Button size="small" variant="outline" className="flex-1" loading={busy} onClick={() => void answerStill(false)}>
                No, it&apos;s sold
              </Button>
              <Button size="small" className="flex-1" loading={busy} onClick={() => void answerStill(true)}>
                Yes, still available
              </Button>
            </div>
          </div>
        )}

        {/* Listing card */}
        <div className="rounded-12 border border-border bg-surface-1 p-3 shadow-l1 dark:shadow-none">
          <div className="flex gap-3">
            <Thumb url={l.coverUrl} size={72} />
            <div className="min-w-0 flex-1">
              <div className="text-15 font-semibold text-ink-primary">{l.title ?? "Untitled listing"}</div>
              <div className="mt-0.5 text-13 text-ink-tertiary">
                {[l.price, l.areaLabel].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge kind={l.badge.kind as BadgeKind} label={l.badge.label} />
                {/* Availability is a different axis from status: an archived
                    listing that was SOLD says so, instead of only "Archived". */}
                {soldish && <StatusBadge kind={l.availability === "rented" ? "rented" : "sold"} />}
                {l.promoted && <StatusBadge kind="promoted" />}
              </div>
            </div>
          </div>
          {(l.liveSince || l.planLabel) && (
            <div className="mt-2.5 text-11 text-ink-tertiary">
              {[l.liveSince ? `Live since ${l.liveSince}` : null, l.planLabel].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Metrics. Leads is the accent tile and opens the Leads screen — the
            design makes it the only tappable one because it's the only metric
            with rows behind it a seller can act on. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric n={l.stats.views} label="Views" sub="unique, per day" />
          <Metric n={l.stats.saves} label="Saves" />
          <Metric n={l.stats.shares} label="Shares" />
          <Metric n={l.stats.leads} label="Leads" accent onClick={() => router.push("/leads")} />
        </div>
        <p className="mx-0.5 my-2.5 text-11 text-ink-tertiary">Your own views and shares aren&apos;t counted.</p>

        {/* Boost. Shown when this listing can actually be boosted right now; a
            listing that's already promoted gets the status route instead of a
            second purchase, and a sold/under-review one gets neither. */}
        {l.promoted ? (
          <div className="rounded-12 bg-accent-soft p-3">
            <div className="flex gap-3">
              <Icon name="rocket" size={26} className="shrink-0 text-accent" />
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">This listing is boosted</div>
                <div className="text-13 leading-[1.45] text-ink-secondary">
                  It&apos;s appearing at the top of the feed, stories and search in your area.
                </div>
              </div>
            </div>
            <Button variant="outline" fullWidth className="mt-3" onClick={() => router.push("/boost")}>
              View boost status
            </Button>
          </div>
        ) : l.canBoost ? (
          <div className="rounded-12 bg-accent-soft p-3">
            <div className="flex gap-3">
              <Icon name="rocket" size={26} className="shrink-0 text-accent" />
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">Boost this listing</div>
                <div className="text-13 leading-[1.45] text-ink-secondary">
                  Appear at the top of the feed, stories and search in your area
                </div>
              </div>
            </div>
            <Button fullWidth className="mt-3" onClick={() => router.push(`/boost/new?listing=${l.id}`)}>
              {l.boostFrom ? `Boost — from ${l.boostFrom}` : "Boost this listing"}
            </Button>
          </div>
        ) : null}

        {/* Advice card — server-computed, so it appears only when true. */}
        {l.tip && (
          <div className="mt-3 rounded-12 bg-warning-soft p-3">
            <div className="flex gap-3">
              <Icon name="bulb" size={24} className="shrink-0 text-warning" />
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">{l.tip.title}</div>
                <div className="text-13 leading-[1.45] text-ink-secondary">{l.tip.body}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => router.push(`/create/photos?edit=${l.id}`)}>
                Add photos
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => router.push(editHref)}>
                Edit price
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bar. Third slot carries whatever this state actually allows. */}
      <div className="sticky bottom-0 z-sticky mt-auto flex gap-2 border-t border-divider bg-page px-4 py-3 safe-bottom">
        <Button variant="outline" className="flex-1 px-0" onClick={() => router.push(editHref)}>Edit</Button>
        <Button
          variant="outline"
          className="flex-1 px-0"
          onClick={() => router.push(l.promoted ? "/boost" : l.canBoost ? `/boost/new?listing=${l.id}` : "/boost")}
        >
          Boost
        </Button>
        {canMarkClosed ? (
          <Button
            className="flex-1 whitespace-nowrap px-0"
            onClick={() =>
              setConfirm(isRent ? MARK_RENTED : MARK_SOLD)
            }
          >
            {isRent ? "Mark as Rented" : "Mark as Sold"}
          </Button>
        ) : l.canReactivate ? (
          <Button className="flex-1 whitespace-nowrap px-0" onClick={() => setConfirm(REACTIVATE)}>
            Re-activate
          </Button>
        ) : (
          <Button variant="outline" className="flex-1 px-0" onClick={() => router.push(`/property/${l.id}`)}>
            View
          </Button>
        )}
      </div>

      {/* ⋯ sheet — the design's Sheets.listingMore. Every row does the real
          thing; rows whose action this state doesn't permit aren't shown at
          all rather than being rendered as no-ops. */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Listing options">
        <div className="pb-2">
          <SheetOption
            label="Edit listing"
            icon={<Icon name="edit" size={20} />}
            onClick={() => { setMenu(false); router.push(editHref); }}
          />
          {(l.canBoost || l.promoted) && (
            <SheetOption
              label={l.promoted ? "View boost status" : "Boost listing"}
              icon={<Icon name="rocket" size={20} />}
              onClick={() => { setMenu(false); router.push(l.promoted ? "/boost" : `/boost/new?listing=${l.id}`); }}
            />
          )}
          {/* Only a live listing has a public link. Sharing a hidden, sold or
              under-review one hands out a URL that 404s for the recipient. */}
          {l.status === "live" && (
            <>
              <SheetOption
                label="Share"
                icon={<Icon name="share" size={20} />}
                onClick={() => { setMenu(false); setShare(true); }}
              />
              <SheetOption
                label="View public page"
                icon={<Icon name="home" size={20} />}
                onClick={() => { setMenu(false); router.push(`/property/${l.id}`); }}
              />
            </>
          )}
          {canMarkClosed && (
            <>
              <SheetOption
                label="Mark as sold"
                icon={<Icon name="check-circle" size={20} />}
                onClick={() => { setMenu(false); setConfirm(MARK_SOLD); }}
              />
              <SheetOption
                label="Mark as rented"
                icon={<Icon name="check-circle" size={20} />}
                onClick={() => { setMenu(false); setConfirm(MARK_RENTED); }}
              />
              <SheetOption
                label="Hide temporarily"
                icon={<Icon name="eye-off" size={20} />}
                onClick={() => { setMenu(false); setConfirm(HIDE); }}
              />
            </>
          )}
          {l.status === "hidden" && (
            <SheetOption
              label="Unhide"
              icon={<Icon name="home" size={20} />}
              onClick={() => { setMenu(false); setConfirm(UNHIDE); }}
            />
          )}
          {l.canReactivate && (
            <SheetOption
              label="Re-activate"
              icon={<Icon name="refund" size={20} />}
              onClick={() => { setMenu(false); setConfirm(REACTIVATE); }}
            />
          )}
          <SheetOption
            label="Delete"
            destructive
            icon={<Icon name="trash" size={20} />}
            onClick={() => { setMenu(false); setConfirm(DELETE); }}
          />
        </div>
      </BottomSheet>

      {/* The same real share sheet the feed and detail use — so a share from
          here lands in `listing_shares` and moves the Shares card above. */}
      <ShareSheet
        open={share}
        onClose={() => { setShare(false); void load(); }}
        card={{
          kind: "property",
          id: l.id,
          coverUrl: l.coverUrl,
          title: l.title,
          price: l.price,
          meta: l.areaLabel,
        } as FeedCard}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm?.action === "delete" ? void remove() : void run())}
        loading={busy}
        destructive={confirm?.destructive}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.label ?? "Confirm"}
      />
    </Shell>
  );
}

// The consequence line on each of these is the design's double-confirm rule
// (Doc2 §15): the seller is told what the action costs BEFORE it happens —
// notably that marking sold stops a running boost with no refund.
const MARK_SOLD = {
  action: "sold",
  title: "Mark this property as sold?",
  body: "It will be archived and removed from feed and search. People who saved it are notified, and any running boost stops with no refund for unused days. You can restore it later.",
  label: "Mark as Sold",
  destructive: true,
};
const MARK_RENTED = {
  action: "rented",
  // `setListingStatus` stops a running boost with no refund for rented exactly
  // as it does for sold, so this line has to say so — it used to promise only
  // the upside ("re-activate for free") while the boost died silently.
  body: "It will be archived and removed from feed and search, and any running boost stops with no refund for unused days. You can re-activate it later for free using the same slot.",
  title: "Mark this property as rented?",
  label: "Mark as Rented",
};
const HIDE = {
  action: "hide",
  title: "Hide this listing?",
  body: "It stops appearing in the feed and search. You can unhide it any time.",
  label: "Hide",
};
const UNHIDE = {
  action: "unhide",
  title: "Unhide this listing?",
  body: "It appears in the feed and search again.",
  label: "Unhide",
};
const REACTIVATE = {
  action: "reactivate",
  title: "Re-activate this listing?",
  body: "It uses the same slot — no extra payment. It will be re-reviewed before going live.",
  label: "Re-activate",
};
const DELETE = {
  action: "delete",
  title: "Delete this listing?",
  body: "It goes to trash for 30 days and the listing and its insights are removed from your profile. Your listing slot is NOT returned.",
  label: "Delete",
  destructive: true,
};

const DONE_TOAST: Record<string, string> = {
  sold: "Listing marked as sold",
  rented: "Listing marked as rented",
  hide: "Listing hidden",
  unhide: "Listing is live again",
  reactivate: "Re-activated — back for a quick review",
};

function Metric({
  n, label, sub, accent, onClick,
}: { n: number; label: string; sub?: string; accent?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-12 p-4 text-left",
        accent ? "bg-accent-soft" : "bg-surface-2",
        onClick && "active:opacity-80",
      )}
    >
      <div className={cn("text-24 font-bold tracking-[-0.2px]", accent ? "text-accent" : "text-ink-primary")}>
        {n.toLocaleString("en-IN")}
      </div>
      <div className="text-13 text-ink-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-11 text-ink-tertiary">{sub}</div>}
    </Tag>
  );
}

function Thumb({ url, size }: { url: string | null; size: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-8 bg-surface-3 text-ink-tertiary"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" data-protected="true" className="h-full w-full object-cover" />
      ) : (
        <Icon name="image" size={22} />
      )}
    </span>
  );
}

/** No bottom nav: this is a screen you enter from a listing and back out of. */
function Shell({ children, onMore }: { children: React.ReactNode; onMore: (() => void) | null }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/profile" />}
          title="Listing insights"
          right={
            onMore ? (
              <button aria-label="Listing options" onClick={onMore} className="grid h-11 w-11 place-items-center text-ink-primary">
                <Icon name="more" size={22} />
              </button>
            ) : (
              <span />
            )
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
