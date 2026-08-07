import { StaffScreen } from "@/components/admin/ops/StaffScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";

/** A25 — Staff (Doc5 A25, template 2522-2564). Super only. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function StaffPage() {
  // `me.id` is passed down so the screen can draw the design's "You" badge and
  // disable the self-actions — the server refuses them too.
  const gate = await screenGate("super");
  if (!gate.ok) return gate.lock;
  const me = gate.me;
  return (
    <AdminPanels screen="staff">
      <StaffScreen meId={me.id} />
    </AdminPanels>
  );
}
