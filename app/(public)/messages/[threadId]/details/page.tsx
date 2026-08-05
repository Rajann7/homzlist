import { ChatDetails } from "@/components";

/** P7 S4 — Chat Details. */
export const metadata = { title: "Chat details" };
export const dynamic = "force-dynamic";

export default async function DetailsPage(props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  return <ChatDetails threadId={params.threadId} base="/messages" />;
}
