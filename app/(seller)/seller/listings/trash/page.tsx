import { Trash } from "@/components/listings/Trash";

/** P10 S4 — Recently deleted (30-day trash, restore or delete now). */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Trash />;
}
