import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBillingReconciliation } from "@/lib/billing/reconcile";

/**
 * POST /api/v1/cron/billing — hourly reconciliation (Doc7 §21 item 12).
 * Same constant-time shared-secret guard as the listings cron; fails closed
 * when CRON_SECRET is unset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, data: await runBillingReconciliation() });
}

/**
 * Vercel Cron invokes schedules with GET (and supplies the CRON_SECRET as a
 * bearer token), so the schedule in vercel.json needs this alias. Same guard —
 * an unauthenticated GET is still a 401.
 */
export const GET = POST;
