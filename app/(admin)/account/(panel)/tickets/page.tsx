import { TicketsScreen } from "@/components/admin/ops/TicketsScreen";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { createServiceClient } from "@/lib/supabase/server";

/** A23 — Tickets (Doc5 A23, template 2427-2483). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CATEGORY_LABEL: Record<string, string> = {
  payment_refund: "Payment or refund",
  listing_not_approved: "Listing not approved",
  number_recovery: "Lost access to number",
  verification: "Verification",
  grievance: "Grievance",
  bug: "Bug",
  other: "Other",
};

export default async function TicketsPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  const db = createServiceClient();

  // The filter options are the values the table ACTUALLY holds, not a
  // hardcoded list — a pill offering a category with no rows behind it is the
  // same defect as an empty City filter (P4 found that one on every queue).
  const [{ data: cats }, { data: staff }] = await Promise.all([
    db.from("support_tickets").select("category"),
    db.from("staff").select("profile_id, display_name").eq("is_active", true).order("display_name"),
  ]);

  const categories = [...new Set(((cats ?? []) as { category: string }[]).map((c) => c.category))]
    .filter(Boolean)
    .map((value) => ({ value, label: CATEGORY_LABEL[value] ?? value }));

  const assignees = ((staff ?? []) as { profile_id: string; display_name: string }[]).map((s) => ({
    value: s.profile_id,
    label: s.display_name,
  }));

  return (
    <AdminPanels screen="tickets">
      <TicketsScreen categories={categories} assignees={assignees} />
    </AdminPanels>
  );
}
