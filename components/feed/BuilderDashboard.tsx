"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { feedApi } from "@/lib/feed/client";
import { cn } from "@/lib/utils";

/**
 * Builder dashboard feed (Doc7 §80, Doc2 §9.1) — own project stat cards +
 * requirements matched to those projects. NEVER any foreign listing. Stats use
 * REAL data (units + the builder's real lead count) — no fabricated view count.
 */
export function BuilderDashboard() {
  const router = useRouter();
  type Data = {
    projects: { id: string; name: string; coverUrl: string | null; statLine: string; buildStatus: string }[];
    matched: { requirement: any; matchedTo: string; tierLabel: string | null }[];
  };
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const res = await feedApi.builderDashboard();
    setData(res.ok ? (res.data as never) : { projects: [], matched: [] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="flex flex-col gap-3 p-4"><Skeleton className="h-40 w-full rounded-12" /><Skeleton className="h-32 w-full rounded-12" /></div>;

  if (data.projects.length === 0 && data.matched.length === 0) {
    return <EmptyState title="No projects yet" subtitle="Post a project to see stats and matching requirements here." cta={{ label: "Post a Project", onClick: () => router.push("/projects/new") }} />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      {/* My Projects — horizontal stat cards */}
      {data.projects.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">My Projects</div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.projects.map((p) => (
              <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="flex w-[220px] shrink-0 flex-col overflow-hidden rounded-12 border border-border bg-surface-1 text-left">
                <div className="h-24 w-full bg-surface-3">{p.coverUrl && <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="truncate text-15 font-semibold text-ink-primary">{p.name}</div>
                  <div className="text-11 text-ink-tertiary">{p.statLine}</div>
                  <span className="mt-1 w-fit rounded-4 bg-accent-soft px-1.5 py-0.5 text-11 font-semibold text-accent">{p.buildStatus}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matching requirements */}
      {data.matched.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Matching Requirements for your projects</div>
          {data.matched.map((m, i) => (
            <div key={m.requirement.id}>
              {m.tierLabel && <div className="mb-1.5 flex items-center gap-1.5"><Icon name="pin" size={14} className="text-ink-tertiary" /><span className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{m.tierLabel}</span></div>}
              <div className="relative overflow-hidden rounded-12 border border-border bg-surface-1 p-4 pl-5">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
                <span className="mb-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">Matched to: {m.matchedTo}</span>
                <div className="text-17 font-bold text-ink-primary">{m.requirement.budgetLabel}</div>
                <div className="mt-0.5 text-13 text-ink-secondary">{[m.requirement.bhk ? `${m.requirement.bhk} BHK` : null, "Buy", m.requirement.areaLabel].filter(Boolean).join(" · ")}</div>
                <button onClick={() => router.push(`/requirements/${m.requirement.id}`)} className="mt-3 text-13 font-semibold text-accent">View requirement</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
