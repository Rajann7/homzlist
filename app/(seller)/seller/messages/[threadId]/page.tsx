import { Thread } from "@/components";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function SellerThreadPage(props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  return <Thread threadId={params.threadId} base="/messages" />;
}
