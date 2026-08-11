"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { SheetOption } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type Photo, type MyListing } from "@/lib/listings/client";
import { InquirySheet, MoreSheet, ShareSheet, ReportSheet, LoginSheet } from "@/components/feed/sheets";
import { interactionsApi, type FeedCard } from "@/lib/feed/client";
import { DETAIL_PAD, DetailHero, DetailRow, DetailSection, DetailSeparator, PropertyDetailBody } from "./detailBody";
import { cn, publicHref } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P4 — Property detail (redesigned, Rajan 28 Jul 2026).
 *
 * Two rules this screen exists to keep.
 *
 * 1. The CONTACT MODE is the server's (Doc2 §5.1): if the owner didn't publish
 *    their number, the payload contains no number at all, so the only thing
 *    this screen can offer is "Request number". There is no client-side branch
 *    that could leak it.
 *
 * 2. Every owner control does what it says, through a real endpoint. Edit and
 *    "Mark as Sold" both used to `router.push('/listings/:id')` — this screen's
 *    own URL — so the two headline owner actions navigated to themselves and
 *    the status state machine (`POST /listings/:id/status`) was unreachable
 *    from the detail. They now open the edit form and drive the endpoint, with
 *    the same confirmation copy the manager uses, because the consequences
 *    (archive, boost stops, no refund) are the same ones.
 */
