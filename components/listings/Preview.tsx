"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type Photo } from "@/lib/listings/client";
import { FeedCard } from "@/components/feed/FeedCard";
import { ProjectCard } from "@/components/feed/ProjectCard";
import type { FeedCard as CardData } from "@/lib/feed/client";
import { DetailHero, PropertyDetailBody, ProjectDetailBody } from "./detailBody";
import { PhotoViewer } from "./ListingDetail";
import { cn } from "@/lib/utils";

/**
 * P6 S1 — Preview (Card | Full tabs).
 *
 * Two subjects share this screen:
 *   ?listing=<id>  a property, previewed BEFORE it is submitted for review
 *   ?project=<id>  a builder project, previewed after it was posted
 *
 * Both tabs render the SAME components the public screens use, off the SAME
 * server payloads — the feed card comes from `/:kind/:id/card` and the full tab
 * from the shared detail body. That is what makes "this is what a buyer sees"
 * structurally true instead of a claim: when the card or the detail changes,
 * this screen changes with it. It used to hand-draw both, and both had drifted.
 *
 * The number rule holds either way: if a number isn't public the server doesn't
 * put it in the payload, so the preview genuinely cannot show it.
 */
export function Preview() {
  const params = useSearchParams();
  const projectId = params.get("project");
  return projectId ? <ProjectPreview id={projectId} /> : <ListingPreview id={params.get("listing") ?? ""} />;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

function ListingPreview({ id: listingId }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [listing, setListing] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState<"card" | "full">("card");
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Hero carousel index, shared with the fullscreen viewer, same as P4. */
  const [idx, setIdx] = useState(0);
  const [viewer, setViewer] = useState(false);
  /**
   * The feed card, BUILT BY THE SERVER (`/listings/:id/card`) and rendered with
   * the same component the feed uses.
   */
  const [card, setCard] = useState<CardData | null>(null);

  useEffect(() => {
    (async () => {
      const [l, p, c] = await Promise.all([
        listingsApi.get(listingId),
        listingsApi.photos(listingId),
        listingsApi.previewCard(listingId),
      ]);
      if (c.ok) setCard(c.data.card);
      if (l.ok) setListing(l.data.listing); else setFailed(true);
      if (p.ok) setPhotos(p.data.photos);
    })();
  }, [listingId]);

  /**
   * Submit, then REPLACE the history entry. Pushing would leave preview (and
   * the photos step behind it) reachable with the back button on a listing
   * that's already queued — which is what made "back" land on the old photo
   * screen after submitting.
   */
  const submit = async () => {
    setSubmitting(true);
    const res = await listingsApi.submit(listingId);
    setSubmitting(false);
    setConfirm(false);

    if (!res.ok) {
      const code = (res.error as any).code;
      toast.show(
        code === "VALIDATION_ERROR" ? "Add at least 1 photo before submitting"
        : code === "OFFLINE" ? "You're offline — try again in a moment"
        : "Couldn't submit right now",
      );
      return;
    }
    // P6 S3. The success screen has a `listing` variant with its own copy and
    // review timeline, and projects and requirements both route to it — a
    // listing dropped the seller straight onto the manager instead, so the one
    // screen that explains "under review, usually 24 hours" was unreachable
    // from the main flow. Re-submitting an already-queued listing skips it:
    // nothing new happened, so a fresh "Submitted" screen would be a lie.
    if (res.data.already) {
      toast.show("Already submitted");
      router.replace("/listings");
      return;
    }
    router.replace(`/create/success?kind=listing&id=${listingId}`);
  };

  if (failed) {
    return (
      <Shell title="Preview">
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">We couldn&apos;t load that listing.</p>
          <Button variant="outline" onClick={() => router.push("/listings")}>Go to My Listings</Button>
        </div>
      </Shell>
    );
  }

  if (!listing) return <LoadingShell title="Preview" />;

  const cover = photos[idx]?.url ?? listing.coverUrl;

  return (
    <Shell
      title="Preview"
      onSubmit={listing.status === "draft" ? () => setConfirm(true) : undefined}
      submitLabel="Submit for review"
    >
      <Tabs tab={tab} onTab={setTab} labels={["Feed card", "Full listing"]} />

      {tab === "card" ? (
        <CardTab
          note="This is how your listing appears in the feed."
          ready={Boolean(card)}
        >
          {card && (
            /* The REAL feed card, off the server's own card payload. Every
               control is inert here — this is a preview, not the feed — but
               the layout, the chips and the facts strip are the same code a
               buyer will scroll past. */
            <FeedCard
              card={card}
              onOpen={() => setTab("full")}
              onOpenPoster={() => toast.show("This opens your public profile in the feed")}
              onSave={() => toast.show("Buyers can save it once it's live")}
              onInquiry={() => toast.show("Buyers can inquire once it's live")}
              onMore={() => toast.show("Share and report open here for buyers")}
            />
          )}
        </CardTab>
      ) : (
        <>
          <DetailHero
            photos={photos}
            cover={cover}
            alt={photos[idx]?.altText ?? listing.title ?? ""}
            idx={idx}
            onOpenPhoto={photos.length ? () => setViewer(true) : undefined}
          />
          <PropertyDetailBody
            listing={listing}
            footer={<ContactAndSafety contactPublic={Boolean(listing.contactPublic)} />}
          />
        </>
      )}

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        {listing.status !== "draft" ? (
          <>
            <div className="mb-3 flex items-center justify-center gap-2">
              {/* The listing's OWN badge, off the server — this said "Under
                  review" for every non-draft status, including `live`. */}
              <StatusBadge kind={listing.badge?.kind ?? "pending"} label={listing.badge?.label} />
            </div>
            {/* replace, not push — this screen must not stay in history once the
                listing is submitted (Doc6 §5.2: no dead-ends, no re-entry). */}
            <Button fullWidth onClick={() => router.replace("/listings")}>Go to My Listings</Button>
          </>
        ) : (
          /* Design S1 sticky bottom: outline "Edit" + primary "Submit for Review" */
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/create/form?edit=${listingId}`)}
            >
              Edit
            </Button>
            {/* design gives Submit the wider share of the row (flex 1.4 vs 1) */}
            <Button className="flex-[1.4]" loading={submitting} onClick={() => setConfirm(true)}>
              Submit for Review
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={submit}
        loading={submitting}
        title="Submit this listing for review?"
        body="Our team reviews listings within 24 hours. You'll be notified once it's live."
        confirmLabel="Submit"
      />

      {/* The same fullscreen viewer a buyer gets on P4 — the preview's photo
          experience is the buyer's, not a still frame. */}
      {viewer && cover && (
        <PhotoViewer
          photos={photos.length ? photos : [{ id: "cover", url: cover, altText: null } as Photo]}
          index={idx}
          onIndex={setIdx}
          onClose={() => setViewer(false)}
          onShare={() => toast.show("Buyers can share it once it's live")}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * The builder's preview. A project is created on submit (payment-first draws the
 * ₹9,999 slot before anything is written), so unlike a listing it already exists
 * by the time it can be previewed — this screen shows what was posted rather
 * than gating the posting. There is no Submit here for that reason; the actions
 * are Edit and Go to My Listings.
 */
function ProjectPreview({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [project, setProject] = useState<any>(null);
  const [card, setCard] = useState<CardData | null>(null);
  const [brochure, setBrochure] = useState<{ url: string | null; scanned: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<"card" | "full">("card");
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  /** The scheme's gallery (0075) — the same rail a buyer will swipe. */
  const [projectPhotos, setProjectPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    (async () => {
      const [p, c, ph] = await Promise.all([
        listingsApi.getProject(id),
        listingsApi.previewProjectCard(id),
        listingsApi.projectPhotos(id),
      ]);
      if (c.ok) setCard(c.data.card);
      if (ph.ok) setProjectPhotos(ph.data.photos);
      if (p.ok) setProject(p.data.project); else { setFailed(true); return; }
      // The brochure link is signed and owner-only; the preview is the owner.
      const b = await listingsApi.brochure(id);
      if (b.ok) setBrochure(b.data.brochure);
    })();
  }, [id]);

  if (failed) {
    return (
      <Shell title="Preview">
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">We couldn&apos;t load that project.</p>
          <Button variant="outline" onClick={() => router.push("/listings")}>Go to My Listings</Button>
        </div>
      </Shell>
    );
  }

  if (!project) return <LoadingShell title="Preview" />;

  return (
    <Shell title="Preview">
      <Tabs tab={tab} onTab={setTab} labels={["Feed card", "Full project"]} />

      {tab === "card" ? (
        <CardTab note="This is how your project appears in the feed." ready={Boolean(card)}>
          {card && (
            <ProjectCard
              card={card}
              onOpen={() => setTab("full")}
              onOpenPoster={() => toast.show("This opens your builder profile in the feed")}
              // Inert on purpose: tapping these in the preview would record a
              // lead against your own project.
              onContact={() => toast.show("Buyers reach you here — Call and WhatsApp")}
              onMore={() => toast.show("Share and report open here for buyers")}
            />
          )}
        </CardTab>
      ) : (
        <>
          {/* The scheme's real gallery (0075) — the preview promises "this is
              what a buyer will see", so it must swipe like the detail does. */}
          <DetailHero
            photos={projectPhotos}
            cover={projectPhotos[0]?.url ?? project.coverUrl}
            alt={project.name ?? ""}
            idx={0}
          />
          <ProjectDetailBody
            project={project}
            openUnit={openUnit}
            onToggleUnit={setOpenUnit}
            onEnquireUnit={() => toast.show("Buyers can enquire about a unit once it's live")}
            brochure={brochure}
            footer={
              /* A builder's number is always public on a project (Doc2 §6), so
                 there is only one variant of this strip here. */
              <ContactAndSafety contactPublic />
            }
          />
        </>
      )}

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        <div className="mb-3 flex items-center justify-center gap-2">
          <StatusBadge kind={project.badge?.kind ?? "pending"} label={project.badge?.label} />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => router.push(`/projects/new?edit=${id}`)}>
            Edit
          </Button>
          <Button className="flex-[1.4]" onClick={() => router.replace("/listings")}>Go to My Listings</Button>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function Tabs({
  tab, onTab, labels,
}: { tab: "card" | "full"; onTab: (t: "card" | "full") => void; labels: [string, string] }) {
  return (
    <div className="chrome flex border-b border-divider">
      {(["card", "full"] as const).map((t, i) => (
        <button
          key={t}
          onClick={() => onTab(t)}
          className={cn("relative h-11 flex-1 text-15 font-semibold", tab === t ? "text-ink-primary" : "text-ink-tertiary")}
        >
          {labels[i]}
          {tab === t && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-sm bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/** Feed context: surface-2 page tint behind the card (design S1). */
function CardTab({ children, note, ready }: { children: React.ReactNode; note: string; ready: boolean }) {
  return (
    <div className="bg-surface-2 p-4">
      <div className="overflow-hidden rounded-12 bg-surface-1 shadow-l1 dark:border dark:border-border dark:shadow-none">
        {ready ? children : (
          <div className="flex flex-col gap-3 p-3">
            <Skeleton className="aspect-[16/9] w-full rounded-8" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-11 text-ink-tertiary">{note}</p>
    </div>
  );
}

/**
 * The design's two closing strips on the Full tab: contact preview + safety.
 * Own spacing wrapper, because the project body drops it straight after the
 * location line where nothing else supplies a gap.
 */
function ContactAndSafety({ contactPublic }: { contactPublic: boolean }) {
  return (
    /* Sits inside the detail body, so it keeps the body's card gutter — a
       full-bleed box here would be the only thing on the page touching both
       edges. */
    <div className="mx-2 mt-2 flex flex-col gap-2 sm:mx-3">
      {/* Contact preview strip — the design's two exact variants */}
      <div className="flex items-center gap-2 rounded-12 bg-surface-3 px-3.5 py-3">
        <Icon name="phone" size={16} className="shrink-0 text-ink-tertiary" />
        <span className="text-13 leading-[1.3] text-ink-secondary">
          {contactPublic
            ? "Your number is public — buyers see Call and WhatsApp."
            : "Your number stays hidden — buyers request it and you approve."}
        </span>
      </div>

      {/* Safety note (design: warning tint + shield) */}
      <div className="flex gap-2 rounded-12 bg-warning-soft px-3.5 py-3">
        <Icon name="shield" size={16} className="mt-px shrink-0 text-warning" />
        <p className="text-11 leading-[1.5] text-ink-secondary">
          Never pay token or advance before a site visit.
        </p>
      </div>
    </div>
  );
}

function LoadingShell({ title }: { title: string }) {
  return (
    <Shell title={title}>
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="aspect-[16/9] w-full rounded-12" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
    </Shell>
  );
}

function Shell({
  children, title, onSubmit, submitLabel,
}: { children: React.ReactNode; title: string; onSubmit?: () => void; submitLabel?: string }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/create" />}
          title={title}
          centerTitle
          // designs/P6 S1 also puts the submit action in the top bar
          right={
            onSubmit ? (
              <button onClick={onSubmit} className="px-2 text-13 font-semibold leading-none text-accent">
                {submitLabel}
              </button>
            ) : undefined
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
