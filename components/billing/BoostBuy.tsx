"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, useToast } from "./ui";
import { billingApi } from "@/lib/billing/client";
import { BackButton, Checklist, MicroBadge, Radio, SectionLabel } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * P11 S4 — Boost purchase.
 *
 * Eligible listings, durations and rates all come from
 * `/billing/boost/eligible` — the rates are admin-editable, and eligibility is
 * a server verdict. Ineligible listings are rendered dimmed with their lock
 * label (as designed) and are not selectable; the server refuses them at
 * checkout too, so the dimming is never the actual control (Doc2 §13).
 */

const TARGET_LABELS: Record<string, { title: string; sub?: string }> = {
  area: { title: "This area only", sub: "Reach: local buyers" },
  city: { title: "Whole city" },
  state: { title: "Whole state" },
  india: { title: "All India" },
};

export function BoostBuy() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [data, setData] = useState<Awaited<ReturnType<typeof billingApi.boostEligible>> | null>(null);
  const [listingId, setListingId] = useState<string | null>(params.get("listing"));
  const [duration, setDuration] = useState<string | null>(null);
  const [targeting, setTargeting] = useState("area");
  const [infoOpen, setInfoOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const res = await billingApi.boostEligible();
    setData(res);
    if (res.ok) {
      // Preselect the first eligible listing + the best-value duration, matching
      // the design's default selection.
      setListingId((cur) => cur ?? res.data.listings.find((l) => l.eligible)?.id ?? null);
      setDuration((cur) => cur ?? (res.data.durations.find((d) => d.bestValue)?.code ?? res.data.durations[0]?.code ?? null));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <BoostBuySkeleton />;

  if (!data.ok) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">Couldn&apos;t load boost options.</p>
          <Button variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      </Shell>
    );
  }

  const d = data.data;
  const eligible = d.listings.filter((l) => l.eligible);
  const selectedListing = d.listings.find((l) => l.id === listingId) ?? null;
  const selectedDuration = d.durations.find((x) => x.code === duration) ?? null;
  const targetLabel = selectedListing
    ? { area: selectedListing.areaLabel ?? "This area", city: "Your city", state: "Your state", india: "All India" }[targeting]!
    : TARGET_LABELS[targeting].title;

  if (!eligible.length) {
    return (
      <Shell onInfo={() => setInfoOpen(true)}>
        <EmptyState
          className="pt-10"
          title="No listings to boost yet"
          subtitle="Only approved, live listings can be boosted. Publish a listing first."
          illustration={<Icon name="rocket" size={96} className="text-ink-disabled" />}
          cta={{ label: "Go to My Listings", onClick: () => router.push("/") }}
        />
        <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
      </Shell>
    );
  }

  const pay = async () => {
    if (!listingId || !selectedDuration) return;
    setPaying(true);
    // Boost checkout reuses the one server-priced flow; the amount is the
    // catalog rate, never the figure rendered here.
    const qs = new URLSearchParams({
      plan: selectedDuration.code,
      listing: listingId,
      targeting,
      targetLabel,
      next: "/boost",
    });
    router.push(`/checkout?${qs.toString()}`);
  };

  return (
    <Shell onInfo={() => setInfoOpen(true)}>
      <div className="flex flex-col gap-4 p-4">
        <SectionLabel>Select a listing</SectionLabel>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1.5">
          {d.listings.map((l) => (
            <button
              key={l.id}
              disabled={!l.eligible}
              onClick={() => setListingId(l.id)}
              className={cn(
                "relative w-[120px] shrink-0 overflow-hidden rounded-8 border-[1.5px] text-left",
                listingId === l.id ? "border-accent" : "border-border",
                !l.eligible && "opacity-50",
              )}
            >
              <span className="grid h-[120px] w-[120px] place-items-center bg-surface-3 text-ink-tertiary">
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="image" size={36} />
                )}
              </span>
              {listingId === l.id && l.eligible && (
                <span className="absolute right-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-accent text-white">
                  <Icon name="check" size={14} strokeWidth={2.5} />
                </span>
              )}
              {l.lockLabel && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Icon name="lock" size={12} /> {l.lockLabel}
                </span>
              )}
              <span className="block p-2">
                <span className="block text-13 font-semibold text-ink-primary">{l.price}</span>
                <span className="block truncate text-11 text-ink-tertiary">{l.title}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="-mt-2 text-11 leading-[1.45] text-ink-tertiary">Only approved, live listings can be boosted.</p>

        <SectionLabel>Choose duration</SectionLabel>
        <div className="flex gap-3">
          {d.durations.map((x) => (
            <button
              key={x.code}
              onClick={() => setDuration(x.code)}
              className={cn(
                "relative flex-1 rounded-12 border-[1.5px] p-3.5 text-left",
                duration === x.code ? "border-accent" : "border-border",
              )}
            >
              <span className="absolute right-3 top-3"><Radio on={duration === x.code} /></span>
              {x.bestValue && <MicroBadge className="mb-1 inline-block">Best Value</MicroBadge>}
              <span className="block text-17 font-semibold text-ink-primary">{x.label}</span>
              <span className="my-0.5 block text-24 font-bold text-ink-primary">{x.price}</span>
              <span className="block text-11 text-ink-tertiary">{x.perDay}</span>
            </button>
          ))}
        </div>

        <SectionLabel>Where to show</SectionLabel>
        <div>
          {d.targets.map((t, i) => {
            const meta = TARGET_LABELS[t.key];
            const title = t.key === "area" && selectedListing?.areaLabel
              ? `This area only — ${selectedListing.areaLabel}`
              : meta.title;
            return (
              <button
                key={t.key}
                onClick={() => setTargeting(t.key)}
                className={cn(
                  "flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left",
                  i < d.targets.length - 1 && "border-b border-divider",
                )}
              >
                <Radio on={targeting === t.key} />
                <span className="flex-1">
                  <span className="block text-15 text-ink-primary">{title}</span>
                  {meta.sub && <span className="block text-11 text-ink-tertiary">{meta.sub}</span>}
                </span>
                {t.reach && (
                  <span className="chrome inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-11 font-semibold text-ink-secondary">{t.reach}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-11 leading-[1.45] text-ink-tertiary">
          Wider targeting doesn&apos;t cost more — but local buyers convert better.
        </p>

        <div className="rounded-12 bg-surface-2 p-4">
          <div className="py-1.5 text-13 text-ink-primary">Listing: {selectedListing?.title ?? "—"}</div>
          <div className="py-1.5 text-13 text-ink-primary">Duration: {selectedDuration?.label ?? "—"}</div>
          <div className="py-1.5 text-13 text-ink-primary">Targeting: {targetLabel}</div>
          <div className="my-2 h-px bg-divider" />
          <div className="flex items-baseline justify-between">
            <span className="text-15 font-semibold text-ink-primary">Total</span>
            <span className="text-20 font-bold text-accent">{selectedDuration?.price ?? "—"}</span>
          </div>
        </div>

        <p className="text-11 leading-[1.45] text-ink-tertiary">
          Boosts start after admin approval. If a boost is rejected, you&apos;re refunded automatically.
        </p>
      </div>

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        <Button fullWidth loading={paying} disabled={!listingId || !selectedDuration} onClick={() => void pay()}>
          Continue to Payment — {selectedDuration?.price ?? ""}
        </Button>
      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
    </Shell>
  );
}

/**
 * The loading state, shared with the route's Suspense fallback. `useSearchParams`
 * forces a Suspense boundary here, and a `null` fallback painted a blank frame
 * before hydration — the designed skeleton never got a chance to show.
 */
export function BoostBuySkeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-[170px] w-full rounded-12" />
        <Skeleton className="h-[120px] w-full rounded-12" />
        <Skeleton className="h-[200px] w-full rounded-12" />
      </div>
    </Shell>
  );
}

function Shell({ children, onInfo }: { children: React.ReactNode; onInfo?: () => void }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/boost" />}
          title="Boost listing"
          centerTitle
          right={onInfo ? <Button variant="icon" aria-label="How boost works" onClick={onInfo}><Icon name="info" /></Button> : undefined}
        />
      }
    >
      {children}
    </AppShell>
  );
}

function InfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="How boost works">
      <div className="pb-2">
        <Checklist
          items={[
            "Your listing appears at the top of the feed, first in stories and top of search in the areas you choose.",
            "Boosted listings show a 'Promoted' tag.",
            "Detailed analytics aren't provided — you'll see the boost status only.",
            "Boosts need admin approval before going live (usually within a few hours).",
          ]}
        />
      </div>
    </BottomSheet>
  );
}
