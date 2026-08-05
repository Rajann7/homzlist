import { StoryViewer } from "@/components/feed/StoryViewer";

/** P2 S4 — Story viewer (fullscreen). */
export const dynamic = "force-dynamic";

export default async function StoryPage(props: { params: Promise<{ posterId: string }> }) {
  const params = await props.params;
  return <StoryViewer posterId={params.posterId} />;
}
