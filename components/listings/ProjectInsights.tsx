"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { navigateAfterClose } from "@/lib/hooks/use-back-close";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type ProjectInsights as Insights } from "@/lib/listings/client";
import type { BadgeKind } from "@/components/ui/StatusBadge";
import { cn, publicHref } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * Project insights — the builder's equivalent of the P9 S5 listing screen,
 * opened by tapping a project tile on their own profile.
 *
 * Two metrics rather than four, on purpose: `saves` and `leads` are keyed to
 * `listings.id`, so a project has no such rows, and a card reading "0 Saves"
 * would be a number with nothing behind it. Views and shares are real
 * (migration 0051).
 */
export function ProjectInsights({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [p, setP] = useState<Insights | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [menu, setMenu] = useState(false);
  // The lifecycle actions this screen gained with migration 0079. Each one is
  // consequential (a paused boost, a released slot), so each is a confirm
  // carrying its consequence line rather than a one-tap action.
  const [confirm, setConfirm] = useState<"hide" | "unhide" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listingsApi.projectInsights(id);
    if (r.ok) { setP(r.data.project); setOffline(false); return; }
    if (r.error.code === "OFFLINE") { setOffline(true); return; }
    setNotFound(true);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** Share the public link. Nothing is counted — project shares have no table
   *  and the screen no longer claims a number for them. */
  const share = () => {
    setMenu(false);
    // Public url — the builder is on the seller host, the recipient is not.
    const url = publicHref(`/project/${id}`);
    if (navigator.share) void navigator.share({ title: p?.name ?? "", url });
    else { void navigator.clipboard?.writeText(url); toast.show("Link copied"); }
  };

  /** Hide / unhide / delete. Deleting leaves the screen — the project it was
   *  showing is in trash, so staying here would show insights for something the
   *  builder has just removed. */
  const runAction = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = confirm === "delete"
      ? await listingsApi.removeProject(id)
      : await listingsApi.setProjectStatus(id, confirm);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) {
      toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't update that project");
      return;
    }
    if (confirm === "delete") {
      toast.show("Moved to trash — restorable for 30 days");
      router.replace("/listings");
      return;
    }
    toast.show(confirm === "hide" ? "Project hidden" : "Project is live again");
    void load();
  };

  if (notFound) {
    return (
      <Shell onMore={null}>
        <div className="flex flex-col items-center px-6 pb-6 pt-16 text-center">
          <Icon name="chart" size={72} className="text-ink-tertiary" />
          <div className="mt-5 text-17 font-semibold text-ink-primary">No insights for this project</div>
          <p className="mt-2 max-w-[280px] text-13 leading-[1.45] text-ink-secondary">
            It may have been deleted, or it isn&apos;t yours.
          </p>
          <Button className="mt-5" onClick={() => router.push("/profile")}>Go to my profile</Button>
        </div>
      </Shell>
    );
  }

  if (!p) {
    return (
      <Shell onMore={null}>
        {offline && <OfflineBanner />}
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-24 w-full rounded-12" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-[92px] w-full rounded-12" />)}
          </div>
          <Skeleton className="h-28 w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell onMore={() => setMenu(true)}>
      {offline && <OfflineBanner />}

      <div className="p-4 pb-[100px]">
        {/* Project card */}
        <div className="rounded-12 border border-border bg-surface-1 p-3 shadow-l1 dark:shadow-none">
          <div className="flex gap-3">
            <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-8 bg-surface-3 text-ink-tertiary">
              {p.coverUrl ? (
                <Img src={p.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
              ) : (
                <Icon name="building" size={22} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-15 font-semibold text-ink-primary">{p.name}</div>
              <div className="mt-0.5 text-13 text-ink-tertiary">
                {[p.priceFrom ? `From ${p.priceFrom}` : null, p.areaLabel].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge kind={p.badge.kind as BadgeKind} label={p.badge.label} />
                {p.promoted && <StatusBadge kind="promoted" />}
              </div>
            </div>
          </div>
          {(p.buildStatusLabel || p.possessionLabel) && (
            <div className="mt-2.5 text-11 text-ink-tertiary">
              {[p.buildStatusLabel, p.possessionLabel ? `Possession ${p.possessionLabel}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Leads — the only metric on this screen, and the only one a builder
            can act on. Full width and tappable: it opens the Leads list, where
            the actual people are. */}
        <button
          onClick={() => router.push("/leads")}
          className="mt-3 flex w-full items-center gap-4 rounded-12 bg-accent-soft p-4 text-left active:opacity-80"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-24 font-bold tracking-[-0.2px] text-accent">
              {p.leads.toLocaleString("en-IN")}
            </span>
            <span className="mt-0.5 block text-13 font-semibold text-ink-primary">Leads</span>
            <span className="mt-0.5 block text-11 leading-[1.45] text-ink-secondary">
              {p.leads === 0
                ? "Nobody has asked to be put in touch about this project yet."
                : "People who tapped Call or WhatsApp on this project."}
            </span>
          </span>
          <Icon name="chevron-right" size={20} className="shrink-0 text-accent" />
        </button>

        {/* Units — a real count off `project_units`, and the thing a builder
            actually manages day to day. */}
        {p.totalUnits !== null && (
          <button
            onClick={() => router.push(`/projects/${p.id}`)}
            className="flex w-full items-center gap-3 rounded-12 bg-surface-2 p-4 text-left"
          >
            <div className="flex-1">
              <div className="text-15 font-semibold text-ink-primary">
                {p.availableUnits ?? 0} of {p.totalUnits} units available
              </div>
              <div className="mt-0.5 text-13 text-ink-secondary">Update which unit types are sold out</div>
            </div>
            <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
          </button>
        )}

        {/* Boost */}
        {p.promoted ? (
          <div className="mt-3 rounded-12 bg-accent-soft p-3">
            <div className="flex gap-3">
              <Icon name="rocket" size={26} className="shrink-0 text-accent" />
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">This project is boosted</div>
                <div className="text-13 leading-[1.45] text-ink-secondary">
                  It&apos;s appearing at the top of the feed, stories and search in your area.
                </div>
              </div>
            </div>
            <Button variant="outline" fullWidth className="mt-3" onClick={() => router.push("/boost")}>
              View boost status
            </Button>
          </div>
        ) : p.canBoost ? (
          <div className="mt-3 rounded-12 bg-accent-soft p-3">
            <div className="flex gap-3">
              <Icon name="rocket" size={26} className="shrink-0 text-accent" />
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">Boost this project</div>
                <div className="text-13 leading-[1.45] text-ink-secondary">
                  Appear at the top of the feed, stories and search in your area
                </div>
              </div>
            </div>
            <Button fullWidth className="mt-3" onClick={() => router.push(`/boost/new?listing=${p.id}&kind=project`)}>
              {p.boostFrom ? `Boost — from ${p.boostFrom}` : "Boost this project"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sticky bar */}
      <div className="sticky bottom-0 z-sticky mt-auto flex gap-2 border-t border-divider bg-page px-4 py-3 safe-bottom">
        <Button variant="outline" className="flex-1 px-0" onClick={() => router.push(`/projects/${p.id}`)}>Edit</Button>
        <Button
          variant="outline"
          className="flex-1 px-0"
          // A project that can't be boosted YET (still under review) used to
          // drop the builder on the Boosts list, which says "No boosts yet" and
          // explains nothing — tapping Boost looked like it did nothing at all.
          // The buy screen shows this very project dimmed with its reason, so
          // that is where it goes in every case except an already-running boost.
          onClick={() => router.push(p.promoted ? "/boost" : `/boost/new?listing=${p.id}&kind=project`)}
        >
          Boost
        </Button>
        <Button className="flex-1 px-0" onClick={() => router.push(`/project/${p.id}`)}>View</Button>
      </div>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Project options">
        <div className="pb-2">
          <SheetOption
            label="Edit project"
            icon={<Icon name="edit" size={20} />}
            onClick={() => { setMenu(false); navigateAfterClose(() => router.push(`/projects/${p.id}`)); }}
          />
          {(p.canBoost || p.promoted) && (
            <SheetOption
              label={p.promoted ? "View boost status" : "Boost project"}
              icon={<Icon name="rocket" size={20} />}
              onClick={() => { setMenu(false); navigateAfterClose(() => router.push(p.promoted ? "/boost" : `/boost/new?listing=${p.id}&kind=project`)); }}
            />
          )}
          {/* Only a live project has a link a visitor can open. */}
          {p.status === "live" && (
            <>
              <SheetOption label="Share" icon={<Icon name="share" size={20} />} onClick={share} />
              <SheetOption
                label="View public page"
                icon={<Icon name="building" size={20} />}
                onClick={() => { setMenu(false); navigateAfterClose(() => router.push(`/project/${p.id}`)); }}
              />
            </>
          )}

          {/* Hide / unhide / delete (migration 0079). None of these existed:
              this screen could show a project but never take one down, so a
              scheme posted by mistake was permanent and its slot with it. */}
          {p.status === "live" && (
            <SheetOption
              label="Hide temporarily"
              icon={<Icon name="wifi-off" size={20} />}
              onClick={() => { setMenu(false); setConfirm("hide"); }}
            />
          )}
          {p.status === "hidden" && (
            <SheetOption
              label="Unhide"
              icon={<Icon name="home" size={20} />}
              onClick={() => { setMenu(false); setConfirm("unhide"); }}
            />
          )}
          <SheetOption
            label="Delete project"
            destructive
            icon={<Icon name="close" size={20} />}
            onClick={() => { setMenu(false); setConfirm("delete"); }}
          />
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runAction}
        loading={busy}
        destructive={confirm === "delete"}
        title={
          confirm === "delete" ? "Delete this project?"
          : confirm === "hide" ? "Hide this project?"
          : "Unhide this project?"
        }
        body={
          confirm === "delete"
            ? "It goes to trash for 30 days — you can restore it from Recently deleted until then."
            : confirm === "hide"
              ? "It stops appearing in the feed and search. Any running boost pauses and keeps its unused days."
              : "It appears in the feed and search again, and a paused boost resumes with the days it had left."
        }
        // The slot line is the consequence that actually costs money, so it is
        // stated rather than implied — and it is the SERVER's rule: a project
        // that never went live gets its ₹9,999 slot back, one that did does not.
        consequence={
          confirm === "delete"
            ? p.status === "live" || p.status === "hidden"
              ? "Your project slot is not returned."
              : "It was never published, so your project slot comes back."
            : undefined
        }
        confirmLabel={confirm === "delete" ? "Delete" : confirm === "hide" ? "Hide" : "Unhide"}
      />
    </Shell>
  );
}

function Shell({ children, onMore }: { children: React.ReactNode; onMore: (() => void) | null }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/profile" />}
          title="Project insights"
          right={
            onMore ? (
              <button aria-label="Project options" onClick={onMore} className="grid h-11 w-11 place-items-center text-ink-primary">
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
