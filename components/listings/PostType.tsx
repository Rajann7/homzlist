"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton } from "@/components/billing/ui";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P5 S2 — "Create": pick what you're posting.
 *
 * The grid is role-filtered by the SERVER's config response: only a Builder is
 * offered "New Project", because only a Builder can buy the ₹9,999 plan that
 * backs it (Doc2 §2 / §6).
 */
/** What the SERVER says this account may still post (billing `pooled`). */
export interface Entitlements {
  listingSlotsLeft: number;
  /** `Infinity` when the plan grants unlimited requirement posts. */
  requirementSlotsLeft: number;
  /** Builder projects left — its own counter, not the listing one (migration 0065). */
  projectSlotsLeft: number;
}

export type Intent = "listing" | "requirement" | "project";

export function PostType({ entitlements }: { entitlements?: Entitlements }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  // The option LIST now differs by role, so it can't render before the role is
  // known — a builder would see Sell/Rent for a frame and watch them vanish.
  // A failed config call resolves too, as "not a builder", so the screen can
  // never hang on a skeleton; the server refuses anything they shouldn't post.
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    void listingsApi.config().then((r) => {
      setRole(r.ok ? r.data.role : null);
      setRoleLoaded(true);
    });
  }, []);

  const slotsLeft = entitlements?.listingSlotsLeft;

  /**
   * Each option spends a DIFFERENT quota, so each carries its own gate:
   * `intent` names the quota, and a blocked option detours through the plan
   * wall instead of walking the user into a form that refuses at the end.
   */
  const options = role === "builder"
    // A Builder posts PROJECTS and nothing else — Sell, Rent and Requirement
    // are the Owner/Broker products (migration 0067). Hiding them here is
    // presentation; POST /listings and POST /requirements refuse the role too.
    ? [{ key: "project", label: "New Project", sub: "Builder project with unit types", icon: "image" as const, href: "/projects/new", intent: "project" as const }]
    : [
        { key: "sell", label: "Sell a property", sub: "List a property for sale", icon: "home" as const, href: "/create/type?kind=sell", intent: "listing" as const },
        { key: "rent", label: "Rent out a property", sub: "List a property to rent", icon: "key" as const, href: "/create/type?kind=rent", intent: "listing" as const },
        { key: "requirement", label: "Post a requirement", sub: "Tell sellers what you're looking for", icon: "search-list" as const, href: "/requirements/new", intent: "requirement" as const },
      ];

  const go = (href: string, intent: Intent) => {
    // Entitlements missing (the fetch failed) → walk on and let the form's own
    // PLAN_REQUIRED bounce handle it, rather than blocking on a guess.
    const left = !entitlements
      ? Infinity
      : intent === "requirement"
        ? entitlements.requirementSlotsLeft
        : intent === "project"
          ? entitlements.projectSlotsLeft
          : entitlements.listingSlotsLeft;
    router.push(left > 0 ? href : `/create?wall=1&intent=${intent}`);
  };

  return (
    <AppShell showNav={false} header={<Header left={<BackButton icon="close" fallback="/" />} title="Create" centerTitle />}>
      <div className="p-4">
        <div className="mb-3.5 text-15 leading-[1.4] text-ink-secondary">What would you like to post?</div>

        <div className="flex flex-col gap-3">
          {!roleLoaded && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-8" />)}
          {roleLoaded && options.map((o) => (
            <button
              key={o.key}
              onClick={() => go(o.href, o.intent)}
              className={cn(
                "flex items-center gap-3.5 rounded-8 border border-border bg-surface-1 p-3.5 text-left",
                "transition-transform duration-150 ease-out-quart active:scale-[0.98]",
              )}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-12 bg-accent-soft text-accent">
                <Icon name={o.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-17 font-semibold leading-[1.2] text-ink-primary">{o.label}</span>
                <span className="mt-[3px] block text-13 leading-[1.3] text-ink-secondary">{o.sub}</span>
              </span>
              <Icon name="chevron-right" size={18} className="shrink-0 text-ink-tertiary" />
            </button>
          ))}
        </div>

        {/* Slot counter (designs/P5 S2). The number is the SERVER's — the same
            value that decides whether this screen or the plan wall renders. */}
        {/* Never to a builder: a leftover listing slot from before the rule
            changed is a number they can no longer spend, so advertising it
            would be the screen promising something the server refuses. */}
        {roleLoaded && role !== "builder" && typeof slotsLeft === "number" && slotsLeft > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
            <span className="flex-1 text-13 font-semibold leading-[1.3] text-accent">
              {slotsLeft} listing slot{slotsLeft === 1 ? "" : "s"} available
            </span>
            <button
              aria-label="About listing slots"
              onClick={() => setTip(true)}
              className="grid h-6 w-6 place-items-center text-ink-tertiary"
            >
              <Icon name="info" size={18} />
            </button>
          </div>
        )}

        {/* Kept deliberately: Drafts has no other entry point, and stranding a
            saved draft would be a dead-end (CLAUDE.md rule 10). Not for a
            builder — drafts here are property drafts, and submitting one is
            refused now, so the link would lead into a form with no exit. */}
        {roleLoaded && role !== "builder" && (
          <button
            onClick={() => router.push("/create/drafts")}
            className="tap44 mx-auto mt-4 block text-13 font-semibold text-accent"
          >
            Continue from drafts
          </button>
        )}
      </div>

      <ConfirmDialog
        open={tip}
        onClose={() => setTip(false)}
        onConfirm={() => setTip(false)}
        hideCancel
        title="Listing slots"
        body="Each plan you buy gives you listing slots. A slot is taken when you submit a listing for review, and it stays with that listing — deleting the listing later doesn't return it."
        confirmLabel="Got it"
      />
    </AppShell>
  );
}

