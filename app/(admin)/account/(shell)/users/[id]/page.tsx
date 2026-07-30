import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { userDetail } from "@/lib/admin/userDetail";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { UserDetailScreen } from "@/components/admin/UserDetailScreen";

/**
 * A11 — User detail (Doc5 A11).
 *
 * A route rather than a stacked panel: the design pushes a panel inside its own
 * frame, but a real admin needs to link a user to a colleague, and a URL is what
 * makes "any entity → A11 → onward" (Doc5's deep-drill rule) survive a reload.
 * The panel's own layout — header, action bar, tabs — is unchanged.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { impersonate?: string };
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "users.edit")) redirect("/");

  const [detail, durations] = await Promise.all([userDetail(params.id), actionOptions("suspend_duration")]);
  if (!detail) notFound();

  return (
    <UserDetailScreen
      detail={detail}
      can={{ users: can(session.staff.level, "users.edit"), ban: can(session.staff.level, "devicebans") }}
      suspendDurations={durations.map((d) => ({ value: d.value, label: d.label }))}
      openImpersonate={searchParams.impersonate === "1"}
    />
  );
}
