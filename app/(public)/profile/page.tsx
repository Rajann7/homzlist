import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OwnProfile } from "@/components/profile/OwnProfile";

/**
 * homzlist.com/profile — Own Profile (P9 S1), the Profile tab of the canonical
 * bottom nav. The public host only had /profile/[username] (someone else's
 * profile), so the nav's own-profile tab 404'd on every public screen.
 *
 * Same component the seller host renders; the gate is server-side (the cookie is
 * host-only, so the public session is the one that counts here). Guests go to
 * /login — the flow returns them home signed in.
 */
export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function PublicProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <OwnProfile />;
}
