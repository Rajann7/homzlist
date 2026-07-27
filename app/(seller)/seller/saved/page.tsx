import { Saved } from "@/components";

/**
 * P10 S1 — Saved. The ⋯ profile menu's "Saved" item and Settings → Your content
 * → Saved both land here. Server-driven: GET /saved on mount.
 */
export const metadata = { title: "Saved" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerSavedPage() {
  return <Saved />;
}
