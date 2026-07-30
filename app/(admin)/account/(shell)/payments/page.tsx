import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { paymentsPage, readPaymentFilters, rupees } from "@/lib/admin/payments";
import { PaymentsScreen } from "@/components/admin/PaymentsScreen";

/**
 * A17 — Payments (Doc5 A17).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PaymentsListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "refunds")) redirect("/");

  const filters = readPaymentFilters(searchParams);
  const pageNo = Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1);

  const page = await paymentsPage(filters, pageNo);

  // The method chip's options are the methods that have actually been used —
  // a gateway method list we cannot charge on is a dead option (CLAUDE.md §7).
  const { data: used } = await createServiceClient().from("payments").select("method").not("method", "is", null).limit(1000);
  const methods = [...new Set(((used ?? []) as Array<{ method: string }>).map((m) => m.method))].sort();

  return (
    <PaymentsScreen
      rows={page.rows}
      total={page.total}
      counts={page.counts}
      sumLabel={`${page.sumCapped ? "over " : ""}${rupees(page.sumPaise)}`}
      page={page.page}
      pageSize={page.pageSize}
      filters={filters}
      methods={methods}
    />
  );
}
