import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { grantablePlans, grantsList } from "@/lib/admin/grants";
import { GrantsScreen } from "@/components/admin/GrantsScreen";

/**
 * A15 — Grants & trials (Doc5 A15).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function GrantsPage() {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "grants")) redirect("/");

  const [rows, plans] = await Promise.all([grantsList(), grantablePlans()]);

  return <GrantsScreen rows={rows} plans={plans} canGrant={can(session.staff.level, "grants")} />;
}
