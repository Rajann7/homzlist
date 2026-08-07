"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, EmptyState, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { listingsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/hooks/useNow";
import { Img } from "@/components/ui/Img";

/**
 * P6 S5 — Drafts (Doc2 §5.3): max 3, 90-day expiry, resume or delete.
 * The countdown is derived from the server's `expiresAt`, not a local clock.
 */
export function Drafts() {
  const now = useNow();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<{ items: any[]; max: number } | null>(null);
  const [menu, setMenu] = useState<any>(null);

  const load = useCallback(async () => {
    const r = await listingsApi.drafts();
    setData(r.ok ? r.data : { items: [], max: 3 });
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return (
      <Shell>
        <div className="flex flex-col gap-3 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-12" />)}</div>
      </Shell>
    );
  }

  if (!data.items.length) {
    return (
      <Shell>
        <EmptyState
          className="pt-10"
          title="No drafts"
          subtitle="Start a listing and we'll save your progress automatically"
          illustration={<Icon name="receipt" size={96} className="text-ink-disabled" />}
          cta={{ label: "Create a listing", onClick: () => router.push("/create") }}
        />
      </Shell>
    );
  }

  return (
    <Shell counter={`${data.items.length} / ${data.max}`}>
      <div className="p-4">
        {data.items.map((d) => {
          const daysLeft = Math.max(0, Math.ceil((new Date(d.expiresAt).getTime() - now) / 86_400_000));
          const p = d.payload ?? {};
          const open = () =>
            router.push(`/create/form?type=${p.typeCode ?? ""}&kind=${p.kind ?? "sell"}&draft=${d.id}`);
          return (
            <div
              key={d.id}
              onClick={open}
              className="mb-3 flex cursor-pointer items-center gap-3 rounded-12 border border-border bg-surface-1 p-3"
            >
              <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-8 bg-surface-2 text-ink-tertiary">
                {d.coverUrl ? (
                  <Img src={d.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="image" size={22} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-15 font-semibold leading-[1.2] text-ink-primary">
                  {d.title || "Untitled draft"}
                </div>
                {/* progress line — the design's second row */}
                <div className="mt-[3px] text-11 leading-[1.3] text-ink-tertiary">
                  {p.typeLabel ?? p.typeCode ?? "Listing"}
                  {p.kind ? ` · ${p.kind === "rent" ? "For rent" : "For sale"}` : ""}
                </div>
                <span
                  className={cn(
                    "mt-1 inline-block text-11 leading-none",
                    daysLeft <= 7 ? "text-warning" : "text-ink-tertiary",
                  )}
                >
                  {daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Expires today"}
                </span>
              </div>
              <button
                aria-label="Draft options"
                onClick={(e) => { e.stopPropagation(); setMenu(d); }}
                className="grid h-11 w-11 shrink-0 place-items-center text-ink-secondary"
              >
                <Icon name="more" size={20} />
              </button>
            </div>
          );
        })}

        <div className="mt-2 flex items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
          <Icon name="info" size={16} className="shrink-0 text-ink-tertiary" />
          <span className="text-11 leading-[1.4] text-ink-tertiary">
            You can keep up to {data.max} drafts. Drafts are deleted after 90 days of inactivity.
          </span>
        </div>
      </div>

      {/* ⋯ menu — the design's per-draft sheet, replacing window.confirm() */}
      <BottomSheet open={Boolean(menu)} onClose={() => setMenu(null)} title="Draft">
        <div className="flex flex-col pb-2">
          <button
            onClick={() => {
              const p = menu.payload ?? {};
              setMenu(null);
              router.push(`/create/form?type=${p.typeCode ?? ""}&kind=${p.kind ?? "sell"}&draft=${menu.id}`);
            }}
            className="flex h-12 items-center px-4 text-left text-15 text-ink-primary active:bg-surface-2"
          >
            Resume editing
          </button>
          <button
            onClick={async () => {
              const id = menu.id;
              setMenu(null);
              const r = await listingsApi.deleteDraft(id);
              toast.show(r.ok ? "Draft deleted" : "Couldn't delete that draft");
              void load();
            }}
            className="flex h-12 items-center px-4 text-left text-15 text-error active:bg-surface-2"
          >
            Delete draft
          </button>
        </div>
      </BottomSheet>
    </Shell>
  );
}

function Shell({ children, counter }: { children: React.ReactNode; counter?: string }) {
  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={<BackButton fallback="/create" />}
          title="Drafts"
          centerTitle
          right={counter ? <span className="px-2 text-13 leading-none text-ink-tertiary">{counter}</span> : undefined}
        />
      }
    >
      {children}
    </AppShell>
  );
}
