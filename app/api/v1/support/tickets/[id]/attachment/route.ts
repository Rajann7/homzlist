import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ticketAttachmentBytes } from "@/lib/support/service";

/**
 * GET /api/v1/support/tickets/:id/attachment?key=… — a screenshot on a ticket.
 *
 * Streamed through an authenticated route rather than handed out as a signed
 * storage URL, for the same reason the data export is: the ownership check runs
 * at the moment of the read, and no URL that outlives it can escape into a chat
 * message, a bug report or a browser history.
 *
 * The key is checked against the attachments actually recorded on THIS ticket,
 * so a caller cannot pass a key belonging to somebody else's ticket — or to
 * their own verification documents, which live in the same private bucket.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key) return fail("VALIDATION_ERROR");

  const file = await ticketAttachmentBytes(claims.sub, params.id, key);
  if (!file) return fail("NOT_FOUND");

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "no-store, private",
      "Content-Length": String(file.body.byteLength),
      // The bytes were magic-byte validated as an image on upload and the
      // content type here is sniffed, not taken from the key — but this route
      // serves user-supplied bytes from the same bucket as verification
      // documents, so it says so explicitly rather than relying on that.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
