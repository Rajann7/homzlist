import { StoryViewer } from "@/components/feed/StoryViewer";

/**
 * P2 S4 — Story viewer (fullscreen).
 *
 * No `force-dynamic`: this route renders NO server data at all (the viewer is a
 * client component that talks to /api/v1/stories, which is itself dynamic and
 * auth-scoped). Forcing it dynamic bought nothing and cost everything — Next
 * will not prefetch a force-dynamic route, so every tap on a story circle paid
 * a cold server round-trip before the overlay could even mount. The route is
 * still rendered per request (no generateStaticParams); it is just prefetchable
 * again, which is what makes the tap open on the next frame.
 */

export default async function StoryPage(props: { params: Promise<{ posterId: string }> }) {
  const params = await props.params;
  return <StoryViewer posterId={params.posterId} />;
}
