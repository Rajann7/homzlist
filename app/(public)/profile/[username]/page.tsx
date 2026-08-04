import type { Metadata } from "next";
import { OtherProfile } from "@/components/profile/OtherProfile";

/**
 * homzlist.com/profile/:username — public Other Profile (P9 S2). Guest-readable.
 * Server-rendered shell; the client component fetches the public (stripped) DTO.
 */
export async function generateMetadata(props: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const params = await props.params;
  return { title: `@${params.username}` };
}

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  // Public host = guest surface (session stripped by middleware) → gate writes.
  return <OtherProfile username={params.username} isGuest />;
}
