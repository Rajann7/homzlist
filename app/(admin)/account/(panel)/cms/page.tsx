import { ContentScreen } from "@/components/admin/content/ContentScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";

/** A20 — Content (Doc5 A20, template 2161-2236). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ContentPage() {
  await requireAdmin("admin");
  return (
    <AdminPanels screen="cms">
      <ContentScreen />
    </AdminPanels>
  );
}
