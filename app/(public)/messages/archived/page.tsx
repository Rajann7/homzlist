import { ArchivedChats } from "@/components";

export const metadata = { title: "Archived" };
export const dynamic = "force-dynamic";

export default function ArchivedPage() {
  return <ArchivedChats base="/messages" />;
}
