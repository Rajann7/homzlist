import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/maintenance — the "Turn off" link on the shell's maintenance
 * banner (designs/P13-14-15 shell markup).
 *
 * The banner is part of the design's shell, and a banner whose only control does
 * nothing is a dead button (CLAUDE.md rule 10). This is the smallest endpoint that
 * makes it real: it flips `maintenance_settings.enabled` and nothing else. Turning
 * maintenance ON, editing the message and setting an ETA all belong to A22
 * (Settings & Flags, Part 5) — this is only the off switch the banner offers.
 *
 * `flags` is a Super-only capability, so a Staff or Admin seat cannot lift
 * maintenance even though they can see the banner (Doc3 §1.1 — the matrix, not the
 * UI, decides).
 */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const gate = await requireCapability("flags");
  if (isDenial(gate)) return gate.response;

  const db = createServiceClient();
  const { data: before } = await db
    .from("maintenance_settings")
    .select("id, enabled, message")
    .eq("id", true)
    .maybeSingle();
  if (!before) return fail("NOT_FOUND");
  if (!(before as { enabled: boolean }).enabled) {
    // Already off — say so rather than logging a change that did not happen.
    return ok({ enabled: false, alreadyOff: true });
  }

  const { data: updated } = await db
    .from("maintenance_settings")
    .update({ enabled: false, updated_by: gate.staff.id, updated_at: new Date().toISOString() })
    .eq("id", true)
    .eq("enabled", true)
    .select("enabled")
    .maybeSingle();
  if (!updated) return ok({ enabled: false, alreadyOff: true });

  await audit({
    actor: gate.staff,
    action: "settings_change",
    entityType: "settings",
    entityId: null,
    entityLabel: "Maintenance mode",
    summary: "Turned maintenance mode OFF from the shell banner",
    diff: { enabled: { old: true, new: false } },
    // A flag change is on Doc5 A26's sensitive list.
    sensitive: true,
  });

  return ok({ enabled: false });
}

/** POST-only; an unmatched method must not confirm the route exists (Doc9 §API1). */
export async function GET() {
  return fail("NOT_FOUND");
}
