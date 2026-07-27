import type { Metadata } from "next";
import { OtherProfile } from "@/components/profile/OtherProfile";
import { OwnProfile } from "@/components/profile/OwnProfile";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";

/**
 * seller.homzlist.com/profile/:username — Other Profile on the seller host.
 *
 * The feed poster row, suggested strip and proposal/lead cards all link to
 * `/profile/:username`, and those surfaces render on the seller host too. Only
 * the public group had this route, so a logged-in user tapping a poster rewrote
 * to `/seller/profile/:username` and 404'd. Same component; the server still
 * strips private fields (Views/Leads/email/raw phone) regardless of host.
 *
 * ONE exception: your OWN username. Pasting your own profile link (or tapping
 * your name from a thread) used to render the VISITOR view of yourself — no
 * stats, no Edit profile, and a "Message"/"Report"/"Block" set aimed at you.
 * The match is made server-side from the session, so the right screen renders
 * on the first paint instead of flashing the visitor one.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  return { title: `@${params.username}` };
}

export default async function SellerOtherProfilePage({ params }: { params: { username: string } }) {
  const claims = await getCurrentUser();
  if (claims) {
    const me = await getProfileById(claims.sub);
    // Usernames are stored lowercased (makeUsername), so a lowercased compare is
    // exact — a link with different casing still lands on your own profile.
    if (me?.username && me.username.toLowerCase() === params.username.toLowerCase()) {
      return <OwnProfile />;
    }
  }
  return <OtherProfile username={params.username} />;
}
