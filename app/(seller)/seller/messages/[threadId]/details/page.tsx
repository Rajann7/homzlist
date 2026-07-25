import { ChatDetails } from "@/components";

export const metadata = { title: "Chat details" };
export const dynamic = "force-dynamic";

export default function SellerDetailsPage({ params }: { params: { threadId: string } }) {
  return <ChatDetails threadId={params.threadId} base="/messages" />;
}
