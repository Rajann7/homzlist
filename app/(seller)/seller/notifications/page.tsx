import { Notifications } from "@/components";

/** P11 S7 — Notifications (Doc4 §61). Authenticated surface → seller host. */
export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerNotificationsPage() {
  return <Notifications />;
}
