"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type MyListing } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P6 S6 — My Listings manager (Doc7 §56).
 *
 * Status changes are consequential — marking sold archives the listing and
 * stops any running boost with no refund — so each one is a double-confirm
 * carrying its consequence line (Doc2 §15).
 */
export function MyListings() {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<{
    items: MyListing[];
    counts: { live: number; pending: number; action: number };
    filters: { key: string; label: string; count: number }[];
  } | null>(null);
  const [offline, setOffline] = useState(false);
  const [sheetFor, setSheetFor] = useState<MyListing | null>(null);
  const [confirm, setConfirm] = useState<{ listing: MyListing; action: string; title: string; body: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Trash is a separate query — `listMine` filters deleted rows out, which is
  // why `restore` had no way of being reached from anywhere.
  const [trash, setTrash] = useState<MyListing[]>([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const r = await listingsApi.mine();
    if (r.ok) { setData(r.data); setOffline(false); }
    else { setOffline(r.error.code === "OFFLINE"); setData({ items: [], counts: { live: 0, pending: 0, action: 0 }, filters: [] }); }
  }, []);

  const loadTrash = useCallback(async () => {
    const r = await listingsApi.trash();
    if (r.ok) setTrash(r.data.items);
  }, []);

  useEffect(() => { void load(); void loadTrash(); }, [load, loadTrash]);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = await listingsApi.setStatus(confirm.listing.id, confirm.action);
    setBusy(false);
    setConfirm(null);
    toast.show(r.ok ? "Listing updated" : "Couldn't update that listing");
    void load();
  };

  /** Answer the 2-month prompt. "No" marks it sold, which is what the design's
   *  "No, it's sold" button means — the server does the archiving. */
  const answerStill = async (l: MyListing, available: boolean) => {
    setBusy(true);
    const r = await listingsApi.stillAvailable(l.id, available);
    setBusy(false);
    toast.show(r.ok ? (available ? "Thanks — kept live" : "Marked as sold") : "Couldn't save that");
    void load();
  };

  const restore = async (l: MyListing) => {
    setBusy(true);
    const r = await listingsApi.setStatus(l.id, "restore");
    setBusy(false);
    toast.show(r.ok ? "Restored" : "Couldn't restore that listing");
    void loadTrash();
    void load();
  };

  if (!data) {
    return (
      <Shell>
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-12" />)}
        </div>
      </Shell>
    );
  }

  if (!data.items.length) {
    return (
      <Shell>
        {offline && <OfflineBanner />}
        <EmptyState
          className="pt-10"
          title="No listings yet"
          subtitle="Post your first property and it goes live after a quick review"
          illustration={<Icon name="home" size={96} className="text-ink-disabled" />}
          cta={{ label: "Create a listing", onClick: () => router.push("/create") }}
        />
      </Shell>
    );
  }

  // Client-side narrowing of a list the server already scoped to this seller —
  // the counts on the chips are the server's, so they can't disagree.
  const visible = data.items.filter((l) =>
    filter === "all" ? true
    : filter === "sold" || filter === "rented" ? l.availability === filter
    : l.status === filter,
  );

  return (
    <Shell>
      {offline && <OfflineBanner />}

      {/* Status filter chips (designs/P9 S6) */}
      <div className="hz-x flex gap-2 px-4 pt-3">
        {(data.filters ?? []).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-13 font-semibold leading-none",
              filter === f.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface-2 text-ink-primary",
            )}
          >
            {f.label}
            <span className={cn("text-11", filter === f.key ? "text-accent" : "text-ink-tertiary")}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {!visible.length && (
          <p className="py-10 text-center text-13 text-ink-secondary">
            Nothing in this filter yet.
          </p>
        )}
        {visible.map((l) => (
          <div key={l.id} className="overflow-hidden rounded-12 bg-surface-1 shadow-l1 dark:border dark:border-border dark:shadow-none">
            <div className="flex gap-3 p-3">
              <button onClick={() => router.push(`/listings/${l.id}`)} className="h-20 w-20 shrink-0 overflow-hidden rounded-8 bg-surface-3">
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="image" size={22} /></span>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink-primary">{l.title ?? "Untitled listing"}</span>
                  <StatusBadge kind={l.badge.kind as any} label={l.badge.label} />
                </div>
                <div className="mt-0.5 text-13 text-ink-primary">{l.price}</div>
                <div className="text-11 text-ink-tertiary">{l.areaLabel}</div>
              </div>

              <button onClick={() => setSheetFor(l)} aria-label="Listing options" className="grid h-11 w-11 shrink-0 place-items-center text-ink-secondary">
                <Icon name="more" />
              </button>
            </div>

            {/* The 2-month check-in. The lifecycle cron sets the flag and
                auto-hides 15 days later — so this is where the owner is
                actually asked, rather than the listing quietly disappearing. */}
            {l.stillAvailableAsked && (
              <div className="border-t border-divider bg-surface-2 px-3 py-2.5">
                <div className="text-13 font-semibold text-ink-primary">Is this still available?</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">
                  Listings are checked every 2 months. No answer within 15 days and it&apos;s hidden.
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="small" loading={busy} onClick={() => void answerStill(l, true)}>Yes, still available</Button>
                  <Button size="small" variant="outline" loading={busy} onClick={() => void answerStill(l, false)}>
                    No, it&apos;s sold
                  </Button>
                </div>
              </div>
            )}

            {/* Reviewer feedback the owner must act on (Doc2 §5.4). */}
            {l.reviewNotes && Object.keys(l.reviewNotes).length > 0 && (
              <div className="border-t border-divider bg-warning-soft px-3 py-2.5">
                <div className="text-11 font-semibold text-warning">Changes requested</div>
                {Object.entries(l.reviewNotes).map(([field, note]) => (
                  <div key={field} className="mt-1 text-11 leading-[1.45] text-ink-secondary">
                    <span className="font-semibold capitalize">{field.replace(/_/g, " ")}:</span> {note}
                  </div>
                ))}
                <Button size="small" className="mt-2" onClick={() => router.push(`/create/form?edit=${l.id}`)}>Edit listing</Button>
              </div>
            )}

            {l.rejectReason && (
              <div className="border-t border-divider bg-error-soft px-3 py-2.5">
                <div className="text-11 font-semibold text-error">Rejected — {l.rejectReason}</div>
                {l.isLocked && (
                  <div className="mt-1 text-11 leading-[1.45] text-ink-secondary">
                    This listing is locked after 3 rejections. Contact support to appeal.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Trash lives on its own screen (designs/P10 S4) — this is the entry
            row, so the manager isn't carrying a second list inside itself. */}
        {!!trash.length && (
          <button
            onClick={() => router.push("/listings/trash")}
            className="mt-2 flex w-full items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3 text-left"
          >
            <Icon name="trash" size={18} className="text-ink-secondary" />
            <span className="flex-1 text-13 font-semibold text-ink-primary">Recently deleted ({trash.length})</span>
            <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
          </button>
        )}
      </div>

      <BottomSheet open={!!sheetFor} onClose={() => setSheetFor(null)} title={sheetFor?.title ?? "Listing"}>
        <div className="pb-2">
          <SheetOption label="View listing" icon={<Icon name="home" size={20} />} onClick={() => { const l = sheetFor!; setSheetFor(null); router.push(`/listings/${l.id}`); }} />
          <SheetOption label="Edit" icon={<Icon name="camera" size={20} />} onClick={() => { const l = sheetFor!; setSheetFor(null); router.push(`/create/form?edit=${l.id}`); }} />
          {sheetFor?.canBoost && (
            <SheetOption label="Boost this listing" icon={<Icon name="rocket" size={20} />} onClick={() => { const l = sheetFor!; setSheetFor(null); router.push(`/boost/new?listing=${l.id}`); }} />
          )}
          {sheetFor?.canReactivate && (
            <SheetOption
              label="Re-activate"
              icon={<Icon name="refund" size={20} />}
              onClick={() => {
                const l = sheetFor!;
                setSheetFor(null);
                setConfirm({ listing: l, action: "reactivate", title: "Re-activate this listing?", body: "It uses the same slot (free) and goes back for a quick review.", label: "Re-activate" });
              }}
            />
          )}
          {sheetFor?.status === "live" && (
            <>
              <SheetOption
                label="Mark as sold"
                icon={<Icon name="check-circle" size={20} />}
                onClick={() => {
                  const l = sheetFor!;
                  setSheetFor(null);
                  setConfirm({ listing: l, action: "sold", title: "Mark as sold?", body: "The listing is archived, people who saved it are notified, and any running boost stops with no refund for unused days.", label: "Mark sold" });
                }}
              />
              <SheetOption
                label="Mark as rented"
                icon={<Icon name="check-circle" size={20} />}
                onClick={() => {
                  const l = sheetFor!;
                  setSheetFor(null);
                  // Same consequence as "sold": the server stops a running
                  // boost with no refund here too (Doc2 §15).
                  setConfirm({ listing: l, action: "rented", title: "Mark as rented?", body: "The listing is archived, and any running boost stops with no refund for unused days. You can re-activate it later for free using the same slot.", label: "Mark rented" });
                }}
              />
              <SheetOption
                label="Hide temporarily"
                icon={<Icon name="wifi-off" size={20} />}
                onClick={() => { const l = sheetFor!; setSheetFor(null); setConfirm({ listing: l, action: "hide", title: "Hide this listing?", body: "It stops appearing in the feed and search. You can unhide it any time.", label: "Hide" }); }}
              />
            </>
          )}
          {/* `hide` had no counterpart in the sheet, so a hidden listing could
              only come back via the lifecycle cron or not at all. */}
          {sheetFor?.status === "hidden" && (
            <SheetOption
              label="Unhide"
              icon={<Icon name="home" size={20} />}
              onClick={() => {
                const l = sheetFor!;
                setSheetFor(null);
                setConfirm({ listing: l, action: "unhide", title: "Unhide this listing?", body: "It appears in the feed and search again.", label: "Unhide" });
              }}
            />
          )}
          <SheetOption
            label="Delete"
            destructive
            icon={<Icon name="close" size={20} />}
            onClick={async () => {
              const l = sheetFor!;
              setSheetFor(null);
              if (!window.confirm("Delete this listing? It goes to trash for 30 days. Your listing slot is NOT returned.")) return;
              const r = await listingsApi.remove(l.id);
              toast.show(r.ok ? "Moved to trash — restorable for 30 days" : "Couldn't delete that listing");
              void load();
            }}
          />
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        loading={busy}
        destructive={confirm?.action === "sold"}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.label ?? "Confirm"}
      />
    </Shell>
  );
}

// Bottom nav stays on: My Listings is a destination, not a step inside the
// creation flow, so it must not dead-end (CLAUDE.md rule 6).
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell header={<Header left={<BackButton fallback="/" />} title="My Listings" centerTitle right={<span />} />}>
      {children}
    </AppShell>
  );
}
