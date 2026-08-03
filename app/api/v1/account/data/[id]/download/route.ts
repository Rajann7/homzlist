import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { downloadExport } from "@/lib/account/service";

/**
 * GET /api/v1/account/data/:id/download — the Download button.
 *
 * Deliberately NOT a signed storage URL. Streaming it through an authenticated
 * route means the ownership check and the 48-hour expiry are evaluated at the
 * moment of download, and no URL that outlives either can escape into a chat
 * message or a browser history.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const file = await downloadExport(claims.sub, params.id);
  if (!file) return fail("NOT_FOUND");

  // `new Uint8Array(buf)` rather than the Buffer itself: Node's Buffer is not a
  // valid BodyInit under the DOM lib types the app router compiles against.
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.body.byteLength),
      "Cache-Control": "no-store, private",
    },
  });
}
