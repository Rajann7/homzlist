import { Thread } from "@/components";

/** P7 S3 — Chat Thread. */
export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default function ThreadPage({ params }: { params: { threadId: string } }) {
  return <Thread threadId={params.threadId} base="/messages" />;
}
