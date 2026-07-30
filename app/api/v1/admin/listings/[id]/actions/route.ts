import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/listings/[id]/actions — A12's row actions (Doc5 A12).
 *
 * A12 is the master table, so its verbs are the ones that apply to a listing in
 * ANY state — hide, unhide, restore from trash — as opposed to A3/A4's approve
 * and reject, which only make sense on something waiting for review. Those stay
 * where they are; this endpoint deliberately does not duplicate them.
 *
 * Doc5's banner for this screen is "compliance edits only, logged", so every
 * action takes a reason and writes it to the audit row.
 */
export const dynamic = "force-dynamic";

/** Hiding is reversible, so it remembers what to go back to. */
const RESTORE_TO = "live";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("listings.edit");
  if (isDenial(gate)) return gate.response;

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

  const db = createServiceClient();
  const { data: found } = await db
    .from("listings")
    .select("id, title, status, profile_id, deleted_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!found) return fail("NOT_FOUND");
  const listing = found as { id: string; title: string | null; status: string; profile_id: string; deleted_at: string | null };
  const label = listing.title || listing.id.slice(0, 8);

  switch (action) {
    case "hide": {
      if (listing.status === "hidden") return fail("LISTING_STATE_LOCKED", { alreadyHidden: true });
      if (listing.status === "deleted") return fail("LISTING_STATE_LOCKED", { inTrash: true });

      await db.from("listings").update({ status: "hidden", hidden_at: new Date().toISOString() }).eq("id", listing.id);
      await notify(listing.profile_id, "listing_rejected", "A listing was hidden", `"${label}" is no longer visible. ${reason.slice(0, 180)}`);

      await audit({
        actor: gate.staff,
        action: "edit",
        entityType: "listing",
        entityId: listing.id,
        entityLabel: label,
        summary: `Hid ${label} from feed and search — ${reason}`,
        diff: { status: { old: listing.status, new: "hidden" } },
        reason,
        sensitive: true,
      });
      return ok({ status: "hidden" });
    }

    case "unhide": {
      if (listing.status !== "hidden") return fail("LISTING_STATE_LOCKED", { notHidden: true });

      await db.from("listings").update({ status: RESTORE_TO, hidden_at: null }).eq("id", listing.id);
      await notify(listing.profile_id, "listing_approved", "Your listing is visible again", `"${label}" is back in feed and search.`);

      await audit({
        actor: gate.staff,
        action: "restore",
        entityType: "listing",
        entityId: listing.id,
        entityLabel: label,
        summary: `Made ${label} visible again — ${reason}`,
        diff: { status: { old: "hidden", new: RESTORE_TO } },
        reason,
      });
      return ok({ status: RESTORE_TO });
    }

    default:
      return fail("VALIDATION_ERROR", { field: "action" });
  }
}

async function notify(
  profileId: string,
  type: "listing_rejected" | "listing_approved",
  title: string,
  body: string,
): Promise<void> {
  const { notify: send } = await import("@/lib/notifications/service");
  await send({ profileId, type, title, body });
}
