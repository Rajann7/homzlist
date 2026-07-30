import { ok } from "@/lib/api";
import { getMaintenance } from "@/lib/system/maintenance";

/**
 * GET /api/v1/system/maintenance — the state behind P12 S8's maintenance page and
 * its "Try again" button (Doc7 §13 #190). Public: a client that can't load the app
 * still needs to know why and for how long.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  return ok(await getMaintenance());
}
