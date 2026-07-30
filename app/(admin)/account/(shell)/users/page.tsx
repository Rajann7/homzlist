import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { readFilters, userFilterOptions, usersPage, totalUsers } from "@/lib/admin/users";
import { UsersScreen } from "@/components/admin/UsersScreen";

/**
 * A10 — Users (Doc5 A10 / designs P14 `usersEl`).
 *
 * Every filter is a URL parameter answered by Postgres, so a filtered list is
 * shareable, survives a reload, and — the part that matters — never ships rows
 * the filter excluded to the browser.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "users.edit")) redirect("/");

  const filters = readFilters(searchParams);
  const pageNo = Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1);

  const [page, options, total] = await Promise.all([
    usersPage(filters, pageNo),
    userFilterOptions(),
    totalUsers(),
  ]);

  return (
    <UsersScreen
      rows={page.rows}
      total={page.total}
      allUsers={total}
      page={page.page}
      pageSize={page.pageSize}
      filters={filters}
      options={options}
      canSuspend={can(session.staff.level, "users.edit")}
      canGrant={can(session.staff.level, "grants")}
      canImpersonate={can(session.staff.level, "users.edit")}
    />
  );
}
