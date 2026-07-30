import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeScheduledDeletions, purgeExpiredExports } from "@/lib/account/purge";

/**
 * POST /api/v1/cron/account — daily. Executes deletions whose 30-day grace has
 * run out and drops expired data-export payloads (Doc7 #201–203).
 *
 * This is the job behind P12's "your account will be deleted on <date>" and
 * "this link expires in 48 hours". Same constant-time shared-secret guard as the
 * other crons; fails closed when CRON_SECRET is unset.
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
  const [deletions, exports] = await Promise.all([purgeScheduledDeletions(), purgeExpiredExports()]);
  return NextResponse.json({ ok: true, data: { deletions, expiredExports: exports } });
}

/** Vercel Cron invokes schedules with GET and the secret as a bearer token. */
export const GET = POST;
