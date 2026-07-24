import { FeedHome } from "@/components/feed/FeedHome";

/**
 * Public home (homzlist.com/) — the P2 feed. Guest-browsable; actions gate to
 * login. Property + Requirement modes; builders see their dashboard.
 */
export const dynamic = "force-dynamic";

export default function PublicHome() {
  return <FeedHome />;
}
