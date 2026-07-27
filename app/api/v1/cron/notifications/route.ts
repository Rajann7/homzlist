import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { runNotificationJobs } from "@/lib/notifications/service";
import { runScheduledNotifications } from "@/lib/notifications/jobs";

/**
 * POST /api/v1/cron/notifications — the notification module's own sweep
 * (Doc2 §14, Doc7 §21). Hourly, because two of its jobs are hour-grained.
 *
 * Two halves:
 *   runNotificationJobs()        release quiet-hours holds · resolve the
 *                                "push seen → skip email" decision · 90-day purge
 *   runScheduledNotifications()  requirement expiry 5d/1d + actual expiry ·
 *                                plan grace · performance nudges · weekly digests
 *
 * Same constant-time shared-secret guard as the other crons, and it fails
 * CLOSED when CRON_SECRET is unset: an open trigger here would be a free
 * notification-spam cannon AND a free way to purge someone's history.
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
  serverEnv();
  const delivery = await runNotificationJobs();
  const scheduled = await runScheduledNotifications();
  return NextResponse.json({ ok: true, data: { delivery, scheduled } });
}

/** Vercel Cron uses GET with the secret as a bearer token. */
export const GET = POST;
