import { Requests } from "@/components";

/** P7 S2 — Message Requests. */
export const metadata = { title: "Message requests" };
export const dynamic = "force-dynamic";

export default function RequestsPage() {
  return <Requests base="/messages" />;
}
