import { ChatDetails } from "@/components";

/** P7 S4 — Chat Details. */
export const metadata = { title: "Chat details" };
export const dynamic = "force-dynamic";

export default function DetailsPage({ params }: { params: { threadId: string } }) {
  return <ChatDetails threadId={params.threadId} base="/messages" />;
}
