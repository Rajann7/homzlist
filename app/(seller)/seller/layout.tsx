import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { RoleProvider } from "@/components/nav/RoleContext";

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
  return (
    <RoleProvider role={profile?.role ?? null}>
      <div className="min-h-[100dvh] bg-page">{children}</div>
    </RoleProvider>
  );
}
