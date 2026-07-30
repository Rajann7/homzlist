import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getLegalPage, getLegalVersionBody, formatDate } from "@/lib/legal/service";
import { renderLegalPdf } from "@/lib/legal/pdf";

/**
 * GET /api/v1/cms/pages/:slug/pdf[?version=1.0] — the "Download PDF" button on
 * every legal reader. Produces a real PDF from the same CMS body the screen
 * renders, so the file can never be a stale copy of the document.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const wanted = new URL(req.url).searchParams.get("version");
  const page = await getLegalPage(params.slug);
  if (!page) return fail("NOT_FOUND");

  let title = page.title;
  let version = page.version;
  let effective = page.effectiveDate;
  let body = page.body;

  if (wanted && wanted !== page.version) {
    const archived = await getLegalVersionBody(params.slug, wanted);
    if (!archived) return fail("NOT_FOUND");
    title = archived.title;
    version = archived.version;
    effective = archived.effectiveDate;
    body = archived.body;
  }

  const pdf = renderLegalPdf({
    title,
    version,
    effectiveDate: formatDate(effective) || "—",
    body,
    footer: `${page.settings.entity_name} · ${page.settings.registered_address} · homzlist.com`,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.length),
      "content-disposition": `attachment; filename="${params.slug}-v${version}.pdf"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
