import { PlansScreen } from "@/components/admin/catalog/PlansScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";
import { sellablePlans } from "@/lib/admin/filter-options";

/** A13 — Plans (Doc5 A13, template 1197-1216). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PlansPage() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="plans" planOptions={await sellablePlans()}>
      <PlansScreen />
    </AdminPanels>
  );
}
