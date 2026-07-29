"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Button, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, type MyListing } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

type TrashItem = MyListing & { daysLeft: number };

/**
 * P10 S4 — Recently deleted.
 *
 * Everything here is the server's: the list is scoped to the session user in
 * the query, and `daysLeft` is computed against the SERVER clock — a device
 * with a wrong date must not be able to show a listing as safe when it is
 * hours from being purged.
 *
 * "Delete now" runs the same purge the 30-day cron does
 * (lifecycle.purgeTrash), so the two paths cannot drift apart.
 */
export function Trash() {
  const toast = useToast();
  const [data, setData] = useState<{ items: TrashItem[]; trashDays: number } | null>(null);
  const [confirm, setConfirm] = useState<TrashItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listingsApi.trash();
    setData(r.ok ? (r.data as { items: TrashItem[]; trashDays: number }) : { items: [], trashDays: 30 });
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Projects live in this list too (migration 0079). They restore and purge
  // through their OWN endpoints — the listing routes know nothing about a
  // project id — so the row says which kind it is and the call follows.
  const isProject = (item: TrashItem) => item.subjectKind === "project";

  const restore = async (item: TrashItem) => {
    const proj = isProject(item);
    const r = proj
      ? await listingsApi.setProjectStatus(item.id, "restore")
      : await listingsApi.setStatus(item.id, "restore");
    toast.show(r.ok ? "Restored" : proj ? "Couldn't restore that project" : "Couldn't restore that listing");
    void load();
  };

  const purge = async () => {
    if (!confirm) return;
    setBusy(true);
    const proj = isProject(confirm);
    const r = proj ? await listingsApi.purgeProject(confirm.id) : await listingsApi.purge(confirm.id);
    setBusy(false);
    setConfirm(null);
    toast.show(r.ok ? "Deleted permanently" : proj ? "Couldn't delete that project" : "Couldn't delete that listing");
    void load();
  };

  if (!data) {
    return (
      <Shell>
        <div className="flex flex-col gap-3 p-4">
          {[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-12" />)}
        </div>
      </Shell>
    );
  }

  if (!data.items.length) {
    return (
      <Shell>
        <div className="flex flex-col items-center px-6 pt-16 text-center">
          <Icon name="trash" size={88} className="text-ink-disabled" />
          <div className="mt-4 text-17 font-semibold leading-[1.3] text-ink-primary">Trash is empty</div>
          <p className="mt-1 text-13 leading-[1.45] text-ink-secondary">
            Deleted listings appear here for {data.trashDays} days.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-surface-2 px-4 py-3 text-11 leading-[1.45] text-ink-secondary">
        Items are permanently deleted after {data.trashDays} days. Restoring a listing doesn&apos;t use a new slot.
      </div>

      <div className="flex flex-col gap-3 px-4 pb-6 pt-1">
        {data.items.map((item) => {
          const deletedAgo = data.trashDays - item.daysLeft;
          const warn = item.daysLeft <= 7;
          return (
            <div key={item.id} className="rounded-12 border border-border bg-surface-1 p-3">
              <div className="flex gap-3">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-8 bg-surface-2">
                  {item.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverUrl}
                      alt=""
                      data-protected="true"
                      className="h-full w-full object-cover opacity-60"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-tertiary">
                      <Icon name="image" size={20} />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-15 font-semibold leading-[1.2] text-ink-secondary">
                    {item.title || item.typeCode || "Untitled"}
                  </div>
                  <div className="mt-0.5 truncate text-13 text-ink-tertiary">
                    {[item.price, item.areaLabel].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {/* The chip already existed and always read "Listing" — it
                        is the row's kind, so it has to tell the truth now that
                        a project can be in here. */}
                    <span className="rounded-4 bg-surface-2 px-1.5 py-1 text-11 font-semibold leading-none text-ink-secondary">
                      {isProject(item) ? "Project" : "Listing"}
                    </span>
                    <span
                      className={cn(
                        "rounded-4 px-1.5 py-1 text-11 font-semibold leading-none",
                        warn ? "bg-warning-soft text-warning" : "bg-surface-2 text-ink-secondary",
                      )}
                    >
                      {deletedAgo <= 0 ? "Deleted today" : `Deleted ${deletedAgo}d ago`} · {item.daysLeft} days left
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" className="flex-1" onClick={() => void restore(item)}>Restore</Button>
                <button
                  onClick={() => setConfirm(item)}
                  className="px-2 text-13 font-semibold leading-none text-error"
                >
                  Delete now
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={purge}
        loading={busy}
        destructive
        title="Delete permanently?"
        body={confirm?.title ?? ""}
        consequence={
          confirm && isProject(confirm)
            ? "This cannot be undone, and the project slot it used is not returned."
            : "This cannot be undone, and the listing slot it used is not returned."
        }
        confirmLabel="Delete"
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell showNav={false}>
      <Header left={<BackButton fallback="/listings" />} title="Recently deleted" centerTitle />
      {children}
    </AppShell>
  );
}
