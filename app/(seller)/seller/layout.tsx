import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { RoleProvider } from "@/components/nav/RoleContext";
import { createServiceClient } from "@/lib/supabase/server";
import { ReacceptGate } from "@/components/legal/ReacceptGate";
import { CloseAccount } from "@/components/account/CloseAccount";
import { MaintenanceGate } from "@/components/system/MaintenanceGate";

/**
 * (seller) — seller.homzlist.com. Requires a seller session (Owner/Broker/
 * Builder); the middleware redirects guests to /login before this renders
 * (server-side guard, no data flash — Doc6 §4 / Doc9 §28). Reached at the root
 * host path; middleware rewrites "/*" → "/seller/*" internally.
 *
 * The role is read HERE, from the profile row rather than the access token, and
 * published to the tree: the bottom nav is role-shaped (a builder has no
 * Search) and nearly every screen that renders it is a client component, so
 * without this each one would have to fetch the role and flash the wrong nav
 * first. Reading the row means a role change takes effect on the next
 * navigation instead of when a 15-minute token rotates.
 */
export const dynamic = "force-dynamic";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const claims = await getCurrentUser();
  const profile = claims ? await getProfileById(claims.sub) : null;

  // P12 S6 — an account with a deletion still inside its grace period sees only
  // the grace screen, whatever URL it asks for. Rendered in place of `children`
  // rather than redirected: a redirect from the layout that wraps the grace page
  // itself would loop, and a layout cannot read the pathname to break the cycle.
  if (claims && (await hasPendingDeletion(claims.sub))) {
    return (
      <RoleProvider role={profile?.role ?? null}>
        <div className="min-h-[100dvh] bg-page">
          <CloseAccount />
        </div>
      </RoleProvider>
    );
  }

  return (
    <RoleProvider role={profile?.role ?? null}>
      <div className="min-h-[100dvh] bg-page">
        {/* P12 S8 — maintenance takes the app down for everyone but staff. */}
        <MaintenanceGate>{children}</MaintenanceGate>
      </div>
      {/* P12 dg-terms — a material legal update blocks the app until accepted. */}
      {claims && <ReacceptGate />}
    </RoleProvider>
  );
}

async function hasPendingDeletion(profileId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("account_actions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("kind", "delete")
    .eq("status", "scheduled")
    .maybeSingle();
  return Boolean(data);
}
