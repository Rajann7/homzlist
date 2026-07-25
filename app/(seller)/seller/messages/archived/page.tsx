import { ArchivedChats } from "@/components";

export const metadata = { title: "Archived" };
export const dynamic = "force-dynamic";

export default function SellerArchivedPage() {
  return <ArchivedChats base="/messages" />;
}
