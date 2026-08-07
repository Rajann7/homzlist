"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { StatusBadge, type BadgeKind } from "@/components/ui/StatusBadge";
import { listingsApi, type MyListing } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

type ArchivedListing = MyListing & { archivedAt: string | null };

/**
 * P10 S5 — Archived (Doc4 §59). The owner's sold/rented listings, hidden from
 * feed and search. The list is the server's (GET /listings/archived). Restore is
 * the `reactivate` status action and is shown ONLY where the server allows it
 * (`canReactivate`, i.e. rented) — a sold listing is terminal, so it carries no
 * Restore rather than a button that would 400.
 */
export function Archived({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<ArchivedListing[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ArchivedListing | null>(null);

  const load = useCallback(async () => {
    const r = await listingsApi.archived();
    if (r.ok) { setItems(r.data.items); setOffline(false); }
    else { setOffline(r.error.code === "OFFLINE"); setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function restore(l: ArchivedListing) {
    setRestoreTarget(null);
    setBusy(l.id);
    const r = await listingsApi.setStatus(l.id, "reactivate");
    setBusy(null);
    if (!r.ok) { toast.show("Couldn't restore that"); return; }
    await load();
    // Content unchanged since approval → straight back live; otherwise re-review.
    toast.show(r.data.listing.status === "live" ? "Listing is live again" : "Listing sent for review");
  }

  const header = (
    <Header
      left={<BackButton fallback={`${base}/settings`} />}
      title="Archived"
      centerTitle
      right={
        <button aria-label={grid ? "List view" : "Grid view"} onClick={() => setGrid((g) => !g)} className="grid h-11 w-11 place-items-center text-ink-primary">
          <Icon name={grid ? "list" : "grid"} size={22} strokeWidth={1.7} />
        </button>
      }
    />
  );

  if (!items) {
    return (
      <AppShell header={header}>
        <div className="grid grid-cols-3 gap-[2px]">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-none" />)}</div>
      </AppShell>
    );
  }

  if (items.length === 0) {
    return (
      <AppShell header={header}>
        {offline && <OfflineStrip />}
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Icon name="archive" size={64} className="text-ink-disabled" strokeWidth={1.3} />
          <h3 className="text-17 font-semibold text-ink-primary">Nothing archived</h3>
          <p className="max-w-xs text-13 text-ink-secondary">Sold and rented listings move here automatically.</p>
          <Button className="mt-2" variant="outline" onClick={() => router.push(`${base}/listings`)}>My listings</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      {offline && <OfflineStrip />}
      <div className="mx-4 my-3 rounded-8 bg-surface-2 px-3 py-2.5 text-11 leading-[1.5] text-ink-tertiary">
        Archived listings are hidden from feed and search. Restore a rented one anytime — it uses the same slot.
      </div>

      {grid ? (
        <div className="grid grid-cols-3 gap-[2px]">
          {items.map((l) => (
            <button key={l.id} onClick={() => router.push(`${base}/listings/${l.id}/insights`)} className="relative aspect-square overflow-hidden bg-surface-3 active:opacity-80">
              {l.coverUrl ? (
                <Img src={l.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover opacity-70" />
              ) : (
                <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="home" size={30} /></span>
              )}
              <span className="chrome absolute bottom-1.5 left-1.5 rounded-4 bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{l.price}</span>
              <span className="chrome absolute left-1.5 top-1.5"><StatusBadge kind={l.badge.kind as BadgeKind} label={l.availability === "sold" ? "Sold" : l.availability === "rented" ? "Rented" : l.badge.label} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((l) => (
            <div key={l.id} className="flex items-start gap-3 px-4 py-3">
              <button onClick={() => router.push(`${base}/listings/${l.id}/insights`)} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-8 bg-surface-3 text-ink-tertiary">
                {l.coverUrl ? (
                  <Img src={l.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover opacity-60" />
                ) : (
                  <Icon name="home" size={22} />
                )}
              </button>
              <div className="min-w-0 flex-1 border-b border-divider pb-3">
                <div className="truncate text-15 font-semibold text-ink-primary">{l.title ?? "Untitled listing"}</div>
                <div className="text-13 text-ink-tertiary">{l.price}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge kind={l.badge.kind as BadgeKind} label={l.availability === "sold" ? "Sold" : l.availability === "rented" ? "Rented" : l.badge.label} />
                  {l.archivedAt && <span className="text-11 text-ink-tertiary">Archived {fmtDate(l.archivedAt)}</span>}
                </div>
                {l.canReactivate && (
                  <Button className="mt-2.5" variant="outline" size="small" disabled={busy === l.id} onClick={() => setRestoreTarget(l)}>
                    {busy === l.id ? "…" : "Restore"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-6" />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => { if (restoreTarget) void restore(restoreTarget); }}
        title="Restore this listing?"
        body="It becomes available again and reuses its original slot. If you've edited it since, it goes for a quick review first."
        confirmLabel="Restore"
      />
    </AppShell>
  );
}

function OfflineStrip() {
  return (
    <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
      <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
