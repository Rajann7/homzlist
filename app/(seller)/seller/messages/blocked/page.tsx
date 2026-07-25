import { BlockedUsers } from "@/components";

export const metadata = { title: "Blocked users" };
export const dynamic = "force-dynamic";

export default function SellerBlockedPage() {
  return <BlockedUsers base="/messages" />;
}
