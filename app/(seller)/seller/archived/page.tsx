import { Archived } from "@/components";

/** P10 S5 — Archived. The ⋯ profile menu's "Archived" item and Settings → Your
 *  content → Archived both land here. Server-driven: GET /listings/archived. */
export const metadata = { title: "Archived" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerArchivedPage() {
  return <Archived />;
}
