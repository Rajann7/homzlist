import { Thread } from "@/components";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default function SellerThreadPage({ params }: { params: { threadId: string } }) {
  return <Thread threadId={params.threadId} base="/messages" />;
}
