import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runListingLifecycle } from "@/lib/listings/lifecycle";
import { serverEnv } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

/**
 * POST /api/v1/cron/listings — the 2AM IST lifecycle chain (Doc7 §21).
 *
 * Guarded by a shared secret in the Authorization header, compared in constant
 * time. Without CRON_SECRET set the route refuses entirely rather than running
 * open — a cron endpoint that anyone can trigger is a free way to age out
 * someone's listings.
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
  // Touch serverEnv so a misconfigured deploy fails loudly here too.
  serverEnv();
  const report = await runListingLifecycle();
  return NextResponse.json({ ok: true, data: report });
}

/**
 * Vercel Cron invokes schedules with GET (and supplies the CRON_SECRET as a
 * bearer token), so the schedule in vercel.json needs this alias. Same guard —
 * an unauthenticated GET is still a 401.
 */
export const GET = POST;
