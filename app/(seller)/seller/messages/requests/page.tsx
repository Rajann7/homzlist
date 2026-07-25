import { Requests } from "@/components";

export const metadata = { title: "Message requests" };
export const dynamic = "force-dynamic";

export default function SellerRequestsPage() {
  return <Requests base="/messages" />;
}
