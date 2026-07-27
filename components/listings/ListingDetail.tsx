"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { listingsApi, type Photo, type MyListing } from "@/lib/listings/client";
import { InquirySheet, MoreSheet, ShareSheet, ReportSheet, LoginSheet } from "@/components/feed/sheets";
import { interactionsApi, feedApi, type FeedCard } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * P4 — Property detail.
 *
 * The sticky bottom bar changes with the CONTACT MODE, and that mode is the
 * server's (Doc2 §5.1): if the owner didn't publish their number, the payload
 * contains no number at all, so the only thing this screen can offer is
 * "Request number". There is no client-side branch that could leak it.
 */
/** One titled block of the detail screen, as the server groups it. */
interface AttrGroup { key: string; label: string; rows: { key: string; label: string; value: string }[] }

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
  const [sheet, setSheet] = useState<null | "inquiry" | "more" | "share" | "report" | "login">(null);
  const [reqBusy, setReqBusy] = useState(false);

  // Persist the wishlist heart for real (Module 6 `saves`), gated for guests.
  const toggleSave = async () => {
    if (isGuest) { setSheet("login"); return; }
    setSaved((s) => !s); // optimistic
    const res = await interactionsApi.toggleSave(id);
    if (res.ok) { setSaved(res.data.saved); toast.show(res.data.saved ? "Saved" : "Removed from saved"); }
    else { setSaved((s) => !s); toast.show("Couldn't save that"); }
  };

  // "Request Number" (owner withheld their number): the only way to reach them
  // is to start a chat request (Module 7). Sending the inquiry grows the pending
  // thread; the number exchange then happens inside it (Request → Allow).
  const requestNumber = async () => {
    if (isGuest) { setSheet("login"); return; }
    setReqBusy(true);
    const res = await interactionsApi.inquiry(id, {
      message: "Hi, I'm interested in this property — could you please share your contact number?",
      intents: [],
      shareNumber: true,
    });
    setReqBusy(false);
    if (res.ok) toast.show(res.data.alreadySent ? "Request updated — continue in Messages" : "Request sent — you'll be notified when they respond");
    else if (res.error.code === "SELF_ACTION_BLOCKED") toast.show("This is your own listing");
    else toast.show("Couldn't send that request");
  };

  useEffect(() => {
    (async () => {
      const l = await listingsApi.get(id);
      if (!l.ok) { setNotFound(true); return; }
      setListing(l.data.listing);
      const p = await listingsApi.photos(id);
      if (p.ok) setPhotos(p.data.photos);
      const s = await listingsApi.similar(id);
      if (s.ok) setSimilar(s.data.items);
    })();
  }, [id]);

  // A listing the viewer may not see is indistinguishable from one that never
  // existed — same 404 screen either way (Doc2 §5.4).
  /**
   * designs/P4 S5. A listing that was sold, rented, archived or never existed
   * all land here — deliberately, because naming the reason would confirm that
   * the id is real (Doc9 §7). The copy is the design's, which is already
   * non-committal ("may have been sold, rented or removed").
   */
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
          <div className="mt-5 text-[20px] font-bold leading-[1.3] text-ink-primary">
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
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-24 w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  const isOwner = Boolean(listing.owner);
  const sold = listing.availability !== "available";
  const underReview = isOwner && listing.status !== "live";
  const cover = photos[idx]?.url ?? listing.coverUrl;

  return (
    <Shell>
      <DetailHeader
        title={listing.title ?? listing.typeLabel ?? ""}
        saved={saved}
        // You don't wishlist your own property — it's already on your profile
        // and in My Listings, and the tap would land in the Saves metric you
        // read on your own insights screen. The server refuses it either way.
        canSave={!isOwner}
        // Sharing a link only makes sense for something a visitor can open. A
        // draft / under-review / hidden / sold listing 404s for everyone else,
        // so offering Share there hands out a dead link.
        canShare={listing.status === "live"}
        onBack={() => router.back()}
        onSave={() => void toggleSave()}
        onShare={() => {
          const url = window.location.href;
          if (navigator.share) void navigator.share({ title: listing.title ?? "", url });
          else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
        }}
        onMore={() => setSheet("more")}
      />

      {/* Hero carousel — designs/P4 S1: full-bleed 4:3 on black, with the
          overlays sitting ON the photo (the header is transparent over it). */}
      {/* shrink-0: the shell is a flex column, and an aspect-ratio-only child
          gets collapsed to nothing without it. */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={photos[idx]?.altText ?? listing.title ?? ""}
            data-protected="true"
            onClick={() => setViewer(true)}
            className={cn("h-full w-full cursor-pointer object-cover", sold && "grayscale")}
          />
        ) : (
          <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={40} /></span>
        )}

        {listing.status === "pending_review" && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rotate-[-24deg] text-[44px] font-bold uppercase tracking-[2px] text-white/[0.28]">
              Under Review
            </span>
          </span>
        )}

        {listing.promoted && (
          <span className="absolute left-3 top-14 rounded-4 bg-black/60 px-2.5 py-1.5 text-11 font-semibold uppercase tracking-[0.3px] leading-none text-white">
            Promoted
          </span>
        )}

        {photos.length > 1 && (
          <>
            <span className="absolute right-3 top-14 rounded-full bg-black/60 px-2.5 py-1.5 text-11 font-semibold leading-none text-white">
              {idx + 1}/{photos.length}
            </span>
            <span className="absolute inset-x-0 bottom-3 flex justify-center gap-[5px]">
              {photos.map((p, i) => (
                <span
                  key={p.id}
                  className={cn(
                    "h-[5px] rounded-full transition-[width,background-color]",
                    i === idx ? "w-[5px] bg-accent" : "w-[5px] bg-white/50",
                  )}
                />
              ))}
            </span>
          </>
        )}
      </div>

      {/* Full-bleed status strips (design: a tinted bar, not a card) */}
      {underReview && listing.status === "pending_review" && (
        <div className="flex shrink-0 items-center gap-2 bg-info-soft px-4 py-2.5">
          <Icon name="clock" size={16} className="shrink-0 text-info" />
          <span className="text-13 leading-[1.4] text-ink-primary">
            This listing is under review. It will go live once approved.
          </span>
        </div>
      )}
      {underReview && listing.status !== "pending_review" && (
        <div className="flex shrink-0 items-center gap-2 bg-warning-soft px-4 py-2.5">
          <Icon name="alert" size={16} className="shrink-0 text-warning" />
          <span className="text-13 leading-[1.4] text-ink-primary">
            {listing.status === "changes_requested"
              ? "Changes requested — update the highlighted details and resubmit."
              : listing.status === "rejected"
              ? "This listing was rejected."
              : "Only you can see this listing right now."}
          </span>
        </div>
      )}
      {sold && (
        <div className="flex shrink-0 items-center gap-2 bg-error-soft px-4 py-2.5">
          <Icon name="check" size={16} className="shrink-0 text-error" />
          <span className="text-13 leading-[1.4] text-ink-primary">
            {listing.availability === "rented" ? "This property has been rented." : "This property has been sold."}
          </span>
        </div>
      )}

      <div className="p-4 pb-28">
        {/* price + kind pill */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-24 font-bold text-ink-primary">{listing.priceOnly ?? listing.price}</span>
              {listing.isNegotiable && (
                <span className="rounded-4 bg-surface-2 px-2 py-1.5 text-11 font-semibold leading-none text-ink-secondary">
                  Negotiable
                </span>
              )}
            </div>
            {listing.pricePerSqft && (
              <div className="mt-[5px] text-13 leading-none text-ink-tertiary">{listing.pricePerSqft}</div>
            )}
          </div>
          <span className="mt-1 shrink-0 rounded-4 bg-accent-soft px-2.5 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
            {listing.kindLabel}
          </span>
        </div>

        <h1 className="mt-3.5 text-17 font-semibold leading-[1.35] text-ink-primary">
          {listing.title ?? listing.typeLabel}
        </h1>
        <div className="mt-[5px] flex items-center gap-[5px] text-13 leading-[1.3] text-ink-secondary">
          <Icon name="pin" size={15} className="text-ink-tertiary" />
          {listing.locationLabel ?? listing.areaLabel}
        </div>

        {/* key specs — fields chosen per property type in field_config */}
        {!!(listing.keySpecs ?? []).length && (
          <div className="mt-4 grid grid-cols-4 gap-0.5 rounded-12 bg-surface-2 px-2 py-3.5">
            {(listing.keySpecs as { icon: string; value: string; label: string }[]).map((s) => (
              <div key={s.label + s.value} className="flex flex-col items-center gap-[5px] text-center">
                <Icon name={s.icon as never} size={22} className="text-ink-secondary" />
                <span className="text-13 font-semibold leading-none text-ink-primary">{s.value}</span>
                <span className="text-11 leading-none text-ink-tertiary">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* highlights */}
        {!!(listing.highlights ?? []).length && (
          <div className="hz-x -mx-4 mt-4 flex gap-2 px-4">
            {(listing.highlights as string[]).map((h) => (
              <span
                key={h}
                className="flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-surface-2 px-3.5 text-13 font-semibold leading-none text-ink-primary"
              >
                {h}
              </span>
            ))}
          </div>
        )}

        {underReview && listing.owner?.rejectReason && (
          <div className="mt-4 rounded-8 bg-warning-soft p-3.5 text-11 leading-[1.45] text-ink-secondary">
            {listing.owner.rejectReason}
          </div>
        )}

        {/* Labels and values are resolved server-side from field_definitions —
            this used to print the raw map, so a buyer read "Bhk 3" and
            "Furnishing semi". */}
        {/* Grouped exactly as the creation form asked for them (migration 0055).
            A Flat carries twenty-seven details now; one flat two-column list of
            that length is a wall, and the seller filled it in as four short
            sections. The grouping is computed server-side so the preview, this
            screen and the public page cannot disagree. */}
        {!!(listing.attributeGroups ?? []).length && (
          <div className="mt-6 flex flex-col gap-5">
            {(listing.attributeGroups as AttrGroup[]).map((g) => (
              <section key={g.key}>
                <div className="mb-3 text-13 font-semibold leading-none text-ink-secondary">{g.label}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {g.rows.map((a) => (
                    <div key={a.key}>
                      <div className="text-11 leading-none text-ink-tertiary">{a.label}</div>
                      <div className="mt-[3px] text-15 leading-[1.3] text-ink-primary">{a.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-5 pt-5">

        {listing.description && (
          <div>
            <div className="mb-1.5 text-13 font-semibold text-ink-secondary">Description</div>
            <p className="whitespace-pre-wrap text-15 leading-[1.45] text-ink-primary selectable">{listing.description}</p>
          </div>
        )}

        {!!(listing.amenities ?? []).length && (
          <div>
            <div className="mb-2 text-13 font-semibold text-ink-secondary">Amenities</div>
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map((a: string) => (
                <span key={a} className="rounded-full bg-surface-2 px-3 py-1.5 text-13 text-ink-secondary">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Similar properties — matched server-side (same type/kind/city, ±35%
            on price), so the rule isn't reverse-engineerable from the client. */}
        {!!similar.length && (
          <div>
            <div className="mb-2 text-13 font-semibold text-ink-secondary">Similar properties</div>
            <div className="hz-x -mx-4 flex gap-3 px-4">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/property/${s.id}`)}
                  className="w-40 shrink-0 overflow-hidden rounded-12 bg-surface-1 text-left shadow-l1 dark:border dark:border-border dark:shadow-none"
                >
                  <span className="block aspect-[4/3] bg-surface-3">
                    {s.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={22} /></span>
                    )}
                  </span>
                  <span className="block p-2.5">
                    <span className="block truncate text-13 font-semibold text-ink-primary">{s.price}</span>
                    <span className="mt-0.5 block truncate text-11 text-ink-tertiary">{s.areaLabel}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Sticky bar — designs/P4 "sticky bottom bar". Which variant shows is
          decided by what the SERVER sent (a withheld number simply isn't in the
          payload), never by a local flag. */}
      <div className="sticky bottom-0 z-sticky mt-auto border-t border-border bg-surface-1 shadow-l2 safe-bottom">
        {isOwner && listing.owner?.stats && (
          <div className="grid grid-cols-3 border-b border-divider">
            {[
              { k: "Views", v: listing.owner.stats.views },
              { k: "Saves", v: listing.owner.stats.saves },
              { k: "Leads", v: listing.owner.stats.leads },
            ].map((s) => (
              <div key={s.k} className="px-1 py-2 text-center">
                {/* Saves and Leads have no table yet (P10 / P8). The server
                    sends null and we print "—" — never a fabricated 0. */}
                <div className="text-13 font-semibold leading-none text-ink-primary">
                  {s.v === null || s.v === undefined ? "—" : Number(s.v).toLocaleString("en-IN")}
                </div>
                <div className="mt-[3px] text-11 leading-none text-ink-tertiary">{s.k}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2.5">
          {isOwner ? (
            <>
              <Button variant="outline" fullWidth onClick={() => router.push(`/listings/${listing.id}`)}>Edit</Button>
              <Button variant="outline" fullWidth onClick={() => router.push(`/boost/new?listing=${listing.id}`)}>Boost</Button>
              <Button className="flex-[1.4] whitespace-nowrap" onClick={() => router.push(`/listings/${listing.id}`)}>
                {listing.kind === "rent" ? "Mark as Rented" : "Mark as Sold"}
              </Button>
            </>
          ) : sold ? (
            <Button variant="outline" fullWidth onClick={() => router.push("/search")}>
              Browse similar properties
            </Button>
          ) : listing.contact ? (
            <>
              <button
                aria-label="Call"
                onClick={() => (window.location.href = `tel:${listing.contact.number}`)}
                className="grid h-11 w-[52px] shrink-0 place-items-center rounded-8 border border-border bg-surface-1 text-ink-primary"
              >
                <Icon name="phone" size={20} />
              </button>
              {listing.contact.whatsapp && (
                <a
                  aria-label="WhatsApp"
                  href={`https://wa.me/${String(listing.contact.whatsapp).replace(/\D/g, "")}`}
                  className="grid h-11 w-[52px] shrink-0 place-items-center rounded-8 border border-accent bg-accent-soft text-accent"
                >
                  <Icon name="message" size={20} />
                </a>
              )}
              <Button fullWidth onClick={() => (isGuest ? setSheet("login") : setSheet("inquiry"))}>Send Inquiry</Button>
            </>
          ) : (
            <>
              {/*
                `flex-1 px-0` is what the design actually specifies for this
                pair: both buttons are `flex:1` with NO horizontal padding (see
                P4's sticky-bar markup). We had `fullWidth` (width:100%), which
                sizes from content instead of splitting evenly, plus the shared
                Button's default px-4 — together that left 111px for a label
                needing 115px, so "Request Number" wrapped onto two lines.
                Equal halves with centred text look identical; this only stops
                the wrap.
              */}
              <Button
                variant="outline"
                className="flex-1 px-0"
                loading={reqBusy}
                onClick={() => void requestNumber()}
              >
                <Icon name="phone" size={17} /> Request Number
              </Button>
              <Button className="flex-1 px-0" onClick={() => (isGuest ? setSheet("login") : setSheet("inquiry"))}>Send Inquiry</Button>
            </>
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
              onNotInterested={async () => {
                setSheet(null);
                if (isGuest) { setSheet("login"); return; }
                await feedApi.notInterested({ typeCode: listing.typeCode });
                toast.show("We'll show fewer like this");
              }}
            />
            <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} card={card} />
            <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} card={card} />
            <InquirySheet open={sheet === "inquiry"} onClose={() => setSheet(null)} card={card} />
            <LoginSheet open={sheet === "login"} onClose={() => setSheet(null)} />
          </>
        );
      })()}

      {/* Fullscreen photo viewer — pinch/double-tap zoom + navigation */}
      {viewer && cover && (
        <PhotoViewer
          photos={photos.length ? photos : [{ id: "cover", url: cover, altText: null } as Photo]}
          index={idx}
          onIndex={setIdx}
          onClose={() => setViewer(false)}
          onShare={() => {
            const url = window.location.href;
            if (navigator.share) void navigator.share({ title: listing.title ?? "", url });
            else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
          }}
        />
      )}
    </Shell>
  );
}

/**
 * Fullscreen viewer (designs/P4 `viewer`).
 *
 * Zoom is CSS transform only — no layout, so it stays at 60fps (CLAUDE.md
 * rule 9). Double-tap toggles 1× / 2.5×; pinch drives the same scale. While
 * zoomed the drag pans instead of changing photo, which is what stops a pan
 * from skipping to the next image mid-inspection.
 */
function PhotoViewer({
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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url ?? ""} alt="" data-protected="true" className="h-full w-full object-cover" />
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
 * The "morphing header" from designs/P4 S1: transparent buttons floating over
 * the hero photo, turning into a solid bar with the listing title once the
 * photo has scrolled away.
 */
function DetailHeader({
  title, saved, canSave = true, canShare = true, onBack, onSave, onShare, onMore,
}: {
  title: string;
  saved: boolean;
  /** Owner viewing their own listing — no wishlist control. */
  canSave?: boolean;
  /** Only a live listing has a link a visitor can actually open. */
  canShare?: boolean;
  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const scroller = document.querySelector("[data-detail-scroll]") ?? window;
    const onScroll = () => {
      const y = scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop;
      setSolid(y > 160); // design's threshold
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Transparent state is a top scrim gradient with white, shadowed glyphs —
  // not a pill behind each button (designs/P4 `hdrStyle` / `hdrBtn`).
  const btn = cn(
    "grid h-11 w-11 shrink-0 place-items-center",
    solid ? "text-ink-primary" : "text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.5))]",
  );

  return (
    <div
      className={cn(
        // 52px is the design's app-bar height
        "fixed inset-x-0 top-0 z-header flex h-[52px] items-center gap-0.5 px-1.5 safe-top transition-colors duration-200",
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
  );
}

