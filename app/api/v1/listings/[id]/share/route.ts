import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer, recordListingShare } from "@/lib/listings/service";
import { rateLimit, clientIp, hashIp } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/listings/:id/share — record one share (designs/P9 S5 "Shares").
 *
 * Open to guests, because the share sheet on a public detail page is open to
 * guests; a guest is keyed by a salted ip+ua hash, never a raw IP (Doc9).
 *
 * Two rules the screen states and this route enforces:
 *   · "Your own views and shares aren't counted" — the owner's own share is
 *     accepted and dropped, so the UI still behaves normally.
 *   · only a `live` listing can be shared, so nothing accrues to a draft.
 *
 * The response is deliberately the same `{ recorded: true }` shape in the
 * counted and the not-counted case: whether a share landed is not something a
 * caller needs to learn, and telling them would leak the owner's identity.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = ["copy", "whatsapp", "native"] as const;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const claims = await getCurrentUser();
  const ipHash = await hashIp(clientIp(req.headers));

  // Per-caller cap. The unique index already makes a repeat share a no-op, but
  // a loop rotating channels could still hammer the table — this bounds it.
  const limited = await rateLimit(`listing-share:${claims?.sub ?? ipHash}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const channel = CHANNELS.find((c) => c === body.channel);
  if (!channel) return fail("VALIDATION_ERROR", { field: "channel" });

  const listing = await getListingForViewer(params.id, claims?.sub ?? null);
  if (!listing) return fail("NOT_FOUND");

  if (listing.status === "live" && claims?.sub !== listing.profile_id) {
    const key = claims?.sub ?? `g:${await hashIp(clientIp(req.headers) + "|" + (req.headers.get("user-agent") ?? ""))}`;
    await recordListingShare(listing.id, key, channel);
  }

  return ok({ recorded: true });
}
