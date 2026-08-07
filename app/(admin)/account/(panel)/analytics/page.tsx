import { AnalyticsScreen } from "@/components/admin/ops/AnalyticsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A28 — Analytics (Doc5 A28, template 2630-2691). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="analytics">
      <AnalyticsScreen />
    </AdminPanels>
  );
}
