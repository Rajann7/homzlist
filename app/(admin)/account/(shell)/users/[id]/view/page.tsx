import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { ImpersonationView } from "@/components/admin/ImpersonationView";

/**
 * A31 — the read-only user view (Doc5 A31).
 *
 * What the user sees of their own account, rendered inside the panel under an
 * audited session. No user session is minted and nothing writable is drawn —
 * the design's own promise, "all sends, payments and messages are disabled", is
 * kept by not rendering any of them rather than by disabling buttons.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UserViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { session?: string };
}) {
  const staff = await currentStaff();
  if (!staff.ok) redirect("/login");
  if (!can(staff.staff.level, "users.edit")) redirect("/");

  // The session must exist, be this admin's, and still be open. Without this the
  // URL alone would be a way to browse a user's account with nothing logged.
  const db = createServiceClient();
  const { data: session } = searchParams.session
    ? await db
        .from("impersonation_sessions")
        .select("id, staff_id, profile_id, started_at, ended_at")
        .eq("id", searchParams.session)
        .maybeSingle()
    : { data: null };

  const live = session as { id: string; staff_id: string; profile_id: string; started_at: string; ended_at: string | null } | null;
  if (!live || live.staff_id !== staff.staff.id || live.profile_id !== params.id || live.ended_at) {
    redirect(`/users/${params.id}`);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, role, city_id, bio, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!profile) notFound();
  const p = profile as Record<string, unknown>;

  const [listings, plans, requirements] = await Promise.all([
    db
      .from("listings")
      .select("id, title, status, price_paise, price_on_request, area_label, cover_url, created_at")
      .eq("profile_id", params.id)
      .not("status", "in", '("deleted")')
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("user_plans")
      .select("name, status, listing_quota, listing_used, expires_at, is_trial")
      .eq("profile_id", params.id)
      .eq("status", "active"),
    db.from("requirements").select("id", { count: "exact", head: true }).eq("profile_id", params.id),
  ]);

  return (
    <ImpersonationView
      sessionId={live.id}
      startedAt={live.started_at}
      user={{
        id: params.id,
        name: (p.name as string) || "Unnamed",
        role: (p.role as string) ?? null,
        bio: (p.bio as string) ?? null,
      }}
      listings={((listings.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
        id: l.id as string,
        title: (l.title as string) ?? "Untitled",
        status: (l.status as string) ?? "draft",
        priceLabel: l.price_on_request
          ? "On request"
          : l.price_paise == null
            ? "—"
            : `₹${Math.round((l.price_paise as number) / 100).toLocaleString("en-IN")}`,
        location: (l.area_label as string) ?? "—",
        coverUrl: (l.cover_url as string) ?? null,
      }))}
      plans={((plans.data ?? []) as Array<Record<string, unknown>>).map((pl) => ({
        name: (pl.name as string) ?? "Plan",
        isTrial: Boolean(pl.is_trial),
        used: Number(pl.listing_used ?? 0),
        quota: Number(pl.listing_quota ?? 0),
        expiresLabel: pl.expires_at
          ? new Date(pl.expires_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "—",
      }))}
      requirements={requirements.count ?? 0}
    />
  );
}
