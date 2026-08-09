import { StoryViewer } from "@/components/feed/StoryViewer";

/**
 * P2 S4 — Story viewer (fullscreen). Not force-dynamic: it renders no server
 * data, and marking it dynamic only made Next refuse to prefetch it, which is
 * what put a cold round-trip in front of every story tap. See the public twin.
 */

export default async function StoryPage(props: { params: Promise<{ posterId: string }> }) {
  const params = await props.params;
  return <StoryViewer posterId={params.posterId} />;
}