export function ListingDetail({ id, isGuest = false }: { id: string; isGuest?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [listing, setListing] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [similar, setSimilar] = useState<MyListing[]>([]);
  const [idx, setIdx] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [saved, setSaved] = useState(false);
  // Which contact/action sheet is open. On the public host the viewer is always
  // a guest (middleware strips the session), so any action that writes to the
  // DB opens the login sheet instead of hitting a 401.
  const [sheet, setSheet] = useState<null | "inquiry" | "more" | "share" | "report" | "login" | "manage">(null);
  const [reqBusy, setReqBusy] = useState(false);
  /** The owner action awaiting confirmation — every one of them writes. */
  const [confirm, setConfirm] = useState<null | { action: OwnerAction; title: string; body: string; label: string; destructive?: boolean }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const l = await listingsApi.get(id);
    if (!l.ok) { setNotFound(true); return; }
    setListing(l.data.listing);
    // Saved-state comes from the `saves` table, not from a fresh `useState`.
    setSaved(Boolean(l.data.listing.saved));
    const [p, s] = await Promise.all([listingsApi.photos(id), listingsApi.similar(id)]);
    if (p.ok) setPhotos(p.data.photos);
    if (s.ok) setSimilar(s.data.items);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Persist the wishlist bookmark for real (Module 6 `saves`), gated for guests.
  const toggleSave = async () => {
    if (isGuest) { setSheet("login"); return; }
    setSaved((s) => !s); // optimistic
    const res = await interactionsApi.toggleSave(id, saved);
    if (res.ok) { setSaved(res.data.saved); toast.show(res.data.saved ? "Saved" : "Removed from saved"); }
    else { setSaved((s) => !s); toast.show("Couldn't save that"); }
  };

  const share = () => {
    // The PUBLIC url, not the one in the address bar: an owner shares this
    // screen from seller.homzlist.com, where the recipient has no session and
    // gets a login wall instead of the listing.
    const url = publicHref(`/property/${id}`);
    if (navigator.share) void navigator.share({ title: listing?.title ?? "", url });
    else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
  };

  // "Request Number" (owner withheld their number): the only way to reach them
  // is to start a chat request (Module 7). Sending the inquiry grows the pending
  // thread; the number exchange then happens inside it (Request → Allow).
  // Number requests were removed with the chat: there is nobody to ask and
  // nothing to wait for. The buyer states how they want to be contacted, the
  // seller gets a lead with that number on it, and the call goes the other way.

  /**
   * Every owner action that changes the row, run against its real endpoint and
   * then re-read from the server — the screen never guesses the new state.
   */
  const runOwnerAction = async (action: OwnerAction) => {
    setBusy(true);
    if (action === "delete") {
      const res = await listingsApi.remove(id);
      setBusy(false);
      setConfirm(null);
      if (!res.ok) { toast.show("Couldn't delete that listing"); return; }
      toast.show(`Moved to Recently deleted — ${res.data.trashDays} days to restore`);
      router.replace("/listings");
      return;
    }
    const res = await listingsApi.setStatus(id, action);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      toast.show(
        res.error.code === "LISTING_STATE_LOCKED" ? "That isn't possible in the listing's current state"
        : res.error.code === "FORBIDDEN" ? "Your role can't put a listing back on the feed"
        : "Couldn't update that listing",
      );
      return;
    }
    toast.show(STATUS_DONE[action] ?? "Updated");
    await load();
  };

  // A listing the viewer may not see is indistinguishable from one that never
  // existed — same 404 screen either way (Doc2 §5.4). A listing that was sold,
  // rented, archived or never existed all land here deliberately, because naming
  // the reason would confirm that the id is real (Doc9 §7).
  if (notFound) {
    return (
      <Shell>
        <div className="flex shrink-0 items-center px-2 py-1.5">
          <button aria-label="Back" onClick={() => router.back()} className="grid h-11 w-11 place-items-center text-ink-primary">
            <Icon name="chevron-left" size={22} />
          </button>
        </div>
        <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
          <Icon name="home" size={96} className="text-ink-tertiary" />
          <div className="mt-5 text-20 font-bold leading-[1.3] text-ink-primary">
            This property is no longer available
          </div>
          <p className="mt-2 max-w-[280px] text-15 leading-[1.45] text-ink-secondary">
            It may have been sold, rented or removed by the owner.
          </p>
          <Button className="mt-5" onClick={() => router.push("/search")}>Browse similar properties</Button>
          <button onClick={() => router.push("/")} className="mt-3.5 text-15 font-semibold leading-none text-accent">
            Go to Home
          </button>
        </div>
      </Shell>
    );
  }

  if (!listing) {
    return (
      <Shell>
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8 w-40 rounded-4" />
          <Skeleton className="h-5 w-56 rounded-4" />
          <Skeleton className="mt-2 h-20 w-full rounded-4" />
          <Skeleton className="h-40 w-full rounded-4" />
        </div>
      </Shell>
    );
  }

  const isOwner = Boolean(listing.owner);
  const sold = listing.availability !== "available";
  const live = listing.status === "live";
  const underReview = isOwner && !live;
  const cover = photos[idx]?.url ?? listing.coverUrl;

  return (
    <Shell>
      <DetailHeader
        title={listing.title ?? listing.typeLabel ?? ""}
        saved={saved}
        // You don't bookmark your own property — it's already on your profile
        // and in My Listings, and the tap would land in the Saves metric you
        // read on your own insights screen. The server refuses it either way.
        canSave={!isOwner}
        // Sharing a link only makes sense for something a visitor can open. A
        // draft / under-review / hidden / sold listing 404s for everyone else,
        // so offering Share there hands out a dead link.
        canShare={live}
        onBack={() => router.back()}
        onSave={() => void toggleSave()}
        onShare={share}
        onMore={() => setSheet(isOwner ? "manage" : "more")}
      />

      {/* Hero — a real swipeable carousel (detailBody), shared with Preview so
          the two can't drift. */}
      <DetailHero
        photos={photos}
        cover={cover}
        alt={photos[idx]?.altText ?? listing.title ?? ""}
        idx={idx}
        onIdx={setIdx}
        onOpenPhoto={() => setViewer(true)}
        grayscale={sold}
        watermark={listing.status === "pending_review" ? "Under Review" : null}
        promoted={Boolean(listing.promoted)}
        // Type and area over the photo, the way a card labels itself — both are
        // columns, so the overlay says nothing the payload didn't.
        tags={[listing.typeLabel, listing.areaLabel].filter(Boolean) as string[]}
      />

      {/* Status strips — full-bleed tinted bars, one per real condition. */}
      {underReview && (
        <StatusStrip
          tone={listing.status === "pending_review" ? "info" : "warning"}
          icon={listing.status === "pending_review" ? "clock" : "alert"}
          text={
            listing.status === "pending_review" ? "This listing is under review. It will go live once approved."
            : listing.status === "changes_requested" ? "Changes requested — update the highlighted details and resubmit."
            : listing.status === "rejected" ? "This listing was rejected."
            : listing.status === "draft" ? "This is a draft. Only you can see it until you submit it."
            : "Only you can see this listing right now."
          }
        />
      )}
      {sold && (
        <StatusStrip
          tone="error"
          icon="check-circle"
          text={listing.availabilityLabel ?? "This property is no longer available."}
        />
      )}

      <PropertyDetailBody
        listing={listing}
        onOpenProfile={(username) => router.push(`/profile/${username}`)}
        notice={
          isOwner ? (
            <OwnerNotice listing={listing} />
          ) : null
        }
        footer={
          /* Similar properties — matched server-side (same type/kind/city, ±35%
             on price), so the rule isn't reverse-engineerable from the client. */
          similar.length ? (
            <>
              <DetailSeparator />
              <DetailSection icon="search" tone="info" title="Similar properties" count={similar.length}>
                <div className={cn("hz-x flex gap-2 py-3", DETAIL_PAD)}>
                  {similar.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => router.push(`/property/${s.id}`)}
                      className="w-36 shrink-0 overflow-hidden rounded-4 border border-border bg-surface-1 text-left"
                    >
                      <span className="block aspect-[4/3] bg-surface-3">
                        {s.coverUrl ? (
                          <Img src={s.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={22} /></span>
                        )}
                      </span>
                      <span className="block px-2 py-2">
                        <span className="block truncate text-13 font-semibold leading-none text-ink-primary">{s.price}</span>
                        <span className="mt-1 block truncate text-11 leading-none text-ink-tertiary">{s.areaLabel}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </DetailSection>
            </>
          ) : null
        }
      />

      {/* Sticky bar — which variant shows is decided by what the SERVER sent (a
          withheld number simply isn't in the payload), never by a local flag. */}
      <div className="sticky bottom-0 z-sticky mt-auto border-t border-border bg-surface-1 safe-bottom">
        {isOwner && listing.owner?.stats && (
          <div className="grid grid-cols-3 divide-x divide-divider border-b border-divider">
            {[
              { k: "Views", v: listing.owner.stats.views },
              { k: "Saves", v: listing.owner.stats.saves },
              { k: "Leads", v: listing.owner.stats.leads },
            ].map((s) => (
              <div key={s.k} className="px-1 py-2 text-center">
                {/* A metric with no table behind it sends null and prints "—"
                    — never a fabricated 0. */}
                <div className="text-13 font-semibold leading-none text-ink-primary">
                  {s.v === null || s.v === undefined ? "—" : Number(s.v).toLocaleString("en-IN")}
                </div>
                <div className="mt-1 text-11 leading-none text-ink-tertiary">{s.k}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2.5">
          {isOwner ? (
            <OwnerBar
              listing={listing}
              busy={busy}
              onEdit={() => router.push(`/create/form?edit=${listing.id}`)}
              onPreview={() => router.push(`/create/preview?listing=${listing.id}`)}
              onBoost={() => router.push(`/boost/new?listing=${listing.id}`)}
              onInsights={() => router.push(`/listings/${listing.id}/insights`)}
              onAsk={(a) => setConfirm(confirmFor(a, listing))}
              onMore={() => setSheet("manage")}
            />
          ) : sold ? (
            <Button variant="outline" fullWidth onClick={() => router.push("/search")}>
              Browse similar properties
            </Button>
          ) : listing.contact ? (
            <>
              <button
                aria-label="Call"
                onClick={() => (window.location.href = `tel:${listing.contact.number}`)}
                className="grid h-11 w-[52px] shrink-0 place-items-center rounded-4 border border-border bg-surface-1 text-ink-primary"
              >
                <Icon name="phone" size={20} />
              </button>
              {listing.contact.whatsapp && (
                <a
                  aria-label="WhatsApp"
                  href={`https://wa.me/91${String(listing.contact.whatsapp).replace(/\D/g, "").slice(-10)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-11 w-[52px] shrink-0 place-items-center rounded-4 border border-accent bg-accent-soft text-accent"
                >
                  <Icon name="whatsapp" size={20} />
                </a>
              )}
              <Button fullWidth onClick={() => (isGuest ? setSheet("login") : setSheet("inquiry"))}>Send Inquiry</Button>
            </>
          ) : (
            /* "Request Number" is gone with the chat: a number is no longer
               something you ask for and wait on. The seller either publishes
               theirs (the branch above) or they don't — and either way the
               buyer's route is the same one action, which also tells the seller
               how and when to reach back. */
            <Button fullWidth onClick={() => (isGuest ? setSheet("login") : setSheet("inquiry"))}>
              <Icon name="zap" size={17} /> Send Inquiry
            </Button>
          )}
        </div>
      </div>

      {/* Action sheets — the same real, DB-backed sheets the feed uses (Module
          6/7). A `FeedCard`-shaped view of the listing feeds them; the sheets
          only read title/price/area/id, so no poster data is needed here. */}
      {(() => {
        const card = {
          kind: "property",
          id: listing.id,
          promoted: Boolean(listing.promoted),
          saved,
          coverUrl: cover ?? null,
          photos: [],
          areaLabel: listing.areaLabel ?? null,
          poster: { id: "", name: "", username: null, role: null, verified: false, avatarUrl: null },
          postedAgo: "",
          price: listing.priceOnly ?? listing.price,
          title: listing.title ?? listing.typeLabel,
          meta: listing.typeLabel,
        } as FeedCard;
        return (
          <>
            <MoreSheet
              open={sheet === "more"}
              onClose={() => setSheet(null)}
              onShare={() => setSheet("share")}
              onReport={() => setSheet(isGuest ? "login" : "report")}
            />
            <ManageSheet
              open={sheet === "manage"}
              listing={listing}
              onClose={() => setSheet(null)}
              onEdit={() => { setSheet(null); router.push(`/create/form?edit=${listing.id}`); }}
              onPreview={() => { setSheet(null); router.push(`/create/preview?listing=${listing.id}`); }}
              onPhotos={() => { setSheet(null); router.push(`/create/photos?listing=${listing.id}`); }}
              onInsights={() => { setSheet(null); router.push(`/listings/${listing.id}/insights`); }}
              onBoost={() => { setSheet(null); router.push(`/boost/new?listing=${listing.id}`); }}
              onShare={() => setSheet("share")}
              onAction={(a) => { setSheet(null); setConfirm(confirmFor(a, listing)); }}
            />
            <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} card={card} />
            <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} card={card} />
            <InquirySheet open={sheet === "inquiry"} onClose={() => setSheet(null)} card={card} />
            <LoginSheet open={sheet === "login"} onClose={() => setSheet(null)} />
          </>
        );
      })()}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) void runOwnerAction(confirm.action); }}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.label ?? "Confirm"}
        destructive={confirm?.destructive}
        loading={busy}
      />

      {/* Fullscreen photo viewer — pinch/double-tap zoom + navigation */}
      {viewer && cover && (
        <PhotoViewer
          photos={photos.length ? photos : [{ id: "cover", url: cover, altText: null } as Photo]}
          index={idx}
          onIndex={setIdx}
          onClose={() => setViewer(false)}
          onShare={share}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

/** Everything the owner can do that WRITES. Each maps to a real endpoint. */
type OwnerAction = "sold" | "rented" | "hide" | "unhide" | "reactivate" | "delete";

const STATUS_DONE: Record<string, string> = {
  sold: "Marked as sold",
  rented: "Marked as rented",
  hide: "Listing hidden",
  unhide: "Listing is visible again",
  reactivate: "Sent back for a quick review",
};

/**
 * The confirmation copy, one per action — the SAME wording My Listings uses,
 * because the consequences are the same ones (archive, boost stops, no refund
 * for unused days — all applied server-side, Doc2 §15).
 */
function confirmFor(action: OwnerAction, listing: any) {
  switch (action) {
    case "sold":
      return { action, title: "Mark as sold?", body: "The listing is archived, people who saved it are notified, and any running boost stops with no refund for unused days.", label: "Mark sold" };
    case "rented":
      return { action, title: "Mark as rented?", body: "The listing is archived, and any running boost stops with no refund for unused days. You can re-activate it later for free using the same slot.", label: "Mark rented" };
    case "hide":
      return { action, title: "Hide this listing?", body: "It stops appearing in the feed and search. You can unhide it any time.", label: "Hide" };
    case "unhide":
      return { action, title: "Make this listing visible?", body: "It goes back into the feed and search straight away.", label: "Unhide" };
    case "reactivate":
      return { action, title: "Re-activate this listing?", body: "It uses the same slot (free) and goes back for a quick review.", label: "Re-activate" };
    case "delete":
      return { action, title: "Delete this listing?", body: `"${listing.title ?? "This listing"}" moves to Recently deleted for 30 days. A listing that was live does not give its slot back.`, label: "Delete", destructive: true };
  }
}

/** Which owner actions this listing's current state actually allows. */
function ownerCaps(listing: any) {
  const status = listing.status as string;
  return {
    isDraft: status === "draft",
    isLive: status === "live",
    isHidden: status === "hidden",
    canBoost: status === "live" && listing.availability === "available",
    canInsights: status === "live" || status === "archived" || listing.availability !== "available",
    // Only a RENTED listing comes back — a sold one is finished (Doc2 §5.4).
    canReactivate: listing.availability === "rented",
    canClose: status === "live" && listing.availability === "available",
    isRent: listing.kind === "rent",
  };
}

/**
 * The owner's sticky bar. Three slots at most, and the primary one is whatever
 * this state actually needs doing next — a draft needs finishing, a live
 * listing needs closing, a hidden one needs bringing back.
 */
function OwnerBar({
  listing, busy, onEdit, onPreview, onBoost, onInsights, onAsk, onMore,
}: {
  listing: any;
  busy: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onBoost: () => void;
  onInsights: () => void;
  onAsk: (a: OwnerAction) => void;
  onMore: () => void;
}) {
  const c = ownerCaps(listing);

  return (
    <>
      <Button variant="outline" className="flex-1 px-0" onClick={onEdit}>Edit</Button>
      {c.isDraft ? (
        <Button className="flex-[1.4] whitespace-nowrap px-0" onClick={onPreview}>Preview &amp; submit</Button>
      ) : c.isHidden ? (
        <Button className="flex-[1.4] whitespace-nowrap px-0" loading={busy} onClick={() => onAsk("unhide")}>Unhide</Button>
      ) : c.canReactivate ? (
        <Button className="flex-[1.4] whitespace-nowrap px-0" loading={busy} onClick={() => onAsk("reactivate")}>Re-activate</Button>
      ) : c.canClose ? (
        <>
          <Button variant="outline" className="flex-1 px-0" onClick={onBoost}>Boost</Button>
          <Button className="flex-[1.4] whitespace-nowrap px-0" loading={busy} onClick={() => onAsk(c.isRent ? "rented" : "sold")}>
            {c.isRent ? "Mark Rented" : "Mark Sold"}
          </Button>
        </>
      ) : c.canInsights ? (
        <Button className="flex-[1.4] whitespace-nowrap px-0" onClick={onInsights}>Insights</Button>
      ) : (
        <Button className="flex-[1.4] whitespace-nowrap px-0" onClick={onPreview}>Preview</Button>
      )}
      <button
        aria-label="More options"
        onClick={onMore}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-4 border border-border text-ink-primary"
      >
        <Icon name="more" size={20} />
      </button>
    </>
  );
}

/**
 * The owner's ⋯ sheet. Every row is either a route that exists or an action
 * that writes; nothing is listed that this listing's state can't do.
 */
function ManageSheet({
  open, listing, onClose, onEdit, onPreview, onPhotos, onInsights, onBoost, onShare, onAction,
}: {
  open: boolean;
  listing: any;
  onClose: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onPhotos: () => void;
  onInsights: () => void;
  onBoost: () => void;
  onShare: () => void;
  onAction: (a: OwnerAction) => void;
}) {
  const c = ownerCaps(listing);
  return (
    <BottomSheet open={open} onClose={onClose} title="Manage listing">
      <div className="flex flex-col pb-2">
        <SheetOption icon={<Icon name="edit" size={22} className="text-ink-secondary" />} label="Edit details" onClick={onEdit} />
        <SheetOption icon={<Icon name="camera" size={22} className="text-ink-secondary" />} label="Manage photos" onClick={onPhotos} />
        <SheetOption icon={<Icon name="eye" size={22} className="text-ink-secondary" />} label="Preview as a buyer" onClick={onPreview} />
        {c.canInsights && (
          <SheetOption icon={<Icon name="chart" size={22} className="text-ink-secondary" />} label="Insights" onClick={onInsights} />
        )}
        {c.canBoost && (
          <SheetOption icon={<Icon name="rocket" size={22} className="text-ink-secondary" />} label="Boost this listing" onClick={onBoost} />
        )}
        {c.isLive && (
          <SheetOption icon={<Icon name="share" size={22} className="text-ink-secondary" />} label="Share" onClick={onShare} />
        )}
        {c.canClose && (
          <>
            <SheetOption icon={<Icon name="check-circle" size={22} className="text-ink-secondary" />} label="Mark as sold" onClick={() => onAction("sold")} />
            <SheetOption icon={<Icon name="check-circle" size={22} className="text-ink-secondary" />} label="Mark as rented" onClick={() => onAction("rented")} />
            <SheetOption icon={<Icon name="eye-off" size={22} className="text-ink-secondary" />} label="Hide temporarily" onClick={() => onAction("hide")} />
          </>
        )}
        {c.isHidden && (
          <SheetOption icon={<Icon name="eye" size={22} className="text-ink-secondary" />} label="Unhide" onClick={() => onAction("unhide")} />
        )}
        {c.canReactivate && (
          <SheetOption icon={<Icon name="refund" size={22} className="text-ink-secondary" />} label="Re-activate" onClick={() => onAction("reactivate")} />
        )}
        <SheetOption icon={<Icon name="trash" size={22} className="text-error" />} label="Delete listing" destructive onClick={() => onAction("delete")} />
      </div>
    </BottomSheet>
  );
}

/**
 * The owner-only block above the details: the listing's own status badge, the
 * moderator's words when there are any, and whether ownership proof is on file.
 * All four values are columns on the row — none of it is shown to a visitor.
 */
function OwnerNotice({ listing }: { listing: any }) {
  const o = listing.owner ?? {};
  const notes = o.rejectReason || o.reviewNotes;
  return (
    <>
      <DetailSeparator />
      <DetailSection
        icon="lock"
        tone={listing.status === "live" ? "accent" : "warning"}
        title="Only you can see this"
      >
        <div className={cn("flex items-center justify-between gap-3 py-2.5", DETAIL_PAD)}>
          <span className="text-13 leading-none text-ink-tertiary">Status</span>
          <StatusBadge kind={listing.badge?.kind ?? "pending"} label={listing.badge?.label} />
        </div>
        {notes && (
          <div className={cn("border-t border-divider py-3", DETAIL_PAD)}>
            <div className="text-11 uppercase leading-none tracking-[0.4px] text-ink-tertiary">From the review team</div>
            <p className="mt-1.5 text-13 leading-[1.45] text-ink-secondary">{notes}</p>
          </div>
        )}
        <div className="divide-y divide-divider border-t border-divider pb-1">
          <DetailRow
            label="Your number"
            value={o.contact?.public ? "Shown to buyers" : "Hidden — buyers must request it"}
          />
          <DetailRow
            label="Ownership proof"
            value={o.hasOwnershipProof ? (o.ownershipProofType ? `Uploaded · ${o.ownershipProofType}` : "Uploaded") : "Not uploaded"}
          />
          {o.contact?.alt && <DetailRow label="Alternate number" value={String(o.contact.alt)} />}
          {listing.postedOn && <DetailRow label="Posted on" value={listing.postedOn} />}
        </div>
      </DetailSection>
    </>
  );
}

function StatusStrip({ tone, icon, text }: { tone: "info" | "warning" | "error"; icon: "clock" | "alert" | "check-circle"; text: string }) {
  const tones = {
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    error: "bg-error-soft text-error",
  } as const;
  return (
    <div className={cn("flex shrink-0 items-center gap-2 px-4 py-2.5", tones[tone])}>
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="text-13 leading-[1.4] text-ink-primary">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fullscreen viewer
// ---------------------------------------------------------------------------

/**
 * Fullscreen viewer (designs/P4 `viewer`).
 *
 * Zoom is CSS transform only — no layout, so it stays at 60fps (CLAUDE.md
 * rule 9). Double-tap toggles 1× / 2.5×; pinch drives the same scale. While
 * zoomed the drag pans instead of changing photo, which is what stops a pan
 * from skipping to the next image mid-inspection.
 */
export function PhotoViewer({
  photos, index, onIndex, onClose, onShare,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onShare: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const gesture = useRef<{ startX: number; startY: number; panX: number; panY: number; pinch: number | null; lastTap: number }>({
    startX: 0, startY: 0, panX: 0, panY: 0, pinch: null, lastTap: 0,
  });

  const photo = photos[Math.min(index, photos.length - 1)];
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const go = (next: number) => { if (next < 0 || next >= photos.length) return; onIndex(next); reset(); };

  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  return (
    <div
      className="fixed inset-0 z-viewer flex touch-none select-none flex-col bg-black"
      onTouchStart={(e) => {
        const g = gesture.current;
        if (e.touches.length === 2) { g.pinch = dist(e.touches); return; }
        g.startX = e.touches[0].clientX;
        g.startY = e.touches[0].clientY;
        g.panX = pan.x;
        g.panY = pan.y;
        const now = Date.now();
        if (now - g.lastTap < 280) { scale > 1 ? reset() : setScale(2.5); g.lastTap = 0; }
        else g.lastTap = now;
      }}
      onTouchMove={(e) => {
        const g = gesture.current;
        if (e.touches.length === 2 && g.pinch) {
          setScale(Math.min(4, Math.max(1, (dist(e.touches) / g.pinch) * scale)));
          g.pinch = dist(e.touches);
          return;
        }
        if (scale > 1) {
          setPan({ x: g.panX + (e.touches[0].clientX - g.startX), y: g.panY + (e.touches[0].clientY - g.startY) });
        }
      }}
      onTouchEnd={(e) => {
        const g = gesture.current;
        g.pinch = null;
        // Swipe between photos only at 1× — a pan while zoomed must not skip.
        if (scale === 1 && e.changedTouches.length === 1) {
          const dx = e.changedTouches[0].clientX - g.startX;
          if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
        }
      }}
    >
      {/* Top bar — designs/P4 S2: close LEFT, counter centred, share RIGHT */}
      <div className="z-[5] flex shrink-0 items-center px-2 py-1.5 safe-top">
        <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center text-white">
          <Icon name="close" size={24} />
        </button>
        <span className="flex-1 text-center text-13 leading-none text-white">
          {index + 1} / {photos.length}
        </span>
        <button aria-label="Share" onClick={onShare} className="grid h-11 w-11 place-items-center text-white">
          <Icon name="share" size={21} />
        </button>
      </div>

      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
        {photos.length > 1 && (
          <button
            aria-label="Previous photo"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="absolute left-1.5 top-1/2 z-[4] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.12] text-white disabled:opacity-0"
          >
            <Icon name="chevron-left" size={22} />
          </button>
        )}

                <Img
          src={photo?.url ?? ""}
          alt={photo?.altText ?? ""}
          data-protected="true"
          onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
          style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}
          className="h-full w-full object-contain transition-transform duration-150 ease-out-quart will-change-transform"
        />

        {photos.length > 1 && (
          <button
            aria-label="Next photo"
            onClick={() => go(index + 1)}
            disabled={index === photos.length - 1}
            className="absolute right-1.5 top-1/2 z-[4] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.12] text-white disabled:opacity-0"
          >
            <Icon name="chevron-right" size={22} />
          </button>
        )}
      </div>

      {/* caption + thumbnail filmstrip */}
      <div className="shrink-0 px-0 pb-1 pt-2 text-center text-11 leading-none text-white/70">
        {photo?.altText ?? ""}
      </div>
      {photos.length > 1 && (
        <div className="hz-x flex shrink-0 justify-center gap-1.5 px-3 pb-3.5 pt-2 safe-bottom">
          {photos.map((p, i) => (
            <button
              key={p.id}
              aria-label={`Photo ${i + 1}`}
              onClick={() => go(i)}
              className={cn(
                "h-12 w-12 shrink-0 overflow-hidden rounded-4 border-2",
                i === index ? "border-white" : "border-transparent opacity-60",
              )}
            >
                            <Img src={p.url ?? ""} alt="" data-protected="true" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell showNav={false} className="flex flex-col">
      {children}
    </AppShell>
  );
}

/**
 * The morphing header: transparent buttons floating over the hero photo,
 * turning into a solid bar with the listing title once the photo has scrolled
 * away.
 *
 * It listened to `window.scroll` (and to a `[data-detail-scroll]` element that
 * nothing has ever rendered), but AppShell scrolls its own `<main>` — so the
 * listener fired on nothing and the bar NEVER went solid: the title never
 * appeared and white glyphs stayed white over white content. An
 * IntersectionObserver on a sentinel at the bottom of the hero doesn't care
 * which element scrolls, which is exactly why it works here.
 */
function DetailHeader({
  title, saved, canSave = true, canShare = true, onBack, onSave, onShare, onMore,
}: {
  title: string;
  saved: boolean;
  /** Owner viewing their own listing — no bookmark control. */
  canSave?: boolean;
  /** Only a live listing has a link a visitor can actually open. */
  canShare?: boolean;
  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const solid = useScrolledPastHero();

  // Transparent state is a top scrim gradient with white, shadowed glyphs.
  const btn = cn(
    "grid h-11 w-11 shrink-0 place-items-center",
    solid ? "text-ink-primary" : "text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.5))]",
  );

  return (
    <>
      <div
        className={cn(
          // 52px is the design's app-bar height
          "fixed inset-x-0 top-0 z-header mx-auto flex h-[52px] max-w-column items-center gap-0.5 px-1.5 safe-top transition-colors duration-200",
          solid
            ? "border-b border-border bg-surface-1"
            : "border-b border-transparent bg-gradient-to-b from-black/35 to-transparent",
        )}
      >
        <button aria-label="Back" onClick={onBack} className={btn}><Icon name="chevron-left" size={22} /></button>
        <span
          className={cn(
            "flex-1 truncate px-1 text-center text-15 font-semibold leading-[1.2] text-ink-primary transition-opacity duration-200",
            solid ? "opacity-100" : "opacity-0",
          )}
        >
          {title}
        </span>
        {canSave && (
          <button aria-label={saved ? "Remove from saved" : "Save"} onClick={onSave} className={btn}>
            <Icon name="bookmark" size={21} filled={saved} />
          </button>
        )}
        {canShare && (
          <button aria-label="Share" onClick={onShare} className={btn}><Icon name="share" size={21} /></button>
        )}
        <button aria-label="More" onClick={onMore} className={btn}><Icon name="more" size={21} /></button>
      </div>
    </>
  );
}

/**
 * Scroll state for the morphing header, shared by both detail screens.
 *
 * It watches the HERO element (`data-detail-hero`, set by DetailHero) and flips
 * once most of the photo has gone under the bar. An IntersectionObserver has no
 * opinion about which element scrolls — which is the whole point, because the
 * previous scroll listener was attached to `window` while AppShell scrolls its
 * own `<main>`, so it never fired once.
 */
export function useScrolledPastHero() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = document.querySelector("[data-detail-hero]");
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setSolid(entry.intersectionRatio < 0.32),
      { rootMargin: "-52px 0px 0px 0px", threshold: [0, 0.15, 0.32, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return solid;
}
