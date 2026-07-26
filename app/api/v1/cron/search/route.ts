import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { runSavedSearchAlerts, notifyLaunchedCities, refreshResponseLabels } from "@/lib/search/alerts";

/**
 * POST/GET /api/v1/cron/search — the Module 8 scheduled work (Doc7 §21 jobs 14).
 *
 *   1. saved-search new-match alerts (Doc2 §12)
 *   2. "we'll notify you when we launch" for cities that have since launched
 *      (Doc7 §118)
 *   3. the automatic seller response-time chip (Doc2 §11) — a measured claim
 *      that must be re-measured, so a seller who goes quiet loses it
 *
 * Both exist because a screen makes a promise that only a scheduled job can
 * keep. Same shared-secret guard as the other cron routes: without CRON_SECRET
 * the endpoint refuses outright rather than running open — an unauthenticated
 * trigger here would be a free notification-spam cannon.
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
  const alerts = await runSavedSearchAlerts();
  const launches = await notifyLaunchedCities();
  const responseLabels = await refreshResponseLabels();
  return NextResponse.json({ ok: true, data: { alerts, launches, responseLabels } });
}

/** Vercel Cron uses GET with the secret as a bearer token. */
export const GET = POST;
