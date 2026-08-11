import { LeadsHub } from "@/components/leads/LeadsHub";

/** Leads home — Received (my posts + counts) / Sent. Replaces P7 Messages. */
export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function LeadsPage() {
  return <LeadsHub base="/leads" />;
}
