import { ok } from "@/lib/api";
import { getLegalIndex } from "@/lib/legal/service";

/** GET /api/v1/cms/pages (Doc7 §173) — the Legal index rows. Public. */
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ pages: await getLegalIndex() });
}
