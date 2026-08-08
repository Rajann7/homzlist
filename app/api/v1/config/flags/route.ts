import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvedFlags } from "@/lib/system/flags";

/**
 * GET /api/v1/config/flags — the feature-flag map resolved for THIS viewer, for
 * client components that gate on a flag (e.g. the PWA install prompt). Values are
 * server-decided; the client only reads them. Guest-readable (a guest still has
 * flags like `pwa_prompt`). Never returns secrets — just booleans.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: NextRequest) {
  const claims = await getCurrentUser();
  return ok({ flags: await resolvedFlags({ role: claims?.role ?? null, userId: claims?.sub ?? null }) });
}
