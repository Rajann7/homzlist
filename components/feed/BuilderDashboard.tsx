"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirementFeed } from "./RequirementFeed";
import { feedApi } from "@/lib/feed/client";
import type { BrowseCard } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * Builder dashboard feed (Doc7 §80, Doc2 §9.1) — own project stat cards +
 * requirements matched to those projects. NEVER any foreign listing. Stats use
 * REAL data (units + the builder's real lead count) — no fabricated view count.
 */
export function BuilderDashboard({ cityName, cityId = null }: { cityName?: string | null; cityId?: string | null }) {
  const router = useRouter();
  type Data = {
    projects: { id: string; name: string; coverUrl: string | null; statLine: string; buildStatus: string }[];
    matched: { card: BrowseCard; matchedTo: string; tierLabel: string | null }[];
  };
  const [data, setData] = useState<Data | null>(null);
  // A FAILED call is not an empty dashboard. This used to collapse the two:
  // any 401 (an access token is 15 minutes), 500 or dropped connection was
  // written in as `{projects: [], matched: []}`, so a builder with ten schemes
  // opened the app to "No projects yet" — a blank home telling them, wrongly,
  // that the database has nothing of theirs.
  const [failed, setFailed] = useState<"offline" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    const res = await feedApi.builderDashboard();
    if (res.ok) { setData(res.data as never); return; }
    setFailed(res.error.code === "OFFLINE" ? "offline" : "error");
    setData(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return (
      <EmptyState
        title={failed === "offline" ? "You're offline" : "Couldn't load your dashboard"}
        subtitle={
          failed === "offline"
            ? "Your projects are safe — reconnect and pull to refresh."
            : "Your projects are still there. Try again in a moment."
        }
        illustration={<Icon name={failed === "offline" ? "wifi-off" : "alert"} size={96} className="text-ink-disabled" />}
        cta={{ label: "Retry", onClick: () => void load() }}
      />
    );
  }

  if (!data) return <div className="flex flex-col gap-3 p-4"><Skeleton className="h-40 w-full rounded-12" /><Skeleton className="h-32 w-full rounded-12" /></div>;

  if (data.projects.length === 0 && data.matched.length === 0) {
    // Genuinely nothing posted yet — the ONE case this copy is true for. The
    // CTA stays on `/create` rather than jumping to the form: creation is
    // payment-first, and `CreateEntry` shows the ₹9,999 wall BEFORE a builder
    // with no slot fills in a multi-step project form they can't submit.
    //
    // Below it, the demand ALREADY in their city. Both P2 builder sections need
    // a project to exist, so a builder who has just registered used to land on
    // a home that was this empty state and nothing else — no reason to believe
    // there were buyers here, on the one screen that has to make that case.
    // This is the requirement feed as-is, not a second version of it: same
    // cards, same city scope, same ₹2,999 wall stripped server-side, so an
    // unpaid builder sees that the demand exists without seeing the budgets.
    return (
      <div>
        <EmptyState title="No projects yet" subtitle="Post a project to see stats and matching requirements here." cta={{ label: "Post a Project", onClick: () => router.push("/create") }} />
        <div className="px-4 pb-1 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
          {cityName ? `Requirements in ${cityName}` : "Requirements near you"}
        </div>
        <RequirementFeed kind="all" cityId={cityId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      {/* My Projects — horizontal stat cards */}
      {data.projects.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">My Projects</div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.projects.map((p) => (
              <button key={p.id} onClick={() => router.push(`/project/${p.id}`)} className="flex w-[220px] shrink-0 flex-col overflow-hidden rounded-12 border border-border bg-surface-1 text-left">
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
          {data.matched.map((m, i, all) => {
            // Locked/unlocked exactly as Doc2 §9.1 words it ("matched
            // RequirementCards locked/unlocked"). The budget is not in the
            // payload for a builder with no active requirement-access plan, so
            // the blur is honest — same treatment as every other locked card.
            const locked = m.card.access === "locked";
            // One header per GROUP, not one per card. This list is a cascade
            // like every other, and four city-tier matches in a row printed
            // "OTHER AREAS" four times — a heading repeated over each of the
            // things it heads. Same rule the requirement browse and feed use:
            // the label appears when the group it names begins.
            const showLabel = Boolean(m.tierLabel) && m.tierLabel !== all[i - 1]?.tierLabel;
            return (
              <div key={m.card.id}>
                {showLabel && <div className="mb-1.5 flex items-center gap-1.5"><Icon name="pin" size={14} className="text-ink-tertiary" /><span className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{m.tierLabel}</span></div>}
                <div className="relative overflow-hidden rounded-12 border border-border bg-surface-1 p-4 pl-5">
                  {!locked && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                  <span className="mb-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">Matched to: {m.matchedTo}</span>
                  {locked ? (
                    <div className="relative w-fit">
                      <div className="select-none text-17 font-bold text-ink-primary blur-[6px]" aria-hidden>₹00L – ₹00L</div>
                      <span className="absolute inset-0 grid place-items-center"><Icon name="lock" size={16} className="text-ink-tertiary" /></span>
                    </div>
                  ) : (
                    <div className="text-17 font-bold text-ink-primary">{m.card.budgetLabel}</div>
                  )}
                  <div className="mt-0.5 text-13 text-ink-secondary">{m.card.summary}</div>
                  <button onClick={() => router.push(`/requirements/${m.card.id}`)} className="mt-3 text-13 font-semibold text-accent">View requirement</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
