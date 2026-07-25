import type { Metadata } from "next";
import { OtherProfile } from "@/components/profile/OtherProfile";

/**
 * seller.homzlist.com/profile/:username — Other Profile on the seller host.
 *
 * The feed poster row, suggested strip and proposal/lead cards all link to
 * `/profile/:username`, and those surfaces render on the seller host too. Only
 * the public group had this route, so a logged-in user tapping a poster rewrote
 * to `/seller/profile/:username` and 404'd. Same component; the server still
 * strips private fields (Views/Leads/email/raw phone) regardless of host.
 */
export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  return { title: `@${params.username}` };
}

export default function SellerOtherProfilePage({ params }: { params: { username: string } }) {
  return <OtherProfile username={params.username} />;
}
