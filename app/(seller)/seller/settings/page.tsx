import { SettingsHome } from "@/components";

/**
 * P10 S6 — Settings home. The ⋯ profile menu's "Settings" item lands here.
 * Server-driven: the screen fetches GET /settings/overview on mount.
 */
export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerSettingsPage() {
  return <SettingsHome />;
}
