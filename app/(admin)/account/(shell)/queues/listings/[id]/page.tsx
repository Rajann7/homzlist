import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can, tooltipFor } from "@/lib/admin/permissions";
import { reviewDetail } from "@/lib/admin/review";
import { createServiceClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/seo/schema";
import { ReviewScreen } from "@/components/admin/ReviewScreen";

/**
 * A4 — Review detail for a listing (Doc5 A4).
 *
 * Server-rendered in full. An admin opening a queue item must see the real
 * fields, the real risk reasons and the real lock state on first paint: a
 * skeleton that resolves into "someone else took this" after they have read the
 * whole listing is the exact failure the lock exists to prevent.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ListingReviewPage({ params }: { params: { id: string } }) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");
  if (!UUID_RE.test(params.id)) notFound();

  const loaded = await reviewDetail("listing", params.id, session.staff);
  if (!loaded.ok) notFound();

  const canDecide = can(session.staff.level, "queues.decide");
  const db = createServiceClient();

  const [assignmentRow, seatRows] = await Promise.all([
    db
      .from("review_assignments")
      .select("assigned_to")
      .eq("subject_type", "listing")
      .eq("subject_id", params.id)
      .maybeSingle(),
    db.from("staff").select("profile_id, display_name, email, level").eq("is_active", true).order("display_name"),
  ]);

  const seats = ((seatRows.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.profile_id as string,
    name: (s.display_name as string) || (s.email as string),
    level: s.level as string,
  }));
  const assignedTo = (assignmentRow.data as { assigned_to?: string } | null)?.assigned_to ?? null;
  const assignment = assignedTo
    ? {
        assignedTo,
        assignedToName: seats.find((s) => s.id === assignedTo)?.name ?? "an admin",
      }
    : null;

  return (
    <ReviewScreen
      detail={loaded.detail}
      canDecide={canDecide}
      decideTooltip={tooltipFor("queues.decide") || "Admin only"}
      basePath="/queues/listings"
      siteUrl={siteUrl()}
      assignment={assignment}
      seats={seats.filter((s) => s.id !== session.staff.id)}
    />
  );
}
