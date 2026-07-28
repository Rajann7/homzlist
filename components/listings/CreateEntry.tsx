"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/billing/ui";
import { PlanWall } from "@/components/billing/PlanWall";
import { PostType, type Entitlements, type Intent } from "./PostType";
import { billingApi } from "@/lib/billing/client";

/**
 * Creation entry point.
 *
 * PAYMENT-FIRST still holds (Doc2 §4.1) — nothing can be posted without a slot,
 * and `POST /listings`, `/projects` and `/requirements` each refuse on their own
 * (Doc9 §11). What changed is WHERE the wall sits.
 *
 * It used to replace this whole screen the moment `listingSlotsLeft` hit 0: a
 * seller who tapped + saw "Choose a plan" and never learned that Create also
 * offers Rent, Requirement and (for a Builder) New Project. Worse, the gate was
 * the LISTING count, so someone whose listing slot was spent but whose
 * requirement post was untouched was sold a plan for something they could
 * already do.
 *
 * So the picker always renders, and each option carries its own gate — the
 * quota that option actually spends, from the server. The wall appears only
 * after a choice is made, and only for the choice that is genuinely blocked.
 * `?wall=1&intent=…` is how a screen asks for it (the PLAN_REQUIRED bounce out
 * of the forms included); the SERVER's numbers still decide whether it renders,
 * so backing into that URL with a slot in hand shows the picker rather than an
 * invitation to pay twice.
 */
export function CreateEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const [ent, setEnt] = useState<Entitlements | null>(null);

  const asked = params.get("wall") === "1" ? (params.get("intent") ?? "listing") : null;
  const intent: Intent | null =
    asked === "requirement" ? "requirement" : asked === "project" ? "project" : asked ? "listing" : null;

  useEffect(() => {
    void billingApi.myPlan().then((r) =>
      setEnt(
        r.ok
          ? {
              listingSlotsLeft: r.data.pooled.listingSlotsLeft,
              requirementSlotsLeft: r.data.pooled.unlimitedRequirements
                ? Number.POSITIVE_INFINITY
                : r.data.pooled.requirementSlotsLeft,
              projectSlotsLeft: r.data.pooled.unlimitedProjects
                ? Number.POSITIVE_INFINITY
                : r.data.pooled.projectSlotsLeft,
            }
          : { listingSlotsLeft: 0, requirementSlotsLeft: 0, projectSlotsLeft: 0 },
      ),
    );
  }, []);

  if (ent === null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-12" />)}
      </div>
    );
  }

  const blocked =
    intent === "requirement"
      ? ent.requirementSlotsLeft <= 0
      : intent === "project"
        ? ent.projectSlotsLeft <= 0
        : ent.listingSlotsLeft <= 0;

  if (intent && blocked) {
    return (
      <PlanWall
        intent={intent}
        // Paying is a detour, not a destination: the buyer came here to post
        // something, so checkout carries them back to this screen.
        next="/create"
        onBack={() => router.replace("/create")}
      />
    );
  }

  return <PostType entitlements={ent} />;
}
