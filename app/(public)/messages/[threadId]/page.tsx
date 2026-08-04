import { Thread } from "@/components";

/** P7 S3 — Chat Thread. */
export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ThreadPage(props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  return <Thread threadId={params.threadId} base="/messages" />;
}
