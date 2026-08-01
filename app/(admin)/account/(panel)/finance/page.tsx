import { FinanceScreen } from "@/components/admin/finance/FinanceScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A16 — Finance (Doc5 A16, template 1148-1163). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FinancePage() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="finance">
      <FinanceScreen />
    </AdminPanels>
  );
}
