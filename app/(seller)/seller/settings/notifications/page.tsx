import { NotificationPrefs } from "@/components";

/**
 * P10 S7 — Notification preferences (Doc4 §63).
 *
 * The rest of the Settings suite (P10) is Module 11; this one screen ships with
 * Module 10 because the notification rules it controls — per-type toggles,
 * marketing consent, quiet hours — are this module's, and the P11 ⋯ sheet's
 * "Notification settings" item points here.
 */
export const metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerNotificationPrefsPage() {
  return <NotificationPrefs />;
}
