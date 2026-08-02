import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { detectAnomalies } from "@/lib/admin/anomalies";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/cron/anomalies — the sweep behind A2's anomaly banners.
 *
 * docs/PENDING-INTEGRATIONS.md M11.2 recorded that `anomaly_events` had five
 * seeded rows and no writer, so the dashboard's banners could never reflect a
 * real incident. This is the writer.
 *
 * Guarded the same way every other cron route is: a shared secret compared in
 * constant time, and a refusal when the secret is not configured at all — an
 * open detector endpoint is a free way to fill an admin's dashboard with noise.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const db = createServiceClient();

  try {
    const { found, written } = await detectAnomalies();
    const duration = Date.now() - t0;

    // The run is recorded, so A27 shows this job the way it shows every other
    // one — a sweep nobody can see having run is the same problem one step up.
    await db.from("cron_runs").insert({
      job_code: "anomaly_sweep",
      status: "ok",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      processed: written,
    });
    await db
      .from("cron_jobs")
      .update({
        last_run_at: startedAt,
        last_status: "ok",
        last_duration_ms: duration,
        failure_count: 0,
      })
      .eq("code", "anomaly_sweep");

    return NextResponse.json({ ok: true, detected: found.length, written });
  } catch (e) {
    await db.from("cron_runs").insert({
      job_code: "anomaly_sweep",
      status: "failed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      error: (e as Error).message.slice(0, 500),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
