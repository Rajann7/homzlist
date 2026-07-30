import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { paymentDetail } from "@/lib/admin/payments";
import { PaymentDetailScreen } from "@/components/admin/PaymentDetailScreen";

/**
 * A18 — Payment detail and refund (Doc5 A18).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "refunds")) redirect("/");

  const detail = await paymentDetail(params.id);
  if (!detail) notFound();

  return <PaymentDetailScreen detail={detail} canRefund={can(session.staff.level, "refunds")} />;
}
