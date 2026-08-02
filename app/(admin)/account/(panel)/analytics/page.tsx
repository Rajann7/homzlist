import { AnalyticsScreen } from "@/components/admin/ops/AnalyticsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A28 — Analytics (Doc5 A28, template 2630-2691). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="analytics">
      <AnalyticsScreen />
    </AdminPanels>
  );
}
