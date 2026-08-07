import { MasterDataScreen } from "@/components/admin/masterdata/MasterDataScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { createServiceClient } from "@/lib/supabase/server";

/** A19 — Master data (Doc5 A19, template 2032-2180). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MasterDataPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  // The design puts a count on the Area requests tab. It is the real number of
  // pending rows, resolved on the server so the tab is right on first paint.
  const { count } = await createServiceClient()
    .from("area_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return (
    <AdminPanels screen="masterData">
      <MasterDataScreen pendingRequests={count ?? 0} />
    </AdminPanels>
  );
}
