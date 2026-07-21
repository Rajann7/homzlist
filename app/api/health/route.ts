import { NextResponse } from "next/server";
import { assertProdSecrets } from "@/lib/env";

/**
 * Health check (Doc8 §2.1) — LB pings this; unhealthy instances are drained.
 * In production it also reports missing critical secrets (names only, never
 * values — Doc9 §16/§20) so a misconfigured deploy is caught fast.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const missingSecrets = assertProdSecrets();
  const healthy = missingSecrets.length === 0;
  return NextResponse.json(
    {
      ok: healthy,
      service: "homzlist",
      time: new Date().toISOString(),
      ...(missingSecrets.length ? { missingSecrets } : {}),
    },
    { status: healthy ? 200 : 503 },
  );
}
