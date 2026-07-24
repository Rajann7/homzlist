import { StoryViewer } from "@/components/feed/StoryViewer";

/** P2 S4 — Story viewer (fullscreen). */
export const dynamic = "force-dynamic";

export default function StoryPage({ params }: { params: { posterId: string } }) {
  return <StoryViewer posterId={params.posterId} />;
}
