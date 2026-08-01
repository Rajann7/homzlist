import { CouponsScreen } from "@/components/admin/catalog/CouponsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";
import { sellablePlans } from "@/lib/admin/filter-options";

/** A14 — Coupons (Doc5 A14, template 1218-1240). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function CouponsPage() {
  await requireAdmin("admin");
  const plans = await sellablePlans();
  // The Scope column names the PLAN, not its code — the code is a database key
  // and "p2999" on a screen is the schema leaking into the product.
  const names = Object.fromEntries(plans.map((p) => [p.code, p.name]));
  return (
    <AdminPanels screen="coupons" planOptions={plans}>
      <CouponsScreen planNames={names} />
    </AdminPanels>
  );
}
