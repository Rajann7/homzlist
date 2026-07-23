"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type Photo } from "@/lib/listings/client";
import { profileApi } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

/**
 * P6 S1 — Preview (Card | Full tabs), then submit for review.
 *
 * Both tabs render the SAME server payload the public detail screen uses, so
 * what the owner previews is exactly what a buyer will get — including the
 * number rule: if the number isn't public, it isn't in the payload, so the
 * preview genuinely can't show it either.
 */
export function Preview() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const listingId = params.get("listing") ?? "";

  const [listing, setListing] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState<"card" | "full">("card");
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [poster, setPoster] = useState<
    { name: string | null; photoUrl: string | null; roleLabel: string | null; isVerified: boolean } | null
  >(null);

  useEffect(() => {
    (async () => {
      const [l, p, me] = await Promise.all([
        listingsApi.get(listingId),
        listingsApi.photos(listingId),
        profileApi.me(),
      ]);
      if (l.ok) setListing(l.data.listing); else setFailed(true);
      if (p.ok) setPhotos(p.data.photos);
      // The poster row shows the real account — same name, photo, role and
      // verified tick a buyer would see on the feed card.
      if (me.ok) {
        const pr = me.data.profile;
        setPoster({
          name: pr.name,
          photoUrl: pr.photoUrl,
          roleLabel: pr.role ? pr.role[0].toUpperCase() + pr.role.slice(1) : null,
          isVerified: Boolean(pr.badges?.id || pr.badges?.rera),
        });
      }
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
    toast.show(res.data.already ? "Already submitted" : "Submitted for review");
    router.replace("/listings");
  };

  if (failed) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">We couldn&apos;t load that listing.</p>
          <Button variant="outline" onClick={() => router.push("/listings")}>Go to My Listings</Button>
        </div>
      </Shell>
    );
  }

  if (!listing) {
    return (
      <Shell>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="aspect-[4/5] w-full rounded-12" />
          <Skeleton className="h-6 w-32" />
        </div>
      </Shell>
    );
  }

  const cover = photos[0]?.url ?? listing.coverUrl;

  return (
    <Shell onSubmit={listing.status === "draft" ? () => setConfirm(true) : undefined}>
      <div className="chrome flex border-b border-divider">
        {(["card", "full"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("relative h-11 flex-1 text-15 font-semibold", tab === t ? "text-ink-primary" : "text-ink-tertiary")}
          >
            {t === "card" ? "Feed card" : "Full listing"}
            {tab === t && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-sm bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "card" ? (
        /* Feed context: surface-2 page tint behind the card (design S1). */
        <div className="bg-surface-2 p-4">
          <article className="overflow-hidden rounded-12 bg-surface-1 shadow-l1 dark:border dark:border-border dark:shadow-none">
            {/* 4:5 carousel with dots + counter */}
            <div className="relative aspect-[4/5] bg-surface-3">
              {photos.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[slide]?.url ?? cover ?? ""} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={40} /></span>
              )}

              {photos.length > 1 && (
                <>
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-11 font-semibold text-white">
                    {slide + 1}/{photos.length}
                  </span>
                  <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                    {photos.map((p, i) => (
                      <button
                        key={p.id}
                        aria-label={`Photo ${i + 1}`}
                        onClick={() => setSlide(i)}
                        className={cn("h-1.5 w-1.5 rounded-full", i === slide ? "bg-white" : "bg-white/50")}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 p-3">
              {/* Price + For Sale / For Rent badge */}
              <div className="flex items-center gap-2">
                <span className="text-17 font-bold text-ink-primary">{listing.price}</span>
                <span
                  className={cn(
                    "rounded-4 px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px]",
                    listing.kind === "rent" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent",
                  )}
                >
                  {listing.kind === "rent" ? "For Rent" : "For Sale"}
                </span>
              </div>

              {/* Meta strip: specs · area · ₹/sqft — all derived from real values */}
              <div className="text-13 text-ink-secondary">{metaLine(listing)}</div>

              <div className="flex items-center gap-1 text-11 text-ink-tertiary">
                <Icon name="pin" size={13} /> {listing.areaLabel ?? "—"}
              </div>

              {/* Poster row */}
              <div className="mt-1 flex items-center gap-2 border-t border-divider pt-2.5">
                <Avatar url={poster?.photoUrl ?? null} name={poster?.name ?? ""} />
                <span className="truncate text-13 font-semibold text-ink-primary">{poster?.name ?? "You"}</span>
                {poster?.isVerified && <Icon name="verified" size={14} className="shrink-0 text-accent" />}
                {poster?.roleLabel && (
                  <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary">
                    {poster.roleLabel}
                  </span>
                )}
              </div>

              {/* Action bar — inert in preview, rendered exactly as the feed
                  shows it: 44px save box + View Property + Inquiry (designs/P6 S1). */}
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-8 border border-border bg-surface-2 text-ink-primary"
                  aria-hidden="true"
                >
                  <Icon name="bookmark" size={20} />
                </span>
                <span className="flex h-11 flex-1 items-center justify-center rounded-8 border border-border bg-surface-1 text-15 font-semibold text-ink-primary">
                  View Property
                </span>
                <span className="flex h-11 flex-1 items-center justify-center rounded-8 bg-accent text-15 font-semibold text-white">
                  Inquiry
                </span>
              </div>
            </div>
          </article>

          <p className="mt-3 text-center text-11 text-ink-tertiary">
            This is how your listing appears in the feed.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] bg-surface-3">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={40} /></span>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-24 font-bold leading-none text-ink-primary">{listing.priceOnly ?? listing.price}</span>
              <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none text-accent">
                {listing.kindLabel}
              </span>
            </div>

            <h1 className="mt-3 text-17 font-semibold leading-[1.3] text-ink-primary">
              {listing.title ?? listing.typeLabel}
            </h1>
            <div className="mt-[5px] flex items-center gap-[5px] text-13 leading-[1.3] text-ink-secondary">
              <Icon name="pin" size={15} className="text-ink-tertiary" />
              {listing.locationLabel ?? listing.areaLabel}
            </div>

            {/* Same server-computed strip the public detail renders */}
            {!!(listing.keySpecs ?? []).length && (
              <div className="mt-4 grid grid-cols-4 gap-0.5 rounded-12 bg-surface-2 px-2 py-3.5">
                {(listing.keySpecs as { value: string; label: string }[]).map((s) => (
                  <div key={s.label + s.value} className="text-center">
                    <div className="text-13 font-semibold leading-[1.1] text-ink-primary">{s.value}</div>
                    <div className="mt-[3px] text-11 leading-[1.2] text-ink-tertiary">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Labels resolved server-side from field_definitions — the preview
                must show what a buyer sees, not the raw attribute keys. */}
            {!!(listing.attributeRows ?? []).length && (
              <>
                <div className="mb-3 mt-5 text-13 font-semibold leading-none text-ink-secondary">Details</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {(listing.attributeRows as { key: string; label: string; value: string }[]).map((a) => (
                    <div key={a.key}>
                      <div className="text-11 leading-none text-ink-tertiary">{a.label}</div>
                      <div className="mt-[3px] text-15 leading-[1.3] text-ink-primary">{a.value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!!(listing.amenities ?? []).length && (
              <>
                <div className="mb-3 mt-5 text-13 font-semibold leading-none text-ink-secondary">Amenities</div>
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map((a: string) => (
                    <span
                      key={a}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-surface-2 px-3 text-13 font-semibold leading-none text-ink-primary"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </>
            )}

            {listing.description && (
              <>
                <div className="mb-2 mt-5 text-13 font-semibold leading-none text-ink-secondary">Description</div>
                <p className="whitespace-pre-wrap text-15 leading-[1.5] text-ink-secondary selectable">
                  {listing.description}
                </p>
              </>
            )}

            {/* Contact preview strip — the design's two exact variants */}
            <div className="mt-4 flex items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
              <Icon name="phone" size={16} className="shrink-0 text-ink-tertiary" />
              <span className="text-13 leading-[1.3] text-ink-secondary">
                {listing.contactPublic
                  ? "Your number is public — buyers see Call and WhatsApp."
                  : "Your number stays hidden — buyers request it and you approve."}
              </span>
            </div>

            {/* Safety note (design: warning tint + shield) */}
            <div className="mt-3 flex gap-2 rounded-8 bg-warning-soft px-3.5 py-3">
              <Icon name="shield" size={16} className="mt-px shrink-0 text-warning" />
              <p className="text-11 leading-[1.5] text-ink-secondary">
                Never pay token or advance before a site visit.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        {listing.status !== "draft" ? (
          <>
            <div className="mb-3 flex items-center justify-center gap-2">
              <StatusBadge kind="pending" label="Under review" />
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
    </Shell>
  );
}

function Shell({ children, onSubmit }: { children: React.ReactNode; onSubmit?: () => void }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/create" />}
          title="Preview"
          centerTitle
          // designs/P6 S1 also puts the submit action in the top bar
          right={
            onSubmit ? (
              <button onClick={onSubmit} className="px-2 text-13 font-semibold leading-none text-accent">
                Submit for review
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

/**
 * Feed-card meta line: "3 BHK · 1,450 sqft · ₹5,862/sqft".
 *
 * Built from the SERVER's `keySpecs` / `pricePerSqft`, not by re-reading the
 * attribute map. The previous version looked up `built_up_area` and `floor_no`,
 * which are not the stored keys (`builtup_area`, `floor`) — so every card
 * silently fell through to the bare type label.
 */
function metaLine(l: any): string {
  const specs = (l.keySpecs ?? []) as { value: string; label: string }[];
  const parts: string[] = [];

  const bhk = specs.find((s) => s.label === "Bedrooms");
  if (bhk) parts.push(bhk.value);

  const area = specs.find((s) => s.label === "Sqft");
  if (area) parts.push(`${area.value} sqft`);

  if (l.pricePerSqft) parts.push(String(l.pricePerSqft).replace(/\s*\/\s*/, "/"));

  return parts.length ? parts.join(" · ") : l.typeLabel;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-11 font-semibold text-ink-secondary">
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
