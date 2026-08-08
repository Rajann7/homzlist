import { FeedHome } from "@/components/feed/FeedHome";
import { getFeedInitial } from "@/lib/feed/initial";

/**
 * Public home (homzlist.com/) — the P2 feed. Guest-browsable; actions gate to
 * login. Property + Requirement modes; builders see their dashboard.
 *
 * The rails and the first rail's cards are rendered HERE rather than fetched
 * after hydration (lib/feed/initial) — the screen used to spend its first
 * seconds as skeletons while the browser made two serial requests the server
 * could have answered in this one.
 */
export const dynamic = "force-dynamic";
// Doc8: a force-dynamic page that reads Supabase still needs this, or the Data
// cache hands the same rows to every visitor until the process restarts.
export const fetchCache = "force-no-store";

export default async function PublicHome() {
  return <FeedHome initial={await getFeedInitial()} />;
}
