import { PaymentsScreen } from "@/components/admin/finance/PaymentsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";
import { paymentFilterOptions, paymentCount } from "@/lib/admin/filter-options";

/** A17 — Payments list (Doc5 A17, template 1114-1146). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PaymentsPage() {
  await requireAdmin("admin");
  const [options, total] = await Promise.all([paymentFilterOptions(), paymentCount()]);
  return (
    <AdminPanels screen="payments">
      <PaymentsScreen options={options} total={total} />
    </AdminPanels>
  );
}
