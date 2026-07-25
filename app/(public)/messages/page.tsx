import { Messages } from "@/components";
import { getCurrentUser } from "@/lib/auth/current-user";

/** P7 S1 — Messages Home (4 tabs). Module 7. */
export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const me = await getCurrentUser();
  return <Messages base="/messages" meId={me?.sub} />;
}
