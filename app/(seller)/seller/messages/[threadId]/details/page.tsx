import { ChatDetails } from "@/components";

export const metadata = { title: "Chat details" };
export const dynamic = "force-dynamic";

export default async function SellerDetailsPage(props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  return <ChatDetails threadId={params.threadId} base="/messages" />;
}