// Per-type icon (Doc1 component gallery / designs/P5 S3) — decorative mapping
// keyed to the fixed set of type codes, not business data, so it's safe to
// keep client-side even though the type LIST itself comes from server config.
const TYPE_ICON: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  flat: "type-flat",
  bungalow: "type-bungalow",
  tenement: "type-tenement",
  farmhouse: "type-farmhouse",
  office: "type-office",
  shop: "type-shop",
  showroom: "type-showroom",
  godown: "type-godown",
  plot_res: "type-plot-res",
  plot_com: "type-plot-com",
  plot_agri: "type-plot-agri",
  plot_farm: "type-plot-farm",
  pg: "type-pg",
};

/**
 * P5 S3 — Property type picker: flat category sections over a 3-up icon grid,
 * confirmed with Continue (designs/P5 S3). It used to be collapsible
 * accordions that navigated on tap, which is a different screen.
 *
 * Types come from the server config, so PG/Hostel simply isn't in a Builder's
 * list and a new type appears here with no code change (Doc2 §5.1).
 */
export function PropertyTypePicker({ kind }: { kind: "sell" | "rent" }) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof listingsApi.config>> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    void listingsApi.config().then(setData);
  }, []);

  const d = data?.ok ? data.data : null;
  // A type that can't be listed for this kind (a plot can't be rented) is hidden.
  const types = (d?.types ?? []).filter((t) => t.kinds.includes(kind));

  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/create" />}
          title="Property type"
          centerTitle
          // step dots — property type is step 2 of 4
          right={
            <span className="flex w-11 justify-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === 1 ? "bg-accent" : "bg-border")} />
              ))}
            </span>
          }
        />
      }
    >
      <div className="px-4 pb-24 pt-4">
        {!d && <div className="py-10 text-center text-13 text-ink-secondary">Loading…</div>}

        {/* designs/P5 S3: flat category sections with a 3-up icon grid — the
            choice is confirmed with Continue, not by navigating on tap. */}
        {d?.categories
          .filter((c) => types.some((t) => t.category === c.key))
          .map((cat) => (
            <div key={cat.key}>
              <div className="mb-3 text-13 font-semibold uppercase leading-none tracking-[0.3px] text-ink-tertiary">
                {cat.label}
              </div>
              <div className="mb-[22px] grid grid-cols-3 gap-2">
                {types.filter((t) => t.category === cat.key).map((t) => {
                  const active = picked === t.code;
                  return (
                    <button
                      key={t.code}
                      onClick={() => setPicked(t.code)}
                      aria-pressed={active}
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center gap-2 rounded-8 border px-2 text-center",
                        "transition-transform duration-150 ease-out-quart active:scale-[0.98]",
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-surface-2",
                      )}
                    >
                      <Icon name={TYPE_ICON[t.code] ?? "home"} size={24} className={active ? "text-accent" : "text-ink-secondary"} />
                      <span className="text-11 font-semibold leading-[1.2] text-ink-primary">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        {d && !types.length && (
          <p className="py-10 text-center text-13 text-ink-secondary">
            No property types are available for your account role.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-border bg-surface-1 px-4 py-3 shadow-l2 safe-bottom">
        <Button
          fullWidth
          disabled={!picked}
          onClick={() => router.push(`/create/form?type=${picked}&kind=${kind}`)}
        >
          Continue
        </Button>
      </div>
    </AppShell>
  );
}
