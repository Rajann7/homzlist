import type { Metadata } from "next";
import { OtherProfile } from "@/components/profile/OtherProfile";

/**
 * homzlist.com/profile/:username — public Other Profile (P9 S2). Guest-readable.
 * Server-rendered shell; the client component fetches the public (stripped) DTO.
 */
export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  return { title: `@${params.username}` };
}

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  // Public host = guest surface (session stripped by middleware) → gate writes.
  return <OtherProfile username={params.username} isGuest />;
}
