"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/billing/ui";
import { PlanWall } from "@/components/billing/PlanWall";
import { PostType } from "./PostType";
import { billingApi } from "@/lib/billing/client";

/**
 * Creation entry point — PAYMENT-FIRST (Doc2 §4.1): the plan wall comes BEFORE
 * the form, not after it.
 *
 * Which screen shows is decided from the SERVER's slot count, never a local
 * flag. And this is only the UX half — `POST /listings` independently refuses
 * without a slot, so a user who navigates straight past this still can't post
 * (Doc9 §11).
 */
export function CreateEntry() {
  const [slots, setSlots] = useState<number | null>(null);

  useEffect(() => {
    void billingApi.myPlan().then((r) => setSlots(r.ok ? r.data.pooled.listingSlotsLeft : 0));
  }, []);

  if (slots === null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-12" />)}
      </div>
    );
  }

  // `?wall=1` is a HINT from the form's PLAN_REQUIRED bounce, not an override:
  // it used to force the wall unconditionally, so backing into this URL after
  // buying a plan showed "Choose a plan" to someone who already had slots and
  // invited them to pay twice. The server's slot count decides.
  return slots <= 0 ? <PlanWall /> : <PostType slotsLeft={slots} />;
}
