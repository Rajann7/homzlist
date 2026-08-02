import { StaffScreen } from "@/components/admin/ops/StaffScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A25 — Staff (Doc5 A25, template 2522-2564). Super only. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function StaffPage() {
  // `me.id` is passed down so the screen can draw the design's "You" badge and
  // disable the self-actions — the server refuses them too.
  const me = await requireAdmin("super");
  return (
    <AdminPanels screen="staff">
      <StaffScreen meId={me.id} />
    </AdminPanels>
  );
}
