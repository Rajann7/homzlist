import { UsersScreen } from "@/components/admin/users/UsersScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { masterFilterOptions, registeredUserCount } from "@/lib/admin/filter-options";

/**
 * A10 — Users (Doc5 A10, template 994-1046). Admin+ only, matching the design's
 * SCREEN_MIN_ROLE (template 248); the gate enforces it server-side rather than
 * the sidebar hiding the link, and a denied admin gets the design's lock
 * screen instead of a rendered page.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UsersPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  const [{ cities }, total] = await Promise.all([masterFilterOptions(), registeredUserCount()]);
  return (
    <AdminPanels screen="users">
      <UsersScreen options={{ cities }} total={total} />
    </AdminPanels>
  );
}
