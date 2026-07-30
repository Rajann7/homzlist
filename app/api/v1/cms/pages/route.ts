import { ok } from "@/lib/api";
import { getLegalIndex } from "@/lib/legal/service";

/**
 * GET /api/v1/cms/pages (Doc7 §12 #173) — the legal index P12 S3 lists.
 * Public: guests must be able to read the legal shelf. Published rows only.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  return ok({ pages: await getLegalIndex() });
}
