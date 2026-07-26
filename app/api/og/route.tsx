import { ImageResponse } from "next/og";

/**
 * GET /api/og?listing=<id>  |  ?title=…&subtitle=…
 *
 * The auto-generated share image (Doc3 §4: "OG tags + auto-generated share
 * image (cover + price + title bar)"). Rendered server-side so a shared link
 * previews correctly in WhatsApp — which, for this audience, is where nearly
 * every link is actually pasted.
 *
 * EDGE runtime, deliberately: `next/og` (@vercel/og) resolves its bundled font
 * through `fileURLToPath` in the Node runtime, which produces an invalid
 * `.\file:\C:\…` path on Windows and kills the response mid-pipe. Edge is the
 * runtime the library targets and has no such path handling. The cost is that
 * `createServiceClient` (which uses `require`) is unavailable here, so the one
 * lookup this route needs goes over PostgREST with plain fetch.
 */
export const runtime = "edge";

const W = 1200;
const H = 630;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listingId = url.searchParams.get("listing");

  let title = clamp(url.searchParams.get("title") ?? "", 90) || "HomzList";
  let subtitle = clamp(url.searchParams.get("subtitle") ?? "", 80);
  let price = "";
  let cover: string | null = null;

  if (listingId && /^[0-9a-f-]{36}$/i.test(listingId)) {
    const l = await fetchListing(listingId);
    // Only a LIVE + available listing gets a rich card. A sold or pending one
    // falls back to the brand card rather than leaking a price for something
    // that is off the market.
    if (l && l.status === "live" && l.availability === "available") {
      title = clamp(l.title ?? "Property on HomzList", 90);
      subtitle = clamp(l.area_label ?? "", 80);
      price = l.price_on_request ? "Price on request" : shortRupees(l.price_paise);
      cover = l.cover_url ?? null;
    }
  }

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flex: 1, position: "relative" }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" width={W} height={430} style={{ objectFit: "cover", width: W, height: 430 }} />
          ) : (
            <div style={{ display: "flex", width: W, height: 430, alignItems: "center", justifyContent: "center", background: "#0F9D58" }}>
              <div style={{ fontSize: 96, fontWeight: 700, color: "#FFFFFF", display: "flex" }}>
                Homz<span style={{ color: "#A8D5BD" }}>List</span>
              </div>
            </div>
          )}
          {price ? (
            <div style={{ position: "absolute", left: 40, bottom: 32, display: "flex", background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 44, fontWeight: 700, padding: "12px 24px", borderRadius: 12 }}>
              {price}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: 200, padding: "0 40px", borderTop: "6px solid #0F9D58", background: "#FFFFFF" }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#111111", display: "flex", lineHeight: 1.15 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 30, color: "#555555", marginTop: 12, display: "flex" }}>{subtitle}</div> : null}
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } },
  );
}

interface ListingRow {
  title: string | null; price_paise: number | null; price_on_request: boolean;
  area_label: string | null; cover_url: string | null; status: string; availability: string;
}

/** One PostgREST read — the service key never leaves the server. */
async function fetchListing(id: string): Promise<ListingRow | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(
      `${base}/rest/v1/listings?id=eq.${id}&select=title,price_paise,price_on_request,area_label,cover_url,status,availability`,
      { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as ListingRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Mirror of lib/billing/money.formatShortRupees — that module is Node-only. */
function shortRupees(paise: number | null): string {
  if (paise == null) return "";
  const r = paise / 100;
  if (r >= 10_000_000) return `₹${trim(r / 10_000_000)} Cr`;
  if (r >= 100_000) return `₹${trim(r / 100_000)} Lakh`;
  if (r >= 1_000) return `₹${Math.round(r).toLocaleString("en-IN")}`;
  return `₹${Math.round(r)}`;
}
const trim = (n: number) => String(Number(n.toFixed(2)));

function clamp(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}
