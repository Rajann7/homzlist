import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { RoleProvider } from "@/components/nav/RoleContext";
import { impersonationContext } from "@/lib/admin/impersonation";
import { ImpersonationBanner } from "@/components/admin/panels/ImpersonationBanner";

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
  // A31 (Doc5): the impersonated tab carries a persistent banner. It is read
  // from the SESSION, not a query flag, so it cannot be dismissed or faked, and
  // a real user's request never resolves one — the design they see is untouched.
  const imp = claims?.imp ? await impersonationContext() : null;
  return (
    <RoleProvider role={profile?.role ?? null}>
      <div className="min-h-[100dvh] bg-page">
        {imp ? (
          <ImpersonationBanner
            name={profile?.name ?? "this user"}
            staffName={imp.staffName}
            startedAt={imp.startedAt}
          />
        ) : null}
        {children}
      </div>
    </RoleProvider>
  );
}
