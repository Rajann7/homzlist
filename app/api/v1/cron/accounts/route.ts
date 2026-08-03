import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepAccounts } from "@/lib/account/service";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/cron/accounts — the job behind two promises Module 12 makes:
 *
 *   "This link expires in 48 hours"           → ready exports past their TTL are
 *                                               expired AND their object deleted
 *   "Your account will be deleted on 12 Feb"  → accounts past their 30-day grace
 *                                               are purged (content removed,
 *                                               payment records anonymised and
 *                                               retained for the legal 7 years)
 *
 * Without this route both are text on a screen. Guarded by the same constant-
 * time shared secret as every other cron route, and refusing outright when the
 * secret is not configured.
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

  const t0 = Date.now();
  const db = createServiceClient();
  try {
    const result = await sweepAccounts();
    await db.from("cron_jobs").update({
      last_run_at: new Date().toISOString(),
      last_status: "success",
      last_duration_ms: Date.now() - t0,
      failure_count: 0,
    }).eq("code", "account_sweep");
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - t0 });
  } catch (err) {
    await db.from("cron_jobs").update({
      last_run_at: new Date().toISOString(),
      last_status: "failed",
      last_duration_ms: Date.now() - t0,
    }).eq("code", "account_sweep");
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
