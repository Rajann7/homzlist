import { Messages } from "@/components";
import { getCurrentUser } from "@/lib/auth/current-user";

/** P7 S1 — Messages Home for sellers (seller.homzlist.com). */
export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function SellerMessagesPage() {
  const me = await getCurrentUser();
  return <Messages base="/messages" meId={me?.sub} seller />;
}
