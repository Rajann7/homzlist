import { Activity } from "@/components";

/** P10 S2 — Your activity. The ⋯ profile menu's "Your activity" item lands here. */
export const metadata = { title: "Your activity" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerActivityPage() {
  return <Activity />;
}
