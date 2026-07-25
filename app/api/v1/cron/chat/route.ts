import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runChatRetention } from "@/lib/chat/retention";
import { serverEnv } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

/**
 * POST /api/v1/cron/chat — daily chat retention sweep (Doc9 §26).
 *
 * Same shared-secret guard as the other cron routes: constant-time compare, and
 * a missing CRON_SECRET refuses outright rather than running open — a purge
 * endpoint anyone could trigger would be a free way to wipe conversations.
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
  const report = await runChatRetention();
  return NextResponse.json({ ok: true, data: report });
}

// Vercel Cron invokes with GET + the CRON_SECRET bearer token.
export const GET = POST;
