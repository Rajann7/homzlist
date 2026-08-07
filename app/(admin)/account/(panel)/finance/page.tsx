import { FinanceScreen } from "@/components/admin/finance/FinanceScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A16 — Finance (Doc5 A16, template 1148-1163). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FinancePage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  return (
    <AdminPanels screen="finance">
      <FinanceScreen />
    </AdminPanels>
  );
}
